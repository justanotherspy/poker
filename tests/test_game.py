"""Unit tests for the GameState core — PokerKit wrapping, actions, showdown,
seat tokens, and multi-hand support."""

from unittest.mock import patch

import pytest

import poker.store as store_module
from poker.game import GameState, create_game, get_game, list_games

# ---------------------------------------------------------------------------
# create_game / get_game
# ---------------------------------------------------------------------------


def test_create_game_defaults() -> None:
    g = create_game()
    assert g.seat_count == 2


def test_create_game_custom_params() -> None:
    g = create_game(seat_count=3, starting_stack=500)
    assert g.seat_count == 3
    view = g.get_view(1)
    assert sum(view.stacks.values()) <= 3 * 500


def test_get_game_returns_none_for_unknown() -> None:
    assert get_game("does-not-exist") is None


def test_get_game_returns_game_after_create() -> None:
    g = create_game()
    loaded = get_game(g.game_id)
    assert loaded is not None
    assert loaded.seat_count == 2
    assert loaded.game_id == g.game_id


def test_create_game_does_not_clobber_others() -> None:
    g1 = create_game()
    g2 = create_game()
    assert g1.game_id != g2.game_id
    assert get_game(g1.game_id) is not None
    assert get_game(g2.game_id) is not None


def test_list_games_returns_summaries() -> None:
    g1 = create_game(seat_count=2)
    g2 = create_game(seat_count=3)
    summaries = list_games()
    by_id = {s.game_id: s for s in summaries}
    assert by_id[g1.game_id].seat_count == 2
    assert by_id[g2.game_id].seat_count == 3
    assert by_id[g1.game_id].hand_number == 1
    assert by_id[g1.game_id].seats_filled == 0


# ---------------------------------------------------------------------------
# Seat tokens — claim, resolve, exhaustion
# ---------------------------------------------------------------------------


def test_claim_seat_returns_token() -> None:
    g = create_game(seat_count=2)
    claim = g.claim_seat()
    assert claim is not None
    seat_id, token = claim
    assert seat_id in (1, 2)
    assert isinstance(token, str)
    assert len(token) >= 16


def test_resolve_seat_returns_correct_seat() -> None:
    g = create_game(seat_count=2)
    claim = g.claim_seat()
    assert claim is not None
    seat_id, token = claim
    assert g.resolve_seat(token) == seat_id


def test_resolve_unknown_token_returns_none() -> None:
    g = create_game(seat_count=2)
    assert g.resolve_seat("nope") is None


def test_claim_seat_exhausts() -> None:
    g = create_game(seat_count=2)
    assert g.claim_seat() is not None
    assert g.claim_seat() is not None
    assert g.claim_seat() is None


def test_claimed_seats_persist_through_serialization() -> None:
    g = create_game(seat_count=2)
    _, tok = g.claim_seat()  # type: ignore[misc]
    g2 = GameState.from_dict(g.to_dict())
    assert g2.resolve_seat(tok) is not None
    # And the next claim returns the OTHER seat, not the one already taken.
    next_claim = g2.claim_seat()
    assert next_claim is not None
    assert next_claim[0] != g2.resolve_seat(tok)


def test_seats_filled_count() -> None:
    g = create_game(seat_count=3)
    assert g.seats_filled() == 0
    g.claim_seat()
    assert g.seats_filled() == 1
    g.claim_seat()
    g.claim_seat()
    assert g.seats_filled() == 3


# ---------------------------------------------------------------------------
# get_view — card visibility and basic fields
# ---------------------------------------------------------------------------


def test_seat1_sees_own_hole_cards() -> None:
    g = create_game()
    v1 = g.get_view(1)
    assert len(v1.hole_cards) == 2
    assert all(len(c) == 2 for c in v1.hole_cards)


def test_seats_have_different_hole_cards() -> None:
    g = create_game()
    assert set(g.get_view(1).hole_cards) != set(g.get_view(2).hole_cards)


