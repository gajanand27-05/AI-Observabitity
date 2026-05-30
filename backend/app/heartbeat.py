import asyncio
import socket
from datetime import datetime, timezone
from .supabase_client import supabase
from .ollama_client import local
from .models_registry import all_ids

INSTANCE_ID = socket.gethostname()

async def heartbeat_loop():
    """Background task that posts a heartbeat to Supabase every 30 seconds."""
    print(f"Starting heartbeat loop for instance: {INSTANCE_ID}")
    while True:
        try:
            # 1. Check local Ollama for models
            try:
                models = await local.list_models()
            except Exception:
                models = []

            # 2. Upsert heartbeat
            data = {
                "instance_id": INSTANCE_ID,
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "version": "0.1.0",
                "ollama_models_seen": models,
                "metadata": {
                    "bake_off_models_supported": all_ids()
                }
            }
            
            supabase.table("backend_heartbeat").upsert(data).execute()
        except Exception as e:
            print(f"HEARTBEAT ERROR: {e}")
        
        await asyncio.sleep(30)
