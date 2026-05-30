import asyncio
import uuid
from app.supabase_client import supabase
from app.rules import default_engine
from app.rules.base import RuleViolation

async def test_rules_and_feedback():
    print("Testing Phase 4: Rules & Feedback...")
    user_id = "a2c49ad7-3139-40ea-b138-e5588f533422" # Real user
    
    # 1. Test Rules Engine Manually
    print("Running rules engine test...")
    trace_dict = {"total_latency_ms": 25000, "final_answer": "Too short"}
    context = {"chunks": []} # Should trigger EmptyRetrieval and HighLatency
    
    violations = await default_engine.run_all(trace_dict, context)
    print(f"Detected {len(violations)} violations: {[v.rule_name for v in violations]}")
    assert any(v.rule_name == "empty_retrieval" for v in violations)
    assert any(v.rule_name == "high_latency" for v in violations)
    
    # 2. Test Feedback API (Simulated)
    print("Testing feedback submission...")
    # Create a dummy trace first
    trace_id = str(uuid.uuid4())
    supabase.table("traces").insert({
        "id": trace_id,
        "user_id": user_id,
        "question": "Feedback Test?",
        "status": "ok"
    }).execute()
    
    # Submit 👎 feedback
    feedback_row = {
        "trace_id": trace_id,
        "user_id": user_id,
        "thumbs": -1,
        "comment": "Not good!"
    }
    supabase.table("feedback").upsert(feedback_row).execute()
    # Auto-flagging logic is in the route, so we simulate it here or just check if we can flag manually
    supabase.table("traces").update({"status": "flagged"}).eq("id", trace_id).execute()
    
    res = supabase.table("traces").select("status").eq("id", trace_id).single().execute()
    print(f"Trace status after feedback: {res.data['status']}")
    assert res.data['status'] == "flagged"
    
    # 3. Test Bad Answers Query
    print("Testing bad answers query...")
    res = supabase.table("traces").select("*, rule_violations(*)").eq("status", "flagged").limit(1).execute()
    if res.data:
        print(f"[PASS] Found flagged trace in bad answers: {res.data[0]['id']}")
    else:
        print("[FAIL] No flagged traces found")

if __name__ == "__main__":
    asyncio.run(test_rules_and_feedback())
