import asyncio
import json
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
from websockets.asyncio.client import connect as ws_connect

_DEV_TOKEN = "e2e-test-token"
# Use the same dev password as the rest of the unit-test suite — the
# verifier reads SPECTATOR_DEV_PASSWORD at call time, so the env value
# active when a request lands is what matters. Sharing the value keeps
# tests order-independent: nothing in this module pops the var.
_SPEC_PW = "test"
_PORT = 18765
_BASE_URL = f"http://127.0.0.1:{_PORT}"
_MCP_URL = f"{_BASE_URL}/mcp"
_SPEC_HEADER = {"X-Spectator-Password": _SPEC_PW}


@pytest.fixture(scope="module")
def server_url() -> Generator[str, None, None]:
    os.environ["MCP_DEV_TOKEN"] = _DEV_TOKEN
    os.environ.setdefault("SPECTATOR_DEV_PASSWORD", _SPEC_PW)

    from poker.server import app

    config = uvicorn.Config(
        app, host="127.0.0.1", port=_PORT, log_level="error", ws="websockets-sansio"
    )
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


def _create_game(seat_count: int = 2) -> str:
    resp = httpx.post(
        f"{_BASE_URL}/api/games",
        headers=_SPEC_HEADER,
        json={"seat_count": seat_count, "starting_stack": 1000},
    )
    assert resp.status_code == 200
    return resp.json()["game_id"]  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# MCP auth
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
# MCP tool surface
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_list_tools(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        tools = await client.list_tools()
        names = {t.name for t in tools}
        assert names == {"list_games", "join_game", "get_table_state", "act", "say"}


# ---------------------------------------------------------------------------
# list_games / join_game
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_list_games_includes_rest_created(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("list_games", {})
        assert result.structured_content is not None
        games: list[dict[str, Any]] = result.structured_content["games"]
        assert any(g["game_id"] == gid for g in games)


@pytest.mark.e2e
async def test_mcp_join_game_returns_token(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("join_game", {"game_id": gid})
        assert result.structured_content is not None
        data = result.structured_content
        assert data["seat_id"] in (1, 2)
        assert "seat_token" in data


@pytest.mark.e2e
async def test_mcp_join_game_no_seats_left(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        await client.call_tool("join_game", {"game_id": gid})
        await client.call_tool("join_game", {"game_id": gid})
        third = await client.call_tool("join_game", {"game_id": gid})
        assert third.structured_content is not None
        assert "error" in third.structured_content


@pytest.mark.e2e
async def test_mcp_join_unknown_game(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("join_game", {"game_id": "nope"})
        assert result.structured_content is not None
        assert "error" in result.structured_content


# ---------------------------------------------------------------------------
# get_table_state / act via seat_token
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_get_state_uses_seat_token(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        joined = await client.call_tool("join_game", {"game_id": gid})
        assert joined.structured_content is not None
        tok = joined.structured_content["seat_token"]
        state = await client.call_tool("get_table_state", {"seat_token": tok})
        assert state.structured_content is not None
        data = state.structured_content
        assert len(data["hole_cards"]) == 2
        assert data["phase"] == "preflop"


@pytest.mark.e2e
async def test_mcp_act_via_seat_token_folds(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        # Both agents join; figure out who acts first and have them fold.
        j1 = await client.call_tool("join_game", {"game_id": gid})
        j2 = await client.call_tool("join_game", {"game_id": gid})
        assert j1.structured_content is not None
        assert j2.structured_content is not None
        tok1 = j1.structured_content["seat_token"]
        tok2 = j2.structured_content["seat_token"]
        seat1 = j1.structured_content["seat_id"]
        state = await client.call_tool("get_table_state", {"seat_token": tok1})
        assert state.structured_content is not None
        actor = state.structured_content["current_actor"]
        actor_tok = tok1 if actor == seat1 else tok2
        result = await client.call_tool(
            "act",
            {"seat_token": actor_tok, "action": "fold", "bluff_declared": False},
        )
        assert result.structured_content is not None
        assert "folds" in result.structured_content.get("result", "")


@pytest.mark.e2e
async def test_mcp_act_invalid_token(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool(
            "act",
            {"seat_token": "bogus", "action": "fold", "bluff_declared": False},
        )
        assert result.structured_content is not None
        assert "error" in result.structured_content


# ---------------------------------------------------------------------------
# Spectator REST surface (password-gated)
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_spectate_state_requires_password(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    resp = httpx.get(f"{_BASE_URL}/api/spectate/state/{gid}")
    assert resp.status_code == 401


@pytest.mark.e2e
def test_spectate_state_with_password(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    resp = httpx.get(
        f"{_BASE_URL}/api/spectate/state/{gid}",
        headers=_SPEC_HEADER,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["table_id"] == gid
    assert len(data["seats"]) == 2
    for seat in data["seats"]:
        assert len(seat["hole_cards"]) == 2


# ---------------------------------------------------------------------------
# MCP say tool
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_mcp_say_returns_phrase(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        joined = await client.call_tool("join_game", {"game_id": gid})
        assert joined.structured_content is not None
        tok = joined.structured_content["seat_token"]
        result = await client.call_tool("say", {"seat_token": tok, "phrase_id": 1})
        assert result.structured_content is not None
        assert result.structured_content["phrase"] == "Nice hand."
        assert result.structured_content["game_id"] == gid


@pytest.mark.e2e
async def test_mcp_say_invalid_phrase_id(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        joined = await client.call_tool("join_game", {"game_id": gid})
        assert joined.structured_content is not None
        tok = joined.structured_content["seat_token"]
        result = await client.call_tool("say", {"seat_token": tok, "phrase_id": 99})
        assert result.structured_content is not None
        assert "error" in result.structured_content


@pytest.mark.e2e
async def test_mcp_say_invalid_token(server_url: str) -> None:
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        result = await client.call_tool("say", {"seat_token": "bogus", "phrase_id": 1})
        assert result.structured_content is not None
        assert "error" in result.structured_content


# ---------------------------------------------------------------------------
# WebSocket — update broadcast after MCP action
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_ws_receives_update_after_mcp_join(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    ws_url = f"ws://127.0.0.1:{_PORT}/api/spectate/ws/{gid}?password={_SPEC_PW}"
    async with ws_connect(ws_url) as ws:
        snap = json.loads(await ws.recv())
        assert snap["type"] == "snapshot"
        # join_game broadcasts an update to all subscribers of this game.
        async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
            await client.call_tool("join_game", {"game_id": gid})
        update = json.loads(await ws.recv())
    assert update["type"] == "update"


@pytest.mark.e2e
async def test_ws_receives_update_after_mcp_say(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        joined = await client.call_tool("join_game", {"game_id": gid})
        assert joined.structured_content is not None
        tok = joined.structured_content["seat_token"]
    ws_url = f"ws://127.0.0.1:{_PORT}/api/spectate/ws/{gid}?password={_SPEC_PW}"
    async with ws_connect(ws_url) as ws:
        snap = json.loads(await ws.recv())
        assert snap["type"] == "snapshot"
        async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
            await client.call_tool("say", {"seat_token": tok, "phrase_id": 7})
        update = json.loads(await ws.recv())
    assert update["type"] == "update"
    assert any(c["text"] == "Really?" for c in update["view"]["chat"])


# ---------------------------------------------------------------------------
# Concurrency — simultaneous joins and acts
# ---------------------------------------------------------------------------


@pytest.mark.e2e
async def test_concurrent_join_fills_exactly_two_seats(server_url: str) -> None:
    gid = _create_game(seat_count=2)

    async def join_once() -> dict[str, Any]:
        async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as c:
            r = await c.call_tool("join_game", {"game_id": gid})
            assert r.structured_content is not None
            return r.structured_content

    results = await asyncio.gather(join_once(), join_once(), join_once())
    successes = [r for r in results if "seat_id" in r]
    errors = [r for r in results if "error" in r]
    assert len(successes) == 2
    assert len(errors) == 1
    assert {r["seat_id"] for r in successes} == {1, 2}


@pytest.mark.e2e
async def test_concurrent_act_only_actor_succeeds(server_url: str) -> None:
    gid = _create_game(seat_count=2)
    async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as client:
        j1 = await client.call_tool("join_game", {"game_id": gid})
        j2 = await client.call_tool("join_game", {"game_id": gid})
    assert j1.structured_content is not None
    assert j2.structured_content is not None
    tok1 = j1.structured_content["seat_token"]
    tok2 = j2.structured_content["seat_token"]

    async def fold(token: str) -> dict[str, Any]:
        async with Client(server_url, auth=BearerAuth(_DEV_TOKEN)) as c:
            r = await c.call_tool(
                "act", {"seat_token": token, "action": "fold", "bluff_declared": False}
            )
            assert r.structured_content is not None
            return r.structured_content

    results = await asyncio.gather(fold(tok1), fold(tok2))
    successes = [r for r in results if "error" not in r]
    errors = [r for r in results if "error" in r]
    assert len(successes) == 1
    assert len(errors) == 1
    assert "folds" in successes[0]["result"]
