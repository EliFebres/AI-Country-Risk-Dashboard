import os
import datetime
from typing import Dict, Any, Optional, List, Tuple

import psycopg2
import psycopg2.extras as extras
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")


def _to_date_from_iso(s: str) -> datetime.date:
    """
    Accepts 'YYYY-MM-DD' or ISO 'YYYY-MM-DDTHH:MMZ' and returns date().
    """
    if not s:
        raise ValueError("Empty generated_at timestamp")
    try:
        # fast path YYYY-MM-DD
        return datetime.date.fromisoformat(s[:10])
    except Exception:
        # last resort
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.date()


def _to_ts_or_none(s: Optional[str]) -> Optional[datetime.datetime]:
    """
    Best-effort ISO8601 parser that returns aware UTC timestamps when possible.
    """
    if not s:
        return None
    try:
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def upsert_snapshot(payload: Dict[str, Any], country_name: str) -> None:
    """
    Atomically insert or update a country-level snapshot.

    Writes to:
      • country                 (ensures parent row for FK)
      • indicator               (upsert by name, keeps unit updated)
      • yearly_value            (upsert by (country_iso2, indicator_id, yr))
      • risk_snapshot           (upsert by (country_iso2, as_of))
      • risk_snapshot_article   (top-3 links for this snapshot; optional; includes image_url)

    Expects in `payload`:
      - country (str ISO-2)
      - _meta.generated_at (ISO datetime string)
      - _meta.units (dict: indicator_name -> unit)
      - indicators (dict: indicator_name -> {"series": {year: value or None}})
      - llm_output.score, llm_output.bullet_summary

    Optional:
      - top_articles: list of dicts with
          {rank, url, title, source, published_at (ISO), impact, summary, image?}
    """
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set in the environment")
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")

    # Required fields
    country = payload.get("country")
    if not country or not isinstance(country, str):
        raise ValueError("payload['country'] must be an ISO-2 string")

    meta = payload.get("_meta") or {}
    gen_at = meta.get("generated_at")
    if not gen_at or not isinstance(gen_at, str):
        raise ValueError("payload['_meta']['generated_at'] must be a string ISO timestamp")
    units = meta.get("units") or {}
    if not isinstance(units, dict):
        raise ValueError("payload['_meta']['units'] must be a dict of indicator -> unit")

    as_of: datetime.date = _to_date_from_iso(gen_at)

    indicators = payload.get("indicators") or {}
    if not isinstance(indicators, dict) or not indicators:
        raise ValueError("payload['indicators'] must be a non-empty dict")

    llm_out = payload.get("llm_output") or {}
    if not (isinstance(llm_out, dict) and {"score", "bullet_summary"} <= set(llm_out.keys())):
        raise ValueError("payload['llm_output'] must include 'score' and 'bullet_summary'")

    # Optional: new top-3 article rows
    top_articles = payload.get("top_articles") or []
    if not isinstance(top_articles, list):
        top_articles = []

    conn = psycopg2.connect(DB_URL)
    try:
        conn.autocommit = False
        with conn.cursor() as cur:
            # 0) Ensure the parent 'country' row exists for the FK
            cur.execute(
                """
                INSERT INTO country (iso2, name)
                VALUES (%s, %s)
                ON CONFLICT (iso2) DO NOTHING
                """,
                (country, country_name),
            )

            # 1) Indicators + yearly series
            for ind_name, ind_data in indicators.items():
                unit = units[ind_name]  # rely on your existing contract; raises if missing

                # 1a) Upsert indicator row, capture its id
                cur.execute(
                    """
                    INSERT INTO indicator (name, unit)
                    VALUES (%s, %s)
                    ON CONFLICT (name)
                    DO UPDATE SET unit = EXCLUDED.unit
                    RETURNING id;
                    """,
                    (ind_name, unit),
                )
                ind_id = cur.fetchone()[0]

                # 1b) Prepare yearly rows (skip nulls)
                series = (ind_data or {}).get("series", {}) or {}
                rows_yv: List[Tuple[str, int, int, float]] = []
                for year, val in series.items():
                    if val is None:
                        continue
                    try:
                        yr_int = int(year)
                        val_f = float(val)
                    except Exception:
                        continue
                    rows_yv.append((country, ind_id, yr_int, val_f))

                if rows_yv:
                    extras.execute_values(
                        cur,
                        """
                        INSERT INTO yearly_value (country_iso2, indicator_id, yr, value)
                        VALUES %s
                        ON CONFLICT (country_iso2, indicator_id, yr)
                        DO UPDATE SET value = EXCLUDED.value
                        """,
                        rows_yv,
                        page_size=1000,
                    )

            # 2) Risk snapshot (latest AI score for the run date)
            cur.execute(
                """
                INSERT INTO risk_snapshot (country_iso2, as_of, score, bullet_summary)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (country_iso2, as_of)
                DO UPDATE SET
                  score = EXCLUDED.score,
                  bullet_summary = EXCLUDED.bullet_summary
                """,
                (country, as_of, llm_out["score"], llm_out["bullet_summary"]),
            )

            # 3) Optional: write the top-3 links for this snapshot (now includes image_url)
            rows_art: List[Tuple] = []
            for a in top_articles:
                if not isinstance(a, dict):
                    continue
                rank = a.get("rank")
                url = (a.get("url") or "").strip()
                if not url or rank not in (1, 2, 3):
                    continue

                # Normalize image value to a single URL string (or None)
                img = a.get("image")
                image_url: Optional[str] = None
                if isinstance(img, str):
                    u = img.strip()
                    image_url = u if u.startswith(("http://", "https://")) else None
                elif isinstance(img, list):
                    for v in img:
                        if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
                            image_url = v.strip()
                            break

                rows_art.append(
                    (
                        country,                                # country_iso2
                        as_of,                                  # as_of (DATE)
                        int(rank),                              # rank 1..3
                        url,                                    # url (TEXT NOT NULL)
                        a.get("title"),                         # title
                        a.get("source"),                        # source
                        _to_ts_or_none(a.get("published_at")),  # published_at TIMESTAMPTZ
                        (float(a["impact"]) if (a.get("impact") is not None) else None),
                        a.get("summary"),
                        image_url,                               # NEW: image_url
                    )
                )

            if rows_art:
                extras.execute_values(
                    cur,
                    """
                    INSERT INTO risk_snapshot_article
                      (country_iso2, as_of, rank, url, title, source, published_at, impact, summary, image_url)
                    VALUES %s
                    ON CONFLICT (country_iso2, as_of, rank)
                    DO UPDATE SET
                      url          = EXCLUDED.url,
                      title        = EXCLUDED.title,
                      source       = EXCLUDED.source,
                      published_at = EXCLUDED.published_at,
                      impact       = EXCLUDED.impact,
                      summary      = EXCLUDED.summary,
                      image_url    = EXCLUDED.image_url,
                      updated_at   = now()
                    """,
                    rows_art,
                    page_size=10,
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


_ECON_EVENT_DDL = """
CREATE TABLE IF NOT EXISTS economic_calendar_event (
    id           BIGSERIAL PRIMARY KEY,
    event_time   TIMESTAMPTZ NOT NULL,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    event        TEXT NOT NULL,
    importance   TEXT NOT NULL CHECK (importance IN ('h','m','l')),
    currency     TEXT,
    previous     DOUBLE PRECISION,
    estimate     DOUBLE PRECISION,
    actual       DOUBLE PRECISION,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_time, country_code, event)
);
-- AI importance ranking (US-tilted). Added idempotently so an already-created
-- table picks up the columns without a migration tool.
ALTER TABLE economic_calendar_event ADD COLUMN IF NOT EXISTS ai_importance DOUBLE PRECISION;
ALTER TABLE economic_calendar_event ADD COLUMN IF NOT EXISTS ai_rationale  TEXT;
ALTER TABLE economic_calendar_event ADD COLUMN IF NOT EXISTS ai_scored_at  TIMESTAMPTZ;
"""


def upsert_economic_events(events: List[Dict[str, Any]]) -> None:
    """Upsert upcoming economic-calendar events for the front-end Econ Calendar pane.

    Self-contained: ensures the ``economic_calendar_event`` table exists (the
    project has no migration tool; this adds one table without touching the
    pre-created risk schema), bulk-upserts the rolling window, and prunes rows
    older than a day so the table stays a forward-looking feed.

    Each event dict (as produced by ``fmp_calendar_fetch.fetch_economic_calendar``):
      - event_time   (aware UTC datetime)  — release date & time
      - country_code (str, FMP 2-letter)   — e.g. 'US', 'EU'
      - country_name (str)                 — display name
      - event        (str)                 — release/decision name
      - importance   (str: 'h'|'m'|'l')    — criticality
      - currency, previous, estimate, actual (optional)
      - ai_importance (float 0..1), ai_rationale (str), ai_scored_at (datetime)
        — optional AI ranking (only the next-14-day subset; null otherwise).
        Nulls never overwrite an existing score (preserved via COALESCE).

    No-op if ``events`` is empty.
    """
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set in the environment")
    if not events:
        return

    rows: List[Tuple] = []
    for e in events:
        if not isinstance(e, dict):
            continue
        event_time = e.get("event_time")
        code = (e.get("country_code") or "").strip()
        event = (e.get("event") or "").strip()
        importance = (e.get("importance") or "").strip()
        if not event_time or not code or not event or importance not in ("h", "m", "l"):
            continue
        ai_importance = e.get("ai_importance")
        try:
            ai_importance = float(ai_importance) if ai_importance is not None else None
        except (TypeError, ValueError):
            ai_importance = None

        rows.append(
            (
                event_time,
                code,
                e.get("country_name") or code,
                event,
                importance,
                e.get("currency"),
                e.get("previous"),
                e.get("estimate"),
                e.get("actual"),
                ai_importance,
                e.get("ai_rationale"),
                e.get("ai_scored_at"),
            )
        )

    if not rows:
        return

    conn = psycopg2.connect(DB_URL)
    try:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(_ECON_EVENT_DDL)

            extras.execute_values(
                cur,
                """
                INSERT INTO economic_calendar_event
                  (event_time, country_code, country_name, event, importance,
                   currency, previous, estimate, actual,
                   ai_importance, ai_rationale, ai_scored_at)
                VALUES %s
                ON CONFLICT (event_time, country_code, event)
                DO UPDATE SET
                  country_name  = EXCLUDED.country_name,
                  importance    = EXCLUDED.importance,
                  currency      = EXCLUDED.currency,
                  previous      = EXCLUDED.previous,
                  estimate      = EXCLUDED.estimate,
                  actual        = EXCLUDED.actual,
                  ai_importance = COALESCE(EXCLUDED.ai_importance, economic_calendar_event.ai_importance),
                  ai_rationale  = COALESCE(EXCLUDED.ai_rationale,  economic_calendar_event.ai_rationale),
                  ai_scored_at  = COALESCE(EXCLUDED.ai_scored_at,  economic_calendar_event.ai_scored_at),
                  updated_at    = now()
                """,
                rows,
                page_size=500,
            )

            # Keep the table a rolling forward window.
            cur.execute(
                "DELETE FROM economic_calendar_event WHERE event_time < now() - interval '1 day'"
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


_NEWS_ALERT_DDL = """
CREATE TABLE IF NOT EXISTS news_alert (
    id           BIGSERIAL PRIMARY KEY,
    as_of        DATE        NOT NULL,
    global_rank  SMALLINT    NOT NULL,
    country_iso2 CHAR(2)     NOT NULL,
    country_name TEXT,
    url          TEXT        NOT NULL,
    title        TEXT,
    source       TEXT,
    published_at TIMESTAMPTZ,
    summary      TEXT,
    image_url    TEXT,
    topic        TEXT        NOT NULL,
    severity     TEXT        NOT NULL CHECK (severity IN ('Critical','Caution','Watch')),
    importance   DOUBLE PRECISION,
    rationale    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (as_of, global_rank)
);
CREATE INDEX IF NOT EXISTS idx_news_alert_as_of ON news_alert (as_of);
"""


def _image_url_or_none(img: Any) -> Optional[str]:
    """Normalize an image value (str or list) to a single http(s) URL, or None."""
    if isinstance(img, str):
        u = img.strip()
        return u if u.startswith(("http://", "https://")) else None
    if isinstance(img, list):
        for v in img:
            if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
                return v.strip()
    return None


def upsert_news_alerts(alerts: List[Dict[str, Any]], as_of: datetime.date) -> None:
    """Replace the global news alerts for ``as_of`` with this run's ranked set.

    Self-contained: ensures the ``news_alert`` table exists (the project has no
    migration tool; this adds one table without touching the pre-created risk
    schema), then uses replace-today semantics — all rows for ``as_of`` are
    deleted and re-inserted so a re-run can never leave stale ranks. History for
    prior ``as_of`` dates is preserved (matching ``risk_snapshot``).

    Each alert dict (as produced by ``alerts_ranker.rank_global_alerts``):
      - global_rank  (int 1..N)            — global importance rank
      - country_iso2 (str ISO-2)           — originating country
      - country_name (str)                 — display name
      - url          (str)                 — article link
      - title, source, summary             (optional)
      - published_at (ISO str)             — article publish time
      - image        (str or list)         — thumbnail URL(s)
      - topic        (str)                 — one of constants.ALERT_TOPICS
      - severity     (str)                 — Critical | Caution | Watch
      - importance   (float 0..1)          — global importance score
      - rationale    (str)                 — one-line ranking rationale

    No-op if ``alerts`` is empty.
    """
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set in the environment")
    if not alerts:
        return

    rows: List[Tuple] = []
    for a in alerts:
        if not isinstance(a, dict):
            continue
        rank = a.get("global_rank")
        url = (a.get("url") or "").strip()
        country = (a.get("country_iso2") or "").strip()
        topic = (a.get("topic") or "").strip()
        severity = (a.get("severity") or "").strip()
        if not url or not country or not topic or severity not in ("Critical", "Caution", "Watch"):
            continue
        try:
            rank = int(rank)
        except (TypeError, ValueError):
            continue

        try:
            importance = float(a["importance"]) if a.get("importance") is not None else None
        except (TypeError, ValueError):
            importance = None

        rows.append(
            (
                as_of,                               # as_of (DATE)
                rank,                                # global_rank
                country,                             # country_iso2
                a.get("country_name"),               # country_name
                url,                                 # url (TEXT NOT NULL)
                a.get("title"),                      # title
                a.get("source"),                     # source
                _to_ts_or_none(a.get("published_at")),  # published_at TIMESTAMPTZ
                a.get("summary"),                    # summary
                _image_url_or_none(a.get("image")),  # image_url
                topic,                               # topic
                severity,                            # severity
                importance,                          # importance
                a.get("rationale"),                  # rationale
            )
        )

    if not rows:
        return

    conn = psycopg2.connect(DB_URL)
    try:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(_NEWS_ALERT_DDL)

            # Replace-today semantics: clear this run date, then insert the ranked set.
            cur.execute("DELETE FROM news_alert WHERE as_of = %s", (as_of,))

            extras.execute_values(
                cur,
                """
                INSERT INTO news_alert
                  (as_of, global_rank, country_iso2, country_name, url, title, source,
                   published_at, summary, image_url, topic, severity, importance, rationale)
                VALUES %s
                """,
                rows,
                page_size=100,
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
