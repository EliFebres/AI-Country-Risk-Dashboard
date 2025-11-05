import re
import os
import sys
import pathlib
import requests
import pandas as pd
from datetime import datetime, timezone

# --- Resolve project root so "backend/" is importable ------------------------
project_root = pathlib.Path.cwd().resolve()
while not (project_root / "backend").is_dir():
    if project_root.parent == project_root:
        raise RuntimeError("Could not find project root containing 'backend/'")
    project_root = project_root.parent

if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# --- Internal Imports -------------------------------------------
from backend.utils import constants
from backend.utils import data_retrieval
from backend.utils.ai import langchain_llm
from backend.utils.news_fetching import fetch_links
from backend.utils.data_fetching import fetch_metrics
from backend.utils.data_fetching import country_data_fetch
from backend.utils.news_fetching.url_resolver import resolve_google_news_url
from backend.utils.news_fetching.simple_scraper import get_article_assets
from backend.utils.news_fetching.advanced_scraper import scrape_one as crawlbase_scrape_one

# --- Paths ------------------------------------------------------------------
BACKEND_DIR    = project_root / "backend"
PROCESSED_DATA = BACKEND_DIR / "data" / "wb_panel_wide"
RAW_DATA_EXCEL = BACKEND_DIR / "data" / "country_data.xlsx"


# --- Helpers ----------------------------------------------------------------
def _news_query_for(country_name: str) -> str:
    return f'"{country_name}" (economy OR inflation OR policy OR protest OR sanctions OR war OR coup OR corruption OR central bank OR IMF)'

def _to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

def _crawlbase_token() -> str:
    # Prefer JS token, then standard token
    return os.getenv("CRAWLBASE_JS_TOKEN") or os.getenv("CRAWLBASE_TOKEN") or ""

def _has_country_partition(root: pathlib.Path, iso2: str) -> bool:
    """
    Return True if a partition dir like country_code=XX exists and has at least one .parquet file.
    """
    part_dir = root / f"country_code={iso2}"
    if not part_dir.is_dir():
        return False
    try:
        return any(p.suffix == ".parquet" for p in part_dir.glob("*.parquet"))
    except Exception:
        return False

def ensure_missing_country_panels(excel_path: pathlib.Path,
                                  root: pathlib.Path,
                                  indicators: dict,
                                  start: int | None = None,
                                  end: int | None = None) -> None:
    """
    Make sure every country in excel_path has a partition under root.
    Only (re)build and write partitions that are missing or empty.
    """
    root.mkdir(parents=True, exist_ok=True)

    df = pd.read_excel(excel_path)
    if not {"Country_Name", "iso2Code"}.issubset(df.columns):
        raise ValueError(f"{excel_path} must include 'Country_Name' and 'iso2Code' columns.")

    missing = []
    for _, row in df.iterrows():
        iso2 = str(row["iso2Code"]).strip()
        if not iso2:
            continue
        if not _has_country_partition(root, iso2):
            missing.append(iso2)

    if not missing:
        print(f"All {len(df)} countries already have parquet partitions in {root}.")
        return

    print(f"Backfilling {len(missing)} missing panels → {missing}")
    for iso2 in missing:
        try:
            panel = fetch_metrics.build_country_panel(
                iso2,
                indicators,
                start=start,
                end=end,
                tidy_fetch=True,
            )
            if panel is None or panel.empty:
                print(f"[{iso2}] No World Bank rows for selected indicators — skipping write.")
                continue

            country_data_fetch.ingest_panel_wide(panel, iso2, root)
            print(f"[{iso2}] Wrote panel with {panel.shape[0]} years × {panel.shape[1]} indicators.")
        except Exception as e:
            print(f"[{iso2}] ERROR while backfilling panel: {e}")

# ---------- Topic-diversity helpers (NEW) ----------
_STOPWORDS = {
    "the","a","an","of","and","for","to","in","on","at","by","with",
    "from","is","are","was","were","be","as","it","that","this"
}

def _norm_title_tokens(t: str) -> set[str]:
    """Lowercase, strip punctuation, drop stopwords → token set."""
    t = re.sub(r"[^a-z0-9\s]", " ", (t or "").lower())
    return {w for w in t.split() if w and w not in _STOPWORDS}

def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))

def pick_top_diverse(
    items_by_id: dict[str, dict],
    imp_map: dict[str, float],
    k: int = 3,
    sim_threshold: float = 0.60
) -> list[str]:
    """
    Greedy selection of top-k by impact, skipping titles that are too similar
    to already-selected ones (Jaccard on token sets).
    """
    ranked_ids = sorted(items_by_id.keys(), key=lambda iid: imp_map.get(iid, 0.0), reverse=True)
    chosen: list[str] = []
    chosen_sets: list[set[str]] = []

    for iid in ranked_ids:
        title = (items_by_id[iid].get("title") or "")
        tokens = _norm_title_tokens(title)
        if any(_jaccard(tokens, ts) >= sim_threshold for ts in chosen_sets):
            continue  # too similar to an already-chosen topic
        chosen.append(iid)
        chosen_sets.append(tokens)
        if len(chosen) == k:
            break

    # Backfill if we couldn't get k unique topics
    if len(chosen) < k:
        for iid in ranked_ids:
            if iid not in chosen:
                chosen.append(iid)
                if len(chosen) == k:
                    break
    return chosen


