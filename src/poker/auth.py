import hashlib
import os

from fastmcp.server.auth import AccessToken, AuthProvider

_HASHED_KEYS: set[str] = {
    h for h in os.getenv("MCP_API_KEY_HASHES", "").split(",") if h
}


class HashedApiKeyVerifier(AuthProvider):
    async def verify_token(self, token: str) -> AccessToken | None:
        if hashlib.sha256(token.encode()).hexdigest() in _HASHED_KEYS:
            return AccessToken(token=token, client_id="api-key", scopes=[])
        return None
