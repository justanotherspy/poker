"""Unit tests for the spectator view model."""

from poker.game import GameState, _position_for, create_game


def _actor(g: GameState) -> int:
    a = g.get_view(1).current_actor
    assert a is not None
    return a


# ---------------------------------------------------------------------------
# Hole cards — spectator sees ALL seats, no filtering.
# ---------------------------------------------------------------------------


def test_spectator_sees_all_hole_cards() -> None:
    g = create_game(seat_count=3, starting_stack=1000)
    sv = g.get_spectator_view()
    assert len(sv.seats) == 3
    for seat in sv.seats:
        assert len(seat.hole_cards) == 2
        assert all(len(c) == 2 for c in seat.hole_cards)


def test_spectator_hole_cards_match_seat_view() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    sv = g.get_spectator_view()
    assert sv.seats[0].hole_cards == g.get_view(1).hole_cards
    assert sv.seats[1].hole_cards == g.get_view(2).hole_cards


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------


def test_position_labels_heads_up() -> None:
    assert _position_for(0, 2) == "SB"
    assert _position_for(1, 2) == "BB"


def test_position_labels_three_handed() -> None:
    assert _position_for(0, 3) == "SB"
    assert _position_for(1, 3) == "BB"
    assert _position_for(2, 3) == "BTN"


def test_position_labels_six_max() -> None:
    expected = ["SB", "BB", "UTG", "MP", "CO", "BTN"]
    for i, label in enumerate(expected):
        assert _position_for(i, 6) == label


def test_spectator_seat_positions_six_max() -> None:
    g = create_game(seat_count=6, starting_stack=1000)
    sv = g.get_spectator_view()
    assert [s.position for s in sv.seats] == ["SB", "BB", "UTG", "MP", "CO", "BTN"]


def test_spectator_blinds_marked() -> None:
    g = create_game(seat_count=3, starting_stack=1000)
    sv = g.get_spectator_view()
    assert sv.seats[0].blind == "SB"
    assert sv.seats[1].blind == "BB"
    assert sv.seats[2].blind is None


def test_dealer_marked_heads_up_is_sb() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    sv = g.get_spectator_view()
    assert sv.seats[0].is_dealer is True
    assert sv.seats[1].is_dealer is False


def test_dealer_marked_three_handed_is_btn() -> None:
    g = create_game(seat_count=3, starting_stack=1000)
    sv = g.get_spectator_view()
    assert sv.seats[2].is_dealer is True
    assert sv.seats[0].is_dealer is False
    assert sv.seats[1].is_dealer is False


# ---------------------------------------------------------------------------
# History — groups action_log into streets, marker entries for board deals.
# ---------------------------------------------------------------------------


def test_history_empty_at_start_has_no_marker() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    sv = g.get_spectator_view()
    # No actions yet — no history.
    assert sv.history == []


def test_history_records_preflop_actions() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    a = _actor(g)
    g.apply_action(a, "call")
    sv = g.get_spectator_view()
    assert any(h.street == "pre" and "calls" in h.text for h in sv.history)


def test_history_emits_flop_marker() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    g.apply_action(_actor(g), "call")
    g.apply_action(_actor(g), "check")
    sv = g.get_spectator_view()
    markers = [h for h in sv.history if h.marker]
    assert len(markers) == 1
    assert markers[0].street == "flop"
    # Flop marker text contains three space-separated cards.
    assert len(markers[0].text.split(" ")) == 3


def test_history_flop_action_grouped_under_flop_street() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    g.apply_action(_actor(g), "call")
    g.apply_action(_actor(g), "check")
    g.apply_action(_actor(g), "check")  # flop check
    sv = g.get_spectator_view()
    flop_actions = [h for h in sv.history if h.street == "flop" and not h.marker]
    assert len(flop_actions) >= 1


# ---------------------------------------------------------------------------
# Fold-ends-hand → winner_names populated, phase=="ended".
# ---------------------------------------------------------------------------


def test_fold_ends_hand_sets_winner_names() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    a = _actor(g)
    g.apply_action(a, "fold")
    sv = g.get_spectator_view()
    assert sv.phase == "ended"
    assert sv.winner_names is not None
    assert len(sv.winner_names) == 1
    # The folder loses, so the other seat wins.
    other = 2 if a == 1 else 1
    assert sv.winner_names == [f"seat_{other}"]


def test_fold_sets_winner_won_amount_positive() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    a = _actor(g)
    g.apply_action(a, "fold")
    sv = g.get_spectator_view()
    winner_seats = [s for s in sv.seats if s.won_amount is not None]
    assert len(winner_seats) == 1
    assert winner_seats[0].won_amount is not None
    assert winner_seats[0].won_amount > 0


# ---------------------------------------------------------------------------
# Chat log — round-trip and append.
# ---------------------------------------------------------------------------


def test_record_chat_appends() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    assert g.chat_log == []
    g.record_chat(1, "nice hand")
    assert len(g.chat_log) == 1
    assert g.chat_log[0]["seat_id"] == 1
    assert g.chat_log[0]["text"] == "nice hand"
    assert g.chat_log[0]["name"] == "seat_1"


def test_record_chat_appears_in_spectator_view() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    g.record_chat(2, "wow")
    sv = g.get_spectator_view()
    assert len(sv.chat) == 1
    assert sv.chat[0].seat_id == 2
    assert sv.chat[0].text == "wow"
    assert sv.chat[0].ts > 0


def test_chat_log_roundtrips_through_serialization() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    g.record_chat(1, "hello")
    g.record_chat(2, "hi")
    g2 = GameState.from_dict(g.to_dict())
    assert len(g2.chat_log) == 2
    assert g2.chat_log[0]["text"] == "hello"
    assert g2.chat_log[1]["text"] == "hi"


# ---------------------------------------------------------------------------
# Last action mirror — top-level last_action_text and per-seat last_action.
# ---------------------------------------------------------------------------


def test_last_action_text_set_after_action() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    a = _actor(g)
    g.apply_action(a, "call")
    sv = g.get_spectator_view()
    assert sv.last_action_text is not None
    assert "calls" in sv.last_action_text
    assert f"seat_{a}" in sv.last_action_text


def test_seat_last_action_populated_for_acting_seat() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    a = _actor(g)
    g.apply_action(a, "fold")
    sv = g.get_spectator_view()
    folder = next(s for s in sv.seats if s.seat_id == a)
    assert folder.last_action == "folds"


# ---------------------------------------------------------------------------
# to_act / current_actor mirroring
# ---------------------------------------------------------------------------


def test_to_act_flag_matches_current_actor() -> None:
    g = create_game(seat_count=3, starting_stack=1000)
    sv = g.get_spectator_view()
    assert sv.current_actor is not None
    acting = [s for s in sv.seats if s.to_act]
    assert len(acting) == 1
    assert acting[0].seat_id == sv.current_actor


# ---------------------------------------------------------------------------
# Stats — null until aggregation lands.
# ---------------------------------------------------------------------------


def test_stats_is_none_for_v1() -> None:
    g = create_game(seat_count=2, starting_stack=1000)
    assert g.get_spectator_view().stats is None
