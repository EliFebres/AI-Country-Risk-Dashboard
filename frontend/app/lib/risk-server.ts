// app/lib/risk-server.ts
import "server-only";
import type { Pool } from "pg";

// ----------------------------- Types --------------------------------------

export type JoinedLatestRisk = {
  iso2: string;
  name: string;
  as_of: string;
  score: number;
  bullet_summary: string;
  prev_as_of?: string | null;
  prev_score?: number | null;
  // arrays of all prior observations (excluding the latest), newest→oldest
  prev_scores?: number[] | null;
  prev_asofs?: string[] | null;
} & { prev_as_ofs?: string[] | null }; // keep backward compat with earlier shape

export type SummaryEntry = { country_iso2: string; bullet_summary: string };

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

export type CountryArticles = {
  iso2: string;
  name: string;
  as_of: string; // latest snapshot date for this country
  articles: {
    url: string;
    title?: string | null;
    source?: string | null;
    published_at?: string | null; // ISO string
    img_url?: string | null;      // image URL per article
  }[];
};

/** One upcoming economic-calendar release for the global Econ Calendar pane. */
export type EconCalendarEvent = {
  event_time: string;          // ISO 8601 UTC string
  country: string;             // display country name
  event: string;               // release / decision name
  importance: "h" | "m" | "l"; // FMP impact tier
};

// ----------------------------- DB (Neon / pg) -----------------------------

declare global {
  // Reused across hot reloads / serverless invocations in the same process.
  // eslint-disable-next-line no-var
  var __NEON_POOL__: Pool | undefined;
}

/**
 * Data-access layer for the Neon (Postgres) risk database.
 *
 * Wraps a process-wide `pg` connection pool — created lazily and cached on a
 * global so hot reloads and concurrent requests share a single pool — and
 * exposes one method per query. SQL strings are identical to the prior
 * function-based module; only the organization changed.
 */
export class RiskRepository {
  /**
   * Resolve the shared Neon pool, creating it on first use.
   *
   * @returns The singleton `pg` {@link Pool}.
   * @throws If called in a browser context or `DATABASE_URL` is unset.
   */
  private async pool(): Promise<Pool> {
    if (typeof window !== "undefined") {
      throw new Error("DB functions must run on the server.");
    }
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
    return global.__NEON_POOL__;
  }

  /**
   * Latest and previous risk snapshot per country, plus arrays of all prior
   * scores/dates (excluding the latest), ordered newest→oldest.
   */
  async fetchJoinedLatestRisks(): Promise<JoinedLatestRisk[]> {
    const pool = await this.pool();
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

  /** Latest non-empty bullet summary per country (one row each). */
  async fetchLatestSummaries(): Promise<SummaryEntry[]> {
    const pool = await this.pool();
    const { rows } = await pool.query<SummaryEntry>(
      `SELECT DISTINCT ON (country_iso2)
            country_iso2, bullet_summary
       FROM risk_snapshot
      WHERE bullet_summary IS NOT NULL
        AND TRIM(bullet_summary) <> ''
   ORDER BY country_iso2, as_of DESC;`
    );
    return rows.map((r) => ({
      country_iso2: (r.country_iso2 || "").toUpperCase(),
      bullet_summary: r.bullet_summary,
    }));
  }

  /**
   * Each country's most recent year/value for the four target indicators.
   * Returns one entry per country with a values map keyed by indicator name.
   */
  async fetchLatestIndicatorValues(): Promise<CountryIndicatorLatest[]> {
    const pool = await this.pool();

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
   * For each country, find its latest `risk_snapshot.as_of` and take up to 3
   * most recent (by `published_at DESC`, then `rank ASC`) articles for that
   * same `as_of`. Countries with 0 articles are still included (empty array).
   */
  async fetchLatestArticlesForLatestSnapshots(): Promise<CountryArticles[]> {
    const pool = await this.pool();

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
   * Up to 20 upcoming economic-calendar events for the global Econ Calendar pane.
   *
   * Window is hour-precise (`now()` … `now() + 7 days`, both TIMESTAMPTZ) so an
   * imminent release is never dropped by date rounding. Selection: take all
   * high-impact events first; if fewer than 20, backfill with medium-impact
   * events — in both tiers the most important by `ai_importance` win — then cap
   * at 20. Rows are returned ordered by `event_time` ascending (closest first).
   */
  async fetchEconCalendarEvents(): Promise<EconCalendarEvent[]> {
    const pool = await this.pool();

    const { rows } = await pool.query<{
      event_time: string | Date;
      country_name: string;
      event: string;
      importance: "h" | "m" | "l";
    }>(`
    WITH windowed AS (
      SELECT event_time, country_name, event, importance, ai_importance
        FROM economic_calendar_event
       WHERE event_time >= now()
         AND event_time <= now() + interval '7 days'
         AND importance IN ('h', 'm')
    ),
    prioritized AS (
      SELECT *,
             ROW_NUMBER() OVER (
               ORDER BY
                 CASE WHEN importance = 'h' THEN 0 ELSE 1 END ASC, -- all highs before mediums
                 ai_importance DESC NULLS LAST,                    -- most important first within tier
                 event_time ASC                                    -- stable tiebreak
             ) AS sel_rank
        FROM windowed
    )
    SELECT event_time, country_name, event, importance
      FROM prioritized
     WHERE sel_rank <= 20
  ORDER BY event_time ASC;
  `);

    return rows.map((r) => ({
      event_time: new Date(r.event_time).toISOString(),
      country: r.country_name,
      event: r.event,
      importance: r.importance,
    }));
  }
}

/** Shared singleton repository — mirrors the pooled-connection lifetime. */
export const riskRepository = new RiskRepository();
