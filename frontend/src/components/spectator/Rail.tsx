// Right rail with tabs. Spectator round-1 tabs: Chat / History / Stats.

"use client";

import { useState, type ReactNode } from "react";
import type { SpectatorView } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { StatsPanel } from "./StatsPanel";

interface Tab {
  key: string;
  label: string;
  badge: number | null;
  render: () => ReactNode;
}

export function Rail({
  view,
  playerContext,
}: {
  view: SpectatorView;
  playerContext?: { onSay: (phraseId: number) => Promise<void> };
}) {
  const [active, setActive] = useState(0);
  const tabs: Tab[] = [
    {
      key: "chat",
      label: "Chat",
      badge: view.chat.length > 0 ? view.chat.length : null,
      render: () => <ChatPanel chat={view.chat} playerContext={playerContext} />,
    },
    {
      key: "history",
      label: "History",
      badge: null,
      render: () => <HistoryPanel view={view} />,
    },
    {
      key: "stats",
      label: "Stats",
      badge: null,
      render: () => <StatsPanel view={view} />,
    },
  ];

  return (
    <aside className="rail">
      <div className="rail-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            className={`rail-tab${i === active ? " is-active" : ""}`}
            onClick={() => setActive(i)}
          >
            {t.label}
            {t.badge != null && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9.5,
                  background: "var(--accent)",
                  color: "#fff",
                  padding: "1px 5px",
                  borderRadius: 999,
                  fontFamily: "var(--mono)",
                  fontWeight: 700,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="rail-body">{tabs[active]?.render()}</div>
    </aside>
  );
}
