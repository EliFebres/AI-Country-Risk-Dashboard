import os
import datetime
import psycopg2
import psycopg2.extras as extras

from dotenv import load_dotenv
load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

def upsert_snapshot(payload: dict, country_name) -> None:
    """
    Atomically insert or update a country-level data snapshot.

    The function writes to four tables—``country``, ``indicator``,
    ``yearly_value``, and ``risk_snapshot``—using a single database
    transaction so that either *all* changes succeed or none are committed.

    Parameters
    ----------
    payload : dict

    """
    # Input Validation
    assert isinstance(payload, dict), "`payload` must be a dict"
    for key in ("country", "_meta", "indicators", "llm_output"):
        assert key in payload, f"payload missing key: {key}"

    country: str = payload["country"]
    assert isinstance(country, str) and country, "`country` must be a non-empty str"

    meta = payload["_meta"]
    assert isinstance(meta, dict) and {"generated_at", "units"} <= meta.keys(), \
        "`_meta` must contain 'generated_at' and 'units'"

    as_of = datetime.date.fromisoformat(meta["generated_at"][:10])

    indicators = payload["indicators"]
    assert isinstance(indicators, dict) and indicators, "`indicators` must be a non-empty dict"

    llm_out = payload["llm_output"]
    assert {"score", "bullet_summary"} <= llm_out.keys(), \
        "`llm_output` must contain 'score' and 'bullet_summary'"

    # Connect and perform transactional upsert
    conn = psycopg2.connect(DB_URL)
    try:
        with conn: # commits on success, rolls back on error
            with conn.cursor() as cur:
                # Country table (idempotent insert)
                cur.execute(
                    """
                    INSERT INTO country (iso2, name)
                    VALUES (%s, %s)
                    ON CONFLICT (iso2) DO NOTHING;
                    """,
                    (country, country_name),
                )

                # Indicator metadata + yearly series
                for ind_name, ind_data in indicators.items():
                    unit = meta["units"][ind_name]

                    # Upsert indicator row, capture its id
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

                    # Prepare yearly data rows, skip null values
                    rows = [
                        (country, ind_id, int(year), float(val))
                        for year, val in ind_data["series"].items()
                        if val is not None
                    ]
                    if rows:
                        # Batched insert for speed; ignore duplicates
                        extras.execute_values(
                            cur,
                            """
                            INSERT INTO yearly_value
                                (country_iso2, indicator_id, yr, value)
                            VALUES %s
                            ON CONFLICT DO NOTHING;
                            """,
                            rows,
                        )

                # Risk snapshot (latest AI score)
                cur.execute(
                    """
                    INSERT INTO risk_snapshot
                        (country_iso2, as_of, score, bullet_summary)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (country_iso2, as_of)
                    DO UPDATE SET score = EXCLUDED.score,
                                  bullet_summary = EXCLUDED.bullet_summary;
                    """,
                    (
                        country,
                        as_of,
                        llm_out["score"],
                        llm_out["bullet_summary"],
                    ),
                )
    finally:
        conn.close()