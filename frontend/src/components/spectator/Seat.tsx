// Seat — avatar, name, position, stack, hole cards, last action, badges.
// Showdown: winners get a halo + amount banner; losers stay slightly dim
// and reveal their hand rank.

import type { SpectatorSeat } from "@/lib/types";
import { Card } from "./Card";
import { SeatTokens } from "./DealerBlindTokens";

export function Seat({
  p,
  showdown,
}: {
  p: SpectatorSeat;
  showdown: boolean;
}) {
  const isWinner = showdown && (p.won_amount ?? 0) > 0;
  const isLoser = showdown && !p.folded && !isWinner && p.shows_cards;

  const cls = [
    "seat",
    p.folded ? "is-folded" : "",
    p.to_act ? "is-to-act" : "",
    isWinner ? "is-winner" : "",
    isLoser ? "is-loser" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {p.to_act && !showdown && (
        <div className="seat-toact">
          <span className="seat-toact-pulse" />
          to act
        </div>
      )}
      {isWinner && (
        <div className="seat-winner-banner">
          <span className="seat-winner-amt">
            +${(p.won_amount ?? 0).toLocaleString()}
          </span>
          <span className="seat-winner-label">wins</span>
        </div>
      )}

      <div className="seat-row">
        <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
          {p.initials}
        </span>
        <div className="seat-id">
          <div className="seat-name">{p.name}</div>
          <div className="seat-meta">
            <span className="seat-stack">
              <span className="seat-stack-sign">$</span>
              {p.stack.toLocaleString()}
            </span>
            <span className="seat-pos">{p.position}</span>
          </div>
        </div>
      </div>

      <div className="seat-hand">
        <span className="seat-holecards">
          {p.folded
            ? p.hole_cards.map((_, i) => <Card key={i} facedown size="sm" />)
            : p.hole_cards.map((c, i) => <Card key={i} card={c} size="sm" />)}
        </span>

        {showdown && p.hand_rank ? (
          <span className="seat-action seat-action--showdown">
            <span className="sd-line1">{p.hand_rank}</span>
          </span>
        ) : (
          p.last_action && (
            <span className="seat-action">{p.last_action}</span>
          )
        )}
      </div>

      <SeatTokens isDealer={p.is_dealer} blind={p.blind} />
    </div>
  );
}
