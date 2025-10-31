import sys
import pathlib
import pandas as pd
from datetime import datetime, timezone
import requests  # for URL resolution & article fetching

# --- Resolve project root so "backend/" is importable ------------------------
project_root = pathlib.Path.cwd().resolve()
while not (project_root / "backend").is_dir():
    if project_root.parent == project_root:
        raise RuntimeError("Could not find project root containing 'backend/'")
    project_root = project_root.parent

if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# --- Imports after sys.path tweak -------------------------------------------
from backend.ai import langchain_llm
from backend.utils import fetch_links
from backend.utils import country_data_fetch
from backend import constants, data_retrieval, data_push
from backend.utils.url_resolver import resolve_google_news_url
from backend.utils.article_summary import extract_and_summarize
from backend.utils.article_media import extract_thumbnail

# --- Paths ------------------------------------------------------------------
BACKEND_DIR    = project_root / "backend"
PROCESSED_DATA = BACKEND_DIR / "data" / "wb_panel_wide"
RAW_DATA_EXCEL = BACKEND_DIR / "data" / "country_data.xlsx"

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
def _news_query_for(country_name: str) -> str:
    return f'"{country_name}" (economy OR inflation OR policy OR protest OR sanctions OR war OR coup OR corruption OR central bank OR IMF)'

def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

# --- Main -------------------------------------------------------------------
def main() -> None:
    """Loop countries → build payload → fetch news → LLM classify → push data to NeonDB."""
    print(f"=== AI Country Risk run started at {_to_utc_iso(datetime.now(timezone.utc))} UTC ===")

    # Map "Country_Name" → "iso2Code" from your Excel
    df_countries: pd.DataFrame = pd.read_excel(RAW_DATA_EXCEL)
    country_map = (
        df_countries[["Country_Name", "iso2Code"]]
        .dropna()
        .set_index("Country_Name")["iso2Code"]
        .to_dict()
    )

    for country_name, iso2 in country_map.items():
        try:
            # 1) Macro payload (pretty, JSON-serializable) — keep your original helper
            payload = data_retrieval.prepare_llm_payload_pretty(
                country_iso=iso2,
                indicators=constants.INDICATORS,
                since=2015,
                lookback=10,
                deltas=(1, 5),
            )

            # 2) Google News items
            query = _news_query_for(country_name or iso2)
            items = fetch_links.gnews_rss(
                query=query,
                max_results=25,
                expand=True,
                extract_chars=24000,
                build_summary=True,
                summary_words=240,
            )

            # Resolve Google wrapper URLs, improve summaries, and (optionally) add thumbnails
            with requests.Session() as _sess:
                # a) Replace news.google.com wrappers with publisher URLs
                for it in items:
                    link = it.get("link")
                    if isinstance(link, str) and "news.google.com" in link:
                        it["link"] = resolve_google_news_url(link, session=_sess)

                # b) Upgrade weak/missing summaries using BeautifulSoup text extraction
                for it in items:
                    cur_sum = (it.get("summary") or "").strip()
                    source  = (it.get("source")  or "").strip()
                    if (not cur_sum) or (len(cur_sum.split()) < 8) or (cur_sum.lower() == source.lower()):
                        link = it.get("link")
                        if isinstance(link, str) and link.startswith("http"):
                            summary, full_text = extract_and_summarize(link, session=_sess, max_words=160)
                            if summary:
                                it["summary"] = summary
                            if full_text:
                                it["content"] = full_text[:24000]  # optional extra context for LLM

                # c) Thumbnail (best-effort via OG/Twitter/JSON-LD or first content <img>)
                for it in items:
                    if not it.get("image"):
                        link = it.get("link")
                        if isinstance(link, str) and link.startswith("http"):
                            thumb = extract_thumbnail(link, session=_sess)
                            if thumb:
                                it["image"] = thumb

            # Assign stable ids for each article item ("a1","a2",...)
            for i, it in enumerate(items, start=1):
                it["id"] = f"a{i}"

            # 3) LLM scoring (omit temperature if your model/mode rejects it)
            llm_output = langchain_llm.country_llm_score(
                country_display=country_name,
                payload=payload,
                articles=items,
                model="gpt-4o-2024-08-06",
                seed=42,
            )

            # 4) Derive top-3 links by per-article impact (fallback to first 3)
            try:
                imp_map = {
                    (e.get("id") or ""): float(e.get("impact") or 0.0)
                    for e in (llm_output.get("news_article_scores") or [])
                    if isinstance(e, dict)
                }
            except Exception:
                imp_map = {}

            items_by_id = {it.get("id"): it for it in items if isinstance(it, dict) and it.get("id")}
            ranked = sorted(
                ((imp_map.get(iid, 0.0), items_by_id[iid]) for iid in items_by_id),
                key=lambda t: t[0],
                reverse=True
            )

            top_articles = []
            for r, (impact, it) in enumerate(ranked[:3] or [(0.0, it) for it in items[:3]], start=1):
                top_articles.append({
                    "rank": r,
                    "id": it.get("id"),
                    "url": it.get("link") or "",
                    "title": it.get("title") or "",
                    "source": it.get("source") or "",
                    "published_at": it.get("published") or None,
                    "impact": float(impact) if impact is not None else None,
                    "summary": it.get("summary") or it.get("snippet") or "",
                    "image": it.get("image")
                })

            # 5) Upsert to DB (writes country, indicator, yearly_value, snapshot, and top-3 links)
            data_push.upsert_snapshot(
                {**payload, "llm_output": llm_output, "top_articles": top_articles},
                    country_name=country_name
                    )

            # Optional progress print
            sc = llm_output.get("score")
            print(f"[{iso2}] score={sc}")
            print(f"article_url: {[a['url'] for a in top_articles]}")
            print(f"img_url: {[a['image'] for a in top_articles]}")

        except Exception as e:
            print(f"[{iso2}] ERROR: {e}")

    print(f"=== Run finished at {_to_utc_iso(datetime.now(timezone.utc))} UTC ===")


if __name__ == "__main__":
    main()
