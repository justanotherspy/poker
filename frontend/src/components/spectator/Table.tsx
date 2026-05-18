// Composed table: felt SVG, community board, pot, seat ring with bet
// chip stacks. Ported from design/project/proto-table.jsx but trimmed to
// the spectator/showdown subset.

import type { SpectatorView } from "@/lib/types";
import { SEAT_LAYOUT } from "@/lib/seatLayout";
import { Card, CardSlot } from "./Card";
import { ChipStack } from "./Chip";
import { Seat } from "./Seat";

function Felt({ w, h }: { w: number; h: number }) {
  const id = `felt-grad-${w}-${h}`;
  return (
    <svg className="felt-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <defs>
        <radialGradient id={id} cx="50%" cy="48%" r="58%">
          <stop offset="0%" stopColor="var(--felt-center)" />
          <stop offset="100%" stopColor="var(--felt-edge)" />
        </radialGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width={w - 4}
        height={h - 4}
        rx={(h - 4) / 2}
        fill="var(--felt-rim)"
      />
      <rect
        x="14"
        y="14"
        width={w - 28}
        height={h - 28}
        rx={(h - 28) / 2}
        fill={`url(#${id})`}
      />
      <rect
        x="22"
        y="22"
        width={w - 44}
        height={h - 44}
        rx={(h - 44) / 2}
        fill="none"
        stroke="var(--felt-line)"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
}

function Board({ cards }: { cards: string[] }) {
  return (
    <div className="board">
      {[0, 1, 2, 3, 4].map((i) =>
        cards[i] ? <Card key={i} card={cards[i]} size="lg" /> : <CardSlot key={i} size="lg" />
      )}
    </div>
  );
}

function Pot({
  amount,
  collected,
  winnerName,
}: {
  amount: number;
  collected: boolean;
  winnerName: string | null;
}) {
  if (collected) {
    return (
      <div className="pot pot--collected">
        <span className="pot-label">collected</span>
        <span className="pot-amt">
          <span className="pot-amt-sign">$</span>
          {amount.toLocaleString()}
        </span>
        {winnerName && <span className="pot-side">→ {winnerName}</span>}
      </div>
    );
  }
  return (
    <div className="pot">
      <span className="pot-label">pot</span>
      <span className="pot-amt">
        <span className="pot-amt-sign">$</span>
        {amount.toLocaleString()}
      </span>
    </div>
  );
}

function stageText(view: SpectatorView): string {
  if (view.phase === "ended") return "showdown · hand complete";
  const actorName =
    view.current_actor != null
      ? view.seats.find((s) => s.seat_id === view.current_actor)?.name
      : null;
  return actorName
    ? `${view.phase} · ${actorName} to act`
    : `${view.phase} · waiting`;
}

export function Table({
  view,
  feltW = 720,
}: {
  view: SpectatorView;
  feltW?: number;
}) {
  const feltH = Math.round(feltW * 0.47);
  const ringW = feltW + 360;
  const ringH = feltH + 290;
  const cx = ringW / 2;
  const cy = ringH / 2;

  const showdown = view.phase === "ended";
  const winnerName = view.winner_names?.[0] ?? null;

  return (
    <div
      className={`table-ring${showdown ? " is-showdown" : ""}`}
      style={{ width: ringW, height: ringH }}
    >
      <div
        className="table-felt"
        style={{ left: cx - feltW / 2, top: cy - feltH / 2 }}
      >
        <Felt w={feltW} h={feltH} />
        <div className="table-center">
          <span className="table-stage">{stageText(view)}</span>
          <Pot
            amount={view.pot}
            collected={showdown}
            winnerName={winnerName}
          />
          <Board cards={view.board} />
        </div>
      </div>

      {/* Per-seat bet chip stacks on the felt (only while hand active). */}
      {!showdown &&
        view.seats.map((p, i) => {
          const L = SEAT_LAYOUT[i];
          if (!L || !p.bet) return null;
          return (
            <div
              key={`bet-${i}`}
              className="table-seatbet-wrap"
              style={{ left: cx + L.chipX, top: cy + L.chipY }}
            >
              <ChipStack amount={p.bet} scale={0.85} />
            </div>
          );
        })}

      {view.seats.map((p, i) => {
        const L = SEAT_LAYOUT[i];
        if (!L) return null;
        return (
          <div
            key={`seat-${i}`}
            className={`table-seat table-seat--${L.align}`}
            style={{ left: cx + L.x, top: cy + L.y }}
          >
            <Seat p={p} showdown={showdown} />
            {!showdown && p.bet > 0 && (
              <span className="seat-bet-badge">
                <span className="seat-bet-badge-sign">$</span>
                {p.bet.toLocaleString()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
