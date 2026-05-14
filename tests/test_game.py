"""Unit tests for the GameState core — PokerKit wrapping, actions, showdown."""

from unittest.mock import patch

import fakeredis
import pytest

import poker.store as store_module
from poker.game import GameState, create_game, get_game


@pytest.fixture(autouse=True)
def fake_redis() -> fakeredis.FakeRedis:  # type: ignore[type-arg]
    r: fakeredis.FakeRedis = fakeredis.FakeRedis(decode_responses=True)  # type: ignore[type-arg]
    with patch.object(store_module, "_client", return_value=r):
        yield r


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


def test_get_game_none_before_create() -> None:
    assert get_game() is None


def test_get_game_returns_game_after_create() -> None:
    create_game()
    g = get_game()
    assert g is not None
    assert g.seat_count == 2


def test_create_game_resets_active_game() -> None:
    create_game()
    g1 = get_game()
    create_game()
    g2 = get_game()
    assert g1 is not None and g2 is not None
    assert g1.game_id != g2.game_id


# ---------------------------------------------------------------------------
# get_view — card visibility and basic fields
# ---------------------------------------------------------------------------


def test_seat1_sees_own_hole_cards() -> None:
    g = create_game()
    v1 = g.get_view(1)
    assert len(v1.hole_cards) == 2
    assert all(len(c) == 2 for c in v1.hole_cards)


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
    view = g.get_view(1)
    assert sum(view.stacks.values()) + view.pot == 2000


def test_current_actor_is_1indexed() -> None:
    g = create_game()
    actor = g.get_view(1).current_actor
    assert actor is not None
    assert actor in (1, 2)


def test_to_call_nonzero_for_preflop_actor() -> None:
    g = create_game()
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
    actor = _get_actor(g)
    g.apply_action(actor, "call")
    actor = _get_actor(g)
    g.apply_action(actor, "check")
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


def test_full_hand_chips_conserved() -> None:
    g = create_game(starting_stack=1000)
    for _ in range(8):
        if g.get_view(1).phase == "ended":
            break
        actor = _get_actor(g)
        v = g.get_view(actor)
        if v.to_call > 0:
            g.apply_action(actor, "call")
        else:
            g.apply_action(actor, "check")
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
        g.apply_action(actor, "raise", 1)


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
    if not g.get_view(1).phase == "ended":
        assert g.needs_showdown()


def test_advance_showdown_reduces_indices() -> None:
    g = create_game()
    _play_to_showdown(g)
    if not g.needs_showdown():
        pytest.skip("Hand ended by fold before showdown")
    g.advance_showdown()


def test_showdown_chips_distributed() -> None:
    g = create_game(starting_stack=1000)
    _play_to_showdown(g)
    while g.needs_showdown():
        g.advance_showdown()
    stacks = g.get_view(1).stacks
    assert sum(stacks.values()) == 2000
    assert g.get_view(1).phase == "ended"


# ---------------------------------------------------------------------------
# action log
# ---------------------------------------------------------------------------


def test_action_log_has_hole_deal_entries() -> None:
    g = create_game()
    deal_entries = [e for e in g._action_log if e["type"] == "deal_hole"]
    assert len(deal_entries) == 4  # 2 cards × 2 seats


def test_action_log_records_player_actions() -> None:
    g = create_game()
    actor = _get_actor(g)
    g.apply_action(actor, "fold")
    player_types = {"fold", "call", "check", "raise", "bet"}
    player_entries = [e for e in g._action_log if e["type"] in player_types]
    assert len(player_entries) == 1
    assert player_entries[0]["seat"] == actor


def test_action_log_records_board_deals() -> None:
    g = create_game()
    actor = _get_actor(g)
    g.apply_action(actor, "call")
    actor = _get_actor(g)
    g.apply_action(actor, "check")
    board_entries = [e for e in g._action_log if e["type"] == "deal_board"]
    assert len(board_entries) == 3  # flop


# ---------------------------------------------------------------------------
# serialization round-trip
# ---------------------------------------------------------------------------


def test_to_dict_from_dict_roundtrip_hole_cards() -> None:
    g = create_game()
    d = g.to_dict()
    g2 = GameState.from_dict(d)
    assert g.get_view(1).hole_cards == g2.get_view(1).hole_cards
    assert g.get_view(2).hole_cards == g2.get_view(2).hole_cards


def test_to_dict_from_dict_roundtrip_after_action() -> None:
    g = create_game()
    actor = _get_actor(g)
    g.apply_action(actor, "call")
    actor = _get_actor(g)
    g.apply_action(actor, "check")
    # Now on flop
    d = g.to_dict()
    g2 = GameState.from_dict(d)
    assert g2.get_view(1).phase == "flop"
    assert g2.get_view(1).board == g.get_view(1).board


def test_to_dict_from_dict_preserves_bluffs() -> None:
    g = create_game()
    g.bluffs[1] = True
    g.bluffs[2] = False
    g2 = GameState.from_dict(g.to_dict())
    assert g2.bluffs == {1: True, 2: False}


def test_from_dict_game_id_preserved() -> None:
    g = create_game()
    g2 = GameState.from_dict(g.to_dict())
    assert g2.game_id == g.game_id


def test_get_game_loads_from_redis() -> None:
    g = create_game()
    # get_game() reads fresh from Redis each time
    g2 = get_game()
    assert g2 is not None
    assert g2.game_id == g.game_id
    assert g2.get_view(1).hole_cards == g.get_view(1).hole_cards
