import asyncio
import httpx
import uuid
import time
from app.supabase_client import supabase

async def final_stress_test():
    print("🚀 Starting Final Stress Test...")
    
    # 1. Setup
    user_id = "3f4b72b7-5f0a-4b38-9ebb-ba011902fdf6" # Admin user
    # Note: Testing rate limits requires hitting the actual running server.
    # Since I am in a CLI, I will simulate the handler calls in rapid succession
    # to see if the internal limiter state increments.
    
    from app.routes.chat import chat
    from app.main import app
    from starlette.requests import Request
    
    # Create a real Request instance
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/chat",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "app": app
    }
    mock_req = Request(scope)
    
    chat_req = type('obj', (object,), {
        'question': 'Test?', 
        'model': 'gemma2:2b', 
        'embedder': 'nomic-embed-text', 
        'k': 5
    })
    
    user_ctx = {"sub": user_id, "role": "admin"}

    print("--- Testing Rate Limiter (5/min) ---")
    results = []
    # Mocking cloud.chat to avoid token usage during stress test
    from unittest.mock import patch
    with patch('app.ollama_client.cloud.chat') as mock_chat:
        mock_chat.return_value = {
            "choices": [{"message": {"content": "Test answer"}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "model": "test"
        }
        
        for i in range(1, 8):
            try:
                print(f"Call {i}...", end=" ")
                # Create a fresh Request for every call
                scope = {
                    "type": "http",
                    "method": "POST",
                    "path": "/chat",
                    "headers": [],
                    "client": ("127.0.0.1", 12345),
                    "app": app
                }
                fresh_req = Request(scope)
                
                await chat(request=fresh_req, req=chat_req, user=user_ctx)
                print("✅ Success")
                results.append("pass")
            except Exception as e:
                import traceback
                traceback.print_exc()
                # slowapi raises RateLimitExceeded which FastAPI converts to 429
                from slowapi.errors import RateLimitExceeded
                if isinstance(e, RateLimitExceeded):
                    print("🛑 RATE LIMITED (429)")
                    results.append("limit")
                else:
                    print(f"❌ Error: {type(e).__name__}")
                    results.append("error")

    # 2. Assertions
    success_count = results.count("pass")
    limit_count = results.count("limit")
    
    print(f"\nFinal Tally: {success_count} Successes, {limit_count} Rate Limits")
    
    if success_count == 5 and limit_count >= 1:
        print("🏆 [PASS] Rate limiter is working exactly as configured (5 per minute).")
    else:
        print("⚠️ [FAIL] Rate limiter behavior unexpected.")

    # 3. Verify Export logic with real data
    print("\n--- Testing Export Persistence ---")
    from app.routes.traces import export_json
    res = await export_json(user=user_ctx)
    import json
    data = json.loads(res.body.decode())
    print(f"Exported {len(data)} traces.")
    assert len(data) >= 5
    print("🏆 [PASS] Export contains the stress test traces.")

if __name__ == "__main__":
    asyncio.run(final_stress_test())
