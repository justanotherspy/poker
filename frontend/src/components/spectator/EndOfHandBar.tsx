import type { SpectatorSeat, SpectatorView } from "@/lib/types";

export function EndOfHandBar({
  view,
  heroSeat,
}: {
  view: SpectatorView;
  heroSeat: SpectatorSeat;
}) {
  const won = (heroSeat.won_amount ?? 0) > 0;
  const winnerName = view.winner_names?.[0] ?? "—";
  const winnerSeat = view.seats.find((s) => s.name === winnerName);

  return (
    <div className={`endbar${won ? " endbar--won" : ""}`}>
      <div className="endbar-left">
        <div className="endbar-headline">
          {won ? (
            <>
              You win <b>${(heroSeat.won_amount ?? 0).toLocaleString()}</b>
              {heroSeat.hand_rank && <> · {heroSeat.hand_rank}</>}
            </>
          ) : (
            <>
              {winnerName} wins <b>${view.pot.toLocaleString()}</b>
              {winnerSeat?.hand_rank && <> · {winnerSeat.hand_rank}</>}
            </>
          )}
        </div>
        <div className="endbar-sub">
          Next hand starting soon.
        </div>
      </div>
      <div className="endbar-right">
        <span className="meta" style={{ fontSize: 12, color: "var(--text-2)" }}>
          next hand auto-deals
        </span>
      </div>
    </div>
  );
}
