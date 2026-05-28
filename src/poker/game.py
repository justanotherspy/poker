import secrets
import time
import uuid
from dataclasses import asdict, dataclass, field
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
    hand_number: int = 1
    game_ended: bool = False


# --- Spectator view model -------------------------------------------------
#
# The spectator view is a single per-table snapshot that exposes ALL
# information (every player's hole cards, action history, chat). It powers
# the read-only spectator UI at `/` and is broadcast to subscribers over
# WebSocket on every mutation.

Blind = Literal["SB", "BB"]
Street = Literal["pre", "flop", "turn", "river"]
SeatKind = Literal["human", "agent"]
SeatStatus = Literal["open", "claimed"]


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
    status: SeatStatus = "open"


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
    hand_number: int = 1


@dataclass
class GameSummary:
    """Compact game listing used by the spectator menu and join discovery."""

    game_id: str
    seat_count: int
    seats_filled: int
    hand_number: int
    phase: str
    game_ended: bool
    created_at: float


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
    game_ended: bool = False
    seats_open: list[int] = field(default_factory=list)


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


def _position_for(seat_index: int, seat_count: int, sb_idx: int = 0) -> str:
    labels = _POS_LABELS.get(seat_count)
    if labels is None:
        return f"S{seat_index + 1}"
    return labels[(seat_index - sb_idx) % seat_count]


def _dealer_index(seat_count: int, sb_idx: int = 0) -> int:
    # Heads-up: SB acts as dealer (button). Otherwise BTN is the seat
    # immediately before SB.
    if seat_count == 2:
        return sb_idx
    return (sb_idx - 1) % seat_count


def _blind_for(seat_index: int, seat_count: int, sb_idx: int) -> Blind | None:
    if seat_index == sb_idx:
        return "SB"
    if seat_index == (sb_idx + 1) % seat_count:
        return "BB"
    return None


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


