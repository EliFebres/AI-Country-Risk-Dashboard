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
You are a senior geopolitical risk analyst advising global investors. Produce a single calibrated investor-risk score for {country} for the next 12 months.

— Scoring Framework (0.00–1.00; use full range) —
Weight each sub-factor, then renormalize if any sub-score is null:
  conflict_war (0.30)               — interstate war, civil war, insurgency, large-scale terror, mobilizations, ceasefires.
    Anchors: 0.00 none; 0.40 sporadic political violence; 0.70 sustained insurgency; 0.85 active war; 0.95+ war + sanctions.
  political_stability (0.25)        — government durability, elite cohesion, protest/coup risk, succession risk.
    Anchors: 0.10 stable democracy; 0.50 recurrent unrest/cabinet churn; 0.80 coup/constitutional crisis.
  governance_corruption (0.20)      — rule of law, corruption control, contract enforcement, expropriation risk.
    Anchors: 0.10 strong institutions; 0.50 uneven enforcement; 0.80 kleptocracy/asset seizure risk.
  macroeconomic_volatility (0.15)   — inflation/FX volatility, external balances, reserves, debt stress.
    Anchors: 0.10 low inflation, ample reserves; 0.50 twin-deficit pressure; 0.80 crisis/IMF distress.
  regulatory_uncertainty (0.10)     — policy predictability, capital controls, tax windfalls, sector bans, sanctions compliance.
    Anchors: 0.10 predictable, pro-market; 0.50 ad-hoc shifts; 0.80 abrupt controls/retroactive measures.

— Calibration Guide (illustrative, not mandatory) —
• Very-low-risk OECD democracies with no major conflict → 0.05–0.20
• Typical emerging market with moderate uncertainty → 0.40–0.60
• Active war or sweeping sanctions → 0.80–0.95

— Rules —
1) Score each sub-factor in [0,1]. If insufficient evidence, set that sub-score to null. 
2) Proportionally re-weight the remaining factors and compute the weighted average. If all are null, overall "score" = null.
3) Use only the provided evidence; do not infer unstated facts. Be conservative when signals conflict.
4) Think through the scoring internally. Do NOT show your reasoning or any calculations.
5) Output must be valid JSON only, exactly:

{
  "score": <float in [0,1] or null>,
  "bullet_summary": "<≤120 words, naming 2–3 primary drivers and any meaningful mitigants>"
}

— Example —
{
  "score": 0.72,
  "bullet_summary": "Active conflict and severe sanctions elevate risk; FX reserves provide a partial buffer."
}

Now evaluate {country} considering {prompt_points}.
""".strip()