def test_board_empty_preflop() -> None:
    g = create_game()
    assert g.get_view(1).board == []


def test_stacks_are_1indexed() -> None:
    g = create_game(starting_stack=1000)
    stacks = g.get_view(1).stacks
    assert 1 in stacks
    assert 2 in stacks
    assert 0 not in stacks


def test_stacks_sum_to_starting_total() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    view = g.get_view(1)
    assert sum(view.stacks.values()) + view.pot == 2000


def test_current_actor_is_1indexed() -> None:
    g = create_game()
    actor = g.get_view(1).current_actor
    assert actor is not None
    assert actor in (1, 2)


def test_phase_preflop_at_start() -> None:
    g = create_game()
    assert g.get_view(1).phase == "preflop"


def test_min_raise_present_preflop() -> None:
    g = create_game()
    view = g.get_view(1)
    assert view.min_raise is not None
    assert view.min_raise > 0


# ---------------------------------------------------------------------------
# apply_action — valid paths
# ---------------------------------------------------------------------------


def _get_actor(g: GameState) -> int:
    actor = g.get_view(1).current_actor
    assert actor is not None
    return actor


def test_fold_ends_hand() -> None:
    g = create_game()
    actor = _get_actor(g)
    result = g.apply_action(actor, "fold")
    assert "folds" in result
    assert g.get_view(1).phase == "ended"


def test_fold_distributes_chips() -> None:
    g = create_game(starting_stack=1000)
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    stacks = g.get_view(1).stacks
    assert sum(stacks.values()) == 2000


def test_call_accepted() -> None:
    g = create_game()
    actor = _get_actor(g)
    view = g.get_view(actor)
    if view.to_call > 0:
        result = g.apply_action(actor, "call")
        assert "calls" in result
    else:
        result = g.apply_action(actor, "check")
        assert "checks" in result


def test_raise_accepted() -> None:
    g = create_game()
    actor = _get_actor(g)
    view = g.get_view(actor)
    assert view.min_raise is not None
    result = g.apply_action(actor, "raise", view.min_raise)
    assert "raises" in result


def test_phase_advances_through_streets() -> None:
    g = create_game()

    def act_all(g: GameState) -> None:
        for _ in range(2):
            actor = _get_actor(g)
            v = g.get_view(actor)
            if v.to_call > 0:
                g.apply_action(actor, "call")
            else:
                g.apply_action(actor, "check")

    act_all(g)
    assert g.get_view(1).phase == "flop"
    assert len(g.get_view(1).board) == 3

    act_all(g)
    assert g.get_view(1).phase == "turn"
    assert len(g.get_view(1).board) == 4

    act_all(g)
    assert g.get_view(1).phase == "river"
    assert len(g.get_view(1).board) == 5


# ---------------------------------------------------------------------------
# apply_action — error paths
# ---------------------------------------------------------------------------


def test_out_of_turn_raises() -> None:
    g = create_game()
    actor = _get_actor(g)
    wrong_seat = 2 if actor == 1 else 1
    with pytest.raises(ValueError, match="Not your turn"):
        g.apply_action(wrong_seat, "fold")


def test_action_on_ended_hand_raises() -> None:
    g = create_game()
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    with pytest.raises(ValueError, match="Hand is over"):
        g.apply_action(actor, "fold")


def test_raise_without_amount_raises() -> None:
    g = create_game()
    actor = _get_actor(g)
    with pytest.raises(ValueError, match="requires an amount"):
        g.apply_action(actor, "raise")


def test_call_with_nothing_owed_is_recorded_as_check() -> None:
    # An agent that sends "call" when no chips are owed should be recorded
    # (and reported) as a check, not a call.
    g = create_game(seat_count=2, starting_stack=1000)
    actor = _get_actor(g)
    # SB calls the BB so the BB now faces no outstanding bet.
    if g.get_view(actor).to_call > 0:
        g.apply_action(actor, "call")
    bb = _get_actor(g)
    assert g.get_view(bb).to_call == 0
    result = g.apply_action(bb, "call")  # client mislabels a check as a call
    assert "checks" in result
    sv = g.get_spectator_view()
    bb_seat = next(s for s in sv.seats if s.seat_id == bb)
    assert bb_seat.last_action == "checks"