def _make_state(
    seat_count: int,
    starting_stacks: tuple[int, ...],
    sb_idx: int,
) -> State:
    blinds_list = [0] * seat_count
    blinds_list[sb_idx] = 50
    blinds_list[(sb_idx + 1) % seat_count] = 100
    return NoLimitTexasHoldem.create_state(
        automations=AUTOMATIONS,
        ante_trimming_status=True,
        raw_antes=0,
        raw_blinds_or_straddles=tuple(blinds_list),
        min_bet=100,
        raw_starting_stacks=starting_stacks,
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
        *,
        created_at: float | None = None,
        hand_number: int = 1,
        sb_idx: int = 0,
        current_hand_stacks: list[int] | None = None,
        archived_history: list[dict[str, Any]] | None = None,
        seat_tokens: dict[int, str] | None = None,
        seats_open: list[int] | None = None,
        game_ended: bool = False,
    ) -> None:
        self._state = state
        self.seat_count = seat_count
        self.starting_stack = starting_stack
        self.game_id = game_id
        self._action_log = action_log
        self.bluffs: dict[int, bool] = {}
        self.chat_log: list[dict[str, Any]] = []
        self.created_at = created_at if created_at is not None else time.time()
        self.hand_number = hand_number
        self.sb_idx = sb_idx
        self.current_hand_stacks = (
            list(current_hand_stacks)
            if current_hand_stacks is not None
            else [starting_stack] * seat_count
        )
        self.archived_history: list[dict[str, Any]] = list(archived_history or [])
        if seat_tokens is None:
            seat_tokens = {i + 1: secrets.token_urlsafe(24) for i in range(seat_count)}
        self.seat_tokens: dict[int, str] = dict(seat_tokens)
        self.seats_open: list[int] = (
            list(seats_open)
            if seats_open is not None
            else [i + 1 for i in range(seat_count)]
        )
        self.game_ended = game_ended

    # ------------------------------------------------------------------
    # Seat ownership — one agent per seat, enforced by an opaque token.
    # ------------------------------------------------------------------

    def claim_seat(self) -> tuple[int, str] | None:
        if not self.seats_open:
            return None
        seat_id = self.seats_open.pop(0)
        return seat_id, self.seat_tokens[seat_id]

    def resolve_seat(self, seat_token: str) -> int | None:
        for seat_id, tok in self.seat_tokens.items():
            if secrets.compare_digest(tok, seat_token):
                return seat_id
        return None

    def seats_filled(self) -> int:
        return self.seat_count - len(self.seats_open)

    def summary(self) -> GameSummary:
        return GameSummary(
            game_id=self.game_id,
            seat_count=self.seat_count,
            seats_filled=self.seats_filled(),
            hand_number=self.hand_number,
            phase=self._phase(),
            game_ended=self.game_ended,
            created_at=self.created_at,
        )

    # ------------------------------------------------------------------
    # Phase / state introspection
    # ------------------------------------------------------------------

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

    def is_hand_over(self) -> bool:
        return not self._state.status and not self.needs_showdown()

    # ------------------------------------------------------------------
    # Per-seat (player) view — own hole cards only.
    # ------------------------------------------------------------------

    def get_view(self, seat_id: int) -> TableView:
        s = self._state
        seat_idx = seat_id - 1
        # Reconstruct from the log rather than reading s.hole_cards: at
        # showdown the HAND_KILLING automation clears the losing seat's cards.
        hole_cards = self._current_hand_hole_cards()[seat_idx]
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
            hand_number=self.hand_number,
            game_ended=self.game_ended,
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
            if t == "hand_break":
                break
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
        dealer_idx = _dealer_index(n, self.sb_idx)

        # Reconstruct hole cards and folds from the log: at showdown the
        # HAND_KILLING automation clears the losing seats' cards and flips
        # their status, which would otherwise make showdown losers look like
        # folders with hidden cards.
        holes_by_seat = self._current_hand_hole_cards()
        folded_seats = self._folded_seats()

        seats: list[SpectatorSeat] = []
        winner_names: list[str] = []
        for i in range(n):
            seat_id = i + 1
            hole = holes_by_seat[i]
            folded = seat_id in folded_seats
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
                    position=_position_for(i, n, self.sb_idx),
                    hole_cards=hole,
                    last_action=last_per_seat.get(seat_id),
                    folded=folded,
                    to_act=(actor == seat_id),
                    is_dealer=(i == dealer_idx),
                    blind=_blind_for(i, n, self.sb_idx),
                    kind="human",
                    hand_rank=hand_rank,
                    shows_cards=shows,
                    won_amount=won_amount,
                    status="open" if seat_id in self.seats_open else "claimed",
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
            hand_number=self.hand_number,
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
            game_ended=self.game_ended,
            seats_open=list(self.seats_open),
        )

    def _build_history(self) -> list[HistoryEntry]:
        """Cumulative history across all hands of this game.

        Combines `archived_history` (entries from completed hands) with the
        history derived from the current hand's action log.
        """
        entries: list[HistoryEntry] = [
            HistoryEntry(
                street=h["street"],
                text=h["text"],
                marker=h.get("marker", False),
                hand_number=h.get("hand_number", 1),
            )
            for h in self.archived_history
        ]
        entries.extend(self._build_current_hand_history())
        return entries

    def _current_hand_actions(self) -> list[dict[str, Any]]:
        """Action log entries for the current hand only (after last hand_break)."""
        for i in range(len(self._action_log) - 1, -1, -1):
            if self._action_log[i].get("type") == "hand_break":
                return self._action_log[i + 1 :]
        return list(self._action_log)

    def _current_hand_hole_cards(self) -> list[list[str]]:
        """Reconstruct each seat's hole cards for the current hand from the
        action log.

        We can't read these from the live pokerkit state at showdown: the
        HAND_KILLING automation mucks losing hands, clearing their
        `hole_cards` (and flipping `statuses`). The deal is round-robin, so
        seat `i` (0-indexed) holds the dealt cards at positions `i` and
        `i + seat_count`.
        """
        dealt = [
            str(e["card"])
            for e in self._current_hand_actions()
            if e.get("type") == "deal_hole"
        ]
        n = self.seat_count
        holes: list[list[str]] = []
        for i in range(n):
            cards: list[str] = []
            if i < len(dealt):
                cards.append(dealt[i])
            if i + n < len(dealt):
                cards.append(dealt[i + n])
            holes.append(cards)
        return holes

    def _folded_seats(self) -> set[int]:
        """1-indexed seats that folded this hand, from the action log.

        Distinct from `not statuses[i]`: a player whose hand was killed at
        showdown also has a falsy status but did not fold.
        """
        return {
            int(e["seat"])
            for e in self._current_hand_actions()
            if e.get("type") == "fold"
        }

    def _build_current_hand_history(self) -> list[HistoryEntry]:
        action_types = {"fold", "call", "check", "bet", "raise"}
        entries: list[HistoryEntry] = []
        board_cards_so_far: list[str] = []
        for entry in self._current_hand_actions():
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
                            hand_number=self.hand_number,
                        )
                    )
                elif count == 4:
                    entries.append(
                        HistoryEntry(
                            street="turn",
                            text=board_cards_so_far[-1],
                            marker=True,
                            hand_number=self.hand_number,
                        )
                    )
                elif count == 5:
                    entries.append(
                        HistoryEntry(
                            street="river",
                            text=board_cards_so_far[-1],
                            marker=True,
                            hand_number=self.hand_number,
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
                        hand_number=self.hand_number,
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
        """Burn and deal board cards until no more are pending."""
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
            # Record what actually happened, not what the client asked for:
            # a "call" with nothing owed is a check, and vice versa. Keeps the
            # action log / history accurate for misbehaving clients.
            actual = "check" if call_amt == 0 else "call"
            verb = "checks" if call_amt == 0 else "calls"
            self._action_log.append({"type": actual, "seat": seat_id})
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

    # ------------------------------------------------------------------
    # Multi-hand support — deal the next hand against current stacks.
    # ------------------------------------------------------------------

    def start_next_hand(self) -> bool:
        """Deal the next hand. Returns False (and ends the game) if it can't.

        Cannot deal a next hand if: the current hand isn't over, the game
        has already ended, or any seat busted out (stack went to 0). The
        bust case ends the game — we don't support rebuys.
        """
        if self.game_ended:
            return False
        if not self.is_hand_over():
            return False

        new_stacks = tuple(int(self._state.stacks[i]) for i in range(self.seat_count))
        if any(st <= 0 for st in new_stacks):
            self.game_ended = True
            return False
        if sum(1 for st in new_stacks if st > 0) < 2:
            self.game_ended = True
            return False

        # Archive this hand's history before resetting.
        self.archived_history.extend(
            asdict(e) for e in self._build_current_hand_history()
        )

        self.sb_idx = (self.sb_idx + 1) % self.seat_count
        self.hand_number += 1
        self.current_hand_stacks = list(new_stacks)
        self.bluffs = {}
        self._action_log.append(
            {
                "type": "hand_break",
                "hand_number": self.hand_number,
                "stacks": list(new_stacks),
                "sb_idx": self.sb_idx,
            }
        )

        self._state = _make_state(self.seat_count, new_stacks, self.sb_idx)
        for _ in range(2 * self.seat_count):
            card = repr(self._state.deck_cards[0])
            self._state.deal_hole(card)
            self._action_log.append({"type": "deal_hole", "card": card})

        return True

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "seat_count": self.seat_count,
            "starting_stack": self.starting_stack,
            "action_log": self._action_log,
            "bluffs": {str(k): v for k, v in self.bluffs.items()},
            "chat_log": self.chat_log,
            "created_at": self.created_at,
            "hand_number": self.hand_number,
            "sb_idx": self.sb_idx,
            "current_hand_stacks": list(self.current_hand_stacks),
            "archived_history": list(self.archived_history),
            "seat_tokens": {str(k): v for k, v in self.seat_tokens.items()},
            "seats_open": list(self.seats_open),
            "game_ended": self.game_ended,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "GameState":
        seat_count: int = d["seat_count"]
        starting_stack: int = d["starting_stack"]
        action_log: list[dict[str, Any]] = list(d["action_log"])
        sb_idx: int = int(d.get("sb_idx", 0))
        current_hand_stacks: list[int] = list(
            d.get("current_hand_stacks") or [starting_stack] * seat_count
        )
        state = _make_state(seat_count, tuple(current_hand_stacks), sb_idx)

        # Find the start of the current hand within the action log.
        start = 0
        for i in range(len(action_log) - 1, -1, -1):
            if action_log[i].get("type") == "hand_break":
                start = i + 1
                break

        for entry in action_log[start:]:
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

        seat_tokens_raw = d.get("seat_tokens")
        seat_tokens: dict[int, str] | None = (
            {int(k): v for k, v in seat_tokens_raw.items()} if seat_tokens_raw else None
        )
        seats_open_raw = d.get("seats_open")
        # Important: preserve an empty list (all seats claimed). `or None`
        # would regenerate every seat as open.
        seats_open: list[int] | None = (
            list(seats_open_raw) if seats_open_raw is not None else None
        )

        g = cls(
            state,
            seat_count,
            starting_stack,
            d["game_id"],
            action_log,
            created_at=d.get("created_at"),
            hand_number=int(d.get("hand_number", 1)),
            sb_idx=sb_idx,
            current_hand_stacks=current_hand_stacks,
            archived_history=list(d.get("archived_history") or []),
            seat_tokens=seat_tokens,
            seats_open=seats_open,
            game_ended=bool(d.get("game_ended", False)),
        )
        g.bluffs = {int(k): v for k, v in d.get("bluffs", {}).items()}
        g.chat_log = list(d.get("chat_log", []))
        return g


def create_game(seat_count: int = 2, starting_stack: int = 1000) -> "GameState":
    """Create a new game and persist it. Returns the live GameState."""
    from poker import store

    starting_stacks = tuple(starting_stack for _ in range(seat_count))
    state = _make_state(seat_count, starting_stacks, sb_idx=0)
    game_id = str(uuid.uuid4())
    action_log: list[dict[str, Any]] = []
    for _ in range(2 * seat_count):
        card = repr(state.deck_cards[0])
        state.deal_hole(card)
        action_log.append({"type": "deal_hole", "card": card})
    g = GameState(state, seat_count, starting_stack, game_id, action_log)
    store.save_game(g.to_dict())
    return g


def get_game(game_id: str) -> "GameState | None":
    from poker import store

    d = store.get_game(game_id)
    return GameState.from_dict(d) if d else None


def list_games() -> list[GameSummary]:
    """All known games, oldest first, summarized for menus."""
    from poker import store

    summaries: list[GameSummary] = []
    for d in store.list_games():
        g = GameState.from_dict(d)
        summaries.append(g.summary())
    return summaries
