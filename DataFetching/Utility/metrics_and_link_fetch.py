import os
import requests
from typing import Tuple

from serpapi import GoogleSearch
from tenacity import retry, wait_fixed, stop_after_attempt

# ---------------------------------------------------------------------------
# World Bank / SerpAPI helper functions
# ---------------------------------------------------------------------------

WB_ENDPOINT = "https://api.worldbank.org/v2/country/{code}/indicator/{ind}?format=json&per_page=60"


@retry(wait=wait_fixed(2), stop=stop_after_attempt(3))
def wb_latest(code: str, indicator: str) -> Tuple[float, int]:
    """Return the most-recent non-null observation for a World Bank indicator.

    Args:
        code (str) : ISO-2 or ISO-3 country code accepted by the World Bank API (e.g. ``"US"``).
        indicator (str) : World Bank indicator code such as ``"SP.POP.GROW"``.

    Returns:
        return (Tuple[float, int]) : ``(value, year)`` where *value* is cast to ``float`` and *year* is the observation year.
    """
    assert isinstance(code, str) and code, "`code` must be a non-empty string"
    assert isinstance(indicator, str) and indicator, "`indicator` must be a non-empty string"

    resp = requests.get(WB_ENDPOINT.format(code=code, ind=indicator), timeout=15)
    resp.raise_for_status()
    data = resp.json()[1]  # [0] is metadata

    # Grab the first record whose value is not null
    valid = next(d for d in data if d["value"] is not None)
    return float(valid["value"]), int(valid["date"])


def serp_news(query, n=10, *, lang="en", region="us"):
    """
    Fetch up to **n** Google-News results for *query* using SerpAPI, returning a
    list of dicts. It tries the dedicated *google_news* engine first and falls
    back to the “News” tab (`tbm=nws`) if no hits are found.

    Args:
        query (str) : Search terms (must be non-empty).
        n (int, optional) : Maximum number of articles to return (1-100, default 10).
        lang (str, optional) : Interface language code passed to Google (default "en").
        region (str, optional) : Geolocation code passed to Google (default "us").

    Returns:
        returns (list[dict[str, str]]) : Each dict contains ``link``, ``title``,
        ``source``, ``date``, ``snippet``.
    """
    assert isinstance(query, str) and query.strip(), "`query` must be a non-empty string"
    assert isinstance(n, int) and 0 < n <= 100, "`n` must be an int in 1…100"

    # Iterate over two SerpAPI engines: 1) dedicated Google News, 2) Google Search News-tab
    for params in ({"engine": "google_news"}, {"engine": "google", "tbm": "nws"}):
        res = GoogleSearch({
            **params, "q": query, "num": n, "hl": lang, "gl": region, 
            "api_key": os.environ["SERPAPI_API_KEY"]
            }).get_dict().get("news_results") # extract news results section
        
        if res:
            return [{k: item.get(k) for k in("link", "title", "source", "date", "snippet")} for item in res][:n]
    
    # If both engines returned nothing, fall back to empty list
    print(f"Warning! The query: '{query}' failed to return anything from SERPAPI search.")
    return []


