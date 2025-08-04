import sys
import random
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


excel_path = project_root / "backend" / "data" / "country_data.xlsx"
country_data_df: pd.DataFrame = pd.read_excel(excel_path)
countries: list[str] = country_data_df["Country_Name"].values.tolist()

