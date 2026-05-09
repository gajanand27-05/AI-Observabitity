"""End-to-end Phase 1 smoke test.

  - Retrieves chunks from BOTH embedders for a known question
  - Calls cloud chat with a small/fast model
  - Asserts non-empty answer + >= 1 chunk per embedder
"""
from __future__ import annotations

import asyncio

from app.ollama_client import cloud
from app.rag.embed import EMBEDDERS
from app.rag.retrieve import retrieve

QUESTION = "Who designed the C programming language and at what company?"
TEST_MODEL = "gemma3:4b"  # tiniest in the lineup → fastest smoke test


async def main() -> None:
    for embedder in EMBEDDERS:
        print(f"\n=== embedder: {embedder} ===")
        chunks = await retrieve(QUESTION, embedder, k=3)
        assert len(chunks) >= 1, f"No chunks retrieved for {embedder}"
        for i, c in enumerate(chunks):
            preview = c.text[:80].replace("\n", " ")
            print(f"  [{i+1}] {c.doc_slug:<25} score={c.score:.3f}  {preview}...")

        ctx = "\n\n".join(c.text for c in chunks)
        resp = await cloud.chat(
            model=TEST_MODEL,
            messages=[
                {"role": "system", "content": "Use the context to answer concisely."},
                {"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {QUESTION}"},
            ],
        )
        ans = resp["choices"][0]["message"]["content"]
        assert ans.strip(), "Empty answer"
        print(f"  ANSWER: {ans[:300]}")
    print("\nPhase 1 smoke test passed.")


if __name__ == "__main__":
    asyncio.run(main())
