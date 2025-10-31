# backend/utils/article_media.py
from __future__ import annotations
import json
from typing import Optional, List
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/132.0.0.0 Safari/537.36"
)

# Add a couple more publisher-specific meta keys (Bloomberg often sets these)
_META_IMAGE_KEYS = [
    ("property", "og:image"),
    ("property", "og:image:secure_url"),
    ("name", "twitter:image"),
    ("name", "twitter:image:src"),
    ("itemprop", "image"),
    ("name", "parsely-image"),       # common analytics image hint
    ("property", "og:image:url"),    # some sites use this variant
]

_IMG_ATTR_CANDIDATES = [
    "src", "data-src", "data-original", "data-lazy-src", "data-image", "data-thumb"
]

def _best_from_srcset(srcset: str, base: str) -> Optional[str]:
    """Choose the largest candidate from an HTML srcset string."""
    try:
        parts = [p.strip() for p in srcset.split(",") if p.strip()]
        scored = []
        for p in parts:
            bits = p.split()
            if not bits:
                continue
            url = urljoin(base, bits[0])
            w = 0
            if len(bits) > 1 and bits[1].endswith("w"):
                try:
                    w = int(bits[1][:-1])
                except Exception:
                    w = 0
            scored.append((w, url))
        scored.sort(reverse=True)
        return scored[0][1] if scored else None
    except Exception:
        return None


def _collect_meta_images(soup: BeautifulSoup, base_url: str) -> List[str]:
    out: List[str] = []

    # OpenGraph / Twitter / itemprop / parsely-image / og:image:url
    for attr, key in _META_IMAGE_KEYS:
        for tag in soup.find_all("meta", attrs={attr: key}):
            content = tag.get("content")
            if content and content.startswith(("http://", "https://")):
                out.append(content)

    # link rel="image_src"
    for link in soup.find_all("link", rel=lambda v: v and "image_src" in v):
        href = link.get("href")
        if href:
            out.append(urljoin(base_url, href))

    # JSON-LD (NewsArticle/Article often has "image" or "thumbnailUrl")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue

        def push_image(val):
            if isinstance(val, str):
                if val.startswith(("http://", "https://")):
                    out.append(val)
            elif isinstance(val, dict):
                u = val.get("url") or val.get("contentUrl") or val.get("thumbnailUrl")
                if isinstance(u, str) and u.startswith(("http://", "https://")):
                    out.append(u)
            elif isinstance(val, list):
                for v in val:
                    push_image(v)

        # Prefer NewsArticle/Article nodes when possible
        candidates = data if isinstance(data, list) else [data]
        for obj in candidates:
            if isinstance(obj, dict):
                img_field = obj.get("image") or obj.get("thumbnailUrl")
                if img_field:
                    push_image(img_field)

    # Dedup preserve order
    seen = set()
    uniq = []
    for u in out:
        if u not in seen:
            uniq.append(u)
            seen.add(u)
    return uniq


