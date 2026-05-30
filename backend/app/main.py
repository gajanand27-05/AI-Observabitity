import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_user
from .config import settings
from .heartbeat import heartbeat_loop
from .routes.admin_bakeoff import router as admin_bakeoff_router
from .routes.admin_observability import router as admin_observability_router
from .routes.chat import router as chat_router
from .routes.feedback import router as feedback_router
from .routes.traces import router as traces_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start heartbeat in background
    heartbeat_task = asyncio.create_task(heartbeat_loop())
    yield
    # Cleanup
    heartbeat_task.cancel()
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="AI Observability backend",
    version="0.1.0",
    lifespan=lifespan,
)

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
app.include_router(admin_observability_router)
app.include_router(traces_router)
app.include_router(feedback_router)
