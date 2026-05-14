import pathlib
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastmcp import FastMCP
from pydantic import BaseModel
from starlette.types import Receive, Scope, Send

from poker import game as _game
from poker import store
from poker.auth import HashedApiKeyVerifier

mcp = FastMCP("poker-server", auth=HashedApiKeyVerifier())
_mcp_asgi = mcp.http_app()

_api = FastAPI()


# ---------------------------------------------------------------------------
# REST API — game control surface for the UI
# ---------------------------------------------------------------------------


class CreateGameRequest(BaseModel):
    seat_count: int = 2
    starting_stack: int = 1000


class ActRequest(BaseModel):
    seat_id: int
    action: Literal["fold", "check", "call", "raise", "bet"]
    amount: int | None = None
    bluff_declared: bool = False


class SayRequest(BaseModel):
    phrase_id: int


@_api.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@_api.post("/api/game")
async def api_create_game(req: CreateGameRequest) -> dict[str, Any]:
    with store.lock():
        g = _game.create_game(req.seat_count, req.starting_stack)
    view = g.get_view(1)
    return {
        "seat_count": g.seat_count,
        "starting_stack": req.starting_stack,
        "current_actor": view.current_actor,
        "phase": view.phase,
    }


@_api.get("/api/game/state/{seat_id}")
async def api_get_state(seat_id: int) -> dict[str, Any]:
    g = _game.get_game()
    if g is None:
        raise HTTPException(status_code=404, detail="No active game.")
    v = g.get_view(seat_id)
    return {
        "seat_id": v.seat_id,
        "hole_cards": v.hole_cards,
        "board": v.board,
        "pot": v.pot,
        "stacks": v.stacks,
        "current_actor": v.current_actor,
        "to_call": v.to_call,
        "min_raise": v.min_raise,
        "phase": v.phase,
    }


@_api.post("/api/game/act")
async def api_act(req: ActRequest) -> dict[str, Any]:
    with store.lock():
        g = _game.get_game()
        if g is None:
            raise HTTPException(status_code=404, detail="No active game.")
        g.bluffs[req.seat_id] = req.bluff_declared
        try:
            result = g.apply_action(req.seat_id, req.action, req.amount)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        store.save(g.to_dict())
    return {"result": result}


@_api.post("/api/game/say")
async def api_say(req: SayRequest) -> dict[str, str]:
    phrase = _game.PHRASES.get(req.phrase_id)
    if phrase is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown phrase_id {req.phrase_id}. Valid range: 1–10.",
        )
    return {"phrase": phrase}


@_api.post("/api/game/showdown")
async def api_showdown() -> dict[str, Any]:
    with store.lock():
        g = _game.get_game()
        if g is None:
            raise HTTPException(status_code=404, detail="No active game.")
        if not g.needs_showdown():
            raise HTTPException(status_code=422, detail="No showdown in progress.")
        g.advance_showdown()
        store.save(g.to_dict())
    view = g.get_view(1)
    return {"phase": view.phase, "needs_showdown": g.needs_showdown()}


# ---------------------------------------------------------------------------
# MCP tools — agent-facing surface
# ---------------------------------------------------------------------------


@mcp.tool
def create_game(seat_count: int = 2, starting_stack: int = 1000) -> dict[str, Any]:
    """Start a new heads-up poker game. Deals hole cards to all seats."""
    with store.lock():
        g = _game.create_game(seat_count, starting_stack)
    view = g.get_view(1)
    return {
        "seat_count": g.seat_count,
        "starting_stack": starting_stack,
        "current_actor": view.current_actor,
        "phase": view.phase,
    }


@mcp.tool
def get_table_state(seat_id: int) -> dict[str, Any]:
    """Get the table state for a seat. Returns own hole cards and all public info."""
    g = _game.get_game()
    if g is None:
        return {"error": "No active game. Call create_game first."}
    v = g.get_view(seat_id)
    return {
        "seat_id": v.seat_id,
        "hole_cards": v.hole_cards,
        "board": v.board,
        "pot": v.pot,
        "stacks": v.stacks,
        "current_actor": v.current_actor,
        "to_call": v.to_call,
        "min_raise": v.min_raise,
        "phase": v.phase,
    }


@mcp.tool
def act(
    seat_id: int,
    action: Literal["fold", "check", "call", "raise", "bet"],
    bluff_declared: bool,
    amount: int | None = None,
    table_chat: int | None = None,
) -> dict[str, Any]:
    """Make a poker action. seat_id is 1-indexed. bluff_declared is required."""
    with store.lock():
        g = _game.get_game()
        if g is None:
            return {"error": "No active game."}
        g.bluffs[seat_id] = bluff_declared
        try:
            result = g.apply_action(seat_id, action, amount)
        except ValueError as exc:
            return {"error": str(exc)}
        store.save(g.to_dict())
    response: dict[str, Any] = {"result": result}
    if table_chat is not None:
        phrase = _game.PHRASES.get(table_chat)
        if phrase:
            response["chat"] = phrase
    return response


@mcp.tool
def say(phrase_id: int) -> dict[str, Any]:
    """Emit a fixed table chat phrase. phrase_id must be 1–10."""
    phrase = _game.PHRASES.get(phrase_id)
    if phrase is None:
        return {"error": f"Unknown phrase_id {phrase_id}. Valid range: 1–10."}
    return {"phrase": phrase}


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
