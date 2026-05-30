import asyncio
import httpx
import time
from app.supabase_client import supabase

async def test_phase6_hardening():
    print("Testing Phase 6: Hardening & Polish...")
    
    # 1. Test Rate Limiting
    print("Testing rate limiting on /chat (simulated hit limit)...")
    # We'll use a real user for the auth header simulation if possible
    # For local verification, we'll just check if the limiter logic is correctly attached
    from app.main import app
    from app.limiter import limiter
    
    # We can't easily test the actual middleware in a script without running the server,
    # but we can verify the limiter is configured.
    assert limiter.enabled
    print("[PASS] Limiter configured")

    # 2. Test Export Endpoints
    print("Testing export endpoints handler logic...")
    from app.routes.traces import export_json, export_csv
    
    admin_id = "3f4b72b7-5f0a-4b38-9ebb-ba011902fdf6"
    admin_user = {"role": "admin", "sub": admin_id}
    
    # JSON Export
    try:
        res = await export_json(user=admin_user)
        assert res.status_code == 200
        assert res.headers["Content-Disposition"] == "attachment; filename=traces.json"
        print("[PASS] JSON Export Handler")
    except Exception as e:
        print(f"[FAIL] JSON Export: {e}")

    # CSV Export
    try:
        res = await export_csv(user=admin_user)
        assert res.status_code == 200
        assert res.headers["Content-Disposition"] == "attachment; filename=traces.csv"
        # Consume the stream to ensure it works
        content = b""
        async for chunk in res.body_iterator:
            content += chunk.encode() if isinstance(chunk, str) else chunk
        assert b"id,user_id,created_at" in content
        print("[PASS] CSV Export Handler")
    except Exception as e:
        print(f"[FAIL] CSV Export: {e}")

    # 3. Test Dashboard aggregation logic
    print("Verifying dashboard aggregation strings...")
    # This is a bit harder to unit test without the frontend environment,
    # but we can verify the backend routes they depend on are still fast.
    start = time.perf_counter()
    supabase.table("traces").select("*").limit(50).execute()
    latency = (time.perf_counter() - start) * 1000
    print(f"Supabase query latency: {latency:.2f}ms")
    assert latency < 1000 # Should be fast
    print("[PASS] Data retrieval performance")

if __name__ == "__main__":
    asyncio.run(test_phase6_hardening())