# --- Main -------------------------------------------------------------------
def main() -> None:
    """Loop countries → payload → news → LLM score → enrich Top-3 images if missing → DB."""
    print(f"=== AI Country Risk run started at {_to_utc_iso(datetime.now(timezone.utc))} UTC ===")

    # 0) Ensure/Backfill World Bank panels per country (incremental, idempotent)
    ensure_missing_country_panels(
        excel_path=RAW_DATA_EXCEL,
        root=PROCESSED_DATA,
        indicators=constants.INDICATORS,
        start=None,
        end=None,
    )

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
            # 1) Macro payload (pretty, JSON-serializable)
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
                max_results=10,
                expand=True,
                extract_chars=24000,
                build_summary=True,
                summary_words=240,
            )

            # --- Resolve and do light enrichment using ONLY the simple scraper ---
            with requests.Session() as _sess:
                # a) Replace news.google.com wrappers with publisher URLs
                for it in items:
                    link = it.get("link")
                    if isinstance(link, str) and "news.google.com" in link:
                        it["link"] = resolve_google_news_url(link, session=_sess)

                # b) Ensure summary/content and thumbnail (simple scraper, single GET)
                for it in items:
                    link = it.get("link")
                    if not isinstance(link, str) or not link.startswith("http"):
                        continue

                    cur_sum = (it.get("summary") or "").strip()
                    source  = (it.get("source")  or "").strip()
                    need_summary = (not cur_sum) or (len(cur_sum.split()) < 8) or (cur_sum.lower() == source.lower())
                    need_image = not it.get("image")

                    if need_summary or need_image:
                        thumb, summary, full_text = get_article_assets(link, session=_sess, max_words=160)
                        if need_summary and summary:
                            it["summary"] = summary
                        if full_text:
                            it["content"] = full_text[:24000]
                        if need_image and thumb:
                            it["image"] = thumb

            # Assign stable ids ("a1","a2",...)
            for i, it in enumerate(items, start=1):
                it["id"] = f"a{i}"

            # 3) LLM scoring
            llm_output = langchain_llm.country_llm_score(
                country_display=country_name,
                payload=payload,
                articles=items,
                model="gpt-4o-2024-08-06",
                seed=42,
            )

            # 4) Rank and select Top-3 by impact with topic diversity (NEW)
            try:
                imp_map = {
                    (e.get("id") or ""): float(e.get("impact") or 0.0)
                    for e in (llm_output.get("news_article_scores") or [])
                    if isinstance(e, dict)
                }
            except Exception:
                imp_map = {}

            items_by_id = {it.get("id"): it for it in items if isinstance(it, dict) and it.get("id")}
            top_ids = pick_top_diverse(items_by_id, imp_map, k=3, sim_threshold=0.60)
            if not top_ids:
                # fallback if LLM returned no impacts
                top_ids = [it.get("id") for it in items[:3] if it.get("id")]

            # 5) Enrich ONLY the Top-3 with missing images using the advanced scraper
            cb_token = _crawlbase_token()
            if cb_token:
                for iid in top_ids:
                    it = items_by_id.get(iid)
                    if not it:
                        continue
                    if it.get("image"):   # only if image is missing
                        continue
                    link = it.get("link") or ""
                    if not isinstance(link, str) or not link.startswith("http"):
                        continue

                    rec = crawlbase_scrape_one(link, cb_token, respect_robots=True)
                    if rec.get("error") or rec.get("skipped"):
                        continue
                    # Fill image if Crawlbase found one
                    if rec.get("image_url"):
                        it["image"] = rec["image_url"]
                    # (Optional tiny bonus) backfill published if missing
                    if (not it.get("published")) and rec.get("published_at"):
                        it["published"] = rec["published_at"]

            # 6) Build Top-3 payload AFTER enrichment
            top_articles = []
            for r, iid in enumerate(top_ids, start=1):
                it = items_by_id.get(iid, {})
                impact = None
                try:
                    impact = float(imp_map.get(iid, 0.0))
                except Exception:
                    impact = None

                top_articles.append({
                    "rank": r,
                    "id": it.get("id"),
                    "url": it.get("link") or "",
                    "title": it.get("title") or "",
                    "source": it.get("source") or "",
                    "published_at": it.get("published") or None,
                    "impact": float(impact) if impact is not None else None,
                    "summary": it.get("summary") or it.get("snippet") or "",
                    "image": it.get("image"),
                })

            # 7) Upsert to DB
            # data_push.upsert_snapshot(
            #     {**payload, "llm_output": llm_output, "top_articles": top_articles},
            #     country_name=country_name
            # )

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
