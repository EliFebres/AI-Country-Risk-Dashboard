// app/lib/risk-server.ts
import "server-only";
import type { CountryRisk } from "./risk-client";

// ----------------------------- DB (Neon / pg) -----------------------------
type DBCountry = { iso2: string; name: string };
type DBRiskSnapshot = {
  country_iso2: string;
  as_of: string;
  score: number;
  bullet_summary: string;
};

export type JoinedLatestRisk = {
  iso2: string;
  name: string;
  as_of: string;
  score: number;
  bullet_summary: string;
  prev_as_of?: string | null;
  prev_score?: number | null;
  // NEW: arrays of all prior observations (excluding the latest), newest→oldest
  prev_scores?: number[] | null;
  prev_asofs?: string[] | null;
} & { prev_as_ofs?: string[] | null }; // keep backward compat with your earlier shape

declare global {
  // eslint-disable-next-line no-var
  var __NEON_POOL__: any | undefined;
}

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error("DB functions must run on the server.");
  }
}

async function getPool() {
  assertServer();
  const { Pool } = await import("pg");
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL env var for Neon.");
  }
  if (!global.__NEON_POOL__) {
    global.__NEON_POOL__ = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // max: 3,
    });
  }
  return global.__NEON_POOL__ as import("pg").Pool;
}

export async function fetchCountriesFromDB(): Promise<DBCountry[]> {
  const pool = await getPool();
  const { rows } = await pool.query<DBCountry>(
    `SELECT iso2, name FROM country ORDER BY name ASC;`
  );
  return rows;
}

export async function fetchLatestRiskSnapshotsFromDB(): Promise<DBRiskSnapshot[]> {
  const pool = await getPool();
  const { rows } = await pool.query<DBRiskSnapshot>(
    `SELECT DISTINCT ON (country_iso2)
            country_iso2, as_of, score, bullet_summary
       FROM risk_snapshot
   ORDER BY country_iso2, as_of DESC;`
  );
  return rows;
}

/**
 * Returns latest and previous risk snapshot per country.
 * Also returns arrays of all prior scores/dates (excluding the latest),
 * ordered newest→oldest.
 */
export async function fetchJoinedLatestRisksFromDB(): Promise<JoinedLatestRisk[]> {
  const pool = await getPool();
  const { rows } = await pool.query<JoinedLatestRisk>(
    `
    WITH ranked AS (
      SELECT
        rs.country_iso2,
        rs.as_of,
        rs.score,
        rs.bullet_summary,
        ROW_NUMBER() OVER (
          PARTITION BY rs.country_iso2
          ORDER BY rs.as_of DESC
        ) AS rn
      FROM risk_snapshot rs
    ),
    latest AS (
      SELECT country_iso2, as_of, score, bullet_summary
      FROM ranked
      WHERE rn = 1
    ),
    prev_single AS (
      SELECT country_iso2, as_of AS prev_as_of, score AS prev_score
      FROM ranked
      WHERE rn = 2
    ),
    prev_list AS (
      SELECT
        country_iso2,
        ARRAY_AGG(score::float8 ORDER BY as_of DESC) FILTER (WHERE rn >= 2) AS prev_scores,
        ARRAY_AGG(as_of ORDER BY as_of DESC)          FILTER (WHERE rn >= 2) AS prev_as_ofs
      FROM ranked
      GROUP BY country_iso2
    )
    SELECT
      c.iso2,
      c.name,
      l.as_of,
      l.score,
      l.bullet_summary,
      ps.prev_as_of,
      ps.prev_score,
      pl.prev_scores,
      pl.prev_as_ofs
    FROM latest l
    LEFT JOIN prev_single ps ON ps.country_iso2 = l.country_iso2
    LEFT JOIN prev_list   pl ON pl.country_iso2 = l.country_iso2
    JOIN country c           ON c.iso2 = l.country_iso2
    ORDER BY c.name ASC;
    `
  );
  return rows;
}

// --------------------------- Weekly JSON refresh --------------------------
export type RefreshOutcome =
  | { status: "skipped"; lastRun: string; nextEligible: string }
  | {
    status: "updated";
    lastRun: string;
    matchedCount: number;
    changedCount: number;
    missingInJson: string[];
  }
  | { status: "error"; error: string };

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type MetaFile = {
  last_run: string; // ISO timestamp (UTC)
  note?: string;
  source?: string;
};

