import os
import threading
import time
from collections.abc import Generator
from typing import Any

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


# ---------------------------------------------------------------------------
# Auth checks
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_unauthenticated_rejected(server_url: str) -> None:
    resp = httpx.post(server_url, json={})
    assert resp.status_code == 401


@pytest.mark.e2e
def test_invalid_token_rejected(server_url: str) -> None:
    resp = httpx.post(server_url, json={}, headers={"Authorization": "Bearer wrong"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Basic MCP connectivity
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_ping(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.ping()


@pytest.mark.e2e
async def test_list_tools_non_empty(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        tools = await client.list_tools()
        assert isinstance(tools, list)
        assert len(tools) == 4


@pytest.mark.e2e
async def test_list_tools_expected_names(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        tools = await client.list_tools()
        names = {t.name for t in tools}
        assert names == {"create_game", "get_table_state", "act", "say"}


# ---------------------------------------------------------------------------
# MCP tool calls — create_game
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_create_game(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("create_game", {"seat_count": 2})
        assert result.structured_content is not None
        data: dict[str, Any] = result.structured_content
        assert data["seat_count"] == 2
        assert data["phase"] == "preflop"


@pytest.mark.e2e
async def test_mcp_create_game_defaults(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("create_game", {})
        assert result.structured_content is not None
        assert result.structured_content["seat_count"] == 2


# ---------------------------------------------------------------------------
# MCP tool calls — get_table_state
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_get_state_no_game(server_url: str) -> None:
    # Reset game by creating a fresh one to ensure get_state works after create
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        result = await client.call_tool("get_table_state", {"seat_id": 1})
        assert result.structured_content is not None
        data = result.structured_content
        assert "hole_cards" in data
        assert len(data["hole_cards"]) == 2
        assert data["phase"] == "preflop"


@pytest.mark.e2e
async def test_mcp_seats_see_different_cards(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        r1 = await client.call_tool("get_table_state", {"seat_id": 1})
        r2 = await client.call_tool("get_table_state", {"seat_id": 2})
        assert r1.structured_content is not None
        assert r2.structured_content is not None
        cards1 = set(r1.structured_content["hole_cards"])
        cards2 = set(r2.structured_content["hole_cards"])
        assert cards1 != cards2


# ---------------------------------------------------------------------------
# MCP tool calls — act
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_fold_ends_hand(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        state = await client.call_tool("get_table_state", {"seat_id": 1})
        assert state.structured_content is not None
        actor = state.structured_content["current_actor"]
        result = await client.call_tool(
            "act",
            {"seat_id": actor, "action": "fold", "bluff_declared": False},
        )
        assert result.structured_content is not None
        assert "folds" in result.structured_content.get("result", "")
        # Check phase ended
        final = await client.call_tool("get_table_state", {"seat_id": 1})
        assert final.structured_content is not None
        assert final.structured_content["phase"] == "ended"


@pytest.mark.e2e
async def test_mcp_out_of_turn_returns_error(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        state = await client.call_tool("get_table_state", {"seat_id": 1})
        assert state.structured_content is not None
        actor = state.structured_content["current_actor"]
        wrong = 2 if actor == 1 else 1
        result = await client.call_tool(
            "act",
            {"seat_id": wrong, "action": "fold", "bluff_declared": False},
        )
        assert result.structured_content is not None
        assert "error" in result.structured_content


# ---------------------------------------------------------------------------
# MCP tool calls — say
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_say_valid(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        result = await client.call_tool("say", {"seat_id": 1, "phrase_id": 1})
        assert result.structured_content is not None
        assert result.structured_content["phrase"] == "Nice hand."


@pytest.mark.e2e
async def test_mcp_say_invalid(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("say", {"seat_id": 1, "phrase_id": 99})
        assert result.structured_content is not None
        assert "error" in result.structured_content


@pytest.mark.e2e
async def test_mcp_say_persisted_to_chat(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {})
        await client.call_tool("say", {"seat_id": 2, "phrase_id": 3})
    # Read via the public spectator endpoint to confirm persistence.
    resp = httpx.get(f"{_BASE_URL}/api/spectate/state")
    assert resp.status_code == 200
    chat = resp.json()["chat"]
    assert any(c["seat_id"] == 2 and c["text"] == "I see you." for c in chat)


# ---------------------------------------------------------------------------
# Spectator API — public, read-only.
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_spectate_state_unauthenticated(server_url: str) -> None:
    # Public — no Authorization header needed.
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {"seat_count": 3})
    resp = httpx.get(f"{_BASE_URL}/api/spectate/state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "preflop"
    assert len(data["seats"]) == 3
    for seat in data["seats"]:
        assert len(seat["hole_cards"]) == 2


@pytest.mark.e2e
async def test_spectate_reflects_act(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("create_game", {"seat_count": 2})
        state = await client.call_tool("get_table_state", {"seat_id": 1})
        assert state.structured_content is not None
        actor = state.structured_content["current_actor"]
        await client.call_tool(
            "act",
            {"seat_id": actor, "action": "fold", "bluff_declared": False},
        )
    resp = httpx.get(f"{_BASE_URL}/api/spectate/state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "ended"
    assert data["winner_names"] is not None
    assert len(data["winner_names"]) == 1
