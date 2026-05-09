"""Char-window chunker. Configurable size + overlap so Phase 1.5 can sweep."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    doc_slug: str
    chunk_idx: int
    text: str
    start: int
    end: int


def chunk_text(doc_slug: str, text: str, size: int = 1000, overlap: int = 150) -> list[Chunk]:
    if size <= overlap:
        raise ValueError("size must exceed overlap")
    n = len(text)
    if n == 0:
        return []
    step = size - overlap
    chunks: list[Chunk] = []
    pos = 0
    idx = 0
    while pos < n:
        end = min(pos + size, n)
        piece = text[pos:end].strip()
        if piece:
            chunks.append(Chunk(doc_slug=doc_slug, chunk_idx=idx, text=piece, start=pos, end=end))
            idx += 1
        if end == n:
            break
        pos += step
    return chunks
