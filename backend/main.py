import sys
import pathlib
import pandas as pd
from datetime import datetime, timedelta, timezone

# --- Resolve project root so "backend/" is importable ------------------------
project_root = pathlib.Path.cwd().resolve()
while not (project_root / "backend").is_dir():
    if project_root.parent == project_root:
        raise RuntimeError("Could not find project root containing 'backend/'")
    project_root = project_root.parent

if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# --- Imports after sys.path tweak -------------------------------------------
from backend.utils import fetch_metrics, fetch_links
from backend import constants, data_retrieval, data_push
from backend.utils import country_data_fetch
from backend.ai import langchain_llm

# --- Paths ------------------------------------------------------------------
BACKEND_DIR    = project_root / "backend"
PROCESSED_DATA = BACKEND_DIR / "data" / "wb_panel_wide"
RAW_DATA_EXCEL = BACKEND_DIR / "data" / "country_data.xlsx"

# Optional: read the country list (not strictly needed below)
country_data_df: pd.DataFrame = pd.read_excel(RAW_DATA_EXCEL)
countries: list[str] = country_data_df["Country_Name"].values.tolist()

# --- Ensure processed World Bank panel exists -------------------------------
panel_dir = PROCESSED_DATA
if not panel_dir.is_dir():
    panel_dir.mkdir(parents=True, exist_ok=True)
    country_data_fetch.ingest_panels_for_all_countries(
        excel_path=RAW_DATA_EXCEL,
        root=PROCESSED_DATA,
        indicators=constants.INDICATORS,
        start=None,
        end=None,
    )

# --- Helpers ----------------------------------------------------------------
def _parse_iso(s: str):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def _clip_words(s: str, max_words: int = 600) -> str:
    parts = s.split()
    return " ".join(parts[:max_words])

def _fmt(x):
    """Pretty-print numbers; keep None as 'NA'."""
    if x is None:
        return "NA"
    try:
        # keep small floats readable, integers clean
        return f"{float(x):.2f}".rstrip("0").rstrip(".")
    except Exception:
        return str(x)

def build_macro_context(payload: dict, max_rows: int = 12) -> str:
    """
    Build a compact newline-delimited snapshot like:
      Inflation (% y/y): 2.3 (2024; Δ1y -0.8, Δ5y +0.4)
    Falls back gracefully if some keys are missing.
    """
    units = payload.get("_meta", {}).get("units", {}) or {}
    rows = []
    for k, info in payload.get("indicators", {}).items():
        info = info or {}
        # Common key variants we might have
        val   = info.get("latest") or info.get("latest_value") or info.get("value")
        year  = info.get("latest_year") or info.get("year")
        d1    = info.get("delta_1y") or info.get("d1") or info.get("delta1")
        d5    = info.get("delta_5y") or info.get("d5") or info.get("delta5")
        unit  = units.get(k, "")
        unit  = f" {unit}" if unit else ""

        row = f"{k}: {_fmt(val)}{unit}"
        meta_bits = []
        if year is not None:
            meta_bits.append(str(year))
        if d1 is not None:
            meta_bits.append(f"Δ1y {_fmt(d1)}")
        if d5 is not None:
            meta_bits.append(f"Δ5y {_fmt(d5)}")
        if meta_bits:
            row += f" ({'; '.join(meta_bits)})"
        rows.append(row)

    # Keep prompt small
    if len(rows) > max_rows:
        rows = rows[:max_rows] + [f"... (+{len(rows)-max_rows} more)"]
    return "\n".join(rows) if rows else "NA"

def main() -> None:
    """Loop countries → build payload → build rich headlines → LLM score."""
    # Map "Country_Name" → "iso2Code"
    df_countries: pd.DataFrame = pd.read_excel(RAW_DATA_EXCEL)
    country_map = (
        df_countries[["Country_Name", "iso2Code"]]
        .dropna()
        .set_index("Country_Name")["iso2Code"]
        .to_dict()
    )

    for country_name, iso2 in country_map.items():
        # 1) Macro payload
        payload = data_retrieval.prepare_llm_payload_pretty(
            country_iso=iso2,
            indicators=constants.INDICATORS,
            since=2015,
            lookback=10,
            deltas=(1, 5),
        )
        prompt_points = ", ".join(payload["indicators"].keys())

        # 2) Google News (expanded with extracted article text)
        DAYS = 365
        query = f'{country_name} (economy OR politics OR conflict OR sanctions OR inflation OR war)'

        items = fetch_links.gnews_rss(
            query=query,
            max_results=10,
            expand=True,        # fetch & extract article body
            extract_chars=3500, # cap per-article text
            lang="en",
            country="US",
        )

        # 2a) Filter by recency
        cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)
        items = [
            it for it in items
            if (dt := _parse_iso(it.get("published") or "")) is None or dt >= cutoff
        ]

        # 2b) Build richer evidence strings (title + extracted body OR clean snippet)
        headlines_rich: list[str] = []
        seen = set()
        for it in items:
            title = (it.get("title") or "").strip()
            body = (it.get("text") or it.get("snippet") or "").strip()
            if not title and not body:
                continue
            # Deduplicate on title to avoid near-identical wires
            if title in seen:
                continue
            seen.add(title)
            evidence = f"{title}\n{_clip_words(body, max_words=600)}".strip()
            if evidence:
                headlines_rich.append(evidence)

        # Fallback: if nothing came back, at least pass titles
        if not headlines_rich:
            headlines_rich = [it.get("title", "") for it in items if it.get("title")]

        # 3) LLM scoring
        macro_context = build_macro_context(payload)

        llm_output = langchain_llm.country_llm_score(
            country=payload["country"],
            headlines=headlines_rich,
            prompt_points=prompt_points,
            macro_context=macro_context,
            attempts=3,
        )

        # 4) Upsert to DB (uncomment when ready)
        data_push.upsert_snapshot({**payload, "llm_output": llm_output}, country_name=country_name)

        # Optional: simple progress print
        print(f"[{country_name}] score={llm_output.get('score')} words={sum(len(h.split()) for h in headlines_rich)}")

if __name__ == "__main__":
    main()
