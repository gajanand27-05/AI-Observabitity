import asyncio
import uuid
from app.supabase_client import supabase
from unittest.mock import patch

async def test_phase5_api_integration():
    print("Performing Phase 5 API Integration Test...")
    
    # 1. Promote or ensure admin
    admin_id = "3f4b72b7-5f0a-4b38-9ebb-ba011902fdf6"
    print(f"Testing as admin: {admin_id}")

    # 2. Test /prompts handler
    from app.routes.admin_observability import list_prompts
    try:
        res = await list_prompts(_={"role": "admin", "sub": admin_id})
        assert "prompts" in res
        print("[PASS] list_prompts handler logic")
    except Exception as e:
        print(f"[FAIL] list_prompts handler: {e}")

    # 3. Create a clean trace with retrieval data to test replay
    from app.tracing.manager import Trace
    print("Creating a clean trace for replay test...")
    parent_trace = Trace(user_id=admin_id, question="Who is Turing?", model_id="llama3", embedder_id="bge-m3")
    async with parent_trace.span("retrieve") as span:
        chunks = [{"doc_slug": "alan-turing", "text": "Alan Turing was a computer scientist.", "chunk_idx": 0}]
        span.output_json = chunks
    parent_trace.final_answer = "Original answer"
    await parent_trace.flush()
    print(f"Parent trace created: {parent_trace.id}")

    # 4. Test Replay Handler
    from app.routes.admin_observability import replay_trace, ReplayRequest
    req = ReplayRequest(trace_id=parent_trace.id, custom_prompt="You are a robot.")
    
    try:
        with patch('app.ollama_client.cloud.chat') as mock_chat:
            mock_chat.return_value = {
                "choices": [{"message": {"content": "Beep boop."}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                "model": "test-model"
            }
            
            res = await replay_trace(req, user={"role": "admin", "sub": admin_id})
            assert "new_trace_id" in res
            assert res["answer"] == "Beep boop."
            print(f"[PASS] replay_trace handler logic. Created: {res['new_trace_id']}")
            
            # Verify linking
            check = supabase.table("traces").select("metadata").eq("id", res["new_trace_id"]).single().execute()
            assert check.data["metadata"]["parent_trace_id"] == parent_trace.id
            print("[PASS] Replay trace linked correctly")
            
    except Exception as e:
        print(f"[FAIL] replay_trace handler: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_phase5_api_integration())
