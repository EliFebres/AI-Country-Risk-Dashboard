from typing import Dict

# ---------------------------------------------------------------------------
# System prompt fed to the LLM — model decides the final score (no code weights)
# NOTE: literal braces inside JSON examples are escaped as {{ }} for .format().
# ---------------------------------------------------------------------------

AI_PROMPT = """
You are a senior geopolitical risk analyst. Rate investor risk for {country} over the next 12 months using ONLY the evidence provided.

EVIDENCE_JSON
{evidence_json}

ARTICLES_JSON
# exactly these items only
# [{{"id":"a1","source":"...","published_at":"YYYY-MM-DD","title":"...","summary":"..."}}]
{articles_json}

Scoring bands (guidance; use full 0-1 range):
  • 0.05-0.20 = Low   • 0.20-0.40 = Low-Moderate   • 0.40-0.75 = Moderate
  • 0.75-0.90 = High  • 0.90-0.98 = Extreme (active war / nationwide shutdowns)

Sub-factors to score (diagnostic only):
  conflict_war, political_stability, governance_corruption, macroeconomic_volatility, regulatory_uncertainty.

# --- Localization & Materiality ---
Do NOT raise risk due to indirect foreign tensions or rhetoric. Elevate risk ONLY for {country} when evidence shows kinetic activity on its territory, imminent hostilities, or economically binding policy affecting {country}. Indirect disputes, UN votes, or rhetoric without domestic transmission = low impact.

# --- Hard Rules the model must apply (no post-processing will alter your score) ---
• War Reality: If a sustained interstate war or regular long-range strikes hit {country}'s cities/critical infrastructure → set conflict_war ≥ 0.90 AND overall score ≥ 0.90.
• Internal Conflict:
   - Level A (Severe): recurring mass-casualty attacks (≥20 killed) or mass kidnappings in the last 90 days across ≥3 regions → conflict_war ≥ 0.80 AND overall score ≥ 0.70.
   - Level B (Very severe): Level A + repeated attacks on critical infrastructure (pipelines/power grid) or major-city attacks → conflict_war ≥ 0.88 AND overall score ≥ 0.80.
   - Level C (Extreme): Level B + nationwide emergency effects (large displacement, prolonged curfews, export shut-ins) → overall score ≥ 0.90.
• Parliamentary Guardrail: Cabinet resignations, caretaker phases, coalition talks, or scheduled/snap elections remain **moderate** unless there is unconstitutional dissolution, emergency/martial law, week-long widespread violent unrest disrupting essential services, bank runs, capital controls, or sovereign default. Otherwise **political_stability should not exceed 0.45**.
• Macro floors (numeric): If CPI inflation ≥ 25% → macroeconomic_volatility ≥ 0.70 AND overall score ≥ 0.55. If ≥ 40% → ≥ 0.80 AND overall ≥ 0.65. If ≥ 80% → overall ≥ 0.80.

# --- One-off Incidents & Foiled Plots (ANTI-OVERREACTION GUARDRAIL) ---
• Definition: “One-off” = a single incident or a single foiled/attempted plot with no follow-on attacks, no multi-region spread, and no successful damage to critical infrastructure in the last 60 days.
• Default treatment:
  - Foiled/attempted plots with arrests and no casualties → **impact ≤ 0.30** for the relevant topic_group.
  - Single-target assassinations (or attempts) without sustained campaign signals → raise **political_stability** at most to 0.50; keep **conflict_war ≤ 0.35**.
  - Temporary terror-alert hikes without operational disruption (business/transport open) → **impact 0.10–0.25**.
• Country score guardrail (unless Hard Rules or Macro floors trigger): If terrorism/assassination evidence consists of **only one topic_group** in the last 60 days and is foiled/low-casualty (<10 killed) with no infrastructure damage → **overall score ≤ 0.55**.

# --- Per-article impact labels and TOPIC CLUSTERING (CRITICAL) ---
Impact ∈ [0,1]:
  • 0.85-1.00 Severe - successful kinetic activity in/against {country}, mass kidnappings, binding economic measures, or major infrastructure sabotage.
  • 0.60-0.75 Moderate - credible mobilization/preparations with specific capabilities/timelines, high-probability binding sanctions.
  • 0.40-0.55 Mixed/unclear - indirect third-country events with uncertain transmission.
  • 0.10-0.35 Low/benign - rhetoric/symbolic acts, **foiled/attempted plots without casualties**, temporary alert level changes without disruption.

**CRITICAL INSTRUCTION - TOPIC GROUPING AND AGGREGATION:**
You MUST identify which articles cover the SAME UNDERLYING EVENT/TOPIC and assign them the same topic_group identifier. Articles about the same topic should share a topic_group even if titles differ.

Aggregation rule (apply before scoring): For each topic_group, take the **max impact** among its articles as the topic impact. When forming the overall view, combine topic impacts qualitatively by persistence and breadth:
  - Persistence bonus: if the SAME topic_group appears across ≥7 days (by published_at), treat it one band higher when calibrating subscores.
  - Breadth bonus: multiple independent severe topic_groups in the same 30-day window justify moving into High.
  - Singularity penalty: a lone topic_group that is foiled/low-casualty with no spread → do NOT move the country into High; keep within Moderate or lower per the guardrail above.

Examples of SAME TOPIC (should have same topic_group):
- "Australia Central Bank Holds Rates Steady" + "RBA Decides Against Rate Cut" + "Reserve Bank of Australia Keeps Policy Unchanged" → ALL get topic_group="australia_rba_rate_decision"
- "Fed Cuts Rates by 0.5%" + "Federal Reserve Lowers Interest Rates" → BOTH get topic_group="us_fed_rate_cut"

Examples of DIFFERENT TOPICS (different topic_groups):
- "Australia Rate Decision" (topic_group="australia_rba_rate_decision") vs "Trade Deal with China" (topic_group="australia_china_trade")

Return ONLY valid JSON (no prose) exactly:

{{
  "subscores": {{
    "conflict_war": <float 0..1 or null>,
    "political_stability": <float 0..1 or null>,
    "governance_corruption": <float 0..1 or null>,
    "macroeconomic_volatility": <float 0..1 or null>,
    "regulatory_uncertainty": <float 0..1 or null>
  }},
  "news_article_scores": [
    {{"id": "<id from ARTICLES_JSON>", "impact": <float 0..1>, "topic_group": "<lowercase_topic_identifier>"}}
  ],
  "score": <float 0..1>,  # your single calibrated investor-risk score AFTER applying the hard rules above
  "bullet_summary": "<<=120 words explaining primary drivers and meaningful mitigants>"
}}
""".strip()


