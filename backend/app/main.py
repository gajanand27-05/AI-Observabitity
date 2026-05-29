from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_user
from .config import settings
from .routes.admin_bakeoff import router as admin_bakeoff_router
from .routes.chat import router as chat_router

app = FastAPI(title="AI Observability backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "version": app.version}


@app.get("/me")
def me(user: dict = Depends(require_user)) -> dict:
    """Echo the authenticated user — used to verify the auth handshake from frontend."""
    return {
        "user_id": user.get("sub"),
        "email": user.get("email"),
        "role": user.get("role"),
    }


app.include_router(chat_router)
app.include_router(admin_bakeoff_router)