def _first_content_image(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """Fallback: traverse likely containers and pick a meaningful <img>."""
    containers = []
    art = soup.find("article")
    if art:
        containers.append(art)
    main = soup.find("main") or soup.find(attrs={"role": "main"})
    if main:
        containers.append(main)
    if not containers:
        containers = [soup]

    for c in containers:
        imgs = c.find_all("img")
        for img in imgs:
            # srcset gives us multiple sizes—pick biggest
            srcset = img.get("srcset")
            if srcset:
                u = _best_from_srcset(srcset, base_url)
                if u:
                    return u
            # else check common lazy attrs and src
            for attr in _IMG_ATTR_CANDIDATES:
                val = img.get(attr)
                if val:
                    u = urljoin(base_url, val)
                    if u.startswith(("http://", "https://")) and not any(
                        t in u.lower() for t in ("/pixel", "1x1", "spacer.gif")
                    ):
                        return u
    return None


# --------------------------- Domain-specific helpers ---------------------------

def _reuters_image(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """
    Reuters tends to render a lead image element with data-testid="EagerImage",
    and also uses a 'resizer' CDN path. Prefer the largest 'srcset' candidate.
    """
    # 1) Look for the lead eager image
    eager = soup.find("img", attrs={"data-testid": "EagerImage"})
    if eager:
        ss = eager.get("srcset")
        if ss:
            u = _best_from_srcset(ss, base_url)
            if u:
                return u
        # fall back to src / common lazy attrs
        for attr in _IMG_ATTR_CANDIDATES:
            val = eager.get(attr)
            if val:
                return urljoin(base_url, val)

    # 2) Try a known gallery/key visual wrapper if present
    # (Reuters often nests the eager image inside carousel/primary-gallery containers)
    gallery = soup.find(attrs={"data-testid": "EagerImageContainer"}) or soup.find("div", class_=lambda v: v and "primary-gallery" in v)
    if gallery:
        img = gallery.find("img")
        if img:
            ss = img.get("srcset")
            if ss:
                u = _best_from_srcset(ss, base_url)
                if u:
                    return u
            for attr in _IMG_ATTR_CANDIDATES:
                val = img.get(attr)
                if val:
                    return urljoin(base_url, val)

    return None


def _bloomberg_image(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """
    Bloomberg usually exposes:
      - <meta property="og:image" ...>  (assets.bwbx.io)
      - <meta name="parsely-image" ...>
      - JSON-LD NewsArticle.image / thumbnailUrl
      - A lead <figure>/<img> near the headline
    """
    # 1) Try OG/Twitter/parsely as *first-class* for Bloomberg
    for attr, key in [
        ("property", "og:image"),
        ("name", "parsely-image"),
        ("name", "twitter:image"),
        ("name", "twitter:image:src"),
    ]:
        tag = soup.find("meta", attrs={attr: key})
        if tag and tag.get("content", "").startswith(("http://", "https://")):
            return tag["content"]

    # 2) Try JSON-LD NewsArticle/Article image fields
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except Exception:
            continue

        def pick(d):
            if isinstance(d, dict):
                if d.get("@type") in ("NewsArticle", "Article"):
                    img = d.get("image") or d.get("thumbnailUrl")
                    if isinstance(img, str):
                        return img
                    if isinstance(img, dict) and img.get("url"):
                        return img["url"]
                    if isinstance(img, list):
                        for v in img:
                            if isinstance(v, str):
                                return v
                            if isinstance(v, dict) and v.get("url"):
                                return v["url"]
            return None

        if isinstance(data, list):
            for obj in data:
                u = pick(obj)
                if u:
                    return u
        else:
            u = pick(data)
            if u:
                return u

    # 3) Heuristic: first <figure>/<img> in main/article
    main = soup.find("main") or soup.find("article") or soup
    fig = main.find("figure") if main else None
    if fig:
        img = fig.find("img")
        if img:
            if img.get("srcset"):
                u = _best_from_srcset(img["srcset"], base_url)
                if u:
                    return u
            for attr in _IMG_ATTR_CANDIDATES:
                val = img.get(attr)
                if val:
                    return urljoin(base_url, val)

    return None


# --------------------------- Public API ---------------------------

def extract_thumbnail(
    url: str,
    session: Optional[requests.Session] = None,
    timeout: float = 10.0,
) -> str:
    """
    Fetch the page at `url` and return the best thumbnail URL.

    Order:
      A) Domain-specific fast paths (Reuters, Bloomberg)
      B) Meta cards (OG/Twitter/itemprop/parsely + JSON-LD)
      C) First meaningful <img> in <article>/<main> or page fallback

    Returns "" if nothing sensible could be found.
    """
    try:
        s = session or requests.Session()
        r = s.get(url, headers={"user-agent": _UA}, timeout=timeout)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        host = urlparse(r.url).netloc.lower()

        # A) Domain-specific
        if "reuters.com" in host:
            u = _reuters_image(soup, r.url)
            if u:
                return u

        if "bloomberg.com" in host:
            u = _bloomberg_image(soup, r.url)
            if u:
                return u

        # B) Meta cards and JSON-LD
        metas = _collect_meta_images(soup, r.url)
        if metas:
            return metas[0]

        # C) First content image
        u2 = _first_content_image(soup, r.url)
        if u2:
            return u2

    except Exception:
        pass
    return ""
