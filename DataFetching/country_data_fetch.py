import sys
import duckdb
import pathlib
import pandas as pd
from typing import Mapping, Optional

# find the project root by looking for a directory that contains "DataFetching"
cwd = pathlib.Path().resolve()
project_root = cwd
while not (project_root / "DataFetching").exists():
    if project_root.parent == project_root:
        raise RuntimeError("Could not find project root containing DataFetching/")
    project_root = project_root.parent

sys.path.insert(0, str(project_root)) # add project root to sys.path

import DataFetching.Utility.constants as constants
import DataFetching.Utility.fetch_metrics as fetch_metrics


def ingest_panel_wide(
    panel: pd.DataFrame,
    country_code: str,
    root: pathlib.Path,
) -> None:
    """
    Persist a *wide* World-Bank panel (years × indicators) as a Parquet
    dataset, partitioned by ``country_code``.

    Parameters
    ----------
    panel : pandas.DataFrame
        Index = year (``int``), columns = indicator names. Output of
        :func:`build_country_panel`.
    country_code : str
        ISO-2/ISO-3 code (e.g. ``"JP"``, ``"IND"``); becomes the partition
        value ``country_code=<CODE>``.
    root : pathlib.Path
        Target directory for the Parquet dataset. Created if it does not
        already exist.

    Directory layout
    ----------------
    ``root/``  
    └── ``country_code=<CODE>/``  
        └── ``panel.parquet``

    Raises
    ------
    AssertionError
        On invalid inputs.
    duckdb.Error
        Propagated if the COPY operation fails.
    """
    # ---- argument validation -----------------------------------------------
    assert isinstance(panel, pd.DataFrame), "`panel` must be a DataFrame"
    assert not panel.empty, "`panel` must contain at least one row"
    assert isinstance(country_code, str) and country_code.strip(), \
        "`country_code` must be a non-empty str"
    assert isinstance(root, pathlib.Path), "`root` must be a pathlib.Path"

    # ---- tidy DataFrame for DuckDB -----------------------------------------
    df: pd.DataFrame = (
        panel
        .copy()
        .reset_index(names="year")           # index → 'year'
        .assign(country_code=country_code)   # partition column
    )

    # ---- ensure destination exists -----------------------------------------
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)

    # ---- write Parquet via DuckDB ------------------------------------------
    con = duckdb.connect(":memory:")
    con.register("df", df)

    target = str(root).replace("'", "''")    # escape single quotes
    con.execute(
        f"""
        COPY df
        TO '{target}'
        (FORMAT PARQUET,
         PARTITION_BY ('country_code'),
         OVERWRITE_OR_IGNORE 1);
        """
    )
    con.close()


def ingest_panels_for_all_countries(
    excel_path: pathlib.Path,
    root: pathlib.Path,
    indicators: Mapping[str, str],
    *,
    start: Optional[int] = None,
    end:   Optional[int] = None,
) -> None:
    """
    Loop through every country listed in *excel_path*, download its full
    factor panel, and persist the result via :func:`ingest_panel_wide`.

    Parameters
    ----------
    excel_path : pathlib.Path
        Excel file containing at least the columns ``"Country_Name"`` and
        ``"iso2Code"``.
    root : pathlib.Path
        Root directory for the partitioned Parquet dataset.
    indicators : Mapping[str, str]
        Mapping forwarded to :func:`build_country_panel`.
    start, end : int | None, optional
        Year bounds forwarded to :func:`build_country_panel`.

    Returns
    -------
    None
        Writes Parquet files to *root*; nothing is returned.

    Raises
    ------
    AssertionError
        On invalid inputs.
    RuntimeError
        Propagated from downstream API calls.
    """
    # Input Validation
    assert excel_path.is_file(), f"{excel_path} does not exist"
    assert indicators, "`indicators` mapping must not be empty"
    if start is not None and end is not None:
        assert start <= end, "`start` year must be ≤ `end` year"

    # Read List Of Countries
    country_data_df = pd.read_excel(excel_path)
    required_cols = {"Country_Name", "iso2Code"}
    if not required_cols.issubset(country_data_df.columns):
        raise ValueError(f"{excel_path} missing columns {required_cols}")

    # Iterate & Ingest
    for _, row in country_data_df.iterrows():
        country_name = row["Country_Name"]
        iso_code     = row["iso2Code"]

        panel = fetch_metrics.build_country_panel(
            iso_code,
            indicators,
            start=start,
            end=end,
            tidy_fetch=True,
        )
        ingest_panel_wide(panel, iso_code, root)
        break


# Fetch All Data Points for All Countries
country_data_excel_path = r"/home/linux/Projects/AI-Country-Risk-Dashboard/Data/country_data.xlsx"
ingest_panels_for_all_countries(
    excel_path=pathlib.Path(country_data_excel_path),
    root=pathlib.Path("Data/wb_panel_wide"),
    indicators=constants.INDICATORS,
    start=None,
    end=None,
)