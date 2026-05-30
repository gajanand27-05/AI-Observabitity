import asyncio
from app.rag.retrieve import retrieve

async def main():
    print("--- DIAGNOSING RETRIEVAL ---")
    query = "tell me about ENIAC"
    embedder = "bge-m3"
    
    try:
        chunks = await retrieve(query, embedder, 5)
        if not chunks:
            print("❌ NO CHUNKS FOUND AT ALL")
            return
            
        for i, c in enumerate(chunks):
            print(f"[{i+1}] {c.doc_slug} (Score: {c.score:.3f})")
            print(f"    Snippet: {c.text[:100]}...")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(main())
