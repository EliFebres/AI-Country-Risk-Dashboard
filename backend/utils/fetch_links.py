import time
import random
import feedparser
import urllib.parse
import datetime as dt

from typing import List, Dict


def _build_query(country: str, days: int = 365) -> str:
    """
    Construct a Google News search query string targeting a country's
    economic or political news published within the last *days*.

    Example:
        Input: country="Argentina", days=365
        Output: '"Argentina" (economic OR political) when:365d'
    """
    assert isinstance(country, str) and country.strip(), "`country` must be a non-empty string"
    assert isinstance(days, int) and days > 0, "`days` must be a positive integer"

    # Quote the country and filter for economic/political news within the timeframe
    return f"\"{country}\" (economic OR political) when:{days}d"


def gnews_rss(country: str,
              n: int = 10,
              *,
              days: int = 365,
              lang: str = "en",
              region: str = "US") -> List[Dict[str, str]]:
    """
    Fetch up to *n* recent Google News items related to the economic or political
    situation of the given *country*, published within the last *days* (default: 365).
    
    Returns:
        A list of dictionaries, each containing:
        - link: URL to the news article
        - title: Headline of the article
        - source: News source name
        - published: Published timestamp (RFC 822 string or empty)
        - snippet: Summary or excerpt of the article
    """
    # ---- validation ---------------------------------------------------------
    assert isinstance(country, str) and country.strip(), "`country` must be a non-empty string"
    assert isinstance(n, int) and 0 < n <= 100, "`n` must be an integer between 1 and 100"
    assert isinstance(days, int) and days > 0, "`days` must be a positive integer"

    # ---- build RSS URL ------------------------------------------------------
    q = urllib.parse.quote_plus(_build_query(country, days))
    url = (f"https://news.google.com/rss/search?q={q}"
           f"&hl={lang}&gl={region}&ceid={region}:{lang.split('-')[0]}")

    # Add browser-like headers to bypass bot detection
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': f'{lang},{lang.split("-")[0]};q=0.5',
        'Connection': 'keep-alive',
        'Referer': 'https://news.google.com/'
    }
    
    # Google blocks rapid requests - add random delay to avoid detection
    time.sleep(random.uniform(1.5, 3.5))  # Critical to avoid being blocked [[6]]
    
    # Parse feed with custom headers
    feed = feedparser.parse(url, request_headers=headers)
    
    # Handle potential redirects (Google often changes URLs)
    if feed.status in [301, 302, 307, 308] and 'location' in feed.headers:
        feed = feedparser.parse(feed.headers['location'], request_headers=headers)

    cutoff = dt.datetime.utcnow() - dt.timedelta(days=days)

    def _to_dict(e):
        # Skip entries older than cutoff
        if "published_parsed" in e:
            pub = dt.datetime(*e.published_parsed[:6])
            if pub < cutoff:
                return None
        return {
            "link":      e.link,
            "title":     e.title,
            "source":    e.get("source", {}).get("title", "Unknown"),
            "published": e.published if "published" in e else "",
            "snippet":   e.get("summary", e.get("content", [{}])[0].get("value", "")) if "summary" not in e else e.summary,
        }

    # Fetch more than needed in case of filtered-out items
    valid_entries = []
    for e in feed.entries[:n*2]:
        entry = _to_dict(e)
        if entry:
            valid_entries.append(entry)
        if len(valid_entries) >= n:
            break
            
    return valid_entries[:n]