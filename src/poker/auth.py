import hashlib
import hmac
import os

from fastapi import Header, HTTPException, WebSocket, status
from fastmcp.server.auth import AccessToken, AuthProvider

_HASHED_KEYS: set[str] = {
    h for h in os.getenv("MCP_API_KEY_HASHES", "").split(",") if h
}


class HashedApiKeyVerifier(AuthProvider):
    async def verify_token(self, token: str) -> AccessToken | None:
        if hashlib.sha256(token.encode()).hexdigest() in _HASHED_KEYS:
            return AccessToken(token=token, client_id="api-key", scopes=[])
        # Plaintext token accepted only when MCP_DEV_TOKEN is set (local dev only).
        dev_token = os.getenv("MCP_DEV_TOKEN")
        if dev_token and token == dev_token:
            return AccessToken(token=token, client_id="dev", scopes=[])
        return None


# ---------------------------------------------------------------------------
# Spectator password — single shared SHA-256 hash gating the spectator UI
# and game-management REST endpoints. Not real authentication: just a dev
# gate so the live server isn't a free-for-all.
# ---------------------------------------------------------------------------


def _spectator_hash() -> str:
    return os.getenv("SPECTATOR_PASSWORD_HASH", "").strip().lower()


def _spectator_dev_password() -> str | None:
    return os.getenv("SPECTATOR_DEV_PASSWORD")


def verify_spectator_password(submitted: str) -> bool:
    """Submitted may be either the SHA-256 hex (UI flow) or the plaintext
    SPECTATOR_DEV_PASSWORD value (dev flow)."""
    if not submitted:
        return False
    expected = _spectator_hash()
    if expected and hmac.compare_digest(submitted.lower(), expected):
        return True
    dev = _spectator_dev_password()
    if dev is not None and hmac.compare_digest(submitted, dev):
        return True
    # Convenience: SUBMITTED was the plaintext dev password, but the client
    # already hashed it before sending. Accept the hash of the dev password
    # too so the UI doesn't need a separate code path.
    if dev is not None:
        dev_hex = hashlib.sha256(dev.encode()).hexdigest()
        if hmac.compare_digest(submitted.lower(), dev_hex):
            return True
    return False


async def require_spectator_password(
    x_spectator_password: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: rejects with 401 if the header is missing or wrong."""
    if not verify_spectator_password(x_spectator_password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing spectator password",
        )


async def require_spectator_ws(ws: WebSocket) -> bool:
    """Validate password on a WebSocket handshake.

    Browsers can't set custom headers on `new WebSocket(...)`, so the
    spectator UI passes the hash as `?password=`. Returns True if the
    handshake should proceed; otherwise closes the socket and returns False.
    """
    submitted = ws.query_params.get("password", "")
    if not verify_spectator_password(submitted):
        await ws.close(code=4401)
        return False
    return True
