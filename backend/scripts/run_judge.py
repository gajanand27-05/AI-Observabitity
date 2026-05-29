"""Phase 1.5 - LLM-as-judge runner.

Loads runs_*.jsonl, calls the judge model for each row, writes judge_*.jsonl.
Resumable: rows already judged are skipped.

Usage from backend/:
  ./.venv/Scripts/python.exe -m scripts.run_judge                  # judge latest runs file
  ./.venv/Scripts/python.exe -m scripts.run_judge --limit 4        # smoke
  ./.venv/Scripts/python.exe -m scripts.run_judge --runs runs_2026....jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from app.config import PROJECT_ROOT
from app.models_registry import JUDGE_MODEL
from app.ollama_client import cloud

BAKE_OFF_DIR = PROJECT_ROOT / "backend" / "data" / "bake_off"

JUDGE_SYSTEM = (
    "You are an expert evaluator scoring AI assistant answers about the history of computing. "
    "Score the candidate answer on three dimensions, each an integer 1-5:\n"
    "  - groundedness: how well the answer is supported by the provided context "
    "(1 = hallucinated, 5 = fully grounded)\n"
    "  - correctness: factual accuracy (1 = wrong, 5 = fully correct)\n"
    "  - completeness: how thoroughly it addresses the question "
    "(1 = key info missing, 5 = thorough)\n\n"
    "Special rules:\n"
    "  - If expected_behavior is 'refuse' (the question is out of scope or has a false premise), "
    "an honest refusal or correction scores 5 across the board.\n"
    "  - A confidently wrong answer to such questions scores 1-2.\n\n"
    "Respond with ONLY a single-line JSON object, no markdown, no prose:\n"
    "{\"groundedness\": <int 1-5>, \"correctness\": <int 1-5>, "
    "\"completeness\": <int 1-5>, \"reasoning\": \"<one short sentence>\"}"
)


def load_runs(explicit: Path | None) -> tuple[Path, list[dict]]:
    if explicit:
        path = explicit
    else:
        files = sorted(BAKE_OFF_DIR.glob("runs_*.jsonl"))
        if not files:
            raise SystemExit("No runs_*.jsonl in backend/data/bake_off/. Run run_bake_off first.")
        path = files[-1]
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return path, rows


def existing_judge_run_ids() -> set[str]:
    ids: set[str] = set()
    for f in BAKE_OFF_DIR.glob("judge_*.jsonl"):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("error") is None:
                ids.add(row["run_id"])
    return ids


_JSON_RE = re.compile(r"\{[\s\S]*\}")


def parse_judgment(text: str) -> dict:
    """Parse the judge's JSON response, with regex fallback for stray prose."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = _JSON_RE.search(text)
        if not m:
            raise ValueError("No JSON object found in judge response")
        return json.loads(m.group(0))


async def judge_one(run: dict) -> dict:
    started = datetime.now(timezone.utc).isoformat()
    t0 = time.perf_counter()
    err: str | None = None
    g = c = co = 0
    reasoning = ""

    if run.get("error"):
        err = f"upstream_error: {run['error']}"
    elif not (run.get("answer") or "").strip():
        err = "empty_answer"
    else:
        try:
            chunks_summary = "\n".join(
                f"  [{i+1}] from {ch['doc_slug'].replace('-', ' ')} (relevance score {ch['score']:.2f})"
                for i, ch in enumerate(run.get("chunks", []))
            ) or "  (no chunks retrieved)"

            user_msg = (
                f"Question: {run['question']}\n"
                f"Expected behavior: {run['expected_behavior']}\n\n"
                f"Retrieved context (top {len(run.get('chunks', []))}):\n{chunks_summary}\n\n"
                f"Candidate answer:\n{run['answer']}"
            )
            resp = await cloud.chat(
                model=JUDGE_MODEL,
                messages=[
                    {"role": "system", "content": JUDGE_SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
            )
            content = resp["choices"][0]["message"]["content"]
            j = parse_judgment(content)

            def clamp(v) -> int:
                try:
                    return max(1, min(5, int(v)))
                except (TypeError, ValueError):
                    return 0

            g = clamp(j.get("groundedness"))
            c = clamp(j.get("correctness"))
            co = clamp(j.get("completeness"))
            reasoning = str(j.get("reasoning", ""))[:500]
        except Exception as e:
            err = f"{type(e).__name__}: {e}"

    return {
        "run_id": run["run_id"],
        "eval_set_version": run["eval_set_version"],
        "question_id": run["question_id"],
        "category": run.get("category"),
        "expected_behavior": run.get("expected_behavior"),
        "model": run["model"],
        "embedder": run["embedder"],
        "judge_model": JUDGE_MODEL,
        "groundedness": g,
        "correctness": c,
        "completeness": co,
        "reasoning": reasoning,
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "judge_latency_ms": int((time.perf_counter() - t0) * 1000),
        "error": err,
    }


async def main(args: argparse.Namespace) -> None:
    runs_path, runs = load_runs(args.runs)
    judged = set() if args.fresh else existing_judge_run_ids()
    todo = [r for r in runs if r["run_id"] not in judged]
    if args.limit:
        todo = todo[: args.limit]

    print(f"Loaded {len(runs)} runs from {runs_path.name}")
    print(f"Already judged: {len(runs) - len(todo)}")
    print(f"To judge:       {len(todo)}")
    print(f"Judge model:    {JUDGE_MODEL}")

    if args.dry_run or not todo:
        return

    BAKE_OFF_DIR.mkdir(parents=True, exist_ok=True)
    out = args.output or (
        BAKE_OFF_DIR / f"judge_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.jsonl"
    )
    print(f"Writing to {out}\n")
    n = len(todo)
    t_start = time.perf_counter()
    with out.open("a", encoding="utf-8") as f:
        for i, r in enumerate(todo, 1):
            print(
                f"[{i:>3}/{n}] {r['question_id']:<5} {r['model']:<28} {r['embedder']:<18} ",
                end="", flush=True,
            )
            j = await judge_one(r)
            f.write(json.dumps(j, ensure_ascii=False) + "\n")
            f.flush()
            if j["error"]:
                print(f"ERROR ({j['error'][:80]})")
            else:
                print(f"g={j['groundedness']} c={j['correctness']} co={j['completeness']}  ({j['judge_latency_ms']} ms)")

    print(f"\nFinished in {time.perf_counter() - t_start:.1f}s -> {out.name}")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=Path, help="Specific runs_*.jsonl file (default: latest)")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--output", type=Path)
    return ap.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
