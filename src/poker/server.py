import pathlib

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastmcp import FastMCP

from poker.auth import ApiKeyMiddleware

app = FastAPI()
app.add_middleware(ApiKeyMiddleware)

mcp = FastMCP("poker-server")

app.mount("/mcp", mcp.http_app())


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


_static_dir = pathlib.Path(__file__).parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