async function nodeFs() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return { fs, path };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  const { fs } = await nodeFs();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

function msUntilNextEligible(lastRunISO: string): {
  nextEligibleISO: string;
  msLeft: number;
} {
  const last = Date.parse(lastRunISO);
  const next = last + ONE_WEEK_MS;
  const msLeft = Math.max(0, next - Date.now());
  return { nextEligibleISO: new Date(next).toISOString(), msLeft };
}

// ---- Weekly + Monday 10am (local tz) gating ------------------------------
// Set SCHEDULE_TZ to your preferred IANA TZ (defaults to US/Eastern).
const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "America/New_York";
const MONDAY_SLOT_HOUR = 10;
const MONDAY_SLOT_MINUTE = 0;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0=Sun ... 6=Sat
  hour: number;
  minute: number;
  second: number;
};

function getLocalParts(d: Date, timeZone: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const num = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const weekdayStr = (parts.find(p => p.type === "weekday")?.value ?? "Sun")
    .slice(0, 3)
    .toLowerCase();
  const weekdayMap: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };

  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    weekday: weekdayMap[weekdayStr] ?? 0,
    hour: num("hour"),
    minute: num("minute"),
    second: num("second"),
  };
}

/**
 * True if we should override the 7-day skip and run now because it's Monday
 * at/after 10:00 in SCHEDULE_TZ and we haven't run since that slot today.
 */
function isMondaySlotDue(lastRunISO: string | null, timeZone = SCHEDULE_TZ): boolean {
  const now = getLocalParts(new Date(), timeZone);
  const afterSlot =
    now.weekday === 1 &&
    (now.hour > MONDAY_SLOT_HOUR ||
      (now.hour === MONDAY_SLOT_HOUR && now.minute >= MONDAY_SLOT_MINUTE));
  if (!afterSlot) return false;
  if (!lastRunISO) return true;

  const last = getLocalParts(new Date(lastRunISO), timeZone);
  const lastWasThisMondayAfterSlot =
    last.weekday === 1 &&
    last.year === now.year &&
    last.month === now.month &&
    last.day === now.day &&
    (last.hour > MONDAY_SLOT_HOUR ||
      (last.hour === MONDAY_SLOT_HOUR && last.minute >= MONDAY_SLOT_MINUTE));

  return !lastWasThisMondayAfterSlot;
}

// ----------------------------- Indicator latest ---------------------------

export const INDICATOR_TARGET_NAMES = [
  "Rule of law (z-score)",
  "Inflation (% y/y)",
  "Interest payments (% revenue)",
  "GDP per-capita growth (% y/y)",
] as const;

export type IndicatorTargetName = (typeof INDICATOR_TARGET_NAMES)[number];

export type CountryIndicatorLatest = {
  iso2: string;
  name: string;
  values: Partial<
    Record<
      IndicatorTargetName,
      { year: number; value: number; unit?: string }
    >
  >;
};

/**
 * Fetch each country's most recent year/value for the four target indicators.
 * Returns one entry per country with a values map keyed by indicator name.
 */
export async function fetchLatestIndicatorValuesFromDB(): Promise<CountryIndicatorLatest[]> {
  const pool = await getPool();

  // DISTINCT ON picks the latest yr per (country, indicator)
  const { rows } = await pool.query<{
    iso2: string;
    name: string;
    indicator_name: IndicatorTargetName;
    unit: string | null;
    yr: number;
    value: number;
  }>(
    `
    WITH targets AS (
      SELECT id, name, unit
        FROM indicator
       WHERE name = ANY($1::text[])
    ),
    latest AS (
      SELECT DISTINCT ON (y.country_iso2, y.indicator_id)
             y.country_iso2, y.indicator_id, y.yr, y.value
        FROM yearly_value y
        JOIN targets t ON t.id = y.indicator_id
    ORDER BY y.country_iso2, y.indicator_id, y.yr DESC
    )
    SELECT c.iso2,
           c.name,
           t.name AS indicator_name,
           t.unit,
           l.yr,
           l.value
      FROM latest l
      JOIN targets t ON t.id = l.indicator_id
      JOIN country c ON c.iso2 = l.country_iso2
    ORDER BY c.name, t.name;
    `,
    [INDICATOR_TARGET_NAMES]
  );

  const byIso2 = new Map<string, CountryIndicatorLatest>();
  for (const r of rows) {
    const key = (r.iso2 || "").toUpperCase();
    let entry = byIso2.get(key);
    if (!entry) {
      entry = { iso2: key, name: r.name, values: {} };
      byIso2.set(key, entry);
    }
    entry.values[r.indicator_name] = {
      year: Number(r.yr),
      value: Number(r.value),
      unit: r.unit ?? undefined,
    };
  }
  return Array.from(byIso2.values());
}

