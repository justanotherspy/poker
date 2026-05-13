import pathlib

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastmcp import FastMCP
from starlette.types import Receive, Scope, Send

from poker.auth import HashedApiKeyVerifier

mcp = FastMCP("poker-server", auth=HashedApiKeyVerifier())
_mcp_asgi = mcp.http_app()

_api = FastAPI()


@_api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


_static_dir = pathlib.Path(__file__).parent / "static"
if _static_dir.is_dir():
    _api.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")


class _App:
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] == "lifespan" or path == "/mcp" or path.startswith("/mcp/"):
            await _mcp_asgi(scope, receive, send)
        else:
            await _api(scope, receive, send)


app = _App()
