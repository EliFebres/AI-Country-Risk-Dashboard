import requests
import pandas as pd
from tenacity import retry, wait_fixed, stop_after_attempt
from typing import List, Dict, Tuple, Iterable, Mapping, Optional, Union, Any

import DataFetching.Utility.constants as constants


@retry(wait=wait_fixed(2), stop=stop_after_attempt(3))
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
        ISO-2 or ISO-3 country code (e.g. ``"US"``, ``"IND"``).
    indicator : str
        World-Bank indicator code (e.g. ``"NY.GDP.MKTP.KD.ZG"``).
    start, end : int | None, optional
        Inclusive year bounds. Supplying only one bound filters locally
        **after** download (WB API requires both for the `date=` parameter).
    tidy : bool, default ``False``
        If ``True`` return a :class:`pandas.Series` indexed by ascending
        years; otherwise return ``list[(year, value)]`` in WB-default
        descending order.
    session : requests.Session | None, optional
        Re-use an existing :class:`requests.Session` to speed up bulk calls.

    Returns
    -------
    list[tuple[int, float | None]]
        When ``tidy=False`` (default).
    pandas.Series
        When ``tidy=True``.

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

    url = constants.WB_ENDPOINT.format(code=code, ind=indicator)
    params: Dict[str, str] = {"format": "json", "per_page": "1000"}

    if start is not None and end is not None:
        params["date"] = f"{start}:{end}"

    req = session or requests
    resp = req.get(url, params=params, timeout=15)
    resp.raise_for_status()

    # Parse Response
    payload = resp.json()
    if not isinstance(payload, list) or len(payload) < 2:
        raise RuntimeError(f"World Bank API error for {code}/{indicator}: {payload}")

    raw = payload[1]  # [0] = metadata
    series: List[Tuple[int, Optional[float]]] = [
        (int(item["date"]),
         float(item["value"]) if item["value"] is not None else None)
        for item in raw
    ]

    # Local Year Filtering When Only One Bound Supplied
    if start is not None and end is None:
        series = [(y, v) for y, v in series if y >= start]
    elif end is not None and start is None:
        series = [(y, v) for y, v in series if y <= end]

    if tidy:
        years, values = zip(*reversed(series))  # ascending
        return pd.Series(values, index=years, name=indicator)

    return series


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
        ISO-2 or ISO-3 country code (e.g. ``"IN"``, ``"USA"``).
    indicators : Mapping[str, str]
        ``{column_name: wb_indicator_code}`` pairs; the mapping's *keys*
        become DataFrame columns.
    start, end : int | None, optional
        Inclusive year bounds forwarded to :func:`wb_series`.
    tidy_fetch : bool, default ``True``
        If ``True`` call :func:`wb_series`` with ``tidy=True`` (ascending
        :class:`pandas.Series`).  Otherwise retrieve the raw list returned by
        ``wb_series(..., tidy=False)`` and tidy it locally.

    Returns
    -------
    pandas.DataFrame
        Index = year (``int``); columns = factor names; dtype = ``float64``.
    """
    # Input Validation
    assert isinstance(code, str) and code.strip(), "`code` must be non-empty str"
    assert indicators, "`indicators` mapping must not be empty"
    assert all(isinstance(k, str) and k.strip() for k in indicators.keys()), \
        "all indicator names must be non-empty str"
    assert all(isinstance(v, str) and v.strip() for v in indicators.values()), \
        "all World-Bank codes must be non-empty str"
    if start is not None and end is not None:
        assert start <= end, "`start` year must be ≤ `end` year"
    assert isinstance(tidy_fetch, bool), "`tidy_fetch` must be bool"

    frames = []
    for col, ind_code in indicators.items():
        if tidy_fetch:
            # wb_series already returns a tidy Series (ascending years)
            s: Any = wb_series(code, ind_code, start=start, end=end, tidy=True)
        else:
            # Convert list[(year, value)]  →  Series
            lst = wb_series(code, ind_code, start=start, end=end, tidy=False)
            years, vals = zip(*lst)            # still descending
            s = pd.Series(vals[::-1],          # flip to ascending
                          index=years[::-1])

        s.name = col
        frames.append(s)

    panel = pd.concat(frames, axis=1, sort=True)   # outer-join on year
    return panel.astype("float64")