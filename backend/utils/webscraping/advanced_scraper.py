from __future__ import annotations

import json
import os
import time
import random
import requests
import tldextract
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Union
from urllib.parse import urlparse
from urllib import robotparser

from bs4 import BeautifulSoup

# --- Optional .env loading (safe if python-dotenv is missing) ---
try:
    from dotenv import load_dotenv  # type: ignore

    THIS_DIR = Path(__file__).resolve().parent
    # Load backend/.env (this file's folder)
    load_dotenv(THIS_DIR / ".env")
    # Also try repo root .env without overriding existing envs
    load_dotenv(THIS_DIR.parent / ".env", override=False)
except Exception:
    pass

# -------------------- Constants -------------------- #
API_BASE = "https://api.crawlbase.com"
TIMEOUT_SECS = 90
DEFAULT_UA = "NewsMetaScraper/1.0 (AI Country Risk) Python"

# -------------------- Time helper -------------------- #
def now_utc_z() -> str:
    """ISO 8601 UTC with trailing 'Z'."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# -------------------- robots.txt compliance -------------------- #
_robots_cache: Dict[str, robotparser.RobotFileParser] = {}

def robots_allowed(url: str, user_agent: str = DEFAULT_UA) -> bool:
    """
    Parse and cache robots.txt for the host, then check can_fetch.
    Returns False if robots can't be fetched (conservative).
    """
    parsed = urlparse(url)
    scheme = parsed.scheme or "https"
    host = parsed.netloc
    base = f"{scheme}://{host}"
    rp = _robots_cache.get(base)

    if rp is None:
        rp = robotparser.RobotFileParser()
        robots_url = f"{base}/robots.txt"
        try:
            rp.set_url(robots_url)
            rp.read()
            _robots_cache[base] = rp
        except Exception:
            # If robots can't be fetched, treat as disallowed (conservative).
            return False

    try:
        return rp.can_fetch(user_agent, url)
    except Exception:
        return False

# -------------------- Crawlbase fetch -------------------- #
def _resolve_token(explicit_token: Optional[str]) -> Optional[str]:
    """Prefer explicit token, then JS token, then standard token."""
    return explicit_token or os.getenv("CRAWLBASE_JS_TOKEN") or os.getenv("CRAWLBASE_TOKEN")

def crawlbase_fetch(url: str, token: str) -> Dict[str, Any]:
    """
    Hit Crawlbase with format=json to receive HTML body plus metadata.
    """
    params = {
        "token": token,
        "url": url,
        "format": "json",     # returns JSON envelope with 'body', 'original_status', etc.
        "device": "desktop",
        "page_wait": 2000,    # ms: let DOM settle
        "ajax_wait": 2000,    # ms: let XHRs settle
        # "country": "US",    # uncomment if you need region pinning
        # "pretty": "true",   # helpful during debugging
    }
    r = requests.get(
        API_BASE,
        params=params,
        headers={"Accept-Encoding": "gzip", "User-Agent": DEFAULT_UA},
        timeout=TIMEOUT_SECS,
    )
    r.raise_for_status()
    return r.json()

# -------------------- HTML parsing helpers -------------------- #
def _first_meta(soup: BeautifulSoup, *names) -> Optional[str]:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return None

def _parse_json_ld(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Parse the first Article/NewsArticle JSON-LD block we can find.
    """
    out: Dict[str, Any] = {}
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            raw = script.string or ""
            if not raw.strip():
                continue
            data = json.loads(raw)
        except Exception:
            continue

        candidates = data if isinstance(data, list) else [data]
        for obj in candidates:
            if not isinstance(obj, dict):
                continue
            typ = obj.get("@type") or obj.get("type")
            if isinstance(typ, list):
                typ = next((t for t in typ if isinstance(t, str)), None)
            if str(typ).lower() in {"article", "newsarticle"} or obj.get("headline") or obj.get("datePublished"):
                out.setdefault("headline", obj.get("headline"))
                out.setdefault("datePublished", obj.get("datePublished") or obj.get("dateCreated"))
                # image can be str/list/dict
                img = obj.get("image")
                if isinstance(img, str):
                    out.setdefault("image", img)
                elif isinstance(img, list) and img:
                    out.setdefault("image", img[0])
                elif isinstance(img, dict) and img.get("url"):
                    out.setdefault("image", img.get("url"))
                if obj.get("description"):
                    out.setdefault("description", obj["description"])
                pub = obj.get("publisher")
                if isinstance(pub, dict) and pub.get("name"):
                    out.setdefault("source", pub.get("name"))
                return out
    return out

