from __future__ import annotations

import csv
import io
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from ..auth import require_user, require_admin
from ..supabase_client import supabase

router = APIRouter(prefix="/traces")

@router.get("")
async def list_traces(user: dict = Depends(require_user)):
    """List traces for the current user. Admins see all."""
    query = supabase.table("traces").select("*").order("created_at", desc=True).limit(50)
    
    if user.get("role") != "admin":
        query = query.eq("user_id", user["sub"])
    
    res = query.execute()
    return {"traces": res.data}

@router.get("/export/json")
async def export_json(user: dict = Depends(require_user)):
    """Export traces as JSON."""
    query = supabase.table("traces").select("*").order("created_at", desc=True)
    if user.get("role") != "admin":
        query = query.eq("user_id", user["sub"])
    
    res = query.execute()
    return JSONResponse(
        content=res.data,
        headers={"Content-Disposition": "attachment; filename=traces.json"}
    )

@router.get("/export/csv")
async def export_csv(user: dict = Depends(require_user)):
    """Export traces as CSV."""
    query = supabase.table("traces").select("*").order("created_at", desc=True)
    if user.get("role") != "admin":
        query = query.eq("user_id", user["sub"])
    
    res = query.execute()
    if not res.data:
        return StreamingResponse(io.StringIO(""), media_type="text/csv")

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=res.data[0].keys())
    writer.writeheader()
    writer.writerows(res.data)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=traces.csv"}
    )

@router.get("/{trace_id}")
async def get_trace(trace_id: str, user: dict = Depends(require_user)):
    """Get a single trace with all its spans."""
    # 1. Fetch trace
    trace_res = supabase.table("traces").select("*").eq("id", trace_id).single().execute()
    if not trace_res.data:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    trace = trace_res.data
    
    # Check ownership
    if user.get("role") != "admin" and trace["user_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this trace")
    
    # 2. Fetch spans
    spans_res = supabase.table("spans").select("*").eq("trace_id", trace_id).order("ord").execute()
    
    return {
        "trace": trace,
        "spans": spans_res.data
    }
