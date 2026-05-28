import asyncio
import logging
import pathlib
from dataclasses import asdict
from typing import Any, Literal

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.staticfiles import StaticFiles
from fastmcp import FastMCP
from pydantic import BaseModel
from starlette.types import Receive, Scope, Send

from poker import game as _game
from poker import store
from poker.auth import (
    HashedApiKeyVerifier,
    require_spectator_password,
    verify_spectator_password,
)

mcp = FastMCP("poker-server", auth=HashedApiKeyVerifier())
_mcp_asgi = mcp.http_app()


# ---------------------------------------------------------------------------
# Per-game BroadcastHub — fan-out spectator-view snapshots to WS subscribers.
# ---------------------------------------------------------------------------


class BroadcastHub:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=16)
        async with self._lock:
            self._subs.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            self._subs.discard(q)

    async def publish(self, msg: dict[str, Any]) -> None:
        async with self._lock:
            dead: list[asyncio.Queue[dict[str, Any]]] = []
            for q in self._subs:
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                self._subs.discard(q)

    async def close(self) -> None:
        """Notify subscribers the game is gone and clear the subscriber set."""
        async with self._lock:
            for q in self._subs:
                try:
                    q.put_nowait({"type": "deleted"})
                except asyncio.QueueFull:
                    pass
            self._subs.clear()


_hubs: dict[str, BroadcastHub] = {}
_hubs_lock = asyncio.Lock()
_auto_deal_tasks: dict[str, asyncio.Task[None]] = {}
_log = logging.getLogger(__name__)

# Upper bound on a player action `amount`. The largest stack we allow is well
# below this (REST creation caps at sane values) but pokerkit operates on
# Python ints, so a misbehaving client could send 10**18 and force a slow
# path. Bound it at the boundary.
_MAX_ACTION_AMOUNT = 10**9

# Delay between hands so spectators see the showdown / winner highlight
# before the next deal flushes the table.
INTER_HAND_DELAY = 5.0


async def _get_hub(game_id: str) -> BroadcastHub:
    async with _hubs_lock:
        hub = _hubs.get(game_id)
        if hub is None:
            hub = BroadcastHub()
            _hubs[game_id] = hub
        return hub


def _view_to_dict(v: _game.SpectatorView) -> dict[str, Any]:
    return asdict(v)


async def _broadcast(game_id: str) -> None:
    g = _game.get_game(game_id)
    if g is None:
        return
    hub = await _get_hub(game_id)
    await hub.publish({"type": "update", "view": _view_to_dict(g.get_spectator_view())})


def _drain_showdown(g: _game.GameState) -> None:
    while g.needs_showdown():
        g.advance_showdown()


def _schedule_auto_deal(game_id: str) -> None:
    existing = _auto_deal_tasks.get(game_id)
    if existing is not None and not existing.done():
        return
    _auto_deal_tasks[game_id] = asyncio.create_task(_auto_deal(game_id))


async def _auto_deal(game_id: str) -> None:
    try:
        await asyncio.sleep(INTER_HAND_DELAY)
        with store.lock(game_id):
            d = store.get_game(game_id)
            if d is None:
                return
            g = _game.GameState.from_dict(d)
            if g.game_ended or not g.is_hand_over():
                return
            g.start_next_hand()
            store.save_game(g.to_dict())
        if store.get_game(game_id) is not None:
            await _broadcast(game_id)
    except asyncio.CancelledError:
        raise
    except Exception:
        _log.exception("auto-deal failed for game %s", game_id)
    finally:
        _auto_deal_tasks.pop(game_id, None)


async def _after_state_change(game_id: str, g: _game.GameState) -> None:
    """Broadcast + schedule the next hand if appropriate."""
    await _broadcast(game_id)
    if g.is_hand_over() and not g.game_ended:
        _schedule_auto_deal(game_id)


_api = FastAPI()


# ---------------------------------------------------------------------------
# REST API — spectator + game management (all gated by spectator password).
# ---------------------------------------------------------------------------