/**
 * Writes public/api/indicator_latest.json.
 */
async function writeLatestIndicatorValuesJson(): Promise<number> {
  const { fs, path } = await nodeFs();
  const outPath = path.join(process.cwd(), "public", "api", "indicator_latest.json");

  const payload = await fetchLatestIndicatorValuesFromDB();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload.length;
}

// ----------------------------- Latest articles ----------------------------
export type CountryArticles = {
  iso2: string;
  name: string;
  as_of: string; // latest snapshot date for this country
  articles: {
    url: string;
    title?: string | null;
    source?: string | null;
    published_at?: string | null; // ISO string
    img_url?: string | null;      // NEW: image URL per article
  }[];
};

/**
 * For each country, find its latest risk_snapshot.as_of and then take up to 3
 * most recent (by published_at DESC, then rank ASC) articles for that same as_of.
 * Countries with 0 articles will still be included with an empty array.
 */
export async function fetchLatestArticlesForLatestSnapshotsFromDB(): Promise<CountryArticles[]> {
  const pool = await getPool();

  const { rows } = await pool.query<{
    iso2: string;
    name: string;
    as_of: string;
    url: string | null;
    title: string | null;
    source: string | null;
    published_at: string | null;
    image_url: string | null;
    rn: number | null;
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (rs.country_iso2)
             rs.country_iso2, rs.as_of
        FROM risk_snapshot rs
    ORDER BY rs.country_iso2, rs.as_of DESC
    ),
    ranked AS (
      SELECT
        a.country_iso2,
        a.as_of,
        a.url,
        a.title,
        a.source,
        a.published_at,
        a.image_url,
        ROW_NUMBER() OVER (
          PARTITION BY a.country_iso2
          ORDER BY a.published_at DESC NULLS LAST, a.rank ASC, a.id ASC
        ) AS rn
      FROM risk_snapshot_article a
      JOIN latest l
        ON l.country_iso2 = a.country_iso2
       AND l.as_of = a.as_of
    ),
    top3 AS (
      SELECT *
      FROM ranked
      WHERE rn <= 3
    )
    SELECT
      c.iso2,
      c.name,
      l.as_of::text AS as_of,
      t.url,
      t.title,
      t.source,
      t.published_at::text AS published_at,
      t.image_url,
      t.rn
    FROM latest l
    JOIN country c ON c.iso2 = l.country_iso2
    LEFT JOIN top3 t ON t.country_iso2 = l.country_iso2
    ORDER BY c.name ASC, t.rn ASC NULLS LAST;
  `);

  // Group rows into one object per country.
  const byIso2 = new Map<string, CountryArticles>();
  for (const r of rows) {
    const key = (r.iso2 || "").toUpperCase();
    let entry = byIso2.get(key);
    if (!entry) {
      entry = { iso2: key, name: r.name, as_of: r.as_of, articles: [] };
      byIso2.set(key, entry);
    }
    if (r.url) {
      entry.articles.push({
        url: r.url,
        title: r.title ?? null,
        source: r.source ?? null,
        published_at: r.published_at ?? null,
        img_url: r.image_url ?? null, // map DB image_url -> JSON img_url
      });
    }
  }
  // Ensure every country from latest is present (even if 0 articles)
  return Array.from(byIso2.values());
}

/**
 * Writes public/api/articles_latest.json.
 */
async function writeLatestArticlesJson(): Promise<number> {
  const { fs, path } = await nodeFs();
  const outPath = path.join(process.cwd(), "public", "api", "articles_latest.json");

  const payload = await fetchLatestArticlesForLatestSnapshotsFromDB();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload.length; // number of countries written
}

// ------------------------- Weekly refresh main flow -----------------------

/**
 * Refresh public/api/risk.json by updating ONLY:
 *  - risk (latest DB score)
 *  - iso2 (DB)
 *  - prevRisk (DB score from the period immediately before the latest as_of)
 *  - prevRiskSeries (all prior scores, newest→oldest, excluding current)
 * Preserves lngLat and other fields. Also writes risk_summary.json (latest
 * summaries only) and indicator_latest.json. Skips if run < 7 days ago,
 * unless it's Monday at/after 10:00 in SCHEDULE_TZ (once per Monday).
 */
export async function refreshRiskJsonWeekly(): Promise<RefreshOutcome> {
  assertServer();

  try {
    const { fs, path } = await nodeFs();
    const riskJsonPath = path.join(process.cwd(), "public", "api", "risk.json");
    const riskSummaryPath = path.join(process.cwd(), "public", "api", "risk_summary.json");
    const metaJsonPath = path.join(process.cwd(), "public", "api", "risk._meta.json");

    // 1) Check meta to decide whether to skip
    const meta = await readJsonIfExists<MetaFile>(metaJsonPath);
    if (meta?.last_run) {
      // Allow a special "Monday 10:00" run in SCHEDULE_TZ even if < 7 days have passed
      const mondayOverride = isMondaySlotDue(meta.last_run);
      if (!mondayOverride) {
        const { nextEligibleISO, msLeft } = msUntilNextEligible(meta.last_run);
        if (msLeft > 0) {
          return { status: "skipped", lastRun: meta.last_run, nextEligible: nextEligibleISO };
        }
      }
    }

    // 2) Read existing risk.json (source of truth for names + coords)
    const existing = await readJsonIfExists<CountryRisk[]>(riskJsonPath);
    if (!existing || existing.length === 0) {
      return {
        status: "error",
        error: "public/api/risk.json is missing or empty; seed it first.",
      };
    }

    // 3) Pull latest + previous risks/summaries from Neon
    const joined = await fetchJoinedLatestRisksFromDB();

    // 4) Build a lookup by normalized country name -> DB data
    const normalize = (s: string) => s.trim().toLowerCase();
    const dbMap = new Map<
      string,
      { iso2: string; score: number; as_of: string; prevScore: number | null; prevScores: number[] }
    >();
    for (const row of joined) {
      const list = Array.isArray(row.prev_scores)
        ? row.prev_scores.map(Number).filter((x) => Number.isFinite(x))
        : [];
      // (defensive) if list missing but prev_score exists, include it
      if (list.length === 0 && row.prev_score != null) {
        const n = Number(row.prev_score);
        if (Number.isFinite(n)) list.push(n);
      }
      dbMap.set(normalize(row.name), {
        iso2: row.iso2,
        score: Number(row.score),
        as_of: row.as_of,
        prevScore: row.prev_score == null ? null : Number(row.prev_score),
        prevScores: list,
      });
    }

    // 5) Update risk/iso2 and set prevRisk/prevRiskSeries
    let matchedCount = 0;
    let changedCount = 0;
    const seenDb = new Set<string>();

    const updated: CountryRisk[] = existing.map((d) => {
      const key = normalize(d.name);
      if (dbMap.has(key)) {
        matchedCount++;
        seenDb.add(key);
        const rec = dbMap.get(key)!;

        const riskChanged = d.risk !== rec.score;
        const iso2Changed = (d as any).iso2 !== rec.iso2;
        if (riskChanged || iso2Changed) changedCount++;

        const out: any = { ...d, risk: rec.score, iso2: rec.iso2, as_of: rec.as_of };

        if (rec.prevScores.length > 0) {
          out.prevRiskSeries = rec.prevScores;         // newest→oldest, excluding current
          out.prevRisk = rec.prevScores[0];            // convenience single value
        } else {
          delete out.prevRiskSeries;
          delete out.prevRisk;
        }

        return out as CountryRisk;
      }
      return d;
    });

    // 6) DB countries that didn’t match any JSON name (FYI)
    const missingInJson: string[] = [];
    for (const [key] of dbMap) {
      if (!seenDb.has(key)) {
        const row = joined.find((r) => normalize(r.name) === key)!;
        missingInJson.push(row.name);
      }
    }

    // 7) Write updated risk.json
    await fs.mkdir(path.dirname(riskJsonPath), { recursive: true });
    await fs.writeFile(riskJsonPath, JSON.stringify(updated, null, 2) + "\n", "utf8");

    // 8) Build & write risk_summary.json with ALL latest summaries
    const summaries = joined
      .filter(r => typeof r.bullet_summary === "string" && r.bullet_summary.trim() !== "")
      .map(r => ({
        country_iso2: r.iso2,
        bullet_summary: r.bullet_summary,
      }));
    await fs.mkdir(path.dirname(riskSummaryPath), { recursive: true });
    await fs.writeFile(riskSummaryPath, JSON.stringify(summaries, null, 2) + "\n", "utf8");

    // 9) Write/refresh meta file
    const now = new Date().toISOString();
    const metaOut: MetaFile = {
      last_run: now,
      source: "neon",
      note:
        "Updated risk + iso2 and prevRisk/prevRiskSeries (from previous DB snapshots) and wrote risk_summary.json; preserved lngLat.",
    };
    await fs.writeFile(metaJsonPath, JSON.stringify(metaOut, null, 2) + "\n", "utf8");

    // 10) Also write the latest indicator values snapshot
    const indicatorsWritten = await writeLatestIndicatorValuesJson();
    console.log(`Wrote indicator_latest.json for ${indicatorsWritten} countries`);

    // 11) And write the latest per-country articles (0–3 each)
    const articlesWritten = await writeLatestArticlesJson();
    console.log(`Wrote articles_latest.json for ${articlesWritten} countries`);

    return { status: "updated", lastRun: now, matchedCount, changedCount, missingInJson };
  } catch (err: any) {
    return { status: "error", error: String(err?.message ?? err) };
  }
}

// ----------------------- Merge-safe single-country writer (optional) ------
type SummaryEntry = { country_iso2: string; bullet_summary: string };

async function resolveIso2ByName(name: string): Promise<string | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ iso2: string }>(
    `SELECT iso2 FROM country WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1;`,
    [name]
  );
  return rows[0]?.iso2 ?? null;
}

/**
 * Merge-safe writer for a SINGLE country (dev helper).
 * Reads existing risk_summary.json (array), upserts the selected country,
 * and writes the full array back — preserving other countries.
 */
export async function writeRiskSummaryJson(opts: {
  iso2?: string;
  name?: string;
}): Promise<SummaryEntry | null> {
  assertServer();

  const codeRaw = opts.iso2 ?? (opts.name ? await resolveIso2ByName(opts.name) : null);
  const code = codeRaw?.toUpperCase();
  if (!code) return null;

  const pool = await getPool();
  const { rows } = await pool.query<SummaryEntry>(
    `
    SELECT country_iso2, bullet_summary
      FROM risk_snapshot
     WHERE country_iso2 = $1
       AND bullet_summary IS NOT NULL
  ORDER BY as_of DESC
     LIMIT 1;
    `,
    [code]
  );
  if (rows.length === 0) return null;

  const record: SummaryEntry = {
    country_iso2: code,
    bullet_summary: rows[0].bullet_summary,
  };

  const { fs, path } = await nodeFs();
  const filePath = path.join(process.cwd(), "public", "api", "risk_summary.json");

  // Read existing file (may be empty/missing)
  const existing = await readJsonIfExists<SummaryEntry[] | SummaryEntry>(filePath);
  const list: SummaryEntry[] = existing
    ? (Array.isArray(existing) ? existing : [existing])
    : [];

  // Upsert by iso2
  const idx = list.findIndex((e) => (e.country_iso2 ?? "").toUpperCase() === code);
  if (idx >= 0) list[idx] = record; else list.push(record);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(list, null, 2) + "\n", "utf8");

  return record;
}
