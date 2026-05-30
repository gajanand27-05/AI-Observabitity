from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_admin
from ..supabase_client import supabase

from pydantic import BaseModel, Field
from ..prompts import DEFAULT_SYSTEM_PROMPT
from ..tracing.manager import Trace
from ..ollama_client import cloud

from ..prompts import PROMPT_REGISTRY, DEFAULT_SYSTEM_PROMPT

router = APIRouter(prefix="/admin/observability")

@router.get("/prompts")
async def list_prompts(_: dict = Depends(require_admin)):
    """List all registered prompt versions."""
    return {"prompts": PROMPT_REGISTRY, "default": DEFAULT_SYSTEM_PROMPT}

class ReplayRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    trace_id: str
    custom_prompt: str = Field(default=DEFAULT_SYSTEM_PROMPT)
    model_id: Optional[str] = None

@router.post("/replay")
async def replay_trace(body: ReplayRequest, user: dict = Depends(require_admin)):
    """Re-run a trace's LLM call with a different prompt."""
    # 1. Fetch original trace and spans
    trace_res = supabase.table("traces").select("*").eq("id", body.trace_id).single().execute()
    if not trace_res.data:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    orig_trace = trace_res.data
    spans_res = supabase.table("spans").select("*").eq("trace_id", body.trace_id).eq("kind", "retrieve").single().execute()
    
    if not spans_res.data:
        raise HTTPException(status_code=400, detail="Original trace has no retrieval data")
    
    # 2. Re-construct context from original retrieval
    chunks = spans_res.data["output_json"]
    if not chunks:
        raise HTTPException(status_code=400, detail="Original trace has empty retrieval")

    context = "\n\n---\n\n".join(
        f"[{i+1}] (from {c['doc_slug'].replace('-', ' ')})\n{c['text']}"
        for i, c in enumerate(chunks)
    )
    user_msg = f"Context:\n{context}\n\nQuestion: {orig_trace['question']}"

    # 3. Start a new trace linked to the old one
    new_trace = Trace(
        user_id=user["sub"],
        question=orig_trace["question"],
        model_id=body.model_id or orig_trace["model_id"],
        embedder_id=orig_trace["embedder_id"]
    )
    new_trace.prompt_version = "custom-replay"
    new_trace.metadata = {
        "parent_trace_id": body.trace_id,
        "is_replay": True,
        "custom_prompt": body.custom_prompt
    }

    # 4. Execute LLM Call
    async with new_trace.span("llm_call", input_json={"model": new_trace.model_id}) as span:
        resp = await cloud.chat(
            model=new_trace.model_id,
            messages=[
                {"role": "system", "content": body.custom_prompt},
                {"role": "user", "content": user_msg},
            ],
        )
        usage = resp.get("usage", {})
        new_trace.set_llm_metrics(
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            cost=0.0
        )
        span.output_json = {"usage": usage}
    
    new_trace.final_answer = resp["choices"][0]["message"]["content"]
    await new_trace.flush()

    return {
        "new_trace_id": new_trace.id,
        "answer": new_trace.final_answer
    }

@router.get("/bad-answers")
async def get_bad_answers(_: dict = Depends(require_admin)):
    """List traces that have been flagged or have rule violations."""
    # Traces with status 'flagged', including their rule violations
    res = supabase.table("traces").select("*, rule_violations(*)").eq("status", "flagged").order("created_at", desc=True).execute()
    return {"traces": res.data}

@router.get("/violations")
async def get_violations(_: dict = Depends(require_admin)):
    """List recent rule violations across all traces."""
    # Select violations and join with trace info
    res = supabase.table("rule_violations").select("*, traces(question, model_id)").order("created_at", desc=True).limit(100).execute()
    return {"violations": res.data}