@_api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


class VerifyPasswordRequest(BaseModel):
    password_hash: str


@_api.post("/api/auth/verify")
async def auth_verify(req: VerifyPasswordRequest) -> dict[str, bool]:
    if not verify_spectator_password(req.password_hash):
        raise HTTPException(status_code=401, detail="invalid password")
    return {"ok": True}


class CreateGameRequest(BaseModel):
    seat_count: int = 2
    starting_stack: int = 1000


@_api.get(
    "/api/games",
    dependencies=[Depends(require_spectator_password)],
)
async def games_list() -> dict[str, Any]:
    return {"games": [asdict(s) for s in _game.list_games()]}


@_api.post(
    "/api/games",
    dependencies=[Depends(require_spectator_password)],
)
async def games_create(req: CreateGameRequest) -> dict[str, Any]:
    if req.seat_count < 2 or req.seat_count > 6:
        raise HTTPException(status_code=422, detail="seat_count must be 2–6")
    if req.starting_stack < 200:
        raise HTTPException(status_code=422, detail="starting_stack must be ≥ 200")
    g = _game.create_game(req.seat_count, req.starting_stack)
    summary = asdict(g.summary())
    await _broadcast(g.game_id)
    return summary


@_api.delete(
    "/api/games/{game_id}",
    dependencies=[Depends(require_spectator_password)],
)
async def games_delete(game_id: str) -> dict[str, bool]:
    with store.lock(game_id):
        deleted = store.delete_game(game_id)
    # Tear down hub + cancel any pending auto-deal.
    hub = _hubs.pop(game_id, None)
    if hub is not None:
        await hub.close()
    task = _auto_deal_tasks.pop(game_id, None)
    if task is not None:
        task.cancel()
    return {"deleted": deleted}


@_api.get(
    "/api/spectate/state/{game_id}",
    dependencies=[Depends(require_spectator_password)],
)
async def spectate_state(game_id: str) -> dict[str, Any]:
    g = _game.get_game(game_id)
    if g is None:
        raise HTTPException(status_code=404, detail="game not found")
    return _view_to_dict(g.get_spectator_view())


@_api.websocket("/api/spectate/ws/{game_id}")
async def ws_spectate(ws: WebSocket, game_id: str) -> None:
    if not verify_spectator_password(ws.query_params.get("password", "")):
        await ws.close(code=4401)
        return
    await ws.accept()
    g = _game.get_game(game_id)
    if g is None:
        # Game doesn't exist; tell the client immediately rather than parking
        # them on a hub that will never publish.
        await ws.send_json({"type": "deleted"})
        await ws.close()
        return
    hub = await _get_hub(game_id)
    q = await hub.subscribe()
    try:
        await ws.send_json(
            {"type": "snapshot", "view": _view_to_dict(g.get_spectator_view())}
        )
        while True:
            msg = await q.get()
            await ws.send_json(msg)
            if msg.get("type") == "deleted":
                break
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unsubscribe(q)


# ---------------------------------------------------------------------------
# REST API — player actions (spectator-password gated)
# ---------------------------------------------------------------------------


class PlayerActRequest(BaseModel):
    seat_token: str
    action: Literal["fold", "check", "call", "raise", "bet"]
    bluff_declared: bool
    amount: int | None = None
    table_chat: int | None = None


def _validate_amount(amount: int | None) -> None:
    if amount is None:
        return
    if amount < 0 or amount > _MAX_ACTION_AMOUNT:
        raise HTTPException(status_code=422, detail="amount out of range")


class PlayerSayRequest(BaseModel):
    seat_token: str
    phrase_id: int


@_api.post(
    "/api/player/join/{game_id}",
    dependencies=[Depends(require_spectator_password)],
)
async def player_join(game_id: str) -> dict[str, Any]:
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            raise HTTPException(status_code=404, detail="game not found")
        g = _game.GameState.from_dict(d)
        claim = g.claim_seat()
        if claim is None:
            raise HTTPException(status_code=409, detail="no seats available")
        seat_id, seat_token = claim
        store.save_game(g.to_dict())
    await _broadcast(game_id)
    return {"game_id": game_id, "seat_id": seat_id, "seat_token": seat_token}