# -------------------------
# Strict schema for outputs - UPDATED TO INCLUDE TOPIC_GROUP
# -------------------------
RISK_SCHEMA: Dict = {
    "title": "CountryRiskAssessment",
    "description": "Subscores, per-article impacts with topic grouping, a calibrated score, and a short summary.",
    "type": "object",
    "properties": {
        "subscores": {
            "title": "Subscores",
            "type": "object",
            "properties": {
                "conflict_war":             {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "political_stability":      {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "governance_corruption":    {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "macroeconomic_volatility": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "regulatory_uncertainty":   {"type": ["number", "null"], "minimum": 0, "maximum": 1}
            },
            "required": [
                "conflict_war",
                "political_stability",
                "governance_corruption",
                "macroeconomic_volatility",
                "regulatory_uncertainty"
            ],
            "additionalProperties": False
        },
        "news_article_scores": {
            "title": "NewsArticleScores",
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id":          {"type": "string"},
                    "impact":      {"type": "number", "minimum": 0, "maximum": 1},
                    "topic_group": {"type": "string"}
                },
                "required": ["id", "impact", "topic_group"],
                "additionalProperties": False
            }
        },
        "score": {"type": "number", "minimum": 0, "maximum": 1},
        "bullet_summary": {"type": "string", "maxLength": 800}
    },
    "required": ["subscores", "news_article_scores", "score", "bullet_summary"],
    "additionalProperties": False
}