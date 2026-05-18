"""WebSocket + REST tests for the spectator API."""

from unittest.mock import patch

import fakeredis
import pytest
from starlette.testclient import TestClient

import poker.store as store_module
from poker.server import _api


@pytest.fixture(autouse=True)
def fake_redis() -> fakeredis.FakeRedis:  # type: ignore[type-arg]
    r: fakeredis.FakeRedis = fakeredis.FakeRedis(decode_responses=True)  # type: ignore[type-arg]
    store_module._memory.clear()
    with patch.object(store_module, "_client", return_value=r):
        yield r


@pytest.fixture
def client() -> TestClient:
    return TestClient(_api)


# ---------------------------------------------------------------------------
# GET /api/spectate/state
# ---------------------------------------------------------------------------


def test_spectate_state_no_game_returns_404(client: TestClient) -> None:
    assert client.get("/api/spectate/state").status_code == 404


def test_spectate_state_returns_view(client: TestClient) -> None:
    client.post("/api/game", json={"seat_count": 3, "starting_stack": 1000})
    resp = client.get("/api/spectate/state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "preflop"
    assert len(data["seats"]) == 3
    # Spectator sees every seat's hole cards.
    for seat in data["seats"]:
        assert len(seat["hole_cards"]) == 2


def test_spectate_state_unfiltered_hole_cards(client: TestClient) -> None:
    client.post("/api/game", json={"seat_count": 2})
    data = client.get("/api/spectate/state").json()
    hands = [tuple(s["hole_cards"]) for s in data["seats"]]
    # Both hands present and distinct.
    assert len(hands) == 2
    assert hands[0] != hands[1]


# ---------------------------------------------------------------------------
# WS /api/spectate/ws
# ---------------------------------------------------------------------------


def test_ws_sends_snapshot_on_connect_when_game_exists(client: TestClient) -> None:
    client.post("/api/game", json={"seat_count": 2})
    with client.websocket_connect("/api/spectate/ws") as ws:
        msg = ws.receive_json()
    assert msg["type"] == "snapshot"
    assert msg["view"]["phase"] == "preflop"
    assert len(msg["view"]["seats"]) == 2


def test_ws_no_snapshot_when_no_game_then_update_on_create(
    client: TestClient,
) -> None:
    # No active game → no initial snapshot. The first message arrives only
    # when a mutation happens (create_game broadcasts).
    with client.websocket_connect("/api/spectate/ws") as ws:
        client.post("/api/game", json={"seat_count": 2})
        msg = ws.receive_json()
    # If a snapshot HAD been queued from the no-game state, it would arrive
    # first. We assert the first message is an `update` (proves no snapshot
    # was sent) carrying the new game state.
    assert msg["type"] == "update"
    assert msg["view"]["phase"] == "preflop"


def test_ws_receives_update_after_act(client: TestClient) -> None:
    client.post("/api/game", json={"seat_count": 2})
    with client.websocket_connect("/api/spectate/ws") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot"
        actor = snap["view"]["current_actor"]
        assert actor is not None
        resp = client.post(
            "/api/game/act",
            json={"seat_id": actor, "action": "fold", "bluff_declared": False},
        )
        assert resp.status_code == 200
        upd = ws.receive_json()
    assert upd["type"] == "update"
    assert upd["view"]["phase"] == "ended"
    assert upd["view"]["winner_names"] is not None


def test_ws_receives_update_after_say(client: TestClient) -> None:
    client.post("/api/game", json={"seat_count": 2})
    with client.websocket_connect("/api/spectate/ws") as ws:
        ws.receive_json()  # initial snapshot
        resp = client.post(
            "/api/game/say", json={"seat_id": 1, "phrase_id": 1}
        )
        assert resp.status_code == 200
        upd = ws.receive_json()
    assert upd["type"] == "update"
    assert len(upd["view"]["chat"]) == 1
    assert upd["view"]["chat"][0]["text"] == "Nice hand."
    assert upd["view"]["chat"][0]["seat_id"] == 1


def test_ws_receives_update_after_create_game(client: TestClient) -> None:
    with client.websocket_connect("/api/spectate/ws") as ws:
        # No initial snapshot — but the create_game broadcast should arrive.
        client.post("/api/game", json={"seat_count": 2})
        upd = ws.receive_json()
    assert upd["type"] == "update"
    assert upd["view"]["phase"] == "preflop"
