// proto-shared.jsx — Mid-fi prototype atoms
// Real type, clean lines, theme-aware via CSS custom properties on .proto root.

const { useState, useMemo, useEffect, useRef } = React;

// ── Card (face / back) ─────────────────────────────────────────────
// A real-feel playing card with a face index and a textured back.
// Dark mode swaps the face to a dark tone — Dan's "dark theme invariant".
// Sizes bumped up (Dan: "all the cards could be a little bigger").
function Card({ rank = "A", suit = "♠", facedown = false, size = "md", style = {} }) {
  const sz = { xs: [26, 38], sm: [34, 48], md: [44, 62], lg: [60, 84], xl: [72, 100] }[size] || [44, 62];
  const isRed = suit === "♥" || suit === "♦";
  const w = sz[0], h = sz[1];

  if (facedown) {
    return (
      <span className="pc pc--back" style={{ width: w, height: h, ...style }}>
        <span className="pc-back-pattern" />
      </span>
    );
  }
  return (
    <span className={`pc${isRed ? " pc--red" : ""}`} style={{ width: w, height: h, ...style }}>
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

// Empty card slot — clearly visible in both themes (Dan: too faint in dark)
function CardSlot({ size = "md", style = {} }) {
  const sz = { xs: [22, 32], sm: [28, 40], md: [38, 54], lg: [52, 72], xl: [64, 90] }[size] || [38, 54];
  return (
    <span className="pc-slot" style={{ width: sz[0], height: sz[1], ...style }}>
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="3" y="2" width="14" height="16" rx="2" />
      </svg>
    </span>
  );
}

// ── Chip — a single casino-style chip with stripes and a denomination ───
function Chip({ denom = 25, size = 22, style = {} }) {
  // map denom to color + stripes
  const palette = {
    1:    { face: "var(--chip-white)",  edge: "var(--chip-white-edge)",  text: "var(--text)" },
    5:    { face: "var(--chip-red)",    edge: "var(--chip-red-edge)",    text: "#fff" },
    25:   { face: "var(--chip-green)",  edge: "var(--chip-green-edge)",  text: "#fff" },
    100:  { face: "var(--chip-black)",  edge: "var(--chip-black-edge)",  text: "#fff" },
    500:  { face: "var(--chip-purple)", edge: "var(--chip-purple-edge)", text: "#fff" },
    1000: { face: "var(--accent)",      edge: "var(--accent-edge)",      text: "#fff" },
  };
  const p = palette[denom] || palette[25];
  const s = size;
  return (
    <span className="chip" style={{ width: s, height: s, background: p.face, ...style }}>
      <span className="chip-stripes" style={{
        background: `conic-gradient(${p.edge} 0 15deg, transparent 0 45deg, ${p.edge} 0 60deg, transparent 0 90deg, ${p.edge} 0 105deg, transparent 0 135deg, ${p.edge} 0 150deg, transparent 0 180deg, ${p.edge} 0 195deg, transparent 0 225deg, ${p.edge} 0 240deg, transparent 0 270deg, ${p.edge} 0 285deg, transparent 0 315deg, ${p.edge} 0 330deg, transparent 0 360deg)`,
      }} />
      <span className="chip-core" style={{ color: p.text }}>{denom}</span>
    </span>
  );
}

// ── ChipStack — a small pile of chips representing a bet on the felt ─
// Given a $ amount, picks a few denominations and stacks them visually.
// `showAmt` controls the floating amount label — turned OFF on the felt
// chip stacks (Dan: the label was overlapping the community cards) and
// instead rendered under each seat as a separate badge.
function ChipStack({ amount = 1200, scale = 1, showAmt = true }) {
  // pick chips greedily from highest denom down, max 5 visible
  const denoms = [1000, 500, 100, 25, 5, 1];
  const picks = [];
  let rem = amount;
  for (const d of denoms) {
    while (rem >= d && picks.length < 5) {
      picks.push(d);
      rem -= d;
    }
  }
  if (!picks.length) picks.push(1);
  const size = 22 * scale;
  const offset = 4 * scale; // vertical offset per chip in the stack
  // render bottom-up so largest denom is on bottom, smallest on top
  const stack = picks.slice().reverse();
  return (
    <span className="chip-stack" style={{
      display: "inline-block",
      position: "relative",
      width: size,
      height: size + (stack.length - 1) * offset,
      verticalAlign: "bottom",
    }}>
      {stack.map((d, i) => (
        <Chip key={i} denom={d} size={size} style={{
          position: "absolute",
          left: 0,
          bottom: i * offset,
        }} />
      ))}
      {showAmt && (
        <span className="chip-stack-amt" style={{
          position: "absolute",
          left: "50%",
          bottom: (stack.length - 1) * offset + size + 4,
          transform: "translateX(-50%)",
        }}>${amount.toLocaleString()}</span>
      )}
    </span>
  );
}

// ── Dealer button (the "D") and blind tokens (SB / BB) ──────────────
function DealerButton({ size = 26, style = {} }) {
  return (
    <span className="dealer-btn" style={{ width: size, height: size, ...style }}>
      <span>D</span>
    </span>
  );
}
function BlindToken({ kind = "SB", size = 22, style = {} }) {
  return (
    <span className={`blind-token blind-token--${kind.toLowerCase()}`} style={{ width: size, height: size, ...style }}>
      {kind}
    </span>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────
function Avatar({ initials = "JS", size = 32, hero = false, style = {} }) {
  return (
    <span className={`avatar${hero ? " avatar--hero" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, ...style }}>
      {initials}
    </span>
  );
}

// ── Button ─────────────────────────────────────────────────────────
function Button({ variant = "default", size = "md", children, style = {}, ...rest }) {
  return (
    <button
      className={`btn btn--${variant} btn--${size}`}
      style={style}
      {...rest}
    >{children}</button>
  );
}

// ── Toggle (switch) and Pill ───────────────────────────────────────
function Toggle({ checked = false, onChange, label, kbd, hint }) {
  return (
    <label className="toggle">
      <span className="toggle-track" data-on={checked || undefined} onClick={() => onChange && onChange(!checked)}>
        <span className="toggle-knob" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
      {hint && <span className="toggle-hint">{hint}</span>}
      {kbd && <span className="kbd">{kbd}</span>}
    </label>
  );
}

function Pill({ children, tone = "default", style = {} }) {
  return <span className={`pill pill--${tone}`} style={style}>{children}</span>;
}

// ── Sample data ────────────────────────────────────────────────────
// `kind` distinguishes human vs Claude agent. Agents carry model + persona
// + token usage + an internal-thoughts feed (spectator-only, polled from
// the game server's agent introspection API).
const PLAYERS = [
  { seat: 0, initials: "K0", name: "k0rax",    stack: 8420,  bet: 0,    pos: "UTG", hand: [["Q","♣"],["J","♣"]], action: "checks",       eq: 14, kind: "agent", model: "claude-haiku-4.5",   persona: "tight-aggressive grinder",     tokensIn: 18420, tokensOut: 2104 },
  { seat: 1, initials: "WH", name: "whiskey",  stack: 5100,  bet: 0,    pos: "MP",  hand: [["7","♦"],["7","♥"]], action: "folds",        eq: 0,  folded: true, kind: "human" },
  { seat: 2, initials: "MI", name: "mira",     stack: 11250, bet: 1200, pos: "CO",  hand: [["A","♥"],["Q","♦"]], action: "bets $1,200",  eq: 41, kind: "agent", model: "claude-sonnet-4.5", persona: "loose-aggressive bluffer",    tokensIn: 24180, tokensOut: 3892 },
  { seat: 3, initials: "JS", name: "spy_07",   stack: 12400, bet: 300,  pos: "BTN", hand: [["A","♠"],["K","♠"]], action: "to act",       eq: 38, hero: true, toAct: true, timer: 18, button: true, kind: "human" },
  { seat: 4, initials: "NI", name: "nine",     stack: 6300,  bet: 50,   pos: "SB",  hand: [["5","♠"],["5","♦"]], action: "folds",        eq: 0,  folded: true, blind: "SB", kind: "agent", model: "claude-opus-4",     persona: "calculating nit",            tokensIn: 12044, tokensOut: 1320 },
  { seat: 5, initials: "DE", name: "redacted", stack: 9800,  bet: 1200, pos: "BB",  hand: [["T","♣"],["9","♣"]], action: "calls $1,200", eq: 7,  blind: "BB", kind: "agent", model: "claude-sonnet-4.5", persona: "opaque, signals minimally",   tokensIn: 21307, tokensOut: 2810 },
];

// Mock internal-thoughts feed for agents — polled from the server in real
// implementation. Each thought is timestamped to the hand street.
const AGENT_THOUGHTS = {
  k0rax: [
    { street: "pre",  text: "UTG with QJ suited. Marginal open here — fold equity is poor 6-handed." },
    { street: "pre",  text: "Folding. Save chips for a stronger spot in position." },
  ],
  mira: [
    { street: "pre",  text: "AQo from CO. Standard open size: 2.5x. spy_07 is on the button and likely 3-bets light." },
    { street: "pre",  text: "Flat-calling spy_07's raise. AQo plays OK out of position vs a button range." },
    { street: "flop", text: "A♠ K♦ 7♣. Top pair good kicker, but K hits BTN range hard." },
    { street: "flop", text: "Check-call to keep his bluffs in." },
    { street: "turn", text: "2♥ blank. Time to lead — he checked back flop, his range is capped." },
    { street: "turn", text: "Sized $1,200 — about 0.6 pot. Targets KQ, KJ, A-rag for value; folds weak Ax bluffs." },
  ],
  nine: [
    { street: "pre",  text: "55 from SB. Set-mine candidate, but multi-way odds are not there with raise + caller." },
    { street: "pre",  text: "Folding. Negative EV to peel here." },
  ],
  redacted: [
    { street: "pre",  text: "T9s from BB. Closing action for 250 more into a multi-way pot. Excellent price." },
    { street: "flop", text: "A♠ K♦ 7♣ — gutterball draw with J. Folded to bet, easy fold." },
  ],
};

// Where each seat sits relative to the felt center.
// (x, y) are offsets in px from felt center to the seat card anchor.
// chipX/chipY are where the bet chip stack sits (closer to center).
// Dan: side chips were too close to the community cards — pushed the
// side seats' chip stacks further out toward their seats.
// Dan (round 4): the bot-center seat's chip stack sat in the same
// vertical column as the to-act / winner banner. Offset to the right
// of the seat for visibility.
const SEAT_LAYOUT = [
  // 0 top-center — chip offset to the right so it doesn't sit directly
  // under any banner above/below the seat
  { x: 0,    y: -180, chipX: 90,   chipY: -130, align: "top" },
  // 1 top-right
  { x: 330,  y: -118, chipX: 195,  chipY: -64,  align: "topright" },
  // 2 bottom-right
  { x: 330,  y: 118,  chipX: 195,  chipY: 64,   align: "botright" },
  // 3 bottom-center (hero) — chip offset to the right (Dan)
  { x: 0,    y: 185,  chipX: 100,  chipY: 130,  align: "bot" },
  // 4 bottom-left
  { x: -330, y: 118,  chipX: -195, chipY: 64,   align: "botleft" },
  // 5 top-left
  { x: -330, y: -118, chipX: -195, chipY: -64,  align: "topleft" },
];

// Showdown — what we render in the "end of hand" view (Dan: prototype
// what happens when a player wins). Hero spy_07 takes the pot with a
// flopped two-pair (AKQ7 + 2). Hand strengths are sorted descending.
// Stored as two parts (Dan: "two pair, [newline] aces & kings" — the
// hand name on the first line, the specific cards on the second).
const SHOWDOWN = {
  pot: 4200,
  winners: ["spy_07"],
  hands: {
    spy_07:   { rankName: "two pair",    kicker: "aces & kings",        win: true,  shows: true },
    mira:     { rankName: "one pair",    kicker: "aces, queen kicker",                shows: true },
    redacted: { rankName: "folded turn",                                               shows: false, folded: true },
    k0rax:    { rankName: "folded preflop",                                            shows: false, folded: true },
    whiskey:  { rankName: "folded preflop",                                            shows: false, folded: true },
    nine:     { rankName: "folded preflop",                                            shows: false, folded: true },
  },
};

Object.assign(window, {
  Card, CardSlot, Chip, ChipStack, DealerButton, BlindToken,
  Avatar, Button, Toggle, Pill,
  PLAYERS, SEAT_LAYOUT, AGENT_THOUGHTS, SHOWDOWN,
});
