"""REST + MCP tool registration tests for the multi-game server."""

import asyncio

import pytest
from starlette.testclient import TestClient

from poker.game import create_game, get_game
from poker.server import _api, _get_hub, mcp
from poker.server import act as mcp_act
from poker.server import get_table_state as mcp_get_state
from poker.server import join_game as mcp_join_game
from poker.server import say as mcp_say
from tests.conftest import SPECTATOR_HEADER


@pytest.fixture
def client() -> TestClient:
    return TestClient(_api)


# ---------------------------------------------------------------------------
# MCP tool surface
# ---------------------------------------------------------------------------


def test_server_name() -> None:
    assert mcp.name == "poker-server"


def test_mcp_tools_registered() -> None:
    tools = asyncio.run(mcp.list_tools())
    names = {t.name for t in tools}
    assert names == {"list_games", "join_game", "get_table_state", "act", "say"}


# ---------------------------------------------------------------------------
# /api/health — no auth required
# ---------------------------------------------------------------------------


def test_health_no_auth(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# /api/auth/verify
# ---------------------------------------------------------------------------


def test_auth_verify_accepts_dev_password(client: TestClient) -> None:
    resp = client.post("/api/auth/verify", json={"password_hash": "test"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_auth_verify_rejects_bad_password(client: TestClient) -> None:
    resp = client.post("/api/auth/verify", json={"password_hash": "wrong"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /api/games CRUD — requires spectator password
# ---------------------------------------------------------------------------


def test_games_list_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/games")
    assert resp.status_code == 401


def test_games_list_empty(client: TestClient) -> None:
    resp = client.get("/api/games", headers=SPECTATOR_HEADER)
    assert resp.status_code == 200
    assert resp.json() == {"games": []}


def test_games_create_returns_summary(client: TestClient) -> None:
    resp = client.post(
        "/api/games",
        headers=SPECTATOR_HEADER,
        json={"seat_count": 2, "starting_stack": 1000},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "game_id" in data
    assert data["seat_count"] == 2
    assert data["hand_number"] == 1
    assert data["phase"] == "preflop"


def test_games_create_validates_seat_count(client: TestClient) -> None:
    resp = client.post(
        "/api/games",
        headers=SPECTATOR_HEADER,
        json={"seat_count": 99, "starting_stack": 1000},
    )
    assert resp.status_code == 422


def test_games_create_validates_starting_stack(client: TestClient) -> None:
    resp = client.post(
        "/api/games",
        headers=SPECTATOR_HEADER,
        json={"seat_count": 2, "starting_stack": 1},
    )
    assert resp.status_code == 422


def test_games_list_contains_created_game(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    games = client.get("/api/games", headers=SPECTATOR_HEADER).json()["games"]
    assert any(g["game_id"] == created["game_id"] for g in games)


def test_games_delete(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    resp = client.delete(
        f"/api/games/{created['game_id']}",
        headers=SPECTATOR_HEADER,
    )
    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}
    games = client.get("/api/games", headers=SPECTATOR_HEADER).json()["games"]
    assert all(g["game_id"] != created["game_id"] for g in games)


def test_games_delete_requires_auth(client: TestClient) -> None:
    resp = client.delete("/api/games/anything")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /api/spectate/state/{game_id}
# ---------------------------------------------------------------------------


def test_spectate_state_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/spectate/state/nothing")
    assert resp.status_code == 401


def test_spectate_state_404_for_unknown(client: TestClient) -> None:
    resp = client.get(
        "/api/spectate/state/unknown-game",
        headers=SPECTATOR_HEADER,
    )
    assert resp.status_code == 404


def test_spectate_state_returns_view(client: TestClient) -> None:
    created = client.post(
        "/api/games",
        headers=SPECTATOR_HEADER,
        json={"seat_count": 3, "starting_stack": 1000},
    ).json()
    resp = client.get(
        f"/api/spectate/state/{created['game_id']}",
        headers=SPECTATOR_HEADER,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "preflop"
    assert len(data["seats"]) == 3
    # Spectator sees every seat's hole cards.
    for seat in data["seats"]:
        assert len(seat["hole_cards"]) == 2
    assert data["hand_number"] == 1
    assert data["game_ended"] is False
    assert set(data["seats_open"]) == {1, 2, 3}


# ---------------------------------------------------------------------------
# MCP say tool — in-process async tests
# ---------------------------------------------------------------------------
# These call the tool functions directly (asyncio_mode = "auto") so we can
# exercise the full tool logic without standing up a real HTTP server.


async def test_say_returns_correct_phrase() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    joined = await mcp_join_game(g.game_id)
    result = await mcp_say(joined["seat_token"], 1)
    assert result == {"phrase": "Nice hand.", "game_id": g.game_id}


async def test_say_invalid_phrase_id_returns_error() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    joined = await mcp_join_game(g.game_id)
    result = await mcp_say(joined["seat_token"], 99)
    assert "error" in result


async def test_say_invalid_token_returns_error() -> None:
    result = await mcp_say("bogus-token", 1)
    assert "error" in result


async def test_say_persists_chat_to_store() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    joined = await mcp_join_game(g.game_id)
    await mcp_say(joined["seat_token"], 3)
    updated = get_game(g.game_id)
    assert updated is not None
    assert len(updated.chat_log) == 1
    assert updated.chat_log[0]["text"] == "I see you."


async def test_say_publishes_update_to_hub() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    joined = await mcp_join_game(g.game_id)
    hub = await _get_hub(g.game_id)
    q = await hub.subscribe()
    await mcp_say(joined["seat_token"], 1)
    msg = q.get_nowait()
    assert msg["type"] == "update"
    assert len(msg["view"]["chat"]) == 1
    assert msg["view"]["chat"][0]["text"] == "Nice hand."


# ---------------------------------------------------------------------------
# MCP act tool — table_chat parameter
# ---------------------------------------------------------------------------


async def test_act_with_table_chat_records_phrase() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    j1 = await mcp_join_game(g.game_id)
    j2 = await mcp_join_game(g.game_id)
    state = mcp_get_state(j1["seat_token"])
    actor_tok = (
        j1["seat_token"]
        if state["current_actor"] == j1["seat_id"]
        else j2["seat_token"]
    )
    result = await mcp_act(actor_tok, "fold", False, table_chat=5)
    assert result.get("chat") == "Let's go."
    updated = get_game(g.game_id)
    assert updated is not None
    assert len(updated.chat_log) == 1
    assert updated.chat_log[0]["text"] == "Let's go."


async def test_act_with_invalid_table_chat_silently_ignored() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    j1 = await mcp_join_game(g.game_id)
    j2 = await mcp_join_game(g.game_id)
    state = mcp_get_state(j1["seat_token"])
    actor_tok = (
        j1["seat_token"]
        if state["current_actor"] == j1["seat_id"]
        else j2["seat_token"]
    )
    result = await mcp_act(actor_tok, "fold", False, table_chat=99)
    assert "chat" not in result
    updated = get_game(g.game_id)
    assert updated is not None
    assert updated.chat_log == []


# ---------------------------------------------------------------------------
# /api/player/* — REST player endpoints (spectator-password gated)
# ---------------------------------------------------------------------------


def test_player_join_requires_auth(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    resp = client.post(f"/api/player/join/{created['game_id']}")
    assert resp.status_code == 401


def test_player_join_unknown_game(client: TestClient) -> None:
    resp = client.post("/api/player/join/no-such-game", headers=SPECTATOR_HEADER)
    assert resp.status_code == 404


def test_player_join_returns_seat_token(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    resp = client.post(
        f"/api/player/join/{created['game_id']}", headers=SPECTATOR_HEADER
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "seat_token" in data
    assert "seat_id" in data
    assert data["game_id"] == created["game_id"]


def test_player_join_no_seats_available(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    game_id = created["game_id"]
    client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER)
    client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER)
    resp = client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER)
    assert resp.status_code == 409


def test_player_state_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/player/state", headers={"X-Seat-Token": "x"})
    assert resp.status_code == 401


def test_player_state_invalid_token(client: TestClient) -> None:
    resp = client.get(
        "/api/player/state",
        headers={**SPECTATOR_HEADER, "X-Seat-Token": "bogus"},
    )
    assert resp.status_code == 404


def test_player_state_missing_token(client: TestClient) -> None:
    # Seat token is sent in a header (CWE-598). Missing header → 401.
    resp = client.get("/api/player/state", headers=SPECTATOR_HEADER)
    assert resp.status_code == 401


def test_player_state_returns_table_view(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    game_id = created["game_id"]
    joined = client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER).json()
    resp = client.get(
        "/api/player/state",
        headers={**SPECTATOR_HEADER, "X-Seat-Token": joined["seat_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["seat_id"] == joined["seat_id"]
    assert len(data["hole_cards"]) == 2
    assert "to_call" in data
    assert "min_raise" in data


def test_player_say_requires_auth(client: TestClient) -> None:
    resp = client.post("/api/player/say", json={"seat_token": "x", "phrase_id": 1})
    assert resp.status_code == 401


def test_player_say_invalid_token(client: TestClient) -> None:
    resp = client.post(
        "/api/player/say",
        headers=SPECTATOR_HEADER,
        json={"seat_token": "bogus", "phrase_id": 1},
    )
    assert resp.status_code == 404


def test_player_say_invalid_phrase(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    joined = client.post(
        f"/api/player/join/{created['game_id']}", headers=SPECTATOR_HEADER
    ).json()
    resp = client.post(
        "/api/player/say",
        headers=SPECTATOR_HEADER,
        json={"seat_token": joined["seat_token"], "phrase_id": 99},
    )
    assert resp.status_code == 422


def test_player_say_returns_phrase(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    joined = client.post(
        f"/api/player/join/{created['game_id']}", headers=SPECTATOR_HEADER
    ).json()
    resp = client.post(
        "/api/player/say",
        headers=SPECTATOR_HEADER,
        json={"seat_token": joined["seat_token"], "phrase_id": 3},
    )
    assert resp.status_code == 200
    assert resp.json()["phrase"] == "I see you."


def test_player_act_requires_auth(client: TestClient) -> None:
    resp = client.post(
        "/api/player/act",
        json={"seat_token": "x", "action": "fold", "bluff_declared": False},
    )
    assert resp.status_code == 401


def test_player_act_invalid_token(client: TestClient) -> None:
    resp = client.post(
        "/api/player/act",
        headers=SPECTATOR_HEADER,
        json={"seat_token": "bogus", "action": "fold", "bluff_declared": False},
    )
    assert resp.status_code == 404


def test_player_act_fold(client: TestClient) -> None:
    created = client.post(
        "/api/games", headers=SPECTATOR_HEADER, json={"seat_count": 2}
    ).json()
    game_id = created["game_id"]
    j1 = client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER).json()
    j2 = client.post(f"/api/player/join/{game_id}", headers=SPECTATOR_HEADER).json()
    state = client.get(
        "/api/player/state",
        headers={**SPECTATOR_HEADER, "X-Seat-Token": j1["seat_token"]},
    ).json()
    actor_tok = (
        j1["seat_token"]
        if state["current_actor"] == j1["seat_id"]
        else j2["seat_token"]
    )
    resp = client.post(
        "/api/player/act",
        headers=SPECTATOR_HEADER,
        json={"seat_token": actor_tok, "action": "fold", "bluff_declared": False},
    )
    assert resp.status_code == 200
    assert "result" in resp.json()
