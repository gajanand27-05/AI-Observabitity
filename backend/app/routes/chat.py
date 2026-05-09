"""/chat and /models endpoints. Phase 1: no tracing yet."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..models_registry import BAKE_OFF_MODELS
from ..ollama_client import cloud
from ..rag.embed import EMBEDDERS
from ..rag.retrieve import retrieve

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions about the history of computing. "
    "Use ONLY the context below to answer. "
    "If the answer is not in the context, say \"I don't know based on the provided documents.\" "
    "Be concise and cite article titles when relevant."
)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    model: str
    embedder: str
    k: int = Field(default=5, ge=1, le=20)


class ChunkOut(BaseModel):
    doc_slug: str
    chunk_idx: int
    text: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    chunks: list[ChunkOut]
    model: str
    embedder: str
    latency_ms: int


@router.get("/models")
def list_models(user: dict = Depends(require_user)) -> dict:
    return {
        "chat_models": [
            {"id": m.id, "family": m.family, "tier": m.tier, "approx_size": m.approx_size}
            for m in BAKE_OFF_MODELS
        ],
        "embedders": list(EMBEDDERS.keys()),
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, user: dict = Depends(require_user)) -> ChatResponse:
    if req.embedder not in EMBEDDERS:
        raise HTTPException(status_code=400, detail=f"Unknown embedder: {req.embedder}")

    t0 = time.perf_counter()
    try:
        chunks = await retrieve(req.question, req.embedder, req.k)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Retrieval failed (did you build the index?): {e}",
        )

    context = "\n\n---\n\n".join(
        f"[{i+1}] (from {c.doc_slug.replace('-', ' ')})\n{c.text}"
        for i, c in enumerate(chunks)
    )
    user_msg = f"Context:\n{context}\n\nQuestion: {req.question}"

    try:
        resp = await cloud.chat(
            model=req.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    answer = resp["choices"][0]["message"]["content"]
    return ChatResponse(
        answer=answer,
        chunks=[ChunkOut(**c.__dict__) for c in chunks],
        model=req.model,
        embedder=req.embedder,
        latency_ms=int((time.perf_counter() - t0) * 1000),
    )
