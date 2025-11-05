import re
import html
import httpx
import asyncio
import feedparser
import trafilatura
import datetime as dt

from typing import List, Dict
from urllib.parse import urlencode, quote_plus


UA = "Mozilla/5.0 (compatible; ai-country-risk/1.0)"

def _gnews_url(query: str, lang: str = "en", country: str = "US") -> str:
    """Build a properly encoded Google News RSS search URL."""
    base = "https://news.google.com/rss/search"
    hl = f"{lang}-{country}"
    ceid = f"{country}:{lang}"
    params = {"q": query, "hl": hl, "gl": country, "ceid": ceid}
    return f"{base}?{urlencode(params, quote_via=quote_plus)}"

def _strip_html(s: str) -> str:
    """Remove all HTML (including <a> links) and unescape entities."""
    if not s:
        return ""
    s = re.sub(r"<a[^>]*>.*?</a>", "", s, flags=re.S | re.I)  # drop anchors
    s = re.sub(r"<[^>]+>", "", s)                              # drop remaining tags
    s = html.unescape(s)                                       # unescape entities
    s = re.sub(r"\s+", " ", s).strip()                         # collapse whitespace
    return s

def _clip_words(s: str, max_words: int) -> str:
    """Return the first max_words of s (by whitespace)."""
    if not s or max_words <= 0:
        return ""
    parts = s.split()
    if len(parts) <= max_words:
        return s.strip()
    return " ".join(parts[:max_words]).strip()

async def _fetch_text_async(url: str, client: httpx.AsyncClient, max_chars: int = 3000) -> str:
    try:
        r = await client.get(url, timeout=15)
        r.raise_for_status()
        text = trafilatura.extract(r.text) or ""
        return text[:max_chars]
    except Exception:
        return ""

def _fetch_text_sync(url: str, client: httpx.Client, max_chars: int = 3000) -> str:
    try:
        r = client.get(url, timeout=15)
        r.raise_for_status()
        text = trafilatura.extract(r.text) or ""
        return text[:max_chars]
    except Exception:
        return ""

async def _expand_items_async(entries: List[Dict], max_articles: int, max_chars: int) -> List[Dict]:
    urls = [e.get("link") for e in entries[:max_articles] if e.get("link")]
    async with httpx.AsyncClient(follow_redirects=True, headers={"User-Agent": UA}) as client:
        texts = await asyncio.gather(*(_fetch_text_async(u, client, max_chars) for u in urls), return_exceptions=True)
    out = []
    for e, t in zip(entries[:max_articles], texts):
        text = "" if isinstance(t, Exception) else (t or "")
        e2 = dict(e)
        e2["text"] = text
        e2["word_count"] = len(text.split())
        out.append(e2)
    return out + entries[max_articles:]

def _expand_items_sync(entries: List[Dict], max_articles: int, max_chars: int) -> List[Dict]:
    urls = [e.get("link") for e in entries[:max_articles] if e.get("link")]
    with httpx.Client(follow_redirects=True, headers={"User-Agent": UA}) as client:
        texts = [_fetch_text_sync(u, client, max_chars) for u in urls]
    out = []
    for e, text in zip(entries[:max_articles], texts):
        e2 = dict(e)
        e2["text"] = text or ""
        e2["word_count"] = len((text or "").split())
        out.append(e2)
    return out + entries[max_articles:]

def gnews_rss(
    query: str,
    *,
    max_results: int = 10,
    expand: bool = True,
    extract_chars: int = 3000,
    lang: str = "en",
    country: str = "US",
    build_summary: bool = True,
    summary_words: int = 240,
) -> List[Dict]:
    """
    Return Google News RSS items. If expand=True, also fetch and extract each article's main text.

    Each item contains:
      - 'title':        str
      - 'link':         str (publisher link)
      - 'published':    ISO8601 str or None
      - 'source':       str (publisher name if available)
      - 'snippet':      str (PLAIN TEXT, links removed)
      - 'snippet_html': str (original RSS summary with HTML)
      - ['text','word_count'] present when expand=True and extraction succeeds
      - ['summary','summary_word_count'] present when build_summary=True
    """
    url = _gnews_url(query, lang=lang, country=country)
    feed = feedparser.parse(url)

    items: List[Dict] = []
    for e in feed.entries[:max_results]:
        published = None
        if getattr(e, "published_parsed", None):
            published = dt.datetime(*e.published_parsed[:6]).isoformat() + "Z"
        raw_summary = getattr(e, "summary", "") or ""
        plain_summary = _strip_html(raw_summary)

        source_title = ""
        src = getattr(e, "source", None)
        if src and hasattr(src, "title"):
            source_title = getattr(src, "title", "") or ""
        elif isinstance(src, str):
            source_title = src

        items.append({
            "title": getattr(e, "title", "") or "",
            "link": getattr(e, "link", "") or "",
            "published": published,
            "source": source_title,
            "snippet": plain_summary,       # cleaned (no links/HTML)
            "snippet_html": raw_summary,    # original HTML (kept just in case)
        })

    # Optionally expand with article body text
    if expand and items:
        try:
            _ = asyncio.get_running_loop()  # raises RuntimeError if none
            items = _expand_items_sync(items, max_articles=max_results, max_chars=extract_chars)
        except RuntimeError:
            items = asyncio.run(_expand_items_async(items, max_articles=max_results, max_chars=extract_chars))

    # Build longer plain-text summaries (prefer extracted 'text', fallback to 'snippet')
    if build_summary and items:
        for e in items:
            base = e.get("text") or e.get("snippet") or ""
            summary = _clip_words(base, summary_words)
            e["summary"] = summary
            e["summary_word_count"] = len(summary.split())

    return items
