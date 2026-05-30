"""/chat and /models endpoints with Phase 2 tracing instrumentation."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..models_registry import BAKE_OFF_MODELS, DEFAULT_MODEL
from ..ollama_client import cloud
from ..rag.embed import EMBEDDERS
from ..rag.retrieve import retrieve

from ..tracing.manager import Trace

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
    trace_id: str


@router.get("/models")
def list_models(user: dict = Depends(require_user)) -> dict:
    return {
        "chat_models": [
            {"id": m.id, "family": m.family, "tier": m.tier, "approx_size": m.approx_size}
            for m in BAKE_OFF_MODELS
        ],
        "embedders": list(EMBEDDERS.keys()),
        "default_model": DEFAULT_MODEL,
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, user: dict = Depends(require_user)) -> ChatResponse:
    if req.embedder not in EMBEDDERS:
        raise HTTPException(status_code=400, detail=f"Unknown embedder: {req.embedder}")

    trace = Trace(
        user_id=user["sub"],
        question=req.question,
        model_id=req.model,
        embedder_id=req.embedder,
    )

    try:
        # 1. Retrieve
        async with trace.span("retrieve", input_json={"question": req.question, "k": req.k}):
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

        # 2. LLM Call
        async with trace.span("llm_call", input_json={"model": req.model, "messages_len": 2}) as span:
            try:
                resp = await cloud.chat(
                    model=req.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                )
                usage = resp.get("usage", {})
                trace.set_llm_metrics(
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0),
                    cost=0.0, # TODO: actual pricing
                )
                span.output_json = {
                    "usage": usage,
                    "model": resp.get("model"),
                    "finish_reason": resp.get("choices", [{}])[0].get("finish_reason")
                }
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

        answer = resp["choices"][0]["message"]["content"]
        trace.final_answer = answer
        
        # Flush trace to Supabase
        await trace.flush()

        return ChatResponse(
            answer=answer,
            chunks=[ChunkOut(**c.__dict__) for c in chunks],
            model=req.model,
            embedder=req.embedder,
            latency_ms=int((time.perf_counter() - trace._start_time) * 1000),
            trace_id=trace.id,
        )
    except Exception as e:
        # If we didn't already flush, flush with error status
        if not any(s.error for s in trace.spans):
             await trace.flush(status="error")
        raise