def extract_metadata(html: str, url: str) -> Dict[str, Any]:
    """
    Generic extractor with domain-aware nudges for Reuters/Bloomberg.
    """
    soup = BeautifulSoup(html, "html.parser")
    ext = tldextract.extract(url)
    domain = ".".join([p for p in [ext.domain, ext.suffix] if p])

    # Generic OG/Twitter
    title = _first_meta(soup, "og:title", "twitter:title") or (soup.title.string.strip() if soup.title else None)
    description = _first_meta(soup, "og:description", "twitter:description")
    image = _first_meta(soup, "og:image", "twitter:image", "twitter:image:src")
    published = _first_meta(soup, "article:published_time", "og:pubdate", "publish_date", "date")

    # JSON-LD fallback (often better for date/image)
    ld = _parse_json_ld(soup)
    title = title or ld.get("headline")
    description = description or ld.get("description")
    image = image or ld.get("image")
    published = published or ld.get("datePublished")

    # Domain nudges:
    if domain == "reuters.com":
        time_tag = soup.find("time", attrs={"datetime": True})
        if time_tag and time_tag.get("datetime"):
            published = published or time_tag["datetime"].strip()
    elif domain == "bloomberg.com":
        # Usually well-covered by OG/JSON-LD above
        pass

    return {
        "title": title,
        "description": description,
        "image_url": image,
        "published_at": published,
        "source_domain": domain,
    }

# -------------------- Orchestrator -------------------- #
def scrape_one(url: str, token: str, respect_robots: bool = True) -> Dict[str, Any]:
    """
    Fetch via Crawlbase and extract metadata, with polite retries.
    """
    if respect_robots and not robots_allowed(url):
        return {
            "url": url,
            "skipped": True,
            "reason": "robots_disallow",
            "fetched_at": now_utc_z(),
        }

    tries = 0
    last_err = None
    while tries < 3:
        tries += 1
        try:
            cb = crawlbase_fetch(url, token)
            original_status = cb.get("original_status")
            body = cb.get("body") or ""
            if not body or original_status is None or int(original_status) >= 400:
                raise RuntimeError(f"Upstream original_status={original_status}")
            meta = extract_metadata(body, url)
            return {
                "url": url,
                "fetched_at": now_utc_z(),
                "original_status": original_status,
                "html_bytes": len(body),
                **meta,
            }
        except Exception as e:
            last_err = str(e)
            # jittered backoff
            time.sleep(0.8 * tries + random.random() * 0.6)

    return {
        "url": url,
        "error": f"failed_after_retries: {last_err}",
        "fetched_at": now_utc_z(),
    }

def _normalize_urls(urls: Union[str, List[str]]) -> List[str]:
    if isinstance(urls, str):
        return [urls]
    return list(urls)

def main(
    urls: Union[str, List[str]],
    outfile: Optional[str] = None,
    token: Optional[str] = None,
    respect_robots: bool = True,
) -> List[Dict[str, Any]]:
    """
    Scrape one or many URLs via Crawlbase and extract metadata.

    Args:
        urls: A single URL string or a list of URL strings.
        outfile: Optional path to write newline-delimited JSON.
        token: Explicit Crawlbase token; if None, uses env (CRAWLBASE_JS_TOKEN/CRAWLBASE_TOKEN).
        respect_robots: If True, skip URLs disallowed by robots.txt.

    Returns:
        List of result dictionaries.
    """
    tok = _resolve_token(token)
    if not tok:
        raise RuntimeError("Set CRAWLBASE_JS_TOKEN or CRAWLBASE_TOKEN (or pass token=).")

    urls_list = _normalize_urls(urls)
    results: List[Dict[str, Any]] = []

    out_fp = open(outfile, "w", encoding="utf-8") if outfile else None
    try:
        for u in urls_list:
            rec = scrape_one(u, tok, respect_robots=respect_robots)
            results.append(rec)
            if out_fp:
                out_fp.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out_fp.flush()
            time.sleep(0.25)  # polite pacing
    finally:
        if out_fp:
            out_fp.close()

    return results