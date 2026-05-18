import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, Literal

from pokerkit import Automation, NoLimitTexasHoldem, StandardHighHand
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


# --- Spectator view model -------------------------------------------------
#
# The spectator view is a single per-table snapshot that exposes ALL
# information (every player's hole cards, action history, chat). It powers
# the read-only spectator UI at `/` and is broadcast to subscribers over
# WebSocket on every mutation.

Blind = Literal["SB", "BB"]
Street = Literal["pre", "flop", "turn", "river"]
SeatKind = Literal["human", "agent"]


@dataclass
class SpectatorSeat:
    seat_id: int
    name: str
    initials: str
    stack: int
    bet: int
    position: str
    hole_cards: list[str]
    last_action: str | None
    folded: bool
    to_act: bool
    is_dealer: bool
    blind: Blind | None
    kind: SeatKind
    hand_rank: str | None = None
    shows_cards: bool = False
    won_amount: int | None = None


@dataclass
class ChatMessage:
    seat_id: int
    name: str
    text: str
    ts: float


@dataclass
class HistoryEntry:
    street: Street
    text: str
    marker: bool = False


@dataclass
class SpectatorView:
    table_id: str
    hand_number: int
    phase: str
    board: list[str]
    pot: int
    seats: list[SpectatorSeat]
    current_actor: int | None
    last_action_text: str | None
    history: list[HistoryEntry]
    chat: list[ChatMessage]
    stats: dict[str, dict[str, float]] | None
    winner_names: list[str] | None


# Standard 6-max position labels. Index 0 is the small blind, index n-1 is
# the button. We always label SB/BB; the remaining seats fill UTG → CO →
# BTN walking from the player after BB toward the button.
_POS_LABELS: dict[int, list[str]] = {
    2: ["SB", "BB"],
    3: ["SB", "BB", "BTN"],
    4: ["SB", "BB", "CO", "BTN"],
    5: ["SB", "BB", "UTG", "CO", "BTN"],
    6: ["SB", "BB", "UTG", "MP", "CO", "BTN"],
}


def _position_for(seat_index: int, seat_count: int) -> str:
    labels = _POS_LABELS.get(seat_count)
    if labels is None:
        return f"S{seat_index + 1}"
    return labels[seat_index]


def _dealer_index(seat_count: int) -> int:
    # Heads-up: SB acts as dealer (button). Otherwise the last seat is BTN.
    return 0 if seat_count == 2 else seat_count - 1


def _seat_name(seat_id: int) -> str:
    return f"seat_{seat_id}"


def _seat_initials(seat_id: int) -> str:
    return f"S{seat_id}"


def _format_action(entry: dict[str, Any]) -> str | None:
    t = entry["type"]
    if t == "fold":
        return "folds"
    if t == "check":
        return "checks"
    if t == "call":
        return "calls"
    if t == "bet":
        return f"bets ${int(entry['amount']):,}"
    if t == "raise":
        return f"raises to ${int(entry['amount']):,}"
    return None


