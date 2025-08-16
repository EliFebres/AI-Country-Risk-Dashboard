import sys
import pathlib
import pandas as pd

project_root = pathlib.Path.cwd().resolve()
while not (project_root / "backend").is_dir():
    if project_root.parent == project_root:
        raise RuntimeError("Could not find project root containing 'backend/'")
    project_root = project_root.parent

if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.utils import fetch_metrics, fetch_links
from backend import constants, data_retrieval, data_push
from backend.utils import country_data_fetch
from backend.ai import langchain_llm


# Paths
BACKEND_DIR      = project_root / "backend"
PROCESSED_DATA   = BACKEND_DIR / "data" / "wb_panel_wide"
RAW_DATA_EXCEL   = BACKEND_DIR / "data" / "country_data.xlsx"

excel_path = project_root / "backend" / "data" / "country_data.xlsx"
country_data_df: pd.DataFrame = pd.read_excel(excel_path)
countries: list[str] = country_data_df["Country_Name"].values.tolist()

# Test if country dataset exsists
dataset_exist = False
panel_dir = project_root / "backend" / "data" / "wb_panel_wide"
if panel_dir.is_dir():
    dataset_exist = True

# Ensure Processed Dataset Is Present
if dataset_exist == False:
    # Create wb_panel_wide folder
    panel_dir.mkdir(parents=True, exist_ok=True)
    # Create WB Panel Dataset for each Country
    country_data_fetch.ingest_panels_for_all_countries(
        excel_path=RAW_DATA_EXCEL,
        root=PROCESSED_DATA,
        indicators=constants.INDICATORS,
        start=None,
        end=None,
    )


def main() -> None:
    """Loop over countries → build payload → LLM score → upsert."""
    # Read the mapping of full country names → ISO-2 codes
    df_countries: pd.DataFrame = pd.read_excel(RAW_DATA_EXCEL)
    country_map = (
        df_countries[["Country_Name", "iso2Code"]]
        .dropna()
        .set_index("Country_Name")["iso2Code"]
        .to_dict()
    )

    for country_name, iso2 in country_map.items():
        # Build The Macro-economic Payload
        payload = data_retrieval.prepare_llm_payload_pretty(
            country_iso=iso2,
            indicators=constants.INDICATORS,
            since=2015,
            lookback=10,
            deltas=(1, 5),
        )

        # Grab Fresh Headlines For Context
        headlines = [
            h["title"]
            for h in fetch_links.gnews_rss(
                country=country_name,
                n=10,
                days=365,
                lang="en",
                region="US",
            )
        ]

        # # Ask The LLM For A Risk Score
        # llm_output = langchain_llm.country_llm_score(
        #     country=payload["country"],
        #     headlines=headlines,
        #     prompt_points=", ".join(payload["indicators"]),
        # )

        # Write Everything To Neon Db
        # data_push.upsert_snapshot({**payload, "llm_output": llm_output}, country_name=country_name)


if __name__ == "__main__":
    main()