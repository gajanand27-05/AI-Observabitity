"""Phase 1.5 — model bake-off runner.

Iterates over (question x model x embedder) combos, captures per-run metrics, writes JSONL.
Resumable: re-running picks up where a previous incomplete run left off.

Usage from backend/:
  ./.venv/Scripts/python.exe -m scripts.run_bake_off                            # full sweep
  ./.venv/Scripts/python.exe -m scripts.run_bake_off --limit 4                  # smoke
  ./.venv/Scripts/python.exe -m scripts.run_bake_off --models gemma3:4b         # subset
  ./.venv/Scripts/python.exe -m scripts.run_bake_off --questions Q01 Q02        # subset
  ./.venv/Scripts/python.exe -m scripts.run_bake_off --dry-run                  # print combos only
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import PROJECT_ROOT
from app.models_registry import all_ids
from app.ollama_client import cloud
from app.rag.embed import EMBEDDERS
from app.rag.retrieve import retrieve

QUESTIONS_FILE = PROJECT_ROOT / "backend" / "eval" / "questions.json"
BAKE_OFF_DIR = PROJECT_ROOT / "backend" / "data" / "bake_off"

SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions about the history of computing. "
    "Use ONLY the context below to answer. "
    "If the answer is not in the context, say \"I don't know based on the provided documents.\" "
    "Be concise."
)


def load_questions() -> tuple[str, list[dict]]:
    data = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    return data["version"], data["questions"]


def existing_keys() -> set[tuple]:
    """Set of (eval_set_version, question_id, model, embedder) tuples already completed (no error)."""
    BAKE_OFF_DIR.mkdir(parents=True, exist_ok=True)
    keys: set[tuple] = set()
    for f in BAKE_OFF_DIR.glob("runs_*.jsonl"):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("error"):
                continue
            keys.add((row["eval_set_version"], row["question_id"], row["model"], row["embedder"]))
    return keys


async def run_one(question: dict, model: str, embedder: str, k: int = 5) -> dict:
    started = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()
    err: str | None = None
    answer = ""
    chunks_out: list[dict] = []
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        chunks = await retrieve(question["question"], embedder, k)
        chunks_out = [
            {"doc_slug": c.doc_slug, "chunk_idx": c.chunk_idx, "score": c.score}
            for c in chunks
        ]
        ctx = "\n\n---\n\n".join(
            f"[{i+1}] (from {c.doc_slug.replace('-', ' ')})\n{c.text}"
            for i, c in enumerate(chunks)
        )
        resp = await cloud.chat(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {question['question']}"},
            ],
        )
        answer = resp["choices"][0]["message"]["content"]
        u = resp.get("usage") or {}
        usage = {
            "prompt_tokens": int(u.get("prompt_tokens", 0)),
            "completion_tokens": int(u.get("completion_tokens", 0)),
            "total_tokens": int(u.get("total_tokens", 0)),
        }
    except Exception as e:
        err = f"{type(e).__name__}: {e}"

    return {
        "run_id": str(uuid.uuid4()),
        "eval_set_version": "v1",
        "question_id": question["id"],
        "category": question["category"],
        "expected_behavior": question["expected_behavior"],
        "question": question["question"],
        "model": model,
        "embedder": embedder,
        "answer": answer,
        "chunks": chunks_out,
        "latency_ms": int((time.perf_counter() - t0) * 1000),
        "prompt_tokens": usage["prompt_tokens"],
        "completion_tokens": usage["completion_tokens"],
        "total_tokens": usage["total_tokens"],
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error": err,
    }


async def main(args: argparse.Namespace) -> None:
    version, questions = load_questions()
    models = args.models or all_ids()
    embedders = args.embedders or list(EMBEDDERS.keys())
    qfilter = set(args.questions) if args.questions else {q["id"] for q in questions}
    questions = [q for q in questions if q["id"] in qfilter]

    combos = [(q, m, e) for q in questions for m in models for e in embedders]
    if args.limit:
        combos = combos[: args.limit]

    done = set() if args.fresh else existing_keys()
    todo = [(q, m, e) for (q, m, e) in combos if (version, q["id"], m, e) not in done]

    print(f"Eval set:     {version} ({len(questions)} questions)")
    print(f"Models:       {len(models)} ({', '.join(models)})")
    print(f"Embedders:    {len(embedders)} ({', '.join(embedders)})")
    print(f"Total combos: {len(combos)}")
    print(f"Already done: {len(combos) - len(todo)}")
    print(f"To run:       {len(todo)}")

    if args.dry_run:
        for q, m, e in todo[:30]:
            print(f"  {q['id']:<5} {m:<28} {e}")
        if len(todo) > 30:
            print(f"  ... and {len(todo) - 30} more")
        return

    if not todo:
        print("Nothing to do.")
        return

    BAKE_OFF_DIR.mkdir(parents=True, exist_ok=True)
    out_path = args.output or (
        BAKE_OFF_DIR / f"runs_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.jsonl"
    )
    print(f"\nWriting to {out_path}\n")

    n = len(todo)
    t_start = time.perf_counter()
    with out_path.open("a", encoding="utf-8") as f:
        for i, (q, m, e) in enumerate(todo, 1):
            print(f"[{i:>3}/{n}] {q['id']:<5} {m:<28} {e:<18} ", end="", flush=True)
            row = await run_one(q, m, e)
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            if row["error"]:
                print(f"ERROR  ({row['error'][:80]})")
            else:
                print(f"OK  {row['latency_ms']:>6} ms  {row['total_tokens']:>5} tok")

    print(f"\nFinished in {time.perf_counter() - t_start:.1f}s -> {out_path.name}")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+")
    ap.add_argument("--embedders", nargs="+")
    ap.add_argument("--questions", nargs="+")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--fresh", action="store_true", help="Ignore existing runs (re-run everything)")
    ap.add_argument("--output", type=Path)
    return ap.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
