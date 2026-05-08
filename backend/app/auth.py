"""Supabase JWT verification for FastAPI.

Frontend obtains a JWT from Supabase Auth and sends it as `Authorization: Bearer <token>`.
Newer Supabase projects sign JWTs with ES256 using rotating keys exposed via JWKS.
"""
from __future__ import annotations

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
