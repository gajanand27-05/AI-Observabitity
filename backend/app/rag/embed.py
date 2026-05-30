"""Build the two parallel Chroma collections (one per embedder).

Embeddings come from local Ollama (cloud has no embedding models).
Collections use cosine similarity space so retrieval scores are bounded [-1, 1].
"""
from __future__ import annotations

import asyncio

import chromadb

from ..config import PROJECT_ROOT
from ..ollama_client import local
from .chunk import Chunk, chunk_text
from .ingest import ARTICLES, DOCS_DIR, slugify

CHROMA_DIR = PROJECT_ROOT / "backend" / "data" / "chroma"

EMBEDDERS: dict[str, str] = {
    "bge-m3":           "wiki_bge_m3",
    "nomic-embed-text": "wiki_nomic",
}

_CONCURRENCY = 4


def _client() -> chromadb.ClientAPI:
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def _load_chunks(size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    for title in ARTICLES:
        slug = slugify(title)
        path = DOCS_DIR / f"{slug}.txt"
        text = path.read_text(encoding="utf-8")
        chunks.extend(chunk_text(slug, text, size=size, overlap=overlap))
    return chunks


async def _embed_with_sem(sem: asyncio.Semaphore, embedder: str, text: str) -> list[float]:
    async with sem:
        # Nomic specific optimization: add prefix
        prepared_text = text
        if embedder == "nomic-embed-text":
            prepared_text = f"search_document: {text}"
        return await local.embed(embedder, prepared_text)


async def _build_one(embedder: str, chunks: list[Chunk]) -> int:
    client = _client()
    name = EMBEDDERS[embedder]

    existing = client.get_or_create_collection(
        name=name, metadata={"embedder": embedder, "hnsw:space": "cosine"}
    )
    if existing.count() == len(chunks):
        return existing.count()

    client.delete_collection(name)
    coll = client.create_collection(
        name=name, metadata={"embedder": embedder, "hnsw:space": "cosine"}
    )

    sem = asyncio.Semaphore(_CONCURRENCY)
    BATCH = 64
    for i in range(0, len(chunks), BATCH):
        sl = chunks[i : i + BATCH]
        embs = await asyncio.gather(*[_embed_with_sem(sem, embedder, c.text) for c in sl])
        coll.add(
            ids=[f"{c.doc_slug}::{c.chunk_idx}" for c in sl],
            embeddings=embs,
            documents=[c.text for c in sl],
            metadatas=[
                {"doc_slug": c.doc_slug, "chunk_idx": c.chunk_idx, "start": c.start, "end": c.end}
                for c in sl
            ],
        )
    return coll.count()


async def build_all(size: int = 1000, overlap: int = 150) -> dict[str, int]:
    chunks = _load_chunks(size, overlap)
    out: dict[str, int] = {}
    for embedder in EMBEDDERS:
        out[embedder] = await _build_one(embedder, chunks)
    return out