@_api.get(
    "/api/player/state",
    dependencies=[Depends(require_spectator_password)],
)
async def player_state(
    x_seat_token: str | None = Header(default=None),
) -> dict[str, Any]:
    # Seat tokens are credentials; the header keeps them out of access logs,
    # browser history, and the Referer chain (CWE-598).
    if not x_seat_token:
        raise HTTPException(status_code=401, detail="missing seat token")
    resolved = _resolve_token(x_seat_token)
    if resolved is None:
        raise HTTPException(status_code=404, detail="invalid seat token")
    game_id, seat_id = resolved
    g = _game.get_game(game_id)
    if g is None:
        raise HTTPException(status_code=404, detail="game not found")
    return _table_view_dict(g.get_view(seat_id), game_id)


@_api.post(
    "/api/player/act",
    dependencies=[Depends(require_spectator_password)],
)
async def player_act(req: PlayerActRequest) -> dict[str, Any]:
    _validate_amount(req.amount)
    resolved = _resolve_token(req.seat_token)
    if resolved is None:
        raise HTTPException(status_code=404, detail="invalid seat token")
    game_id, seat_id = resolved
    chat_phrase: str | None = None
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            raise HTTPException(status_code=404, detail="game not found")
        g = _game.GameState.from_dict(d)
        g.bluffs[seat_id] = req.bluff_declared
        try:
            result = g.apply_action(seat_id, req.action, req.amount)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        _drain_showdown(g)
        if req.table_chat is not None:
            phrase = _game.PHRASES.get(req.table_chat)
            if phrase:
                g.record_chat(seat_id, phrase)
                chat_phrase = phrase
        store.save_game(g.to_dict())
    g_after = _game.get_game(game_id)
    if g_after is not None:
        await _after_state_change(game_id, g_after)
    response: dict[str, Any] = {"result": result, "game_id": game_id}
    if chat_phrase is not None:
        response["chat"] = chat_phrase
    return response


@_api.post(
    "/api/player/say",
    dependencies=[Depends(require_spectator_password)],
)
async def player_say(req: PlayerSayRequest) -> dict[str, Any]:
    phrase = _game.PHRASES.get(req.phrase_id)
    if phrase is None:
        raise HTTPException(
            status_code=422,
            detail=f"unknown phrase_id {req.phrase_id}. Valid range: 1–10.",
        )
    resolved = _resolve_token(req.seat_token)
    if resolved is None:
        raise HTTPException(status_code=404, detail="invalid seat token")
    game_id, seat_id = resolved
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            raise HTTPException(status_code=404, detail="game not found")
        g = _game.GameState.from_dict(d)
        g.record_chat(seat_id, phrase)
        store.save_game(g.to_dict())
    await _broadcast(game_id)
    return {"phrase": phrase, "game_id": game_id}


# ---------------------------------------------------------------------------
# MCP tools — agent-facing surface
# ---------------------------------------------------------------------------


def _resolve_token(seat_token: str) -> tuple[str, int] | None:
    """Find (game_id, seat_id) for a given seat token by scanning games."""
    import secrets as _secrets

    for game_dict in store.list_games():
        seat_tokens = game_dict.get("seat_tokens", {}) or {}
        for sid_str, tok in seat_tokens.items():
            if _secrets.compare_digest(str(tok), seat_token):
                return str(game_dict["game_id"]), int(sid_str)
    return None


def _table_view_dict(v: _game.TableView, game_id: str) -> dict[str, Any]:
    return {
        "game_id": game_id,
        "seat_id": v.seat_id,
        "hole_cards": v.hole_cards,
        "board": v.board,
        "pot": v.pot,
        "stacks": v.stacks,
        "current_actor": v.current_actor,
        "to_call": v.to_call,
        "min_raise": v.min_raise,
        "phase": v.phase,
        "hand_number": v.hand_number,
        "game_ended": v.game_ended,
    }


