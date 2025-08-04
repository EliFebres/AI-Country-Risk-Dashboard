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

from backend.utils import fetch_metrics
from backend import constants, data_retrieval, data_push
from backend.utils import country_data_fetch


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





# country_codes = []
# for country in countries:
#     country_iso_code = country_data_df[country_data_df["Country_Name"] == country]["iso2Code"].values.tolist()[0]

    