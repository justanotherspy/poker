// Status bar at the bottom of the stage. Active variant shows street /
// to-act / pot / last action. Showdown variant shows winner / hand /
// pot.

import type { SpectatorView } from "@/lib/types";

export function StatusBar({ view }: { view: SpectatorView }) {
  if (view.phase === "ended") {
    const winnerName = view.winner_names?.[0] ?? "—";
    const winnerSeat = view.seats.find((s) => s.name === winnerName);
    return (
      <div className="statusbar statusbar--showdown">
        <div className="statusbar-item">
          <span className="label">winner</span>
          <span className="statusbar-val statusbar-val--accent">
            {winnerName}
          </span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="label">hand</span>
          <span className="statusbar-val">
            {winnerSeat?.hand_rank ?? "—"}
          </span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="label">pot</span>
          <span className="statusbar-val">${view.pot.toLocaleString()}</span>
        </div>
        <div className="statusbar-spacer" />
      </div>
    );
  }

  const actor =
    view.current_actor != null
      ? view.seats.find((s) => s.seat_id === view.current_actor)
      : null;

  return (
    <div className="statusbar">
      <div className="statusbar-item">
        <span className="label">street</span>
        <span className="statusbar-val">{view.phase}</span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">to act</span>
        <span className="statusbar-val statusbar-val--accent">
          {actor ? actor.name : "—"}
        </span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">main pot</span>
        <span className="statusbar-val">${view.pot.toLocaleString()}</span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">last</span>
        <span className="statusbar-val statusbar-val--mono">
          {view.last_action_text ?? "—"}
        </span>
      </div>
      <div className="statusbar-spacer" />
      <div className="statusbar-item">
        <span className="meta">details in tabs →</span>
      </div>
    </div>
  );
}
