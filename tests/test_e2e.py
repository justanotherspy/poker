import os
import threading
import time
from collections.abc import Generator

import httpx
import pytest
import uvicorn
from fastmcp import Client
from fastmcp.client.auth import BearerAuth

_DEV_TOKEN = "e2e-test-token"
_PORT = 18765
_BASE_URL = f"http://127.0.0.1:{_PORT}"
_MCP_URL = f"{_BASE_URL}/mcp"


@pytest.fixture(scope="module")
def server_url() -> Generator[str, None, None]:
    os.environ["MCP_DEV_TOKEN"] = _DEV_TOKEN

    from poker.server import app

    config = uvicorn.Config(app, host="127.0.0.1", port=_PORT, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        try:
            httpx.get(f"{_BASE_URL}/api/health", timeout=1)
            break
        except Exception:
            time.sleep(0.05)

    yield _MCP_URL

    server.should_exit = True
    thread.join(timeout=5)
    os.environ.pop("MCP_DEV_TOKEN", None)


@pytest.mark.e2e
def test_unauthenticated_rejected(server_url: str) -> None:
    resp = httpx.post(server_url, json={})
    assert resp.status_code == 401


@pytest.mark.e2e
def test_invalid_token_rejected(server_url: str) -> None:
    resp = httpx.post(server_url, json={}, headers={"Authorization": "Bearer wrong"})
    assert resp.status_code == 401


@pytest.mark.e2e
async def test_ping(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.ping()


@pytest.mark.e2e
async def test_list_tools(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        tools = await client.list_tools()
        assert isinstance(tools, list)
