"""Query-time retrieval against a Chroma collection."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import chromadb

from ..ollama_client import local
from .embed import CHROMA_DIR, EMBEDDERS


@dataclass
class RetrievedChunk:
    doc_slug: str
    chunk_idx: int
    text: str
    score: float


_client: Optional[chromadb.ClientAPI] = None


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


async def retrieve(query: str, embedder: str, k: int = 5) -> list[RetrievedChunk]:
    if embedder not in EMBEDDERS:
        raise ValueError(f"Unknown embedder: {embedder}")
    
    # Nomic specific optimization: add prefix
    prepared_query = query
    if embedder == "nomic-embed-text":
        prepared_query = f"search_query: {query}"
        
    qemb = await local.embed(embedder, prepared_query)
    coll = _get_client().get_collection(name=EMBEDDERS[embedder])
    res = coll.query(query_embeddings=[qemb], n_results=k)
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]
    out: list[RetrievedChunk] = []
    for doc, meta, dist in zip(docs, metas, dists):
        out.append(
            RetrievedChunk(
                doc_slug=str(meta.get("doc_slug", "")),
                chunk_idx=int(meta.get("chunk_idx", 0)),
                text=doc,
                score=float(1.0 - dist),  # cosine space: distance = 1 - cos_sim
            )
        )
    return out
