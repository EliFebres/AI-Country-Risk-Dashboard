import sys
import duckdb
import pathlib
import pandas as pd
from typing import Mapping, Optional

import backend.constants as constants
import backend.utils.fetch_metrics as fetch_metrics


def ingest_panel_wide(
    panel: pd.DataFrame,
    country_code: str,
    root: pathlib.Path,
) -> None:
    """
    Persist a *wide* World-Bank panel (years x indicators) as Parquet,
    partitioned by ``country_code`` under *root*.

    Directory layout
    ----------------
    root/  
    └── country_code=<CODE>/  
        └── panel.parquet
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
    con = duckdb.connect(":memory:")
    con.register("df", df)

    target = str(root).replace("'", "''")        # escape single quotes
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
    Loop through every country listed in *excel_path*, build its panel,
    and persist via :func:`ingest_panel_wide`.
    """
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
            tidy_fetch=True,
        )
        ingest_panel_wide(panel, iso_code, root)


# Example usage:
# ingest_panels_for_all_countries(
#     excel_path=RAW_DATA_EXCEL,
#     root=PROCESSED_DATA,
#     indicators=constants.INDICATORS,
#     start=None,
#     end=None,
# )