def _evaluate_hand_label(hole: list[str], board: list[str]) -> str | None:
    if len(board) < 3 or len(hole) < 2:
        return None
    try:
        from pokerkit.utilities import Card

        hole_cards = tuple(Card.parse("".join(hole)))
        board_cards = tuple(Card.parse("".join(board)))
        h = StandardHighHand.from_game(hole_cards, board_cards)
    except Exception:
        return None
    label = getattr(h.entry, "label", None)
    if label is None:
        return None
    text = getattr(label, "value", str(label))
    return str(text).lower()


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
        self.chat_log: list[dict[str, Any]] = []

    def _board(self) -> list[str]:
        return [repr(c) for group in self._state.board_cards for c in group]

    def _pot(self) -> int:
        s = self._state
        return sum(s.bets) + sum(p.amount for p in s.pots)

    def _phase(self) -> str:
        s = self._state
        if not s.status:
            return "ended"
        board_len = len(self._board())
        if board_len == 0:
            return "preflop"
        if board_len == 3:
            return "flop"
        if board_len == 4:
            return "turn"
        return "river"

    def get_view(self, seat_id: int) -> TableView:
        s = self._state
        seat_idx = seat_id - 1
        hole_cards = [repr(c) for c in s.hole_cards[seat_idx]]
        board = self._board()
        pot = self._pot()
        stacks = {i + 1: stack for i, stack in enumerate(s.stacks)}
        actor = (s.actor_index + 1) if s.actor_index is not None else None
        to_call = s.checking_or_calling_amount or 0
        min_r = s.min_completion_betting_or_raising_to_amount
        min_raise = min_r if s.can_complete_bet_or_raise_to(min_r) else None
        return TableView(
            seat_id=seat_id,
            hole_cards=hole_cards,
            board=board,
            pot=pot,
            stacks=stacks,
            current_actor=actor,
            to_call=to_call,
            min_raise=min_raise,
            phase=self._phase(),
        )

    # ------------------------------------------------------------------
    # Spectator view — all-seats snapshot, no card filtering.
    # ------------------------------------------------------------------
    def get_spectator_view(self) -> SpectatorView:
        s = self._state
        n = self.seat_count
        phase = self._phase()
        board = self._board()
        ended = phase == "ended"

        # Most recent action per seat, by walking action_log from the tail.
        action_types = {"fold", "call", "check", "bet", "raise"}
        last_per_seat: dict[int, str] = {}
        last_text: str | None = None
        for entry in reversed(self._action_log):
            t = entry.get("type")
            if t in action_types:
                seat_id = int(entry["seat"])
                txt = _format_action(entry)
                if txt is not None:
                    if last_text is None:
                        last_text = f"{_seat_name(seat_id)} {txt}"
                    last_per_seat.setdefault(seat_id, txt)
                    if len(last_per_seat) >= n:
                        break

        actor = (s.actor_index + 1) if s.actor_index is not None else None
        dealer_idx = _dealer_index(n)

        seats: list[SpectatorSeat] = []
        winner_names: list[str] = []
        for i in range(n):
            seat_id = i + 1
            hole = [repr(c) for c in s.hole_cards[i]]
            folded = not s.statuses[i]
            stack = int(s.stacks[i])
            won_delta = stack - int(s.starting_stacks[i])
            won_amount = won_delta if (ended and won_delta > 0) else None
            shows = False
            hand_rank: str | None = None
            if ended and not folded:
                shows = True
                hand_rank = _evaluate_hand_label(hole, board)
            if won_amount is not None:
                winner_names.append(_seat_name(seat_id))
            seats.append(
                SpectatorSeat(
                    seat_id=seat_id,
                    name=_seat_name(seat_id),
                    initials=_seat_initials(seat_id),
                    stack=stack,
                    bet=int(s.bets[i]),
                    position=_position_for(i, n),
                    hole_cards=hole,
                    last_action=last_per_seat.get(seat_id),
                    folded=folded,
                    to_act=(actor == seat_id),
                    is_dealer=(i == dealer_idx),
                    blind=("SB" if i == 0 else "BB" if i == 1 else None),
                    kind="human",
                    hand_rank=hand_rank,
                    shows_cards=shows,
                    won_amount=won_amount,
                )
            )

        history = self._build_history()
        chat = [
            ChatMessage(
                seat_id=int(m["seat_id"]),
                name=str(m["name"]),
                text=str(m["text"]),
                ts=float(m["ts"]),
            )
            for m in self.chat_log
        ]

        return SpectatorView(
            table_id=self.game_id,
            hand_number=1,
            phase=phase,
            board=board,
            pot=self._pot(),
            seats=seats,
            current_actor=actor,
            last_action_text=last_text,
            history=history,
            chat=chat,
            stats=None,
            winner_names=(winner_names if ended and winner_names else None),
        )

    def _build_history(self) -> list[HistoryEntry]:
        action_types = {"fold", "call", "check", "bet", "raise"}
        entries: list[HistoryEntry] = []
        board_cards_so_far: list[str] = []
        for entry in self._action_log:
            t = entry.get("type")
            if t == "deal_board":
                board_cards_so_far.append(str(entry["card"]))
                count = len(board_cards_so_far)
                if count == 3:
                    entries.append(
                        HistoryEntry(
                            street="flop",
                            text=" ".join(board_cards_so_far),
                            marker=True,
                        )
                    )
                elif count == 4:
                    entries.append(
                        HistoryEntry(
                            street="turn",
                            text=board_cards_so_far[-1],
                            marker=True,
                        )
                    )
                elif count == 5:
                    entries.append(
                        HistoryEntry(
                            street="river",
                            text=board_cards_so_far[-1],
                            marker=True,
                        )
                    )
            elif t in action_types:
                count = len(board_cards_so_far)
                if count < 3:
                    street: Street = "pre"
                elif count == 3:
                    street = "flop"
                elif count == 4:
                    street = "turn"
                else:
                    street = "river"
                seat_id = int(entry["seat"])
                text = _format_action(entry) or ""
                entries.append(
                    HistoryEntry(
                        street=street,
                        text=f"{_seat_name(seat_id)} {text}",
                    )
                )
        return entries

    def record_chat(self, seat_id: int, text: str) -> ChatMessage:
        msg = ChatMessage(
            seat_id=seat_id,
            name=_seat_name(seat_id) if seat_id > 0 else "dealer",
            text=text,
            ts=time.time(),
        )
        self.chat_log.append(asdict(msg))
        return msg

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
            "chat_log": self.chat_log,
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
        g.chat_log = list(d.get("chat_log", []))
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
