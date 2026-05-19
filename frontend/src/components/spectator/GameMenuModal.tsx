// GameMenuModal — list / create / delete / select games.
//
// The spectator-only entry point for game lifecycle. Refreshes the games
// list each time it opens. On "watch", calls onSelect(gameId) and the
// parent updates the URL + subscribes. On "new game", POSTs and selects
// the new game immediately. On "delete", DELETEs and refreshes the list.

"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createGame, deleteGame, listGames } from "@/lib/api";
import type { GameSummary } from "@/lib/types";

interface Props {
  open: boolean;
  currentGameId: string | null;
  onClose: () => void;
  onSelect: (gameId: string) => void;
}

export function GameMenuModal({ open, currentGameId, onClose, onSelect }: Props) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatCount, setSeatCount] = useState(2);
  const [startingStack, setStartingStack] = useState(1000);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await listGames();
      setGames(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load games");
    }
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  async function onCreate(evt: FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const summary = await createGame(seatCount, startingStack);
      onSelect(summary.game_id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(gameId: string) {
    if (!confirm(`delete game ${gameId.slice(0, 8)}? this can't be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteGame(gameId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">games</h2>
          <button className="modal-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <section className="modal-section">
          <h3 className="modal-section-title">active games</h3>
          {games.length === 0 ? (
            <div className="modal-empty">no games yet — create one below.</div>
          ) : (
            <ul className="game-list">
              {games.map((g) => {
                const isCurrent = g.game_id === currentGameId;
                return (
                  <li key={g.game_id} className="game-list-row">
                    <div className="game-list-meta">
                      <span className="game-list-id">{g.game_id.slice(0, 8)}</span>
                      <span className="meta">
                        {g.seats_filled}/{g.seat_count} seats · hand #{g.hand_number} ·{" "}
                        {g.game_ended ? "ended" : g.phase}
                      </span>
                    </div>
                    <div className="game-list-actions">
                      <button
                        className="modal-button"
                        disabled={isCurrent}
                        onClick={() => {
                          onSelect(g.game_id);
                          onClose();
                        }}
                      >
                        {isCurrent ? "watching" : "watch"}
                      </button>
                      <button
                        className="modal-button modal-button--danger"
                        disabled={busy}
                        onClick={() => onDelete(g.game_id)}
                      >
                        delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="modal-section">
          <h3 className="modal-section-title">new game</h3>
          <form onSubmit={onCreate} className="modal-form modal-form--row">
            <label className="modal-field">
              <span>seats</span>
              <input
                type="number"
                min={2}
                max={6}
                value={seatCount}
                onChange={(e) => setSeatCount(Number(e.target.value))}
                disabled={busy}
                className="modal-input modal-input--narrow"
              />
            </label>
            <label className="modal-field">
              <span>starting stack</span>
              <input
                type="number"
                min={200}
                step={100}
                value={startingStack}
                onChange={(e) => setStartingStack(Number(e.target.value))}
                disabled={busy}
                className="modal-input modal-input--narrow"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="modal-button modal-button--primary"
            >
              create
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
