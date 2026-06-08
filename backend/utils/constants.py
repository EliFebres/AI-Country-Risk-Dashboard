"""
Shared constants for the AI Country Risk Dashboard.

Only literals—no runtime imports—to avoid circular dependencies.
"""

# ---------------------------------------------------------------------------
# External data source
# ---------------------------------------------------------------------------

WB_ENDPOINT: str = ("https://api.worldbank.org/v2/country/{code}/indicator/{ind}")

# ---------------------------------------------------------------------------
# Economic / governance indicators (World Bank series)
# ---------------------------------------------------------------------------

# World Bank series only — every value here is fetched from the World Bank API.
# Non-WB sources (e.g. the OWID Political Corruption Index) live in EXTRA_INDICATORS
# so the World Bank fetch loop never sees a non-WB code.
INDICATORS = {
    "INFLATION":          "FP.CPI.TOTL.ZG",         # Consumer-price inflation, % y/y
    "UNEMPLOYMENT":       "SL.UEM.TOTL.ZS",         # Unemployment rate, % labour force
    "FDI_PCT_GDP":        "BX.KLT.DINV.WD.GD.ZS",   # FDI net inflows, % GDP
    "POL_STABILITY":      "GOV_WGI_PV.EST",         # Political stability (z-score)
    "RULE_OF_LAW":        "GOV_WGI_RL.EST",         # Rule of law (z-score)
    "GINI_INDEX":         "SI.POV.GINI",            # Income inequality (0 – 100)
    "GDP_PC_GROWTH":      "NY.GDP.PCAP.KD.ZG",      # GDP per-capita growth, % y/y
    "INT_PAYM_PCT_REV":   "GC.XPN.INTP.RV.ZS",      # Interest payments / revenue, %
}

# Non-World-Bank indicators. The value is a sentinel (never sent to the WB API);
# these are merged into each country's panel after the WB fetch (see
# backend/utils/data_fetching/political_corruption_fetch.py and
# country_data_fetch.merge_extra_indicators).
EXTRA_INDICATORS = {
    "POL_CORRUPTION":     "OWID:political-corruption-index",  # V-Dem via Our World in Data
}

# Full set used by the read/DB side (data_retrieval + data_push). The fetch side
# uses INDICATORS (WB-only) so the WB loop never tries to fetch the sentinel.
ALL_INDICATORS = {**INDICATORS, **EXTRA_INDICATORS}

# ---------------------------------------------------------------------------
# Coverage universe (50 countries: 25 Developed + 25 Emerging)
# ---------------------------------------------------------------------------

SELECTED_COUNTRIES: list[str] = [
    # --- Developed Markets ---
    "United States", "Canada", "Germany", "France", "United Kingdom",
    "Japan", "Australia", "Austria", "Belgium", "Denmark",
    "Finland", "Ireland", "Italy", "Netherlands", "New Zealand",
    "Norway", "Portugal", "Singapore", "Spain", "Sweden",
    "Switzerland", "Israel", "Hong Kong SAR, China", "Greece", "Luxembourg",
    # --- Emerging Markets ---
    "Argentina", "Brazil", "Chile", "China", "Colombia",
    "Hungary", "India", "Indonesia", "Malaysia", "Mexico",
    "Pakistan", "Peru", "Philippines", "Poland", "Qatar",
    "Romania", "Saudi Arabia", "South Africa", "Thailand", "United Arab Emirates",
    "Ukraine", "Morocco", "Kenya", "Nigeria", "Bangladesh",
]

# ---------------------------------------------------------------------------
# Country roster (hardcoded). Source of truth for the run universe — replaces
# the former backend/data/country_data.xlsx read. Each entry carries the
# display name, ISO-2 (World Bank / DB key) and ISO-3 (OWID join key).
# ---------------------------------------------------------------------------

