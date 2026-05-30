import asyncio
import uuid
from app.supabase_client import supabase
from app.prompts import get_prompt, PROMPT_REGISTRY
from app.tracing.manager import Trace

async def test_phase5_replay():
    print("Testing Phase 5: Debug & Improve Loop...")
    user_id = "a2c49ad7-3139-40ea-b138-e5588f533422" # Real user
    
    # 1. Test Prompt Registry
    print("Checking prompt registry...")
    p1 = get_prompt("v1")
    assert "helpful assistant" in p1
    print("[PASS] Prompt Registry")

    # 2. Create a "parent" trace with retrieval spans
    print("Creating parent trace...")
    parent_trace = Trace(user_id=user_id, question="Who is Turing?", model_id="llama3", embedder_id="bge-m3")
    parent_trace.prompt_version = "v1"
    
    # Mock retrieval span (ESSENTIAL for replay)
    async with parent_trace.span("retrieve") as span:
        chunks = [{"doc_slug": "alan-turing", "text": "Alan Turing was a computer scientist.", "chunk_idx": 0}]
        span.output_json = chunks
    
    parent_trace.final_answer = "Turing was a scientist."
    await parent_trace.flush()
    print(f"Parent trace created: {parent_trace.id}")

    # 3. Simulate Replay (Simulating the logic in admin_observability.py)
    print("Simulating replay...")
    new_prompt = "Answer like a pirate."
    
    # Replay logic
    new_trace = Trace(user_id=user_id, question=parent_trace.question, model_id="llama3", embedder_id="bge-m3")
    new_trace.prompt_version = "pirate-replay"
    new_trace.metadata = {"parent_trace_id": parent_trace.id, "is_replay": True}
    
    # Use parent's context
    context_str = f"Context: {chunks[0]['text']}\n\nQuestion: {parent_trace.question}"
    
    async with new_trace.span("llm_call") as span:
        # We won't actually hit the LLM in this unit test to save credits, just mock the output
        new_trace.final_answer = "Arrr, Turing be a scientist, matey!"
        span.output_json = {"answer": new_trace.final_answer}
    
    await new_trace.flush()
    print(f"Replay trace created: {new_trace.id}")

    # 4. Verify linking in DB
    print("Verifying DB records...")
    res = supabase.table("traces").select("*").eq("id", new_trace.id).single().execute()
    assert res.data["metadata"]["parent_trace_id"] == parent_trace.id
    assert res.data["prompt_version"] == "pirate-replay"
    print("[PASS] Trace Linking and Versioning")

if __name__ == "__main__":
    asyncio.run(test_phase5_replay())