# ---------------------------------------------------------------------------
# Multi-hand — start_next_hand carries stacks, rotates button.
# ---------------------------------------------------------------------------


def test_start_next_hand_blocked_while_hand_in_progress() -> None:
    g = create_game()
    assert g.start_next_hand() is False
    assert g.hand_number == 1


def test_start_next_hand_succeeds_after_fold() -> None:
    g = create_game(starting_stack=1000)
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    started = g.start_next_hand()
    assert started is True
    assert g.hand_number == 2
    # Phase resets to preflop.
    assert g.get_view(1).phase == "preflop"
    # Total stacks conserved.
    assert sum(g.get_view(1).stacks.values()) + g.get_view(1).pot == 2000


def test_start_next_hand_rotates_button() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    initial_sb = g.sb_idx
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    assert g.start_next_hand() is True
    assert g.sb_idx == (initial_sb + 1) % 2


def test_start_next_hand_ends_game_on_bust() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    actor = _get_actor(g)
    # Shove all-in then call → one player wins all stacks.
    g.apply_action(actor, "raise", 1000)
    other = _get_actor(g)
    g.apply_action(other, "call")
    while g.needs_showdown():
        g.advance_showdown()
    # Now one player has 2000, the other has 0.
    started = g.start_next_hand()
    assert started is False
    assert g.game_ended is True


# ---------------------------------------------------------------------------
# Serialization round-trip — must preserve seat tokens, sb_idx, hand_number.
# ---------------------------------------------------------------------------


def test_to_dict_from_dict_roundtrip_hole_cards() -> None:
    g = create_game()
    d = g.to_dict()
    g2 = GameState.from_dict(d)
    assert g.get_view(1).hole_cards == g2.get_view(1).hole_cards
    assert g.get_view(2).hole_cards == g2.get_view(2).hole_cards


def test_to_dict_preserves_seat_tokens() -> None:
    g = create_game()
    g2 = GameState.from_dict(g.to_dict())
    assert g2.seat_tokens == g.seat_tokens


def test_to_dict_preserves_sb_idx() -> None:
    g = create_game(seat_count=3)
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    g.start_next_hand()
    g2 = GameState.from_dict(g.to_dict())
    assert g2.sb_idx == g.sb_idx
    assert g2.hand_number == g.hand_number


def test_to_dict_preserves_game_ended() -> None:
    g = create_game(starting_stack=1000)
    g.game_ended = True
    g2 = GameState.from_dict(g.to_dict())
    assert g2.game_ended is True


def test_get_game_loads_from_redis() -> None:
    g = create_game()
    g2 = get_game(g.game_id)
    assert g2 is not None
    assert g2.game_id == g.game_id
    assert g2.get_view(1).hole_cards == g.get_view(1).hole_cards


# ---------------------------------------------------------------------------
# in-memory fallback (no Redis)
# ---------------------------------------------------------------------------


def test_create_and_get_game_without_redis() -> None:
    with patch.object(store_module, "_client", return_value=None):
        store_module._memory["games"] = {}
        g = create_game()
        g2 = get_game(g.game_id)
        assert g2 is not None
        assert g2.game_id == g.game_id


# ---------------------------------------------------------------------------
# all-in board run-out regression
# ---------------------------------------------------------------------------


def test_allin_board_runout_completes() -> None:
    g = create_game(starting_stack=1000)
    actor = _get_actor(g)
    g.apply_action(actor, "raise", 1000)
    actor2 = _get_actor(g)
    g.apply_action(actor2, "call")
    assert g.needs_showdown()
    while g.needs_showdown():
        g.advance_showdown()
    board = g.get_view(1).board
    assert len(board) == 5
    assert g.get_view(1).phase == "ended"
    assert sum(g.get_view(1).stacks.values()) == 2000
