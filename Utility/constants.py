# ---------------------------------------------------------------------------
# Display names for indicators
# ---------------------------------------------------------------------------

NICE_NAME: dict[str, str] = {
    "INFLATION":          "Inflation (% y/y)",
    "UNEMPLOYMENT":       "Unemployment (% labour force)",
    "FDI_PCT_GDP":        "FDI inflow (% GDP)",
    "POL_STABILITY":      "Political stability (z-score)",
    "RULE_OF_LAW":        "Rule of law (z-score)",
    "CONTROL_CORRUPTION": "Control of corruption (z-score)",
    "GINI_INDEX":         "Income inequality (Gini)",
    "GDP_PC_GROWTH":      "GDP per-capita growth (% y/y)",
    "INT_PAYM_PCT_REV":   "Interest payments (% revenue)",
}

# ---------------------------------------------------------------------------
# Units for the pretty labels above
# ---------------------------------------------------------------------------

UNITS: dict[str, str] = {
    "Inflation (% y/y)":             "% y/y",
    "Unemployment (% labour force)": "%",
    "FDI inflow (% GDP)":            "% GDP",
    "Political stability (z-score)": "z-score",
    "Rule of law (z-score)":         "z-score",
    "Control of corruption (z-score)": "z-score",
    "Income inequality (Gini)":      "index",
    "GDP per-capita growth (% y/y)": "% y/y",
    "Interest payments (% revenue)": "% revenue",
}
