"""One-shot CLI to fetch all Wikipedia docs, chunk, and build both Chroma collections.

Usage from backend/:
  ./.venv/Scripts/python.exe -m scripts.build_index
  ./.venv/Scripts/python.exe -m scripts.build_index --size 1500 --overlap 200 --force-fetch
"""
from __future__ import annotations

import argparse
import asyncio
import time

from app.rag.embed import build_all
from app.rag.ingest import ingest_all


async def main(size: int, overlap: int, force_fetch: bool) -> None:
    print("[1/2] Fetching Wikipedia articles...")
    t0 = time.perf_counter()
    fetched = await ingest_all(force=force_fetch)
    for slug, sz in fetched.items():
        print(f"  {slug:<35} {sz:>8} chars")
    print(f"  -> {len(fetched)} docs in {time.perf_counter() - t0:.1f}s")

    print(f"\n[2/2] Building Chroma collections (chunk={size}/{overlap})...")
    t0 = time.perf_counter()
    counts = await build_all(size=size, overlap=overlap)
    for embedder, n in counts.items():
        print(f"  {embedder:<25} {n} chunks")
    print(f"  -> done in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=1000)
    ap.add_argument("--overlap", type=int, default=150)
    ap.add_argument("--force-fetch", action="store_true")
    args = ap.parse_args()
    asyncio.run(main(args.size, args.overlap, args.force_fetch))
