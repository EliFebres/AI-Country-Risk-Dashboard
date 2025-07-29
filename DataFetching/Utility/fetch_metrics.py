import requests

from typing import Tuple
from tenacity import retry, wait_fixed, stop_after_attempt

import DataFetching.Utility.constants as constants


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

    resp = requests.get(constants.WB_ENDPOINT.format(code=code, ind=indicator), timeout=15)
    resp.raise_for_status()
    data = resp.json()[1]  # [0] is metadata

    # Grab the first record whose value is not null
    valid = next(d for d in data if d["value"] is not None)
    return float(valid["value"]), int(valid["date"])


# Code Use Demonstration
# val, year = wb_latest("AR", "SP.POP.GROW")
# print(f"Argentina population growth {year}: {val:.2f}%")
