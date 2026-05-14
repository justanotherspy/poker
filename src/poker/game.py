import threading
from dataclasses import dataclass
from typing import Literal

from pokerkit import Automation, NoLimitTexasHoldem
from pokerkit.state import State

AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CARD_BURNING,
    Automation.BOARD_DEALING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
    # Required for showdown: _end_showdown → _begin_hand_killing → _end_hand_killing
    # → _begin_chips_pushing. Without this automation the state machine stalls and
    # status never becomes False after showdown.
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


class GameState:
    def __init__(self, state: State, seat_count: int) -> None:
        self._state = state
        self.seat_count = seat_count
        self.bluffs: dict[int, bool] = {}
        self._lock = threading.Lock()

    def get_view(self, seat_id: int) -> TableView:
        s = self._state
        seat_idx = seat_id - 1
        hole_cards = [repr(c) for c in s.hole_cards[seat_idx]]
        # board_cards is list[list[Card]] — flatten across groups
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

    def apply_action(
        self,
        seat_id: int,
        action: ActionType,
        amount: int | None = None,
    ) -> str:
        with self._lock:
            s = self._state
            if not s.status:
                raise ValueError("Hand is over.")
            actor_1idx = (s.actor_index + 1) if s.actor_index is not None else None
            if actor_1idx != seat_id:
                raise ValueError(
                    f"Not your turn. Current actor: seat {actor_1idx}."
                )
            if action == "fold":
                if not s.can_fold():
                    raise ValueError("Cannot fold now.")
                s.fold()
                return f"Seat {seat_id} folds."
            elif action in ("check", "call"):
                if not s.can_check_or_call():
                    raise ValueError(f"Cannot {action} now.")
                call_amt = s.checking_or_calling_amount
                s.check_or_call()
                verb = "checks" if call_amt == 0 else "calls"
                return f"Seat {seat_id} {verb}."
            elif action in ("raise", "bet"):
                if amount is None:
                    raise ValueError(f"'{action}' requires an amount.")
                if not s.can_complete_bet_or_raise_to(amount):
                    raise ValueError(f"Cannot {action} to {amount}.")
                s.complete_bet_or_raise_to(amount)
                verb = "raises" if action == "raise" else "bets"
                return f"Seat {seat_id} {verb} to {amount}."
            else:
                raise ValueError(f"Unknown action: '{action}'.")

    def needs_showdown(self) -> bool:
        return bool(self._state.showdown_indices)

    def advance_showdown(self) -> None:
        self._state.show_or_muck_hole_cards(True)


_active_game: GameState | None = None
_game_lock = threading.Lock()


def create_game(seat_count: int = 2, starting_stack: int = 1000) -> GameState:
    global _active_game
    stacks = tuple(starting_stack for _ in range(seat_count))
    blinds = (50, 100) + (0,) * (seat_count - 2)
    state = NoLimitTexasHoldem.create_state(
        automations=AUTOMATIONS,
        ante_trimming_status=True,
        raw_antes=0,
        raw_blinds_or_straddles=blinds,
        min_bet=100,
        raw_starting_stacks=stacks,
        player_count=seat_count,
    )
    for _ in range(2 * seat_count):
        state.deal_hole()
    with _game_lock:
        _active_game = GameState(state, seat_count)
    return _active_game


def get_game() -> GameState | None:
    return _active_game
