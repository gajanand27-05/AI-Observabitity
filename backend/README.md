# Backend — AI Observability

Python 3.12 / FastAPI. Runs on your laptop. Exposed publicly via Cloudflare Tunnel.

## Setup

```powershell
# from project root
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
# from /backend, with venv activated
uvicorn app.main:app --reload --port 8000
```

Health check: open http://127.0.0.1:8000/healthz — should return `{"status": "ok"}`.

## Smoke test

```powershell
# from /backend with venv activated
python scripts\smoke_test.py
```

Verifies Ollama Cloud, local Ollama, embedding model, and the 12 bake-off models.
