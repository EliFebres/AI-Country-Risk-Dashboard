
# World Bank REST endpoint template – fill in {code} with the ISO-2/3 country code
# and {ind} with the indicator ID (e.g., "SP.POP.GROW"); returns a JSON series with
# up to 60 yearly observations.
WB_ENDPOINT = "https://api.worldbank.org/v2/country/{code}/indicator/{ind}?format=json&per_page=60"


# AI system prompt for evaluating geopolitical investor risk.
AI_PROMPT = """
You are a geopolitical risk analyst.

You will evaluate a single country based on global investor risk. Your task is to:

1. Assess the country’s risk on a 0.0–1.0 scale, where 1.0 = maximum risk and 0.0 = lowest risk.
2. Consider all relevant factors provided in `{prompt_points}`, such as political stability, regulatory environment, economic volatility, corruption, security, etc.
3. (Optional) Use chain-of-thought reasoning internally to improve accuracy—do not include it in the final output.

IMPORTANT: Respond only with valid JSON matching the schema below. Do **not** include any extra text, explanation, or markdown.  
If any data is missing or cannot be assessed, return `"score": null` and `"bullet_summary": ""`.

Expected schema:
```json
{
  "score": float (0.00–1.00),
  "bullet_summary": string (≤75 words)
}

Example:
{
  "score": 0.72,
  "bullet_summary": "Political instability and high inflation elevate risk, though foreign reserves buffer shocks."
}

Now evaluate {country} considering {prompt_points}.
"""

# Selected 50 Countries (25 Developed / 25 Emerging Markets)
SELECTED_COUNTRIES = [
    # Developed Markets
    "United States",
    "Canada",
    "Germany",
    "France",
    "United Kingdom",
    "Japan",
    "Australia",
    "Austria",
    "Belgium",
    "Denmark",
    "Finland",
    "Ireland",
    "Italy",
    "Netherlands",
    "New Zealand",
    "Norway",
    "Portugal",
    "Singapore",
    "Spain",
    "Sweden",
    "Switzerland",
    "Israel",
    "Hong Kong SAR, China",
    "Greece",
    "Luxembourg",
    # Emerging Markets
    "Argentina",
    "Brazil",
    "Chile",
    "China",
    "Colombia",
    "Hungary",
    "India",
    "Indonesia",
    "Malaysia",
    "Mexico",
    "Pakistan",
    "Peru",
    "Philippines",
    "Poland",
    "Qatar",
    "Romania",
    "Saudi Arabia",
    "South Africa",
    "Thailand",
    "United Arab Emirates",
    "Ukraine",
    "Morocco",
    "Kenya",
    "Nigeria",
    "Bangladesh"
]
