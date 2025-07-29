
# World Bank REST endpoint template – fill in {code} with the ISO-2/3 country code
# and {ind} with the indicator ID (e.g., "SP.POP.GROW"); returns a JSON series with
# up to 60 yearly observations.
WB_ENDPOINT = "https://api.worldbank.org/v2/country/{code}/indicator/{ind}?format=json&per_page=60"