"""Admin-gated read API for the bake-off dashboard + manual feedback recorder."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_admin
from ..config import PROJECT_ROOT

BAKE_OFF_DIR = PROJECT_ROOT / "backend" / "data" / "bake_off"
FEEDBACK_FILE = BAKE_OFF_DIR / "feedback.jsonl"

router = APIRouter(prefix="/admin/bakeoff")


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def _latest(prefix: str) -> Path | None:
    files = sorted(BAKE_OFF_DIR.glob(f"{prefix}_*.jsonl"))
    return files[-1] if files else None


@router.get("/runs")
async def get_runs(_: dict = Depends(require_admin)) -> dict:
    p = _latest("runs")
    return {"file": p.name if p else None, "rows": _load_jsonl(p) if p else []}


@router.get("/judge")
async def get_judge(_: dict = Depends(require_admin)) -> dict:
    p = _latest("judge")
    return {"file": p.name if p else None, "rows": _load_jsonl(p) if p else []}


@router.get("/feedback")
async def get_feedback(_: dict = Depends(require_admin)) -> dict:
    return {"rows": _load_jsonl(FEEDBACK_FILE)}


class FeedbackIn(BaseModel):
    run_id: str = Field(min_length=1)
    stars: int = Field(ge=1, le=5)
    thumbs: str = Field(pattern="^(up|down|skip)$")


@router.post("/feedback")
async def post_feedback(body: FeedbackIn, user: dict = Depends(require_admin)) -> dict:
    BAKE_OFF_DIR.mkdir(parents=True, exist_ok=True)
    row = {
        "run_id": body.run_id,
        "stars": body.stars,
        "thumbs": body.thumbs,
        "rated_by": user.get("sub"),
        "rated_by_email": user.get("email"),
        "rated_at": datetime.now(timezone.utc).isoformat(),
    }
    with FEEDBACK_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return {"ok": True, "rated_at": row["rated_at"]}
