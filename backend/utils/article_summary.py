# backend/utils/article_summary.py
from __future__ import annotations
import re
from typing import Optional, Tuple

import requests
from bs4 import BeautifulSoup

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/132.0.0.0 Safari/537.36"
)

_REMOVALS = {"script", "style", "noscript", "iframe", "svg", "footer", "header", "nav", "aside", "form"}


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _best_container(soup: BeautifulSoup) -> Optional[BeautifulSoup]:
    """
    Heuristic: prefer <article>; else role=main/<main>; else largest <div> by <p> text length.
    """
    candidates = []

    # 1) <article>
    articles = soup.find_all("article")
    if articles:
        candidates.extend(articles)

    # 2) role=main or <main>
    main = soup.find(attrs={"role": "main"}) or soup.find("main")
    if main:
        candidates.append(main)

    # 3) class/id hints
    hints = ["article", "content", "story", "post", "entry", "body", "read", "main", "text"]
    for tag in soup.find_all(True):
        cid = (tag.get("class") or []) + [tag.get("id") or ""]
        if any(h in " ".join(map(str, cid)).lower() for h in hints):
            candidates.append(tag)

    # Deduplicate while preserving order
    seen = set()
    uniq = []
    for c in candidates:
        if id(c) not in seen:
            uniq.append(c)
            seen.add(id(c))
    if not uniq:
        return None

    def score(node) -> int:
        ps = node.find_all("p")
        return sum(len(_clean(p.get_text(" ", strip=True))) for p in ps)

    return max(uniq, key=score)


def extract_main_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    # Strip obvious non-content
    for tag in list(_REMOVALS):
        for n in soup.find_all(tag):
            n.decompose()

    container = _best_container(soup) or soup
    paragraphs = [
        _clean(p.get_text(" ", strip=True))
        for p in container.find_all("p")
    ]
    paragraphs = [p for p in paragraphs if len(p) > 40]  # drop very short junk
    text = _clean(" ".join(paragraphs))
    return text


def summarize_lead(text: str, max_words: int = 160) -> str:
    """
    Simple lead summary: take sentences until we hit ~max_words.
    """
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out, words = [], 0
    for s in sentences:
        w = len(s.split())
        if w == 0:
            continue
        if words + w > max_words and out:
            break
        out.append(s)
        words += w
        if words >= max_words:
            break
    return _clean(" ".join(out))[:2000]  # safety cap


def extract_and_summarize(
    url: str,
    session: Optional[requests.Session] = None,
    timeout: float = 10.0,
    max_words: int = 160,
) -> Tuple[str, str]:
    """
    Fetch URL → extract main text → return (summary, full_text).
    Returns ("", "") on failure.
    """
    try:
        s = session or requests.Session()
        r = s.get(url, headers={"user-agent": _UA}, timeout=timeout)
        r.raise_for_status()
        text = extract_main_text(r.text)
        if not text:
            return "", ""
        summary = summarize_lead(text, max_words=max_words)
        return summary, text
    except Exception:
        return "", ""
