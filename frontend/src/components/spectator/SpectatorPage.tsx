// Top-level orchestrator for the spectator route. Reads live view from
// the WebSocket hook, manages theme state, lays out topbar / stage /
// rail.

"use client";

import { useEffect, useState } from "react";
import { useSpectatorState } from "@/lib/useSpectatorState";
import { Rail } from "./Rail";
import { StatusBar } from "./StatusBar";
import { Table } from "./Table";
import { Topbar } from "./Topbar";

type Theme = "light" | "dark";

export function SpectatorPage() {
  const { view, connectionState } = useSpectatorState();
  const [theme, setTheme] = useState<Theme>("light");

  // Read persisted theme on mount (avoids the pre-paint script's value
  // being overwritten by React's initial render).
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

  return (
    <div className="spectator-shell">
      <Topbar
        view={view}
        theme={theme}
        onToggleTheme={toggleTheme}
        connectionState={connectionState}
      />
      <main className="proto-main">
        <section className="proto-stage">
          <div className="stage-felt-wrap">
            {view ? <Table view={view} feltW={720} /> : <EmptyTable />}
          </div>
          {view ? <StatusBar view={view} /> : <EmptyStatus />}
        </section>
        {view ? <Rail view={view} /> : <EmptyRail />}
      </main>
    </div>
  );
}

function EmptyTable() {
  return (
    <div
      style={{
        fontFamily: "var(--serif)",
        fontSize: 18,
        color: "var(--text-2)",
      }}
    >
      Waiting for an active table…
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
