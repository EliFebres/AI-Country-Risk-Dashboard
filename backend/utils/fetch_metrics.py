import logging
import requests
import pandas as pd
from tenacity import retry, wait_fixed, stop_after_attempt, retry_if_exception_type
from typing import List, Dict, Tuple, Mapping, Optional, Union, Any

import backend.constants as constants

# Some WB endpoints are picky for Taiwan; ISO-2 "TW" often needs ISO-3 "TWN".
_SPECIAL_WB_CODE = {"TW": "TWN",}

def _normalize_country_code(code: str) -> str:
    c = (code or "").strip().upper()
    # Minimal, surgical normalization for known outliers
    if len(c) == 2 and c in _SPECIAL_WB_CODE:
        return _SPECIAL_WB_CODE[c]
    return c


@retry(
    wait=wait_fixed(2),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type(requests.RequestException),  # retry network issues only
)
def wb_series(
    code: str,
    indicator: str,
    *,
    start: Optional[int] = None,
    end:   Optional[int] = None,
    tidy: bool = False,
    session: Optional[requests.Session] = None,
) -> Union[List[Tuple[int, Optional[float]]], pd.Series]:
    """
    Retrieve the full World-Bank time-series *indicator* for a single country.

    Parameters
    ----------
    code : str
        ISO-2 or ISO-3 country code (e.g. "US", "IND"). For Taiwan, we normalize "TW" → "TWN".
    indicator : str
        World-Bank indicator code (e.g. "NY.GDP.MKTP.KD.ZG").
    start, end : int | None, optional
        Inclusive year bounds. Supplying only one bound filters locally
        after download (WB API requires both for the `date=` parameter).
    tidy : bool, default False
        If True return a pandas.Series indexed by ascending years;
        otherwise return list[(year, value)] (descending, WB default).
    session : requests.Session | None, optional
        Re-use an existing requests.Session to speed up bulk calls.

    Returns
    -------
    list[tuple[int, float | None]]
        When tidy=False (descending years).
    pandas.Series
        When tidy=True (ascending years).
    """
    # Input Validation
    assert isinstance(code, str) and code.strip(),  "`code` must be non-empty str"
    assert isinstance(indicator, str) and indicator.strip(), "`indicator` must be non-empty str"
    assert isinstance(tidy, bool), "`tidy` must be bool"
    if start is not None:
        assert isinstance(start, int), "`start` must be int"
    if end is not None:
        assert isinstance(end, int),   "`end` must be int"
    if start is not None and end is not None:
        assert start <= end, "`start` year must be ≤ `end` year"
    if session is not None:
        assert isinstance(session, requests.Session), "`session` must be requests.Session"

    # Build Request
    if "?" in constants.WB_ENDPOINT:
        raise ValueError("WB_ENDPOINT should not include query parameters")

    norm_code = _normalize_country_code(code)
    url = constants.WB_ENDPOINT.format(code=norm_code, ind=indicator)
    params: Dict[str, str] = {"format": "json", "per_page": "1000"}
    if start is not None and end is not None:
        params["date"] = f"{start}:{end}"

    req = session or requests
    resp = req.get(url, params=params, timeout=15)
    resp.raise_for_status()

    # Parse Response (WB returns [meta, rows] where rows can be [] or None)
    payload = resp.json()
    if not isinstance(payload, list) or len(payload) < 2:
        raise RuntimeError(f"World Bank API error for {norm_code}/{indicator}: {payload}")

    rows = payload[1] or []  # key fix: treat None as empty list

    # Convert to list[(year, value)] in WB default order (desc by year)
    series_pairs: List[Tuple[int, Optional[float]]] = []
    for item in rows:
        try:
            year = int(item.get("date"))
        except (TypeError, ValueError):
            continue
        val = item.get("value")
        series_pairs.append((year, float(val) if val is not None else None))

    # Local Year Filtering When Only One Bound Supplied
    if start is not None and end is None:
        series_pairs = [(y, v) for y, v in series_pairs if y >= start]
    elif end is not None and start is None:
        series_pairs = [(y, v) for y, v in series_pairs if y <= end]

    if tidy:
        # Ascending years for tidy Series
        if not series_pairs:
            return pd.Series(dtype="float64", name=indicator)
        years = [y for (y, _) in series_pairs]
        vals  = [v for (_, v) in series_pairs]
        s = pd.Series(vals, index=years, name=indicator)
        return s.sort_index()

    # Default: return descending pairs (as WB provides)
    return series_pairs


def build_country_panel(
    code: str,
    indicators: Mapping[str, str],
    *,
    start: Optional[int] = None,
    end:   Optional[int] = None,
    tidy_fetch: bool = True,
) -> pd.DataFrame:
    """
    Fetch multiple World-Bank indicators for one country and assemble them
    into a year-by-factor table.

    Parameters
    ----------
    code : str
        ISO-2 or ISO-3 country code (e.g. "IN", "USA").
    indicators : Mapping[str, str]
        {column_name: wb_indicator_code} pairs; the mapping's *keys* become columns.
    start, end : int | None, optional
        Inclusive year bounds forwarded to wb_series.
    tidy_fetch : bool, default True
        If True call wb_series(..., tidy=True) to get ascending Series;
        else get raw list and tidy locally.

    Returns
    -------
    pandas.DataFrame
        Index = year (int); columns = factor names; dtype = float64 where possible.
        May be empty if no indicators returned any rows.
    """
    assert isinstance(code, str) and code.strip(), "`code` must be non-empty str"
    assert indicators, "`indicators` mapping must not be empty"
    assert all(isinstance(k, str) and k.strip() for k in indicators.keys()), \
        "all indicator names must be non-empty str"
    assert all(isinstance(v, str) and v.strip() for v in indicators.values()), \
        "all World-Bank codes must be non-empty str"
    if start is not None and end is not None:
        assert start <= end, "`start` year must be ≤ `end` year"
    assert isinstance(tidy_fetch, bool), "`tidy_fetch` must be bool"

    frames: List[pd.Series] = []
    for col, ind_code in indicators.items():
        try:
            if tidy_fetch:
                s: Any = wb_series(code, ind_code, start=start, end=end, tidy=True)
                # Ensure proper naming
                if isinstance(s, pd.Series):
                    s.name = col
                else:
                    # Extremely defensive, though tidy=True always returns Series
                    s = pd.Series(dtype="float64", name=col)
            else:
                lst = wb_series(code, ind_code, start=start, end=end, tidy=False)
                if not lst:
                    s = pd.Series(dtype="float64", name=col)
                else:
                    years, vals = zip(*lst)  # WB order is descending
                    s = pd.Series(list(vals)[::-1], index=list(years)[::-1], name=col)
        except requests.RequestException as e:
            logging.warning("WB network error for %s/%s: %s (skipping)", code, ind_code, e)
            continue
        except Exception as e:
            logging.warning("WB error for %s/%s: %s (skipping)", code, ind_code, e)
            continue

        frames.append(s)

    if not frames:
        return pd.DataFrame()

    panel = pd.concat(frames, axis=1, sort=True)  # outer-join on year
    # Cast numerics where possible
    try:
        panel = panel.astype("float64")
    except Exception:
        pass
    return panel
