import asyncio
import uuid
import time
import httpx
from app.supabase_client import supabase
from app.tracing.manager import Trace
from app.rules import default_engine
from app.prompts import get_prompt, get_latest_version
from app.routes.chat import chat
from app.routes.traces import get_trace, list_traces, export_json
from app.routes.feedback import post_feedback, FeedbackIn
from app.routes.admin_observability import replay_trace, ReplayRequest
from starlette.requests import Request
from unittest.mock import patch

async def run_full_regression():
    print("🚀 STARTING FULL SYSTEM REGRESSION TEST (Phases 1-6)")
    user_id = "3f4b72b7-5f0a-4b38-9ebb-ba011902fdf6" # Admin user
    user_ctx = {"sub": user_id, "role": "admin"}
    
    # ---------------------------------------------------------
    # PHASE 1 & 2: RAG + Tracing
    # ---------------------------------------------------------
    print("\n[PHASE 1 & 2] Testing RAG Pipeline + Trace Creation...")
    
    # Mock LLM to avoid costs, but test the FULL pipeline flow
    with patch('app.ollama_client.cloud.chat') as mock_chat:
        mock_chat.return_value = {
            "choices": [{"message": {"content": "Regression test answer."}}],
            "usage": {"prompt_tokens": 50, "completion_tokens": 20},
            "model": "test-model"
        }
        
        scope = {"type": "http", "method": "POST", "path": "/chat", "client": ("127.0.0.1", 0), "app": type('obj', (object,), {'state': type('obj', (object,), {'limiter': type('obj', (object,), {'limit': lambda x: lambda y: y})})})}
        # Simple mock request that bypasses limiter for this specific check
        mock_req = Request(scope)
        
        from app.routes.chat import ChatRequest
        req_data = ChatRequest(question="What is Unix?", model="llama3", embedder="nomic-embed-text", k=3)
        
        resp = await chat(request=mock_req, req=req_data, user=user_ctx)
        trace_id = resp.trace_id
        print(f"✅ Chat successful. Trace ID: {trace_id}")
        
        # Verify Trace & Spans in DB
        res = supabase.table("traces").select("*").eq("id", trace_id).single().execute()
        assert res.data["question"] == "What is Unix?"
        assert res.data["prompt_version"] is not None
        
        spans = supabase.table("spans").select("*").eq("trace_id", trace_id).execute()
        assert len(spans.data) >= 2 # Should have retrieve and llm_call
        print(f"✅ Trace and {len(spans.data)} spans verified in Supabase.")

    # ---------------------------------------------------------
    # PHASE 4: Rules Engine & Feedback
    # ---------------------------------------------------------
    print("\n[PHASE 4] Testing Rules Engine & Feedback Loop...")
    
    # Check if a 👎 flags the trace
    feedback_data = FeedbackIn(trace_id=trace_id, thumbs=-1, comment="Regression test fail")
    await post_feedback(body=feedback_data, user=user_ctx)
    
    # Check status changed to flagged
    check = supabase.table("traces").select("status").eq("id", trace_id).single().execute()
    assert check.data["status"] == "flagged"
    print("✅ Feedback submitted and trace auto-flagged.")

    # ---------------------------------------------------------
    # PHASE 5: Prompts & Replay
    # ---------------------------------------------------------
    print("\n[PHASE 5] Testing Prompt Versioning & Replay...")
    
    latest_v = get_latest_version()
    assert latest_v is not None
    
    replay_req = ReplayRequest(trace_id=trace_id, custom_prompt="Answer as a robot.")
    with patch('app.ollama_client.cloud.chat') as mock_chat:
        mock_chat.return_value = {
            "choices": [{"message": {"content": "BEEP BOOP."}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            "model": "test-model"
        }
        replay_resp = await replay_trace(body=replay_req, user=user_ctx)
        assert replay_resp["answer"] == "BEEP BOOP."
        
        # Verify linking
        child_trace = supabase.table("traces").select("*").eq("id", replay_resp["new_trace_id"]).single().execute()
        assert child_trace.data["metadata"]["parent_trace_id"] == trace_id
        print(f"✅ Replay successful. Linked {replay_resp['new_trace_id']} to {trace_id}")

    # ---------------------------------------------------------
    # PHASE 6: Hardening (Rate Limit + Export)
    # ---------------------------------------------------------
    print("\n[PHASE 6] Testing Hardening (Exports)...")
    
    export_res = await export_json(user=user_ctx)
    assert export_res.status_code == 200
    print("✅ Data export functional.")

    print("\n" + "="*50)
    print("✨ ALL PHASES VERIFIED AND PASSING ✨")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(run_full_regression())
