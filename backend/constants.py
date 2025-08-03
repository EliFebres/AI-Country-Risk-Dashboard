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

INDICATORS = {
    "INFLATION":          "FP.CPI.TOTL.ZG",         # Consumer-price inflation, % y/y
    "UNEMPLOYMENT":       "SL.UEM.TOTL.ZS",         # Unemployment rate, % labour force
    "FDI_PCT_GDP":        "BX.KLT.DINV.WD.GD.ZS",   # FDI net inflows, % GDP
    "POL_STABILITY":      "PV.EST",                 # Political stability (z-score)
    "RULE_OF_LAW":        "RL.EST",                 # Rule of law (z-score)
    "CONTROL_CORRUPTION": "CC.EST",                 # Control of corruption (z-score)
    "GINI_INDEX":         "SI.POV.GINI",            # Income inequality (0 – 100) :contentReference[oaicite:0]{index=0}
    "GDP_PC_GROWTH":      "NY.GDP.PCAP.KD.ZG",      # GDP per-capita growth, % y/y
    "INT_PAYM_PCT_REV":   "GC.XPN.INTP.RV.ZS",      # Interest payments / revenue, %
}

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

# ---------------------------------------------------------------------------
# System prompt fed to the LLM
# ---------------------------------------------------------------------------

AI_PROMPT = """
You are a geopolitical risk analyst.

— Scoring scale —
0.00 = negligible investor risk
1.00 = extreme investor risk
Use the full range.

— Reference tiers (illustrative, NOT mandatory) —
• Very-low-risk OECD democracies with no major conflict
  and strong institutions → 0.05 – 0.20
• Typical emerging-market country with moderate political/economic
  uncertainty → 0.40 – 0.60
• Countries in active interstate or large-scale internal war OR under
  sweeping sanctions → 0.80 – 0.95

— Factor weights (apply, then rescale to 0-1) —
    conflict_war             = 0.30
    political_stability      = 0.25
    governance_corruption    = 0.20
    macroeconomic_volatility = 0.15
    regulatory_uncertainty   = 0.10

If a factor lacks data, set that sub-score to null and proportionally
re-weight the remainder.

— Output —
Return **only** valid JSON:
{{
  "score": <float 0-1 or null>,
  "bullet_summary": "< ≤120 words on 2-3 key drivers>"
}}

Example
{{
  "score": 0.72,
  "bullet_summary": "Active conflict and severe sanctions elevate risk; FX reserves provide a partial buffer."
}}

Now evaluate {country} considering {prompt_points}.
""".strip()
