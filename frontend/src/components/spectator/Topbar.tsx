// Topbar — brand, table context, hand number, connection indicator,
// theme toggle, plus games-menu and logout controls.

"use client";

import type { ConnectionState } from "@/lib/useSpectatorState";
import type { PlayerMode, SpectatorSeat, SpectatorView } from "@/lib/types";

export function Topbar({
  view,
  theme,
  onToggleTheme,
  connectionState,
  onOpenGames,
  onLogout,
  playerMode,
  onSetPlayerMode,
  heroSeat,
}: {
  view: SpectatorView | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  connectionState: ConnectionState;
  onOpenGames: () => void;
  onLogout: () => void;
  playerMode: PlayerMode;
  onSetPlayerMode: (mode: PlayerMode) => void;
  heroSeat?: SpectatorSeat | null;
}) {
  const tableLabel = view
    ? `table #${view.table_id.slice(0, 8)} · ${view.seats.length}-max NLH`
    : "no active table";
  const connCls =
    connectionState === "live"
      ? "conn-pill conn-pill--live"
      : connectionState === "reconnecting"
        ? "conn-pill conn-pill--reconnecting"
        : "conn-pill";

  const contextLabel =
    playerMode === "player" && heroSeat
      ? `seat ${heroSeat.seat_id} · ${heroSeat.name} · ${heroSeat.position}`
      : playerMode === "player"
        ? "player — select a seat"
        : "spectating";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 1.4c1.6 2.5 4.4 4.4 4.4 7 0 1.5-1 2.7-2.4 2.7-.6 0-1.1-.2-1.5-.5l.5 2.8h-2l.5-2.8c-.4.3-.9.5-1.5.5-1.4 0-2.4-1.2-2.4-2.7 0-2.6 2.8-4.5 4.4-7z" />
            </svg>
          </span>
          <span className="brand-name">
            justanotherspy <span className="brand-sep">/</span> poker
          </span>
        </div>
        <span className="topbar-sep">·</span>
        <span className="topbar-context">
          {contextLabel}{" "}
          {playerMode === "spectator" && (
            <span className="meta">{tableLabel}</span>
          )}
        </span>
      </div>
      <div className="topbar-right">
        {view && <span className="meta">hand #{view.hand_number}</span>}
        <span className={connCls}>{connectionState}</span>
        {view && (
          <div className="seg-group">
            <button
              className={`seg seg--sm${playerMode === "spectator" ? " is-active" : ""}`}
              onClick={() => onSetPlayerMode("spectator")}
            >
              spectator
            </button>
            <button
              className={`seg seg--sm${playerMode === "player" ? " is-active" : ""}`}
              onClick={() => onSetPlayerMode("player")}
            >
              player
            </button>
          </div>
        )}
        <button className="topbar-button" onClick={onOpenGames}>
          games
        </button>
        <button className="topbar-button" onClick={onLogout} title="log out">
          logout
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="toggle theme"
        >
          {theme === "light" ? (
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M16 11a6 6 0 1 1-7-7 5 5 0 0 0 7 7z" fill="currentColor" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="10" cy="10" r="3.5" fill="currentColor" />
              <g strokeLinecap="round">
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M3.9 16.1l1.4-1.4M14.7 5.3l1.4-1.4" />
              </g>
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
