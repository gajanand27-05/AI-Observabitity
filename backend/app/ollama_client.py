"""Thin async clients for Ollama Cloud (chat) and local Ollama (embeddings)."""
from __future__ import annotations

import httpx

from .config import settings


class CloudOllama:
    def __init__(self) -> None:
        self.base = settings.ollama_base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {settings.ollama_api_key}"}

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"{self.base}/v1/models", headers=self.headers)
            r.raise_for_status()
            return [m["id"] for m in r.json()["data"]]

    async def chat(self, model: str, messages: list[dict], **kwargs) -> dict:
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(
                f"{self.base}/v1/chat/completions",
                headers=self.headers,
                json={"model": model, "messages": messages, **kwargs},
            )
            r.raise_for_status()
            return r.json()


class LocalOllama:
    def __init__(self) -> None:
        self.base = settings.local_ollama_url.rstrip("/")

    async def embed(self, model: str, text: str) -> list[float]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self.base}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            r.raise_for_status()
            return r.json()["embedding"]

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.base}/api/tags")
            r.raise_for_status()
            return [m["name"] for m in r.json().get("models", [])]


cloud = CloudOllama()
local = LocalOllama()