@mcp.tool
async def list_games() -> dict[str, Any]:
    """List every active game so an agent can pick one to join."""
    return {"games": [asdict(s) for s in _game.list_games()]}


@mcp.tool
async def join_game(game_id: str) -> dict[str, Any]:
    """Claim an open seat at a game. Returns a seat_token used for every
    subsequent act/say/get_table_state call. One seat per agent: a second
    join_game call gets a different seat (or an error if full)."""
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            return {"error": "Game not found."}
        g = _game.GameState.from_dict(d)
        claim = g.claim_seat()
        if claim is None:
            return {"error": "No seats available."}
        seat_id, seat_token = claim
        store.save_game(g.to_dict())
    await _broadcast(game_id)
    return {"game_id": game_id, "seat_id": seat_id, "seat_token": seat_token}


@mcp.tool
def get_table_state(seat_token: str) -> dict[str, Any]:
    """Get the table state for the seat owning `seat_token`. Returns own
    hole cards and all public info."""
    resolved = _resolve_token(seat_token)
    if resolved is None:
        return {"error": "Invalid seat token."}
    game_id, seat_id = resolved
    g = _game.get_game(game_id)
    if g is None:
        return {"error": "Game not found."}
    return _table_view_dict(g.get_view(seat_id), game_id)


@mcp.tool
async def act(
    seat_token: str,
    action: Literal["fold", "check", "call", "raise", "bet"],
    bluff_declared: bool,
    amount: int | None = None,
    table_chat: int | None = None,
) -> dict[str, Any]:
    """Make a poker action. The seat is identified by `seat_token` from
    join_game. `bluff_declared` is required.

    If `table_chat` (1–10) is supplied, the matching phrase is persisted
    to the table chat under this seat and broadcast to spectators.
    """
    if amount is not None and (amount < 0 or amount > _MAX_ACTION_AMOUNT):
        return {"error": "amount out of range"}
    resolved = _resolve_token(seat_token)
    if resolved is None:
        return {"error": "Invalid seat token."}
    game_id, seat_id = resolved
    chat_phrase: str | None = None
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            return {"error": "Game not found."}
        g = _game.GameState.from_dict(d)
        g.bluffs[seat_id] = bluff_declared
        try:
            result = g.apply_action(seat_id, action, amount)
        except ValueError as exc:
            return {"error": str(exc)}
        _drain_showdown(g)
        if table_chat is not None:
            phrase = _game.PHRASES.get(table_chat)
            if phrase:
                g.record_chat(seat_id, phrase)
                chat_phrase = phrase
        store.save_game(g.to_dict())
    g_after = _game.get_game(game_id)
    if g_after is not None:
        await _after_state_change(game_id, g_after)
    response: dict[str, Any] = {"result": result, "game_id": game_id}
    if chat_phrase is not None:
        response["chat"] = chat_phrase
    return response


@mcp.tool
async def say(seat_token: str, phrase_id: int) -> dict[str, Any]:
    """Emit a fixed table chat phrase from the seat owning `seat_token`.
    phrase_id must be 1–10."""
    phrase = _game.PHRASES.get(phrase_id)
    if phrase is None:
        return {"error": f"Unknown phrase_id {phrase_id}. Valid range: 1–10."}
    resolved = _resolve_token(seat_token)
    if resolved is None:
        return {"error": "Invalid seat token."}
    game_id, seat_id = resolved
    with store.lock(game_id):
        d = store.get_game(game_id)
        if d is None:
            return {"error": "Game not found."}
        g = _game.GameState.from_dict(d)
        g.record_chat(seat_id, phrase)
        store.save_game(g.to_dict())
    await _broadcast(game_id)
    return {"phrase": phrase, "game_id": game_id}


# ---------------------------------------------------------------------------
# ASGI router
# ---------------------------------------------------------------------------

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
