import os
import datetime
import psycopg2
import psycopg2.extras as extras

from dotenv import load_dotenv
from typing import Dict, Any, Optional, List, Tuple

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
    Atomically insert or update a country-level snapshot and (minimal change)
    also write the top 3 links for that (country, as_of) into risk_snapshot_article.

    New in this version:
      - Ensures a parent row exists in `country` (INSERT ... ON CONFLICT DO NOTHING)
        so the FK on risk_snapshot.country_iso2 never fails after a fresh DB reset.

    Expects:
      payload["country"] -> ISO-2 (e.g., "IN")
      payload["_meta"]["generated_at"] -> ISO string (used to compute as_of DATE)
      payload["llm_output"]["score"], payload["llm_output"]["bullet_summary"]

    Optional:
      payload["top_articles"] -> list of up to 3 dicts:
          {rank, url, title, source, published_at (ISO), impact, summary}
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

    as_of: datetime.date = _to_date_from_iso(gen_at)

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
            # If your table/columns differ (e.g., iso2/name), adjust here.
            cur.execute(
                """
                INSERT INTO country (iso2, name)
                VALUES (%s, %s)
                ON CONFLICT (iso2) DO NOTHING
                """,
                (country, country_name),
            )

            # 1) Upsert the risk snapshot (existing behavior)
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

            # 2) Minimal addition: write the top-3 links for this snapshot
            rows: List[Tuple] = []
            for a in top_articles:
                if not isinstance(a, dict):
                    continue
                rank = a.get("rank")
                url = (a.get("url") or "").strip()
                if not url or rank not in (1, 2, 3):
                    continue
                rows.append(
                    (
                        country,                           # country_iso2
                        as_of,                             # as_of (DATE)
                        int(rank),                         # rank 1..3
                        url,                               # url (TEXT NOT NULL)
                        a.get("title"),                    # title
                        a.get("source"),                   # source
                        _to_ts_or_none(a.get("published_at")),  # published_at TIMESTAMPTZ
                        (float(a["impact"]) if (a.get("impact") is not None) else None),
                        a.get("summary"),
                    )
                )

            if rows:
                extras.execute_values(
                    cur,
                    """
                    INSERT INTO risk_snapshot_article
                      (country_iso2, as_of, rank, url, title, source, published_at, impact, summary)
                    VALUES %s
                    ON CONFLICT (country_iso2, as_of, rank)
                    DO UPDATE SET
                      url          = EXCLUDED.url,
                      title        = EXCLUDED.title,
                      source       = EXCLUDED.source,
                      published_at = EXCLUDED.published_at,
                      impact       = EXCLUDED.impact,
                      summary      = EXCLUDED.summary,
                      updated_at   = now()
                    """,
                    rows,
                    page_size=10,
                )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
