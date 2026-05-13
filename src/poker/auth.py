import hashlib
import os
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_HASHED_KEYS: set[str] = {
    h for h in os.getenv("MCP_API_KEY_HASHES", "").split(",") if h
}


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.url.path.startswith("/mcp"):
            token = request.headers.get("Authorization", "").removeprefix("Bearer ")
            if hashlib.sha256(token.encode()).hexdigest() not in _HASHED_KEYS:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)
