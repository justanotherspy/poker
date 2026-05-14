import uuid
from dataclasses import dataclass
from typing import Any, Literal

from pokerkit import Automation, NoLimitTexasHoldem
from pokerkit.state import State

# BOARD_DEALING and CARD_BURNING are intentionally excluded so we can deal
# specific cards and record them in the action log for deterministic replay.
AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
    Automation.HAND_KILLING,
)

PHRASES: dict[int, str] = {
    1: "Nice hand.",
    2: "Wow, lucky!",
    3: "I see you.",
    4: "Bold move.",
    5: "Let's go.",
    6: "Good game.",
    7: "Really?",
    8: "Interesting.",
    9: "Time to go.",
    10: "All in!",
}

ActionType = Literal["fold", "check", "call", "raise", "bet"]


@dataclass
class TableView:
    seat_id: int
    hole_cards: list[str]
    board: list[str]
    pot: int
    stacks: dict[int, int]
    current_actor: int | None
    to_call: int
    min_raise: int | None
    phase: str


def _make_state(seat_count: int, starting_stack: int) -> State:
    stacks = tuple(starting_stack for _ in range(seat_count))
    blinds = (50, 100) + (0,) * (seat_count - 2)
    return NoLimitTexasHoldem.create_state(
        automations=AUTOMATIONS,
        ante_trimming_status=True,
        raw_antes=0,
        raw_blinds_or_straddles=blinds,
        min_bet=100,
        raw_starting_stacks=stacks,
        player_count=seat_count,
    )


class GameState:
    def __init__(
        self,
        state: State,
        seat_count: int,
        starting_stack: int,
        game_id: str,
        action_log: list[dict[str, Any]],
    ) -> None:
        self._state = state
        self.seat_count = seat_count
        self.starting_stack = starting_stack
        self.game_id = game_id
        self._action_log = action_log
        self.bluffs: dict[int, bool] = {}

    def get_view(self, seat_id: int) -> TableView:
        s = self._state
        seat_idx = seat_id - 1
        hole_cards = [repr(c) for c in s.hole_cards[seat_idx]]
        board = [repr(c) for group in s.board_cards for c in group]
        pot = sum(s.bets) + sum(p.amount for p in s.pots)
        stacks = {i + 1: stack for i, stack in enumerate(s.stacks)}
        actor = (s.actor_index + 1) if s.actor_index is not None else None
        to_call = s.checking_or_calling_amount or 0
        min_r = s.min_completion_betting_or_raising_to_amount
        min_raise = min_r if s.can_complete_bet_or_raise_to(min_r) else None
        board_len = len(board)
        if not s.status:
            phase = "ended"
        elif board_len == 0:
            phase = "preflop"
        elif board_len == 3:
            phase = "flop"
        elif board_len == 4:
            phase = "turn"
        else:
            phase = "river"
        return TableView(
            seat_id=seat_id,
            hole_cards=hole_cards,
            board=board,
            pot=pot,
            stacks=stacks,
            current_actor=actor,
            to_call=to_call,
            min_raise=min_raise,
            phase=phase,
        )

    def _advance_board(self) -> None:
        """Burn and deal board cards until no more are pending.

        Uses a single interleaved loop so all-in run-outs across multiple
        streets (flop → turn → river with no intervening betting) complete
        in one call.
        """
        s = self._state
        while s.can_burn_card() or s.can_deal_board():
            if s.can_burn_card():
                s.burn_card()
                self._action_log.append({"type": "burn"})
            elif s.can_deal_board():
                card = repr(s.deck_cards[0])
                s.deal_board(card)
                self._action_log.append({"type": "deal_board", "card": card})

    def apply_action(
        self,
        seat_id: int,
        action: ActionType,
        amount: int | None = None,
    ) -> str:
        s = self._state
        if not s.status:
            raise ValueError("Hand is over.")
        actor_1idx = (s.actor_index + 1) if s.actor_index is not None else None
        if actor_1idx != seat_id:
            raise ValueError(f"Not your turn. Current actor: seat {actor_1idx}.")
        if action == "fold":
            if not s.can_fold():
                raise ValueError("Cannot fold now.")
            s.fold()
            self._action_log.append({"type": "fold", "seat": seat_id})
            result = f"Seat {seat_id} folds."
        elif action in ("check", "call"):
            if not s.can_check_or_call():
                raise ValueError(f"Cannot {action} now.")
            call_amt = s.checking_or_calling_amount
            s.check_or_call()
            verb = "checks" if call_amt == 0 else "calls"
            self._action_log.append({"type": action, "seat": seat_id})
            result = f"Seat {seat_id} {verb}."
        elif action in ("raise", "bet"):
            if amount is None:
                raise ValueError(f"'{action}' requires an amount.")
            if not s.can_complete_bet_or_raise_to(amount):
                raise ValueError(f"Cannot {action} to {amount}.")
            s.complete_bet_or_raise_to(amount)
            verb = "raises" if action == "raise" else "bets"
            self._action_log.append({"type": action, "seat": seat_id, "amount": amount})
            result = f"Seat {seat_id} {verb} to {amount}."
        else:
            raise ValueError(f"Unknown action: '{action}'.")
        self._advance_board()
        return result

    def needs_showdown(self) -> bool:
        return bool(self._state.showdown_indices)

    def advance_showdown(self) -> None:
        self._state.show_or_muck_hole_cards(True)
        self._action_log.append({"type": "show"})
        # After all showdowns are drained the board run-out (for all-in hands)
        # may become available.
        self._advance_board()

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "seat_count": self.seat_count,
            "starting_stack": self.starting_stack,
            "action_log": self._action_log,
            "bluffs": {str(k): v for k, v in self.bluffs.items()},
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "GameState":
        seat_count: int = d["seat_count"]
        starting_stack: int = d["starting_stack"]
        action_log: list[dict[str, Any]] = d["action_log"]
        state = _make_state(seat_count, starting_stack)
        for entry in action_log:
            t = entry["type"]
            if t == "deal_hole":
                state.deal_hole(entry["card"])
            elif t == "burn":
                state.burn_card()
            elif t == "deal_board":
                state.deal_board(entry["card"])
            elif t == "show":
                state.show_or_muck_hole_cards(True)
            elif t == "fold":
                state.fold()
            elif t in ("call", "check"):
                state.check_or_call()
            elif t in ("raise", "bet"):
                state.complete_bet_or_raise_to(entry["amount"])
        g = cls(state, seat_count, starting_stack, d["game_id"], list(action_log))
        g.bluffs = {int(k): v for k, v in d.get("bluffs", {}).items()}
        return g


def create_game(seat_count: int = 2, starting_stack: int = 1000) -> "GameState":
    from poker import store

    store.clear()  # remove any previous game's state key from Redis
    state = _make_state(seat_count, starting_stack)
    game_id = str(uuid.uuid4())
    action_log: list[dict[str, Any]] = []
    for _ in range(2 * seat_count):
        card = repr(state.deck_cards[0])
        state.deal_hole(card)
        action_log.append({"type": "deal_hole", "card": card})
    g = GameState(state, seat_count, starting_stack, game_id, action_log)
    store.save(g.to_dict())
    return g


def get_game() -> "GameState | None":
    from poker import store

    d = store.load()
    return GameState.from_dict(d) if d else None
