import asyncio
import uuid
from app.supabase_client import supabase
from app.tracing.manager import Trace

async def test_dashboard_apis():
    print("Testing Dashboard APIs...")
    user_id = "a2c49ad7-3139-40ea-b138-e5588f533422" # Valid user from earlier
    
    # 1. Create a fresh trace to ensure we have something to find
    trace = Trace(user_id=user_id, question="Verification Question?", model_id="verify-model", embedder_id="verify-embedder")
    async with trace.span("llm_call"):
        await asyncio.sleep(0.01)
    trace.final_answer = "Verified."
    await trace.flush()
    print(f"Created trace: {trace.id}")

    # 2. Test List Traces (Simulating the backend route logic)
    res = supabase.table("traces").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(5).execute()
    if len(res.data) > 0:
        print(f"[PASS] List Traces: Found {len(res.data)} traces for user")
    else:
        print("[FAIL] List Traces: No traces found")

    # 3. Test Get Single Trace
    res = supabase.table("traces").select("*").eq("id", trace.id).single().execute()
    if res.data and res.data['id'] == trace.id:
        print(f"[PASS] Get Trace: Found specific trace {trace.id}")
    else:
        print("[FAIL] Get Trace: Could not find specific trace")

    # 4. Test Get Spans for Trace
    res = supabase.table("spans").select("*").eq("trace_id", trace.id).order("ord").execute()
    if len(res.data) > 0:
        print(f"[PASS] Get Spans: Found {len(res.data)} spans for trace")
    else:
        print("[FAIL] Get Spans: No spans found")

if __name__ == "__main__":
    asyncio.run(test_dashboard_apis())
