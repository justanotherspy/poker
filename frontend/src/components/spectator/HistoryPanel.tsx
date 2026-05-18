// Hand history — grouped per street, with a dashed marker row at each
// board deal showing the new card(s).

import type { HistoryEntry, SpectatorView } from "@/lib/types";
import { parseCard } from "./Card";

function renderText(text: string, marker: boolean): React.ReactNode {
  if (!marker) return text;
  // Marker text is a space-separated list of 2-char card codes.
  const parts = text.split(/\s+/).filter(Boolean);
  return parts
    .map((c) => {
      const { rank, suit } = parseCard(c);
      return `${rank}${suit}`;
    })
    .join(" ");
}

export function HistoryPanel({ view }: { view: SpectatorView }) {
  const entries: HistoryEntry[] = view.history;
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">hand history</span>
        <span className="meta">
          #{view.hand_number} · {view.phase}
        </span>
      </div>
      <div className="panel-body history-stream">
        {entries.length === 0 ? (
          <div className="hist-empty">No actions yet.</div>
        ) : (
          entries.map((e, i) => (
            <div
              key={i}
              className={`hist-line${e.marker ? " is-marker" : ""}`}
            >
              <span className="hist-street">{e.street}</span>
              <span className="hist-text">{renderText(e.text, e.marker)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
