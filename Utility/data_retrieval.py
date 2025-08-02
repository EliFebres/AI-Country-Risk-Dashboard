
import re
import duckdb
import pathlib
import pandas as pd
from datetime import datetime, timezone

import Utility.constants as constants


def query_macro_panel(country_iso_code: str) -> pd.DataFrame:
    """
    Load and return World Bank macro-panel data for a single country (years ≥ 2000).

    Parameters
    ----------
    country_iso_code : str
        Two- or three-letter ISO-alpha country code **in uppercase** (e.g. ``"US"``, ``"ARG"``).

    Returns
    -------
    pd.DataFrame
        A DataFrame containing all columns in the source parquet files, filtered to
        observations from the year 2000 onward and ordered chronologically.
    """
    # ---- validation --------------------------------------------------------
    assert isinstance(country_iso_code, str) and country_iso_code, "`country_iso_code` must be a non-empty str"
    assert re.fullmatch(r"[A-Z]{2,3}", country_iso_code), "`country_iso_code` must be a 2- or 3-letter uppercase ISO code"

    # ---- query parquet partition ------------------------------------------
    parquet_glob = (
        pathlib.Path("Data/wb_panel_wide")
        / f"country_code={country_iso_code}"
        / "*.parquet"
    )

    sql = f"""
        SELECT *
        FROM read_parquet('{parquet_glob.as_posix()}')
        WHERE year >= 2000
        ORDER BY year
    """

    return duckdb.sql(sql).df()


def prepare_llm_payload_pretty(
    country_iso: str,
    indicators: dict[str, str],
    *,
    since: int = 2015,
    lookback: int = 10,
    deltas: tuple[int, ...] = (1, 5),
) -> dict:
    """
    Build a compact, readable dictionary of recent macro-economic data
    suitable for consumption by a large-language model (LLM).

    The resulting structure groups each indicator under a friendly name,
    includes the latest value, Δ-changes over selected horizons, and a
    truncated time series:

    Parameters
    ----------
    country_iso : str
        Two- or three-letter ISO-alpha code (uppercase).
    indicators : dict[str, str]
        Mapping of raw column names to human-friendly labels.
    since : int, default 2015
        Earliest year to keep in the time series.
    lookback : int, default 10
        Number of most-recent years to retain per indicator.
    deltas : tuple[int, ...], default (1, 5)
        Horizons (in years) over which to compute percentage changes.

    Returns
    -------
    dict
        A nested dictionary as illustrated above.
    """
    # Input Validation
    assert isinstance(country_iso, str) and re.fullmatch(r"[A-Z]{2,3}", country_iso), \
        "`country_iso` must be a 2- or 3-letter uppercase ISO code"
    assert isinstance(indicators, dict) and indicators, "`indicators` must be a non-empty dict"
    assert all(isinstance(k, str) and k for k in indicators.keys()), "indicator keys must be non-empty str"
    assert isinstance(since, int) and 1900 <= since <= datetime.now().year, "`since` must be a reasonable year"
    assert isinstance(lookback, int) and lookback > 0, "`lookback` must be a positive int"
    assert all(isinstance(h, int) and h > 0 for h in deltas), "`deltas` must contain positive ints"

    # Load & Restrict Panel
    df = query_macro_panel(country_iso)
    df = df[df.year >= since]

    latest_row = df.tail(1).squeeze()
    latest_year = int(latest_row["year"])

    # Per-indicator Payload
    ind_payload: dict[str, dict] = {}
    for raw_col in indicators.keys():
        pretty_name = constants.NICE_NAME.get(raw_col, raw_col)

        # most-recent `lookback` values
        series = (
            df.set_index("year")[raw_col]
            .dropna()
            .tail(lookback)
            .round(2)
            .to_dict()
        )

        # Percentage Changes Over Each Horizon
        delta_vals = {}
        for h in deltas:
            pct = (
                df.set_index("year")[raw_col]
                .pct_change(h, fill_method=None)
                .round(3)
                .tail(1)
                .iloc[0]
            )
            delta_vals[f"Δ{h}y"] = None if pd.isna(pct) else float(pct)

        ind_payload[pretty_name] = {
            "latest": None if pd.isna(latest_row[raw_col]) else round(float(latest_row[raw_col]), 2),
            **delta_vals,
            "series": series,
        }

    # Assemble Final Structure
    return {
        "country": country_iso,
        "latest_year": latest_year,
        "indicators": ind_payload,
        "_meta": {
            "units": constants.UNITS,
            "source": "World Bank",
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "series_lookback": lookback,
        },
    }


# Useage
# country_context = prepare_llm_payload_pretty("IN",
#                                              constants.INDICATORS,
#                                              since=2020,
#                                              lookback=5)