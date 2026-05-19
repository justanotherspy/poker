"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useSpectatorState } from "@/lib/useSpectatorState";
import { usePlayerState } from "@/lib/usePlayerState";
import type { PlayerMode } from "@/lib/types";
import { ActionBar } from "./ActionBar";
import { EndOfHandBar } from "./EndOfHandBar";
import { GameMenuModal } from "./GameMenuModal";
import { LoginModal } from "./LoginModal";
import { Rail } from "./Rail";
import { StatusBar } from "./StatusBar";
import { Table } from "./Table";
import { Topbar } from "./Topbar";

type Theme = "light" | "dark";

export function SpectatorPage() {
  return (
    <AuthProvider>
      <SpectatorPageInner />
    </AuthProvider>
  );
}

function SpectatorPageInner() {
  const { hash, ready } = useAuth();
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "dark" || t === "light") setTheme(t);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  if (!ready) {
    return <div className="spectator-shell" />;
  }

  if (!hash) {
    return (
      <div className="spectator-shell">
        <LoginModal />
      </div>
    );
  }

  return <AuthedShell theme={theme} onToggleTheme={toggleTheme} />;
}

function AuthedShell({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [gameId, setGameIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("game");
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>("spectator");

  const { view, connectionState, gameMissing } = useSpectatorState(gameId);
  const { logout } = useAuth();

  const {
    seatId: heroSeatId,
    playerView,
    claimSeat,
    releaseSeat,
    act,
    say,
  } = usePlayerState(gameId);

  const setGameId = useCallback((next: string | null) => {
    setGameIdState(next);
    try {
      const url = new URL(window.location.href);
      if (next === null) {
        url.searchParams.delete("game");
      } else {
        url.searchParams.set("game", next);
      }
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (gameMissing) {
      setGameId(null);
      setMenuOpen(true);
    }
  }, [gameMissing, setGameId]);

  // When switching to spectator mode, release the seat.
  const handleSetPlayerMode = (mode: PlayerMode) => {
    setPlayerMode(mode);
    if (mode === "spectator") {
      releaseSeat();
    }
  };

  const handleClaimSeat = async (_seatId: number) => {
    if (!gameId) return;
    await claimSeat(gameId);
  };

  const heroSeat = heroSeatId != null
    ? view?.seats.find((s) => s.seat_id === heroSeatId) ?? null
    : null;

  const showActionBar =
    playerMode === "player" && heroSeat != null && view != null && playerView != null;
  const showEndBar =
    playerMode === "player" && heroSeat != null && view?.phase === "ended";

  const bottomBar = () => {
    if (!view) return <EmptyStatus />;
    if (playerMode === "spectator") return <StatusBar view={view} />;
    if (showEndBar && heroSeat) {
      return <EndOfHandBar view={view} heroSeat={heroSeat} />;
    }
    if (showActionBar && playerView && heroSeat) {
      return (
        <ActionBar
          view={view}
          playerView={playerView}
          heroSeat={heroSeat}
          onAct={act}
          onSay={say}
        />
      );
    }
    // Player mode, no seat yet
    return (
      <div className="statusbar">
        <div className="statusbar-item">
          <span className="meta">click an open seat to join the game</span>
        </div>
      </div>
    );
  };

  return (
    <div className="spectator-shell">
      <Topbar
        view={view}
        theme={theme}
        onToggleTheme={onToggleTheme}
        connectionState={connectionState}
        onOpenGames={() => setMenuOpen(true)}
        onLogout={logout}
        playerMode={playerMode}
        onSetPlayerMode={handleSetPlayerMode}
        heroSeat={heroSeat}
      />
      <main className="proto-main">
        <section className="proto-stage">
          <div className="stage-felt-wrap">
            {view ? (
              <Table
                view={view}
                feltW={720}
                playerMode={playerMode}
                heroSeatId={heroSeatId}
                onClaimSeat={handleClaimSeat}
              />
            ) : (
              <EmptyTable onOpenGames={() => setMenuOpen(true)} />
            )}
          </div>
          {bottomBar()}
        </section>
        {view ? (
          <Rail
            view={view}
            playerContext={
              playerMode === "player" && heroSeat != null
                ? { onSay: say }
                : undefined
            }
          />
        ) : (
          <EmptyRail />
        )}
      </main>
      <GameMenuModal
        open={menuOpen}
        currentGameId={gameId}
        onClose={() => setMenuOpen(false)}
        onSelect={setGameId}
      />
    </div>
  );
}

function EmptyTable({ onOpenGames }: { onOpenGames: () => void }) {
  return (
    <div
      style={{
        fontFamily: "var(--serif)",
        fontSize: 18,
        color: "var(--text-2)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <span>No game selected.</span>
      <button className="modal-button modal-button--primary" onClick={onOpenGames}>
        open games menu
      </button>
    </div>
  );
}

function EmptyStatus() {
  return (
    <div className="statusbar">
      <div className="statusbar-item">
        <span className="meta">no active game</span>
      </div>
    </div>
  );
}

function EmptyRail() {
  return (
    <aside className="rail">
      <div className="rail-tabs">
        <button className="rail-tab is-active">Chat</button>
        <button className="rail-tab">History</button>
        <button className="rail-tab">Stats</button>
      </div>
      <div className="rail-body">
        <div className="panel">
          <div className="panel-body">
            <div className="chat-empty">no active game</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
