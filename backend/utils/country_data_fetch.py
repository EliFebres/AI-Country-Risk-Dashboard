import shutil
import duckdb
import pathlib
import pandas as pd

from zoneinfo import ZoneInfo
from typing import Mapping, Optional
from datetime import datetime, date, timedelta

import backend.utils.fetch_metrics as fetch_metrics


def _first_monday(year: int, month: int) -> date:
    d = date(year, month, 1)
    return d + timedelta(days=(0 - d.weekday()) % 7)

def _is_first_monday_of_quarter(now: datetime) -> bool:
    return now.month in (1, 4, 7, 10) and now.date() == _first_monday(now.year, now.month)


def ingest_panel_wide(panel: pd.DataFrame, country_code: str, root: pathlib.Path) -> None:
    """Persist a wide World Bank panel to Parquet, partitioned by country.

    The input ``panel`` is expected to be **wide** (rows = years, columns =
    indicators) with the index representing calendar years. The function resets
    the index to a ``year`` column, attaches the provided ``country_code``,
    and uses an in-memory DuckDB connection to `COPY` the data as Parquet
    files partitioned by ``country_code`` under ``root``.

    Args:
        panel (pd.DataFrame): Non-empty, wide-form DataFrame whose index are
            years and whose columns are indicator codes (or similar). The index
            will be reset to a ``year`` column.
        country_code (str): ISO-2 (or similar) country code used both as a
            data column and the Parquet partition key.
        root (pathlib.Path): Output directory. It will be created if missing,
            then used as the COPY destination for Parquet output.

    Returns:
        None
    """
    # Input Validation
    assert isinstance(panel, pd.DataFrame) and not panel.empty, \
        "`panel` must be a non-empty DataFrame"
    assert isinstance(country_code, str) and country_code.strip(), \
        "`country_code` must be a non-empty str"
    assert isinstance(root, pathlib.Path), "`root` must be a pathlib.Path"

    # Tidy Dataframe For Duckdb
    df: pd.DataFrame = (
        panel.reset_index(names="year")          # index → 'year'
             .assign(country_code=country_code)  # partition column
    )

    # Ensure Destination Exists
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)

    # Write Via Duckdb
    con = None
    try:
        con = duckdb.connect(":memory:")
        con.register("df", df)

        target = str(root).replace("'", "''")  # escape single quotes for SQL literal
        con.execute(
            f"""
            COPY df
            TO '{target}'
            (FORMAT PARQUET,
             PARTITION_BY ('country_code'),
             OVERWRITE_OR_IGNORE 1);
            """
        )
    
    finally:
        con.close()



def ingest_panels_for_all_countries(
    excel_path: pathlib.Path,
    root: pathlib.Path,
    indicators: Mapping[str, str],
    *,
    start: Optional[int] = None,
    end:   Optional[int] = None
) -> None:
    """Build and persist per-country World Bank panels from a roster Excel file.

    On the first Monday of each calendar quarter (Jan, Apr, Jul, Oct; timezone
    ``America/New_York``), the function deletes the directory at ``root`` using
    a safety-guarded `shutil.rmtree` and then recreates it to produce a clean
    snapshot before ingest.

    Args:
        excel_path (pathlib.Path): Path to the country roster Excel file.
            Must exist and include columns ``"Country_Name"`` and ``"iso2Code"``.
        root (pathlib.Path): Root output directory where per-country panel
            artifacts are written. On quarterly cleanup days, this directory is
            deleted and recreated at the start of the run.
        indicators (Mapping[str, str]): Mapping of indicator codes to labels/
            descriptions passed to the panel fetcher. Must not be empty.
        start (Optional[int], keyword-only): First calendar year to include
            (inclusive). If ``None``, the fetcher’s default is used.
        end (Optional[int], keyword-only): Last calendar year to include
            (inclusive). If ``None``, the fetcher’s default is used.

    Returns:
        None
    """
    # Quarterly cleanup (first Monday of each quarter, America/New_York)
    now = datetime.now(ZoneInfo("America/New_York"))
    if _is_first_monday_of_quarter(now) and root.is_dir():
        # Safety guard: avoid catastrophic deletes (like '/')
        root_resolved = root.resolve()
        if len(root_resolved.parts) <= 3:  # tweak threshold for your project layout
            raise RuntimeError(f"Refusing to delete suspiciously high-level path: {root_resolved}")
        shutil.rmtree(root_resolved)

    # Input Validation
    assert excel_path.is_file(), f"{excel_path} does not exist"
    assert indicators, "`indicators` mapping must not be empty"
    if start is not None and end is not None:
        assert start <= end, "`start` year must be ≤ `end` year"

    # Read Country List
    country_df = pd.read_excel(excel_path)
    required_cols = {"Country_Name", "iso2Code"}
    if not required_cols.issubset(country_df.columns):
        raise ValueError(f"{excel_path} missing columns {required_cols}")

    # Iterate & Ingest
    for _, row in country_df.iterrows():
        iso_code = row["iso2Code"]
        
        panel = fetch_metrics.build_country_panel(
            iso_code, 
            indicators, 
            start=start, 
            end=end, 
            tidy_fetch=True
        )
        
        ingest_panel_wide(panel, iso_code, root)
