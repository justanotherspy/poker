// Casino-style chip + greedy-denomination ChipStack.
// Ported from design/project/proto-shared.jsx:50-118.

import type { CSSProperties } from "react";

interface ChipPalette {
  face: string;
  edge: string;
  text: string;
}

const PALETTE: Record<number, ChipPalette> = {
  1: { face: "var(--chip-white)", edge: "var(--chip-white-edge)", text: "var(--text)" },
  5: { face: "var(--chip-red)", edge: "var(--chip-red-edge)", text: "#fff" },
  25: { face: "var(--chip-green)", edge: "var(--chip-green-edge)", text: "#fff" },
  100: { face: "var(--chip-black)", edge: "var(--chip-black-edge)", text: "#fff" },
  500: { face: "var(--chip-purple)", edge: "var(--chip-purple-edge)", text: "#fff" },
  1000: { face: "var(--accent)", edge: "var(--accent-edge)", text: "#fff" },
};

export function Chip({
  denom = 25,
  size = 22,
  style = {},
}: {
  denom?: number;
  size?: number;
  style?: CSSProperties;
}) {
  const p = PALETTE[denom] ?? PALETTE[25];
  return (
    <span
      className="chip"
      style={{ width: size, height: size, background: p.face, ...style }}
    >
      <span
        className="chip-stripes"
        style={{
          background: `conic-gradient(${p.edge} 0 15deg, transparent 0 45deg, ${p.edge} 0 60deg, transparent 0 90deg, ${p.edge} 0 105deg, transparent 0 135deg, ${p.edge} 0 150deg, transparent 0 180deg, ${p.edge} 0 195deg, transparent 0 225deg, ${p.edge} 0 240deg, transparent 0 270deg, ${p.edge} 0 285deg, transparent 0 315deg, ${p.edge} 0 330deg, transparent 0 360deg)`,
        }}
      />
      <span className="chip-core" style={{ color: p.text }}>
        {denom}
      </span>
    </span>
  );
}

// Greedy denomination packer, max 5 visible chips. Bottom-up render so
// the largest denom sits on the bottom of the stack.
export function ChipStack({
  amount = 0,
  scale = 1,
}: {
  amount?: number;
  scale?: number;
}) {
  const denoms = [1000, 500, 100, 25, 5, 1];
  const picks: number[] = [];
  let rem = amount;
  for (const d of denoms) {
    while (rem >= d && picks.length < 5) {
      picks.push(d);
      rem -= d;
    }
  }
  if (!picks.length) picks.push(1);
  const size = 22 * scale;
  const offset = 4 * scale;
  const stack = picks.slice().reverse();
  return (
    <span
      className="chip-stack"
      style={{
        width: size,
        height: size + (stack.length - 1) * offset,
      }}
    >
      {stack.map((d, i) => (
        <Chip
          key={i}
          denom={d}
          size={size}
          style={{ position: "absolute", left: 0, bottom: i * offset }}
        />
      ))}
    </span>
  );
}
