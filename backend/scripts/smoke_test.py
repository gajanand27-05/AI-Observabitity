"""Phase 0 smoke test.

Run from project root:
    python backend/scripts/smoke_test.py

Checks (in order):
  1. Ollama Cloud /v1/models returns the 12 locked bake-off models
  2. Tiny completion against the smallest model (gemma3:4b)
  3. Local Ollama is reachable at LOCAL_OLLAMA_URL
  4. Local Ollama can produce an embedding via nomic-embed-text

Exits 0 on full pass, 1 on any failure. No external deps beyond `httpx` + `python-dotenv`.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load .env from project root regardless of CWD
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT / "backend"))
from app.models_registry import all_ids  # noqa: E402

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "").rstrip("/")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "")
LOCAL_OLLAMA_URL = os.getenv("LOCAL_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")

PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
SKIP = "\033[93m[SKIP]\033[0m"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    badge = PASS if ok else FAIL
    print(f"{badge} {name}" + (f"  — {detail}" if detail else ""))


def check_cloud_models() -> None:
    if not OLLAMA_BASE_URL or not OLLAMA_API_KEY:
        record("Ollama Cloud — env vars set", False, "OLLAMA_BASE_URL or OLLAMA_API_KEY missing in .env")
        return
    try:
        r = httpx.get(
            f"{OLLAMA_BASE_URL}/v1/models",
            headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json().get("data", [])
        ids = {m["id"] for m in data}
    except Exception as e:
        record("Ollama Cloud — list models", False, f"{type(e).__name__}: {e}")
        return

    record("Ollama Cloud — list models", True, f"{len(ids)} models returned")

    expected = set(all_ids())
    missing = expected - ids
    if missing:
        record("Ollama Cloud — 12 bake-off models present", False,
               f"missing: {', '.join(sorted(missing))}")
    else:
        record("Ollama Cloud — 12 bake-off models present", True, "all 12 found")


def check_cloud_completion() -> None:
    if not OLLAMA_BASE_URL or not OLLAMA_API_KEY:
        record("Ollama Cloud — tiny completion", False, "env not set")
        return
    try:
        r = httpx.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {OLLAMA_API_KEY}"},
            json={
                "model": "gemma3:4b",
                "messages": [{"role": "user", "content": "Reply with exactly the word: pong"}],
                "max_tokens": 10,
            },
            timeout=60,
        )
        r.raise_for_status()
        out = r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        record("Ollama Cloud — tiny completion (gemma3:4b)", False, f"{type(e).__name__}: {e}")
        return
    record("Ollama Cloud — tiny completion (gemma3:4b)", True, f"got: {out!r}")


def check_local_ollama() -> None:
    try:
        r = httpx.get(f"{LOCAL_OLLAMA_URL}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
    except Exception as e:
        record("Local Ollama — reachable", False,
               f"{type(e).__name__}: {e}. Is the Ollama desktop app running?")
        return
    record("Local Ollama — reachable", True, f"{len(models)} local model(s)")

    for required in ("nomic-embed-text", "bge-m3"):
        present = any(m.startswith(required) for m in models)
        if present:
            record(f"Local Ollama — {required} pulled", True)
        else:
            record(f"Local Ollama — {required} pulled", False,
                   f"run: ollama pull {required}")


def check_local_embedding() -> None:
    try:
        r = httpx.post(
            f"{LOCAL_OLLAMA_URL}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": "smoke test"},
            timeout=30,
        )
        r.raise_for_status()
        vec = r.json().get("embedding", [])
    except Exception as e:
        record("Local Ollama — embedding works", False, f"{type(e).__name__}: {e}")
        return
    if isinstance(vec, list) and len(vec) >= 100:
        record("Local Ollama — embedding works", True, f"vector dim = {len(vec)}")
    else:
        record("Local Ollama — embedding works", False, f"unexpected response shape")


def main() -> int:
    print("=" * 60)
    print("AI Observability — Phase 0 smoke test")
    print("=" * 60)

    print("\n--- Ollama Cloud ---")
    check_cloud_models()
    check_cloud_completion()

    print("\n--- Local Ollama ---")
    check_local_ollama()
    check_local_embedding()

    print("\n" + "=" * 60)
    failed = [name for name, ok, _ in results if not ok]
    if failed:
        print(f"FAILED ({len(failed)}/{len(results)}): {', '.join(failed)}")
        return 1
    print(f"ALL {len(results)} CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
