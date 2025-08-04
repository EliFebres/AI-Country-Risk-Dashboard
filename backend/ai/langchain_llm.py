import os
import json
import logging
from typing import List, Dict, Optional, TYPE_CHECKING

from dotenv import load_dotenv
load_dotenv()

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

import backend.constants as constants


logger = logging.getLogger(__name__)
_EXPECTED_KEYS = {"score", "bullet_summary"}  # JSON schema from the LLM


def _clean_keys(d: Dict) -> Dict:
    """Lower-case & strip whitespace from dict keys (helps on sloppy JSON)."""
    return {k.strip().lower(): v for k, v in d.items()}


def country_llm_score(
    country: str,
    headlines: List[str],
    prompt_points: str,
    *,
    llm: Optional["ChatOpenAI"] = None,
    model: str = "gpt-3.5-turbo",
    temperature: float = 0.2,
    api_key: Optional[str] = None,
) -> Dict[str, object]:
    """
    Return a JSON-like dict with the LLM's risk score and ≤75-word summary.

    Parameters
    ----------
    country        : ISO-alpha country code or display name.
    headlines      : List of recent headline strings (only first 5 are used).
    prompt_points  : Comma-separated macro indicators shown to the LLM.
    llm            : Optional *ChatOpenAI* instance to reuse.
    model          : OpenAI chat model name.
    temperature    : Sampling temperature.
    api_key        : Explicit key overrides ``$OPENAI_API_KEY``.

    Notes
    -----
    * If LangChain packages are missing, the function transparently falls back
      to the official ``openai`` client (≥1.0).
    * Any errors or schema mismatches yield ``{"score": None,
      "bullet_summary": ""}``.
    """
    # Input Validation
    assert country and isinstance(country, str)
    assert headlines and all(isinstance(h, str) for h in headlines)
    assert isinstance(prompt_points, str) and prompt_points

    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set (env var or api_key arg).")
        return {"score": None, "bullet_summary": ""}

    # Construct Prompt
    context = "\n".join(headlines[:5])
    sys_msg = constants.AI_PROMPT.format(prompt_points=prompt_points, country=country)
    user_msg = f"Country: {country}\nRecent headlines:\n{context}"

    if llm is None:
        llm = ChatOpenAI(
            model_name=model,
            temperature=temperature,
            openai_api_key=api_key,
        )
    lc_msgs = [SystemMessage(content=sys_msg), HumanMessage(content=user_msg)]
    try:
        resp_text = llm.invoke(lc_msgs).content.strip()
    except Exception as exc:
        logger.error("LangChain error: %s", exc)
        return {"score": None, "bullet_summary": ""}

    # Parse / Validate
    try:
        raw = json.loads(resp_text)
    except json.JSONDecodeError:
        logger.error("LLM responded with non-JSON:\n%s", resp_text)
        return {"score": None, "bullet_summary": ""}

    data = _clean_keys(raw)
    if _EXPECTED_KEYS != set(data):
        logger.error("LLM schema mismatch: %s", raw)
        return {"score": None, "bullet_summary": ""}

    score, summary = data["score"], data["bullet_summary"]

    try:
        score = None if score is None else float(score)
    except (TypeError, ValueError):
        logger.warning("`score` not castable to float: %s", score)
        score = None

    summary = summary if isinstance(summary, str) else ""
    if len(summary.split()) > 75:
        summary = " ".join(summary.split()[:75])

    result = {"score": score, "bullet_summary": summary}
    assert set(result) == _EXPECTED_KEYS
    return result
