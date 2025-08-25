import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional

from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=False)

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage

import backend.constants as constants

logger = logging.getLogger(__name__)

# -------------------------
# Strict schema for outputs
# -------------------------
RISK_SCHEMA: Dict = {
    "title": "CountryRiskAssessment",
    "description": "Subscores, per-article impacts, a calibrated score, and a short summary.",
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
                    "id":     {"type": "string"},
                    "impact": {"type": "number", "minimum": 0, "maximum": 1}
                },
                "required": ["id", "impact"],
                "additionalProperties": False
            }
        },
        "score": {"type": "number", "minimum": 0, "maximum": 1},
        "bullet_summary": {"type": "string", "maxLength": 800}
    },
    "required": ["subscores", "news_article_scores", "score", "bullet_summary"],
    "additionalProperties": False
}
# Schema format/requirements align with LangChain’s structured outputs helper. :contentReference[oaicite:1]{index=1}

# -------------------------
# Optional diagnostic metric (does not affect score)
# -------------------------
def _recency_weight(days_old: int) -> float:
    if days_old <= 14: return 1.0
    if days_old <= 60: return 0.60
    return 0.30

def _compute_news_flow(articles_min: List[Dict], impact_by_id: Dict[str, float]) -> float:
    """Recency-weighted mean + small corroboration boost if >=2 severe (>=0.85) events within 30 days.
    This is purely diagnostic; it does not alter the model's score.
    """
    num = den = 0.0
    today = datetime.utcnow().date()
    severe_recent = 0

    for it in articles_min:
        _id = it.get("id")
        imp = impact_by_id.get(_id)
        if imp is None:
            continue
        published_at = (it.get("published_at") or "")[:10]
        try:
            age = (today - datetime.fromisoformat(published_at).date()).days
        except Exception:
            age = 9999
        w = _recency_weight(age)
        num += w * float(imp)
        den += w
        if imp >= 0.85 and age <= 30:
            severe_recent += 1

    news = (num / den) if den > 0 else 0.10
    if severe_recent >= 2:
        news = min(news * 1.10, 1.0)
    return float(max(0.05, min(news, 0.95)))

# -------------------------
# Helpers for prompt I/O
# -------------------------
def _articles_to_json(articles: List[Dict]) -> str:
    """Normalize article fields used in the prompt."""
    norm = []
    for i, it in enumerate(articles[:10]):
        norm.append({
            "id": f"a{i+1}",
            "source": (it.get("source") or "").strip(),
            "published_at": (it.get("published") or "")[:10],
            "title": (it.get("title") or "").strip(),
            "summary": (it.get("summary") or it.get("text") or it.get("snippet") or "").strip(),
        })
    return json.dumps(norm, ensure_ascii=False)

def _articles_min_list(articles_json_str: str) -> List[Dict]:
    raw = json.loads(articles_json_str) if articles_json_str else []
    return [
        {
            "id": it.get("id"),
            "title": it.get("title", ""),
            "summary": it.get("summary", ""),
            "source": it.get("source", ""),
            "published_at": it.get("published_at", "")
        }
        for it in raw
    ]

# -------------------------
# Main entry — no heuristic overrides, no code-side floors
# -------------------------
def country_llm_score(
    *,
    country_display: str,
    payload: Dict,
    articles: List[Dict],
    llm: Optional["ChatOpenAI"] = None,
    model: str = "gpt-4.1",   # any model supporting structured outputs
    temperature: float = 0.0,
    seed: int = 42,
    api_key: Optional[str] = None,
) -> Dict[str, object]:
    """
    Returns:
      {
        "score": float|None,        # final score (the model's score; no code-side reweighting)
        "bullet_summary": str,
        "subscores": {...},         # model diagnostics only
        "news_article_scores": [...],
        "news_flow": float,         # diagnostic only
      }
    """
    assert isinstance(payload, dict) and payload, "`payload` must be a non-empty dict"
    assert isinstance(articles, list), "`articles` must be a list"
    assert isinstance(country_display, str) and country_display.strip(), "`country_display` must be non-empty"

    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set (env var or api_key arg).")
        return {"score": None, "bullet_summary": "", "subscores": {}, "news_flow": None, "news_article_scores": []}

    evidence_json = json.dumps(payload, ensure_ascii=False)
    articles_json = _articles_to_json(articles)
    prompt = constants.AI_PROMPT.format(
        country=country_display,
        evidence_json=evidence_json,
        articles_json=articles_json
    )

    _llm = llm or ChatOpenAI(
        model=model,
        temperature=temperature,
        max_retries=0,
        api_key=api_key,
        seed=seed,
    )
    structured_llm = _llm.with_structured_output(schema=RISK_SCHEMA, strict=True)

    try:
        data = structured_llm.invoke([SystemMessage(content=prompt)])
    except Exception as exc:
        logger.error("LangChain structured output error: %s", exc)
        return {"score": None, "bullet_summary": "", "subscores": {}, "news_flow": None, "news_article_scores": []}

    # Validate shape minimally
    if not isinstance(data, dict) or "score" not in data or "subscores" not in data or "news_article_scores" not in data:
        logger.error("Model returned invalid structure: %s", str(data)[:300])
        return {"score": None, "bullet_summary": "", "subscores": {}, "news_flow": None, "news_article_scores": []}

    # Diagnostics only (does not affect score)
    try:
        impacts = {e["id"]: float(e["impact"]) for e in data.get("news_article_scores", []) if isinstance(e, dict) and "id" in e and "impact" in e}
    except Exception:
        impacts = {}
    news_flow = _compute_news_flow(_articles_min_list(articles_json), impacts)

    return {
        "score": float(data["score"]) if isinstance(data.get("score"), (int, float, str)) else None,
        "bullet_summary": (data.get("bullet_summary") or "").strip()[:800],
        "subscores": data.get("subscores") or {},
        "news_article_scores": data.get("news_article_scores") or [],
        "news_flow": news_flow,  # diagnostic
    }
