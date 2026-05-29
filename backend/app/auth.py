"""Supabase JWT verification for FastAPI + admin role check.

Frontend obtains a JWT from Supabase Auth and sends it as `Authorization: Bearer <token>`.
Newer Supabase projects sign JWTs with ES256 using rotating keys exposed via JWKS.

Admin gating reads `public.profiles.role` via service-role REST (RLS bypassed by design).
"""
from __future__ import annotations

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

bearer = HTTPBearer(auto_error=False)

_BASE = settings.supabase_url.rstrip("/")
_JWKS_URL = f"{_BASE}/auth/v1/.well-known/jwks.json"
_ISSUER = f"{_BASE}/auth/v1"

_jwk_client = jwt.PyJWKClient(_JWKS_URL, cache_keys=True)


def _decode(token: str) -> dict:
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=_ISSUER,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}") from e


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """FastAPI dependency. Returns the decoded JWT payload (sub = user_id, email, role, ...)."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")
    return _decode(creds.credentials)


async def get_profile_role(user_id: str) -> str | None:
    """Fetch app-level role from public.profiles via service-role REST (RLS bypassed)."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{_BASE}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "role"},
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
            },
        )
        r.raise_for_status()
        data = r.json()
        return data[0]["role"] if data else None


async def require_admin(user: dict = Depends(require_user)) -> dict:
    """Dependency that requires the caller's profile.role == 'admin'."""
    uid = user.get("sub")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub claim")
    role = await get_profile_role(uid)
    if role != "admin":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Admin role required (current: {role or 'none'})"
        )
    return user
