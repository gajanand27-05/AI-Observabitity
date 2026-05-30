from __future__ import annotations

from fastapi import APIRouter, Depends
from ..auth import require_admin
from ..supabase_client import supabase

router = APIRouter(prefix="/admin/observability")

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
