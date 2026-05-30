import asyncio
import os
import shutil
import chromadb
from app.rag.ingest import ingest_all

async def clean_and_rebuild():
    print("🧹 Deleting old Chroma data...")
    path = "data/chroma"
    if os.path.exists(path):
        # We try to delete the directory, handling the 'in use' error if possible
        try:
            shutil.rmtree(path)
            print("✅ Deleted directory.")
        except Exception as e:
            print(f"⚠️ Could not delete directory (likely in use): {e}")
            print("Switching to collection deletion mode...")
            client = chromadb.PersistentClient(path=path)
            for coll in client.list_collections():
                print(f"Removing collection: {coll.name}")
                client.delete_collection(coll.name)
    
    print("🚀 Re-ingesting everything...")
    await ingest_all()
    
    print("🧠 Building Chroma collections...")
    from app.rag.embed import build_all
    await build_all(size=1000, overlap=150)
    
    print("✨ Rebuild complete.")

if __name__ == "__main__":
    asyncio.run(clean_and_rebuild())
