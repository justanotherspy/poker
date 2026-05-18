// Playing card primitive. Renders a face card (rank + suit) or a
// facedown back, sized via the `size` prop.
//
// Backend card strings are 2 chars: rank in "23456789TJQKA" and suit in
// "shdc" (e.g., "Tc", "Ad"). We translate to the prototype's display:
// suit glyphs ♠ ♥ ♦ ♣.

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SUIT_GLYPH: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function parseCard(s: string): { rank: string; suit: string; isRed: boolean } {
  const rank = s.charAt(0);
  const suitChar = s.charAt(1).toLowerCase();
  const suit = SUIT_GLYPH[suitChar] ?? suitChar;
  return { rank, suit, isRed: suitChar === "h" || suitChar === "d" };
}

export function Card({
  card,
  size = "md",
  facedown = false,
}: {
  card?: string;
  size?: Size;
  facedown?: boolean;
}) {
  if (facedown || !card) {
    return <span className="pc pc--back" data-size={size} />;
  }
  const { rank, suit, isRed } = parseCard(card);
  return (
    <span className={`pc${isRed ? " pc--red" : ""}`} data-size={size}>
      <span className="pc-corner pc-corner--tl">
        <span className="pc-rank">{rank}</span>
        <span className="pc-suit">{suit}</span>
      </span>
      <span className="pc-center">{suit}</span>
      <span className="pc-corner pc-corner--br">
        <span className="pc-rank">{rank}</span>
        <span className="pc-suit">{suit}</span>
      </span>
    </span>
  );
}

export function CardSlot({ size = "md" }: { size?: Size }) {
  return (
    <span className="pc-slot" data-size={size}>
      <svg
        viewBox="0 0 20 20"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      >
        <rect x="3" y="2" width="14" height="16" rx="2" />
      </svg>
    </span>
  );
}
