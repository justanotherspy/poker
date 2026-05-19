"""WebSocket tests for the spectator API (per-game subscription)."""

import pytest
from starlette.testclient import TestClient

from poker.server import _api
from tests.conftest import SPECTATOR_HEADER


@pytest.fixture
def client() -> TestClient:
    return TestClient(_api)


def _create_game(client: TestClient, seat_count: int = 2) -> str:
    resp = client.post(
        "/api/games",
        headers=SPECTATOR_HEADER,
        json={"seat_count": seat_count},
    )
    assert resp.status_code == 200
    return resp.json()["game_id"]  # type: ignore[no-any-return]


# ---------------------------------------------------------------------------
# WS auth — handshake rejected without password.
# ---------------------------------------------------------------------------


def test_ws_without_password_is_rejected(client: TestClient) -> None:
    gid = _create_game(client)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/spectate/ws/{gid}"):
            pass


# ---------------------------------------------------------------------------
# WS — snapshot + updates flow for the requested game.
# ---------------------------------------------------------------------------


def test_ws_sends_snapshot_on_connect(client: TestClient) -> None:
    gid = _create_game(client, seat_count=2)
    with client.websocket_connect(f"/api/spectate/ws/{gid}?password=test") as ws:
        msg = ws.receive_json()
    assert msg["type"] == "snapshot"
    assert msg["view"]["phase"] == "preflop"
    assert len(msg["view"]["seats"]) == 2
    assert msg["view"]["table_id"] == gid


def test_ws_scoped_to_one_game(client: TestClient) -> None:
    gid_a = _create_game(client, seat_count=2)
    gid_b = _create_game(client, seat_count=3)
    with client.websocket_connect(f"/api/spectate/ws/{gid_a}?password=test") as ws:
        msg = ws.receive_json()
    assert msg["view"]["table_id"] == gid_a
    assert len(msg["view"]["seats"]) == 2
    # gid_b unaffected
    with client.websocket_connect(f"/api/spectate/ws/{gid_b}?password=test") as ws:
        msg_b = ws.receive_json()
    assert msg_b["view"]["table_id"] == gid_b
    assert len(msg_b["view"]["seats"]) == 3


def test_ws_receives_delete_then_closes(client: TestClient) -> None:
    gid = _create_game(client)
    with client.websocket_connect(f"/api/spectate/ws/{gid}?password=test") as ws:
        ws.receive_json()  # snapshot
        client.delete(f"/api/games/{gid}", headers=SPECTATOR_HEADER)
        # The delete handler closes the hub; subscribers receive
        # `{"type": "deleted"}` and the connection then drops.
        msg = ws.receive_json()
    assert msg["type"] == "deleted"