COUNTRY_ROSTER: list[dict[str, str]] = [
    {"name": "United Arab Emirates",  "iso2": "AE", "iso3": "ARE"},
    {"name": "Argentina",             "iso2": "AR", "iso3": "ARG"},
    {"name": "Australia",             "iso2": "AU", "iso3": "AUS"},
    {"name": "Austria",               "iso2": "AT", "iso3": "AUT"},
    {"name": "Belgium",               "iso2": "BE", "iso3": "BEL"},
    {"name": "Bangladesh",            "iso2": "BD", "iso3": "BGD"},
    {"name": "Brazil",                "iso2": "BR", "iso3": "BRA"},
    {"name": "Canada",                "iso2": "CA", "iso3": "CAN"},
    {"name": "Switzerland",           "iso2": "CH", "iso3": "CHE"},
    {"name": "Chile",                 "iso2": "CL", "iso3": "CHL"},
    {"name": "China",                 "iso2": "CN", "iso3": "CHN"},
    {"name": "Colombia",              "iso2": "CO", "iso3": "COL"},
    {"name": "Germany",               "iso2": "DE", "iso3": "DEU"},
    {"name": "Denmark",               "iso2": "DK", "iso3": "DNK"},
    {"name": "Egypt",                 "iso2": "EG", "iso3": "EGY"},
    {"name": "Spain",                 "iso2": "ES", "iso3": "ESP"},
    {"name": "Finland",               "iso2": "FI", "iso3": "FIN"},
    {"name": "France",                "iso2": "FR", "iso3": "FRA"},
    {"name": "United Kingdom",        "iso2": "GB", "iso3": "GBR"},
    {"name": "Greece",                "iso2": "GR", "iso3": "GRC"},
    {"name": "Hong Kong SAR, China",  "iso2": "HK", "iso3": "HKG"},
    {"name": "Hungary",               "iso2": "HU", "iso3": "HUN"},
    {"name": "Indonesia",             "iso2": "ID", "iso3": "IDN"},
    {"name": "India",                 "iso2": "IN", "iso3": "IND"},
    {"name": "Ireland",               "iso2": "IE", "iso3": "IRL"},
    {"name": "Israel",                "iso2": "IL", "iso3": "ISR"},
    {"name": "Italy",                 "iso2": "IT", "iso3": "ITA"},
    {"name": "Japan",                 "iso2": "JP", "iso3": "JPN"},
    {"name": "Kazakhstan",            "iso2": "KZ", "iso3": "KAZ"},
    {"name": "Kenya",                 "iso2": "KE", "iso3": "KEN"},
    {"name": "South Korea",           "iso2": "KR", "iso3": "KOR"},
    {"name": "Luxembourg",            "iso2": "LU", "iso3": "LUX"},
    {"name": "Morocco",               "iso2": "MA", "iso3": "MAR"},
    {"name": "Mexico",                "iso2": "MX", "iso3": "MEX"},
    {"name": "Mongolia",              "iso2": "MN", "iso3": "MNG"},
    {"name": "Malaysia",              "iso2": "MY", "iso3": "MYS"},
    {"name": "Nigeria",               "iso2": "NG", "iso3": "NGA"},
    {"name": "Netherlands",           "iso2": "NL", "iso3": "NLD"},
    {"name": "Norway",                "iso2": "NO", "iso3": "NOR"},
    {"name": "New Zealand",           "iso2": "NZ", "iso3": "NZL"},
    {"name": "Pakistan",              "iso2": "PK", "iso3": "PAK"},
    {"name": "Peru",                  "iso2": "PE", "iso3": "PER"},
    {"name": "Philippines",           "iso2": "PH", "iso3": "PHL"},
    {"name": "Poland",                "iso2": "PL", "iso3": "POL"},
    {"name": "Portugal",              "iso2": "PT", "iso3": "PRT"},
    {"name": "Qatar",                 "iso2": "QA", "iso3": "QAT"},
    {"name": "Romania",               "iso2": "RO", "iso3": "ROU"},
    {"name": "Russia",                "iso2": "RU", "iso3": "RUS"},
    {"name": "Saudi Arabia",          "iso2": "SA", "iso3": "SAU"},
    {"name": "Singapore",             "iso2": "SG", "iso3": "SGP"},
    {"name": "Sweden",                "iso2": "SE", "iso3": "SWE"},
    {"name": "Thailand",              "iso2": "TH", "iso3": "THA"},
    {"name": "Turkey",                "iso2": "TR", "iso3": "TUR"},
    {"name": "Ukraine",               "iso2": "UA", "iso3": "UKR"},
    {"name": "United States",         "iso2": "US", "iso3": "USA"},
    {"name": "Venezuela",             "iso2": "VE", "iso3": "VEN"},
    {"name": "South Africa",          "iso2": "ZA", "iso3": "ZAF"},
]

# Convenience lookups derived from the roster.
ISO3_BY_ISO2: dict[str, str] = {c["iso2"]: c["iso3"] for c in COUNTRY_ROSTER}
COUNTRY_NAME_BY_ISO2: dict[str, str] = {c["iso2"]: c["name"] for c in COUNTRY_ROSTER}

# ---------------------------------------------------------------------------
# Display names for indicators
# ---------------------------------------------------------------------------

NICE_NAME: dict[str, str] = {
    "INFLATION":          "Inflation (% y/y)",
    "UNEMPLOYMENT":       "Unemployment (% labour force)",
    "FDI_PCT_GDP":        "FDI inflow (% GDP)",
    "POL_STABILITY":      "Political stability (z-score)",
    "RULE_OF_LAW":        "Rule of law (z-score)",
    "GINI_INDEX":         "Income inequality (Gini)",
    "GDP_PC_GROWTH":      "GDP per-capita growth (% y/y)",
    "INT_PAYM_PCT_REV":   "Interest payments (% revenue)",
    "POL_CORRUPTION":     "Political corruption index (0–1, higher = more corrupt)",
}

# ---------------------------------------------------------------------------
# Units for the pretty labels above
# ---------------------------------------------------------------------------

UNITS: dict[str, str] = {
    "Inflation (% y/y)":               "% y/y",
    "Unemployment (% labour force)":   "%",
    "FDI inflow (% GDP)":              "% GDP",
    "Political stability (z-score)":   "z-score",
    "Rule of law (z-score)":           "z-score",
    "Income inequality (Gini)":        "index",
    "GDP per-capita growth (% y/y)":   "% y/y",
    "Interest payments (% revenue)":   "% revenue",
    "Political corruption index (0–1, higher = more corrupt)": "index (0–1)",
}
