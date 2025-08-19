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
};

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

export async function fetchJoinedLatestRisksFromDB(): Promise<JoinedLatestRisk[]> {
  const pool = await getPool();
  const { rows } = await pool.query<JoinedLatestRisk>(
    `WITH latest AS (
       SELECT DISTINCT ON (country_iso2)
              country_iso2, as_of, score, bullet_summary
         FROM risk_snapshot
     ORDER BY country_iso2, as_of DESC
    )
    SELECT c.iso2, c.name, l.as_of, l.score, l.bullet_summary
      FROM latest l
      JOIN country c ON c.iso2 = l.country_iso2
    ORDER BY c.name ASC;`
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

/**
 * Refresh public/api/risk.json by updating ONLY:
 *  - risk score (from Neon)
 *  - iso2 (from Neon)
 * It preserves all existing entries and their lngLat coordinates.
 * Also writes public/api/risk_summary.json with ALL latest
 * { country_iso2, bullet_summary } rows (one per country, if summary is present).
 * Skips if run < 7 days ago. Also updates public/api/risk._meta.json.
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
      const { nextEligibleISO, msLeft } = msUntilNextEligible(meta.last_run);
      if (msLeft > 0) {
        return { status: "skipped", lastRun: meta.last_run, nextEligible: nextEligibleISO };
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

    // 3) Pull latest risks/summaries from Neon
    const joined = await fetchJoinedLatestRisksFromDB();

    // 4) Build a lookup by normalized country name -> { iso2, score }
    const normalize = (s: string) => s.trim().toLowerCase();
    const dbMap = new Map<string, { iso2: string; score: number }>();
    for (const row of joined) {
      dbMap.set(normalize(row.name), { iso2: row.iso2, score: Number(row.score) });
    }

    // 5) Update only `risk` and add/refresh `iso2` for matched countries; keep others as-is
    let matchedCount = 0;
    let changedCount = 0;
    const seenDb = new Set<string>();

    const updated = existing.map((d) => {
      const key = normalize(d.name);
      if (dbMap.has(key)) {
        matchedCount++;
        seenDb.add(key);
        const rec = dbMap.get(key)!;

        const riskChanged = d.risk !== rec.score;
        const iso2Changed = (d as any).iso2 !== rec.iso2;
        if (riskChanged || iso2Changed) changedCount++;

        // Preserve lngLat and everything else; only set risk + iso2
        return { ...d, risk: rec.score, iso2: rec.iso2 } as CountryRisk;
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

    // 7) Write updated risk.json (scores + iso2; lngLat preserved)
    await fs.mkdir(path.dirname(riskJsonPath), { recursive: true });
    await fs.writeFile(riskJsonPath, JSON.stringify(updated, null, 2) + "\n", "utf8");

    // 8) Build & write risk_summary.json with ALL latest summaries
    //    Only include summaries that are non-null / non-empty.
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
      note: "Updated risk scores + iso2 and wrote risk_summary.json; preserved existing coords (lngLat).",
    };
    await fs.writeFile(metaJsonPath, JSON.stringify(metaOut, null, 2) + "\n", "utf8");

    return { status: "updated", lastRun: now, matchedCount, changedCount, missingInJson };
  } catch (err: any) {
    return { status: "error", error: String(err?.message ?? err) };
  }
}

// ----------------------- (Optional) single-country writer -----------------
// You can keep these helpers if you still want a per-country endpoint in dev.

async function resolveIso2ByName(name: string): Promise<string | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ iso2: string }>(
    `SELECT iso2 FROM country WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1;`,
    [name]
  );
  return rows[0]?.iso2 ?? null;
}

/**
 * Writes public/api/risk_summary.json with the latest
 * { country_iso2, bullet_summary } for a SINGLE country.
 * Accepts either iso2 or name (name resolved via country table).
 */
export async function writeRiskSummaryJson(opts: {
  iso2?: string;
  name?: string;
}): Promise<{ country_iso2: string; bullet_summary: string } | null> {
  assertServer();

  const code = opts.iso2 ?? (opts.name ? await resolveIso2ByName(opts.name) : null);
  if (!code) return null;

  const pool = await getPool();
  const { rows } = await pool.query<{ country_iso2: string; bullet_summary: string }>(
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

  const record = rows[0];

  const { fs, path } = await nodeFs();
  const outPath = path.join(process.cwd(), "public", "api", "risk_summary.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify([record], null, 2) + "\n", "utf8");

  return record;
}
