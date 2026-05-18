// Dealer button + SB/BB blind tokens, pinned to the bottom-right corner
// of a seat. Ported from design/project/proto-shared.jsx:121-134.

export function DealerButton({ size = 24 }: { size?: number }) {
  return (
    <span className="dealer-btn" style={{ width: size, height: size }}>
      <span>D</span>
    </span>
  );
}

export function BlindToken({ kind, size = 22 }: { kind: "SB" | "BB"; size?: number }) {
  return (
    <span
      className={`blind-token blind-token--${kind.toLowerCase()}`}
      style={{ width: size, height: size }}
    >
      {kind}
    </span>
  );
}

export function SeatTokens({
  isDealer,
  blind,
}: {
  isDealer: boolean;
  blind: "SB" | "BB" | null;
}) {
  if (!isDealer && !blind) return null;
  return (
    <div className="seat-tokens">
      {isDealer && <DealerButton size={24} />}
      {blind === "SB" && <BlindToken kind="SB" size={22} />}
      {blind === "BB" && <BlindToken kind="BB" size={22} />}
    </div>
  );
}
