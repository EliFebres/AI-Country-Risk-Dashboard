import os
import re
import json
import logging
from time import sleep
from pathlib import Path
from typing import List, Dict, Optional, TYPE_CHECKING

from dotenv import load_dotenv, find_dotenv

# Load .env reliably
load_dotenv(find_dotenv(), override=False)
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

import backend.constants as constants

logger = logging.getLogger(__name__)
_EXPECTED_KEYS = {"score", "bullet_summary"}  # JSON schema from the LLM


def _clean_keys(d: Dict) -> Dict:
    """Lower-case & strip whitespace from dict keys (helps on sloppy JSON)."""
    return {k.strip().lower(): v for k, v in d.items()}


def _robust_json_loads(text: str) -> Optional[Dict]:
    """
    Try to parse JSON. If the model wraps JSON in prose, extract the outermost
    {...} block and parse that.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None


def country_llm_score(
    country: str,
    headlines: List[str],
    prompt_points: str,
    *,
    macro_context: Optional[str] = None,   # NEW: compact table of latest values/deltas
    llm: Optional["ChatOpenAI"] = None,
    model: str = "gpt-5-mini",
    temperature: float = 1.0,
    api_key: Optional[str] = None,
    attempts: int = 2,                     # NEW: how many times to try
    retry_sleep: float = 0.4               # small pause between tries
) -> Dict[str, object]:
    """
    Return a JSON-like dict with the LLM's risk score and ≤75-word summary.

    If the first attempt yields {"score": None, ...}, the function will retry
    (up to `attempts`) with a lower temperature and a stronger instruction to
    produce a numeric score using conservative inference.
    """
    # Input Validation
    assert country and isinstance(country, str)
    assert headlines and all(isinstance(h, str) for h in headlines)
    assert isinstance(prompt_points, str) and prompt_points
    assert isinstance(attempts, int) and attempts >= 1

    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not set (env var or api_key arg).")
        return {"score": None, "bullet_summary": ""}

    # Prepare common message parts
    context = "\n".join(headlines[:5])
    sys_base = constants.AI_PROMPT.format(prompt_points=prompt_points, country=country)
    sys_suffix = (
        "\n\nReturn ONLY valid JSON with keys exactly: "
        '{"score": <float 0-1 or null>, "bullet_summary": "<<=75 words>"}'
    )

    # Macro context (optional but highly recommended)
    macro_block = f"\n\nMacro indicators (latest & deltas):\n{macro_context}" if macro_context else ""

    def _one_call(_temp: float, extra_nudge: str = "") -> Dict[str, object]:
        _llm = llm or ChatOpenAI(model_name=model, temperature=_temp, openai_api_key=api_key)
        sys_msg = SystemMessage(content=sys_base + sys_suffix + extra_nudge)
        user_msg = HumanMessage(
            content=(
                f"Country: {country}"
                f"{macro_block}"
                f"\n\nRecent headlines (max 5, newest first):\n{context}"
            )
        )
        try:
            resp_text = _llm.invoke([sys_msg, user_msg]).content.strip()
        except Exception as exc:
            logger.error("LangChain error: %s", exc)
            return {"score": None, "bullet_summary": ""}

        raw = _robust_json_loads(resp_text)
        if not isinstance(raw, dict):
            logger.error("LLM responded with non-JSON:\n%s", resp_text[:500])
            return {"score": None, "bullet_summary": ""}

        data = _clean_keys(raw)
        if _EXPECTED_KEYS != set(data):
            logger.error("LLM schema mismatch: %s", raw)
            return {"score": None, "bullet_summary": ""}

        score, summary = data["score"], data["bullet_summary"]

        # Cast score
        try:
            score = None if score is None else float(score)
        except (TypeError, ValueError):
            logger.warning("`score` not castable to float: %s", score)
            score = None

        # Tighten summary length
        summary = summary if isinstance(summary, str) else ""
        if len(summary.split()) > 75:
            summary = " ".join(summary.split()[:75])

        return {"score": score, "bullet_summary": summary}

    # Attempt 1: your current settings
    out = _one_call(temperature)
    if out["score"] is not None or attempts == 1:
        return out

    # Attempts 2..N: stronger nudge + low temperature
    nudge = (
        "\n\nIf some quantitative inputs are missing, infer a *conservative* "
        "0.00–1.00 score using the headlines and priors for similar countries. "
        "Do not say 'insufficient evidence'; still return a numeric score."
    )
    for i in range(2, attempts + 1):
        sleep(retry_sleep)
        out = _one_call(_temp=0.2, extra_nudge=nudge)
        if out["score"] is not None:
            logger.info("LLM produced a score on retry %d.", i)
            return out

    # All attempts failed
    return out
