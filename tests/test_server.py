"""REST + MCP tool registration tests for the multi-game server."""

import asyncio

import pytest
from starlette.testclient import TestClient

from poker.server import _api, mcp
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
