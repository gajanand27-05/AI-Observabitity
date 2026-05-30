from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..auth import require_user
from ..supabase_client import supabase

router = APIRouter(prefix="/feedback")

class FeedbackIn(BaseModel):
    trace_id: str = Field(min_length=1)
    thumbs: int = Field(ge=-1, le=1) # -1 (down), 0 (none), 1 (up)
    stars: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = None

@router.post("")
async def post_feedback(body: FeedbackIn, user: dict = Depends(require_user)):
    row = {
        "trace_id": body.trace_id,
        "user_id": user["sub"],
        "thumbs": body.thumbs,
        "stars": body.stars,
        "comment": body.comment
    }
    # Use service role client to upsert feedback
    supabase.table("feedback").upsert(row).execute()
    
    # If thumbs is -1 (👎), auto-flag the trace
    if body.thumbs == -1:
        supabase.table("traces").update({"status": "flagged"}).eq("id", body.trace_id).execute()
    
    return {"ok": True}
