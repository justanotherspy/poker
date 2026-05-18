// Top-level orchestrator for the spectator route.
//
// Wraps the tree in <AuthProvider> so the login hash is available to the
// API client and WS hook. Renders <LoginModal> when no hash is present.
// Otherwise reads ?game=<id> from the URL, subscribes to that game via
// useSpectatorState, and exposes a Games button (in the Topbar) that
// opens <GameMenuModal> for create/delete/switch.

"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useSpectatorState } from "@/lib/useSpectatorState";
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
  const { view, connectionState, gameMissing } = useSpectatorState(gameId);
  const { logout } = useAuth();

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

  // If the watched game vanishes (deleted from another tab, or we just
  // deleted it), drop selection and bounce back to the menu.
  useEffect(() => {
    if (gameMissing) {
      setGameId(null);
      setMenuOpen(true);
    }
  }, [gameMissing, setGameId]);

  return (
    <div className="spectator-shell">
      <Topbar
        view={view}
        theme={theme}
        onToggleTheme={onToggleTheme}
        connectionState={connectionState}
        onOpenGames={() => setMenuOpen(true)}
        onLogout={logout}
      />
      <main className="proto-main">
        <section className="proto-stage">
          <div className="stage-felt-wrap">
            {view ? (
              <Table view={view} feltW={720} />
            ) : (
              <EmptyTable onOpenGames={() => setMenuOpen(true)} />
            )}
          </div>
          {view ? <StatusBar view={view} /> : <EmptyStatus />}
        </section>
        {view ? <Rail view={view} /> : <EmptyRail />}
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
