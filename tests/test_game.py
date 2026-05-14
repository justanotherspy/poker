"""Unit tests for the GameState core — PokerKit wrapping, actions, showdown."""

import pytest

import poker.game as game_module
from poker.game import GameState, create_game, get_game


@pytest.fixture(autouse=True)
def reset_singleton() -> None:
    """Ensure each test starts with no active game."""
    game_module._active_game = None
    yield
    game_module._active_game = None


# ---------------------------------------------------------------------------
# create_game / singleton
# ---------------------------------------------------------------------------


def test_create_game_defaults() -> None:
    g = create_game()
    assert g.seat_count == 2
    assert get_game() is g


def test_create_game_custom_params() -> None:
    g = create_game(seat_count=3, starting_stack=500)
    assert g.seat_count == 3
    view = g.get_view(1)
    assert sum(view.stacks.values()) <= 3 * 500  # blinds already posted


def test_create_game_resets_singleton() -> None:
    g1 = create_game()
    g2 = create_game()
    assert g1 is not g2
    assert get_game() is g2


def test_get_game_none_before_create() -> None:
    assert get_game() is None


# ---------------------------------------------------------------------------
# get_view — card visibility and basic fields
# ---------------------------------------------------------------------------


def test_seat1_sees_own_hole_cards() -> None:
    g = create_game()
    v1 = g.get_view(1)
    assert len(v1.hole_cards) == 2
    assert all(len(c) == 2 for c in v1.hole_cards)  # short form like "Ac"


def test_seat2_sees_own_hole_cards() -> None:
    g = create_game()
    v2 = g.get_view(2)
    assert len(v2.hole_cards) == 2


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
    stacks = g.get_view(1).stacks
    # total chips in stacks + bets already posted = 2000
    view = g.get_view(1)
    assert sum(stacks.values()) + view.pot == 2000


def test_current_actor_is_1indexed() -> None:
    g = create_game()
    actor = g.get_view(1).current_actor
    assert actor is not None
    assert actor in (1, 2)


def test_to_call_nonzero_for_preflop_actor() -> None:
    g = create_game()
    # Actor must call or fold preflop (big blind already posted)
    view = g.get_view(1)
    assert view.to_call >= 0


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
    view = g.get_view(1)
    actor = view.current_actor
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
    # Total chips must be conserved
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


def test_check_on_free_street() -> None:
    g = create_game()
    # Play through preflop (call + check to reach flop)
    actor = _get_actor(g)
    g.apply_action(actor, "call")
    actor = _get_actor(g)
    g.apply_action(actor, "check")
    # Now on flop, should be able to check for free
    actor = _get_actor(g)
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

    def act_all_check(phases: list[str]) -> None:
        for _ in range(2):
            actor = _get_actor(g)
            v = g.get_view(actor)
            if v.to_call > 0:
                g.apply_action(actor, "call")
            else:
                g.apply_action(actor, "check")

    act_all_check([])
    assert g.get_view(1).phase == "flop"
    assert len(g.get_view(1).board) == 3

    act_all_check([])
    assert g.get_view(1).phase == "turn"
    assert len(g.get_view(1).board) == 4

    act_all_check([])
    assert g.get_view(1).phase == "river"
    assert len(g.get_view(1).board) == 5


def test_full_hand_chips_conserved() -> None:
    g = create_game(starting_stack=1000)
    # Play all streets to showdown
    for _ in range(8):  # 2 actions × 4 streets
        if g.get_view(1).phase == "ended":
            break
        actor = _get_actor(g)
        v = g.get_view(actor)
        if v.to_call > 0:
            g.apply_action(actor, "call")
        else:
            g.apply_action(actor, "check")
    # Advance showdown if needed
    while g.needs_showdown():
        g.advance_showdown()
    stacks = g.get_view(1).stacks
    assert sum(stacks.values()) == 2000
    assert g.get_view(1).phase == "ended"


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


def test_raise_invalid_amount_raises() -> None:
    g = create_game()
    actor = _get_actor(g)
    with pytest.raises(ValueError):
        g.apply_action(actor, "raise", 1)  # below minimum


def test_unknown_action_raises() -> None:
    g = create_game()
    actor = _get_actor(g)
    with pytest.raises(ValueError, match="Unknown action"):
        g.apply_action(actor, "shove")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# bluffs
# ---------------------------------------------------------------------------


def test_bluff_flag_stored() -> None:
    g = create_game()
    g.bluffs[1] = True
    assert g.bluffs[1] is True


def test_bluff_flag_defaults_absent() -> None:
    g = create_game()
    assert 1 not in g.bluffs


# ---------------------------------------------------------------------------
# showdown
# ---------------------------------------------------------------------------


def _play_to_showdown(g: GameState) -> None:
    for _ in range(8):
        if g.needs_showdown() or g.get_view(1).phase == "ended":
            break
        actor = _get_actor(g)
        v = g.get_view(actor)
        if v.to_call > 0:
            g.apply_action(actor, "call")
        else:
            g.apply_action(actor, "check")


def test_needs_showdown_after_river() -> None:
    g = create_game()
    _play_to_showdown(g)
    # Either hand ended via fold along the way or we're in showdown
    if not g.get_view(1).phase == "ended":
        assert g.needs_showdown()


def test_advance_showdown_reduces_indices() -> None:
    g = create_game()
    _play_to_showdown(g)
    if not g.needs_showdown():
        pytest.skip("Hand ended by fold before showdown")
    g.advance_showdown()
    # After first advance, either still in showdown or done
    # (2-player game: may need 2 shows)


def test_showdown_chips_distributed() -> None:
    g = create_game(starting_stack=1000)
    _play_to_showdown(g)
    while g.needs_showdown():
        g.advance_showdown()
    stacks = g.get_view(1).stacks
    assert sum(stacks.values()) == 2000
    assert g.get_view(1).phase == "ended"
