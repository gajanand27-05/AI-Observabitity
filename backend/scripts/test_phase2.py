import asyncio
import uuid
from app.supabase_client import supabase
from app.tracing.manager import Trace
from app.heartbeat import heartbeat_loop

async def test_tracing():
    print("Testing tracing...")
    user_id = "a2c49ad7-3139-40ea-b138-e5588f533422" # Real user from DB
    trace = Trace(user_id=user_id, question="What is ENIAC?", model_id="test-model", embedder_id="test-embedder")
    
    async with trace.span("retrieve", input_json={"k": 5}):
        await asyncio.sleep(0.1)
    
    async with trace.span("llm_call", input_json={"prompt": "..."}):
        await asyncio.sleep(0.2)
        trace.set_llm_metrics(100, 50, 0.001)
    
    trace.final_answer = "ENIAC was the first programmable, electronic, general-purpose digital computer."
    await trace.flush()
    print(f"Trace {trace.id} flushed.")
    
    # Verify in Supabase
    res = supabase.table("traces").select("*").eq("id", trace.id).single().execute()
    if res.data:
        print(f"[PASS] Trace found in Supabase: {res.data['id']}")
    else:
        print("[FAIL] Trace NOT found in Supabase")

async def test_heartbeat_once():
    print("Testing heartbeat...")
    from app.heartbeat import INSTANCE_ID
    import socket
    
    # Run one iteration of the logic
    models = []
    data = {
        "instance_id": INSTANCE_ID,
        "last_seen": "2026-05-30T12:00:00Z", # Fixed for test
        "version": "test-0.1.0",
        "ollama_models_seen": models,
        "metadata": {"test": True}
    }
    supabase.table("backend_heartbeat").upsert(data).execute()
    
    res = supabase.table("backend_heartbeat").select("*").eq("instance_id", INSTANCE_ID).single().execute()
    if res.data:
        print(f"[PASS] Heartbeat found in Supabase for {INSTANCE_ID}")
    else:
        print("[FAIL] Heartbeat NOT found in Supabase")

if __name__ == "__main__":
    asyncio.run(test_tracing())
    asyncio.run(test_heartbeat_once())
