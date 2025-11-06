import os
import sys
import pathlib
import requests
import pandas as pd

from typing import List, Dict
from collections import defaultdict
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
from backend.utils.data_upsert import data_push
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
    
def _parse_date_for_sort(date_str):
    """Parse publication date for sorting. Returns datetime or epoch for invalid dates."""
    if not date_str:
        return datetime(1970, 1, 1)
    try:
        # Try ISO format
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except Exception:
        pass
    try:
        # Try date only
        return datetime.strptime(date_str[:10], "%Y-%m-%d")
    except Exception:
        return datetime(1970, 1, 1)

def _score_article_relevance(article: Dict, country_name: str) -> float:
    """
    Score article relevance (0-1) based on title/summary content.
    Higher = more relevant to geopolitical risk.
    """
    title = (article.get("title") or "").lower()
    summary = (article.get("summary") or article.get("snippet") or "").lower()
    text = f"{title} {summary}"
    country_lower = country_name.lower()
    
    # Must mention country
    if country_lower not in text:
        return 0.1
    
    score = 0.3  # Base score for mentioning country
    
    # HIGH relevance keywords (government/policy/economy/security)
    high_keywords = [
        'government', 'ministry', 'parliament', 'president', 'prime minister',
        'central bank', 'interest rate', 'monetary policy', 'inflation', 'gdp',
        'election', 'cabinet', 'policy', 'budget', 'fiscal', 'trade',
        'military', 'defense', 'conflict', 'sanctions', 'war', 'coup', 'security'
    ]
    
    # MEDIUM relevance keywords
    medium_keywords = [
        'economy', 'economic', 'finance', 'currency', 'debt', 'growth',
        'minister', 'official', 'regulation', 'law', 'reform'
    ]
    
    # LOW relevance (noise - entertainment/sports)
    noise_keywords = [
        'sport', 'football', 'soccer', 'basketball', 'tennis', 'cricket',
        'music', 'entertainment', 'celebrity', 'festival', 'award',
        'movie', 'film', 'actor', 'singer', 'concert'
    ]
    
    # Count matches
    high_count = sum(1 for kw in high_keywords if kw in text)
    medium_count = sum(1 for kw in medium_keywords if kw in text)
    noise_count = sum(1 for kw in noise_keywords if kw in text)
    
    # Scoring logic
    score += min(high_count * 0.15, 0.5)     # Up to +0.5 for high keywords
    score += min(medium_count * 0.08, 0.2)   # Up to +0.2 for medium keywords
    score -= noise_count * 0.2                # Penalty for noise
    
    # Bonus for title mentions (title is more important)
    if any(kw in title for kw in high_keywords):
        score += 0.15
    
    return max(0.0, min(1.0, score))


def _fetch_relevant_news(country_name: str, max_articles: int = 20) -> List[Dict]:
    """
    Fetch news using multiple targeted queries (political, economic, security).
    Score by relevance and return top max_articles most relevant items.
    """
    queries = [
        # Query 1: Government/Political
        f'"{country_name}" (government OR president OR prime minister OR parliament OR election OR cabinet OR coup OR protest)',
        
        # Query 2: Economic/Central Bank
        f'"{country_name}" (central bank OR interest rate OR inflation OR GDP OR currency OR monetary policy OR IMF OR World Bank)',
        
        # Query 3: Security/Military
        f'"{country_name}" (military OR defense OR conflict OR war OR attack OR sanctions OR security OR terrorism)',
    ]
    
    all_items = []
    seen_urls = set()
    
    for query in queries:
        items = fetch_links.gnews_rss(
            query=query,
            max_results=15,  # Fetch 15 per query = 45 total
            expand=True,
            extract_chars=24000,
            build_summary=True,
            summary_words=240,
        )
        
        # Deduplicate by URL
        for item in items:
            url = item.get("link", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_items.append(item)
    
    # Score each article for relevance
    for item in all_items:
        item["relevance_score"] = _score_article_relevance(item, country_name)
    
    # Sort by relevance (highest first)
    all_items.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
    
    # Filter out low-relevance articles (< 0.3)
    filtered = [item for item in all_items if item.get("relevance_score", 0) >= 0.3]
    
    # Return top max_articles
    return filtered[:max_articles]


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

            # 2) Fetch relevant news using multi-query strategy with relevance filtering
            items = _fetch_relevant_news(country_name or iso2, max_articles=20)
            
            if items:
                avg_rel = sum(it.get("relevance_score", 0) for it in items) / len(items)
                print(f"[{iso2}] Fetched {len(items)} articles (avg relevance: {avg_rel:.2f})")

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

            # 4) Rank and select Top-3 using AI's TOPIC CLUSTERING
            try:
                # Build maps from AI output
                article_scores = llm_output.get("news_article_scores") or []
                imp_map = {}
                topic_map = {}  # article_id -> topic_group
                
                for e in article_scores:
                    if not isinstance(e, dict):
                        continue
                    aid = e.get("id", "")
                    if not aid:
                        continue
                    
                    try:
                        imp_map[aid] = float(e.get("impact", 0.0))
                    except (ValueError, TypeError):
                        imp_map[aid] = 0.0
                    
                    topic_map[aid] = e.get("topic_group", "unknown")
                    
            except Exception:
                imp_map = {}
                topic_map = {}

            items_by_id = {it.get("id"): it for it in items if isinstance(it, dict) and it.get("id")}

            if imp_map and topic_map:
                # Group articles by topic_group (AI's clustering)
                topics = defaultdict(list)
                for aid, topic_group in topic_map.items():
                    topics[topic_group].append(aid)
                
                # For each topic, select the BEST article:
                # 1. Highest impact
                # 2. If tied, most recent publication date
                topic_representatives = []
                
                for topic_group, article_ids in topics.items():
                    # Sort by: impact DESC, then recency DESC
                    sorted_ids = sorted(
                        article_ids,
                        key=lambda aid: (
                            imp_map.get(aid, 0.0),  # Higher impact first
                            _parse_date_for_sort(items_by_id.get(aid, {}).get("published", ""))
                        ),
                        reverse=True
                    )
                    
                    # Take the best article from this topic
                    best_id = sorted_ids[0]
                    topic_representatives.append((
                        best_id,
                        imp_map.get(best_id, 0.0),
                        topic_group
                    ))
                
                # Sort topic representatives by impact (highest first) and take top 3
                topic_representatives.sort(key=lambda x: x[1], reverse=True)
                top_ids = [aid for aid, _, _ in topic_representatives[:3]]
                
                # Optional logging to see what AI clustered
                print(f"[{iso2}] AI identified {len(topics)} distinct topics:")
                for aid, imp, topic in topic_representatives[:5]:
                    title = items_by_id.get(aid, {}).get("title", "")[:60]
                    print(f"  - {topic[:30]:30s} | impact={imp:.2f} | {title}")
                
            else:
                # Fallback: naive sorting by impact if no topic info
                if imp_map:
                    ranked_ids = sorted(
                        items_by_id.keys(),
                        key=lambda iid: imp_map.get(iid, float("-inf")),
                        reverse=True,
                    )
                else:
                    ranked_ids = [it.get("id") for it in items if it.get("id")]
                top_ids = ranked_ids[:3]

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