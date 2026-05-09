"""Fetch + clean Wikipedia articles to plain text.

Uses MediaWiki's `extracts` API which returns plain text directly — no HTML
parsing required. Idempotent: if a doc file already exists, skip it.
"""
from __future__ import annotations

import asyncio
import re

import httpx

from ..config import PROJECT_ROOT

DOCS_DIR = PROJECT_ROOT / "backend" / "data" / "docs"

ARTICLES = [
    # People
    "Alan Turing",
    "Ada Lovelace",
    "Grace Hopper",
    "Donald Knuth",
    "Dennis Ritchie",
    "Linus Torvalds",
    "Tim Berners-Lee",
    # Languages
    "Fortran",
    "Lisp (programming language)",
    "C (programming language)",
    "Smalltalk",
    "Python (programming language)",
    "JavaScript",
    # Systems / hardware
    "ENIAC",
    "UNIVAC I",
    "Unix",
    "Linux",
    # Networks / paradigms
    "ARPANET",
    "World Wide Web",
    "Object-oriented programming",
]

UA = "ai-observability-rag/0.1 (educational; contact: gajanandvd2005@gmail.com)"


def slugify(title: str) -> str:
    s = title.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


async def _fetch_one(client: httpx.AsyncClient, title: str) -> str:
    r = await client.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "format": "json",
            "prop": "extracts",
            "explaintext": "1",
            "redirects": "1",
            "titles": title,
        },
    )
    r.raise_for_status()
    pages = r.json()["query"]["pages"]
    page = next(iter(pages.values()))
    if "missing" in page:
        raise ValueError(f"Wikipedia page not found: {title}")
    extract = page.get("extract", "")
    if not extract.strip():
        raise ValueError(f"Empty extract for {title}")
    return extract


async def ingest_all(force: bool = False) -> dict[str, int]:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    stats: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": UA}) as client:
        for title in ARTICLES:
            slug = slugify(title)
            path = DOCS_DIR / f"{slug}.txt"
            if path.exists() and not force:
                stats[slug] = path.stat().st_size
                continue
            text = await _fetch_one(client, title)
            path.write_text(text, encoding="utf-8")
            stats[slug] = len(text)
    return stats


if __name__ == "__main__":
    out = asyncio.run(ingest_all())
    for slug, size in out.items():
        print(f"  {slug:<35} {size:>8} chars")
    print(f"\nTotal: {len(out)} docs")
