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
