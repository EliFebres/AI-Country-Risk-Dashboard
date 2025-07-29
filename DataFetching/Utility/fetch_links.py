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

    feed = feedparser.parse(url)
    cutoff = dt.datetime.utcnow() - dt.timedelta(days=days)

    def _to_dict(e):
        # Skip entries older than cutoff
        pub = dt.datetime(*e.published_parsed[:6]) if "published_parsed" in e else None
        if pub and pub < cutoff:
            return None
        return {
            "link":      e.link,
            "title":     e.title,
            "source":    e.get("source", {}).get("title", ""),
            "published": e.published if "published" in e else "",
            "snippet":   e.summary if "summary" in e else "",
        }

    # Fetch more than needed in case of filtered-out items
    return [d for e in feed.entries[:n*2] if (d := _to_dict(e))][:n]


# Code Use Demonstration
# articles = gnews_rss(
#        country="Argentina",
#        n=5,
#        days=365,     # look-back window (default is already 365)
#        lang="en",    # UI language
#        region="US"   # geolocation
# )
# articles