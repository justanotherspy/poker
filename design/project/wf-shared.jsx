// wf-shared.jsx — shared sketch primitives for poker wireframes
// All components share a low-fi, slightly handwritten aesthetic.

const { useState, useMemo } = React;

// ── Tiny SVG building blocks ────────────────────────────────────────

// A hand-drawn looking oval/stadium felt
function FeltOval({ w, h, theme = "paper", strokeAccent = false, children }) {
  const fills = {
    paper: ["var(--paper-2)", "var(--paper-3)"],
    dark: ["#25221F", "#1A1814"],
    accent: ["#EFD9CC", "#E0BFA9"]
  };
  const [c1, c2] = fills[theme] || fills.paper;
  const stroke = strokeAccent ? "var(--accent)" : theme === "dark" ? "var(--paper-2)" : "var(--ink)";
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id={`felt-${theme}`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </radialGradient>
        </defs>
        <rect x="6" y="6" width={w - 12} height={h - 12} rx={(h - 12) / 2}
        fill={`url(#felt-${theme})`} stroke={stroke} strokeWidth="1.5" />
        {/* inner felt rail */}
        <rect x="16" y="16" width={w - 32} height={h - 32} rx={(h - 32) / 2}
        fill="none" stroke={stroke} strokeWidth=".75" strokeDasharray="2 5" opacity=".5" />
      </svg>
      {children}
    </div>);

}

// Single hole card placeholder
function Card({ size = "md", rank = "A", suit = "♠", facedown = false, red = false, style = {} }) {
  const sz = { sm: [22, 30], md: [32, 44], lg: [44, 60], xl: [56, 78] }[size] || [32, 44];
  if (facedown) {
    return (
      <span className="card-ph card-ph--back" style={{ width: sz[0], height: sz[1], ...style }} />);

  }
  const isRed = red || suit === "♥" || suit === "♦";
  return (
    <span className={`card-ph ${isRed ? "card-ph--red" : ""}`}
    style={{ width: sz[0], height: sz[1], flexDirection: "column", gap: 0, lineHeight: 1, ...style }}>
      <span style={{ fontSize: sz[0] * .55 }}>{rank}</span>
      <span style={{ fontSize: sz[0] * .5, marginTop: -2 }}>{suit}</span>
    </span>);

}

// A small player seat: avatar, name, stack, last action, cards, timer
function Seat({
  initials = "JS", name = "spy_07", stack = "12,400",
  action, hand = [["A", "♠"], ["K", "♦"]],
  showHand = true, isHero = false, hasButton = false, isFolded = false,
  isToAct = false, timer = null, position = null, equity = null,
  compact = false
}) {
  return (
    <div className="box box--fill" style={{
      padding: compact ? "8px 10px" : "10px 12px",
      minWidth: compact ? 130 : 170,
      borderColor: isToAct ? "var(--accent)" : isFolded ? "var(--rule)" : "var(--ink)",
      borderWidth: isToAct ? 2 : 1.25,
      opacity: isFolded ? .45 : 1,
      position: "relative"
    }}>
      {hasButton &&
      <span style={{
        position: "absolute", top: -10, right: -10, width: 22, height: 22,
        borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper)",
        fontFamily: "var(--hand)", fontWeight: 700, fontSize: 13,
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}>D</span>
      }
      {isToAct &&
      <span className="ml ml--accent" style={{
        position: "absolute", top: -8, left: 8, background: "var(--paper)", padding: "0 6px"
      }}>to act{timer ? ` · ${timer}s` : ""}</span>
      }
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="avatar" style={{
          width: compact ? 28 : 32, height: compact ? 28 : 32,
          fontSize: compact ? 13 : 15,
          background: isHero ? "var(--accent)" : "var(--paper-2)",
          color: isHero ? "var(--paper)" : "var(--ink)"
        }}>{initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hand hand--sm" style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            {position && <span className="ml" style={{ fontSize: 9 }}>{position}</span>}
          </div>
          <div className="hand hand--sm" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>$</span>{stack}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 6 }}>
        <div style={{ display: "flex", gap: 3 }}>
          {hand.map(([r, s], i) =>
          showHand && !isFolded ?
          <Card key={i} rank={r} suit={s} size={compact ? "sm" : "md"} /> :
          <Card key={i} facedown size={compact ? "sm" : "md"} />
          )}
        </div>
        {action &&
        <span className="ml" style={{ color: "var(--ink)", fontSize: 10 }}>{action}</span>
        }
      </div>
      {equity != null &&
      <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span className="ml">win</span>
            <span className="hand hand--sm" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>{equity}%</span>
          </div>
          <div className="equity"><i style={{ width: `${equity}%` }} /></div>
        </div>
      }
    </div>);

}

// Community / board cards (5 slots, optionally some empty)
function Board({ cards = [["A", "♠"], ["K", "♦"], ["7", "♣"]], size = "lg" }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[0, 1, 2, 3, 4].map((i) =>
      cards[i] ?
      <Card key={i} rank={cards[i][0]} suit={cards[i][1]} size={size} /> :
      <span key={i} className="card-ph card-ph--back" style={{
        width: { sm: 22, md: 32, lg: 44, xl: 56 }[size],
        height: { sm: 30, md: 44, lg: 60, xl: 78 }[size],
        borderStyle: "dashed", background: "transparent", opacity: .35
      }} />
      )}
    </div>);

}

// Pot indicator
function Pot({ amount = "4,200", side, dark = false }) {
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span className="ml" style={{ color: dark ? "var(--paper-2)" : "var(--ink-soft)" }}>pot</span>
      <span className="hand hand--lg" style={{
        fontSize: 28, color: dark ? "var(--paper)" : "var(--ink)"
      }}>
        <span style={{ color: "var(--accent)" }}>$</span>{amount}
      </span>
      {side &&
      <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>
          + side ${side}
        </span>
      }
    </div>);

}

// Browser-y top bar to set context for each wireframe
function Topbar({ title = "spectating · table #1284", crumbs, right }) {
  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="sh" style={{ fontSize: 20 }}>justanotherspy / poker</span>
        <span className="ml">/ {title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {right || <span className="ml">blinds 50/100 · hand #4,217 · 04h 12m</span>}
      </div>
    </div>);

}

// Annotation note — a little handwritten callout
function Note({ children, x, y, w = 180, rotate = 0, arrow = null }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w,
      transform: `rotate(${rotate}deg)`,
      pointerEvents: "none", zIndex: 5
    }}>
      <div className="annot" style={{ lineHeight: 1.15 }}>{children}</div>
      {arrow &&
      <svg width={w} height="40" style={{ position: "absolute", top: 18, left: 0, overflow: "visible" }}>
          <path d={arrow} className="scribble scribble--accent" />
        </svg>
      }
    </div>);

}

// A small chip-stack visual
function ChipStack({ n = 3, accent = false, size = 10 }) {
  return (
    <span className="chip-stack" style={{ display: "inline-flex", gap: 1 }}>
      {Array.from({ length: n }).map((_, i) =>
      <span key={i} className={`chip ${accent && i % 2 === 0 ? "chip--accent" : ""}`}
      style={{ width: size, height: size }} />
      )}
    </span>);

}

// Equity stacked bar across the entire pot
function EquityStack({ players = [] }) {
  return (
    <div style={{ width: "100%" }}>
      <div className="ml" style={{ marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>equity to win pot</span>
        <span>%</span>
      </div>
      <div style={{
        height: 18, border: "1.25px solid var(--ink)", borderRadius: 4,
        display: "flex", overflow: "hidden", background: "var(--paper)"
      }}>
        {players.map((p, i) =>
        <div key={i} style={{
          width: `${p.eq}%`,
          background: p.color || (i % 2 === 0 ? "var(--accent)" : "var(--paper-3)"),
          borderRight: i < players.length - 1 ? "1px solid var(--ink)" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--hand)", fontWeight: 700, fontSize: 11,
          color: p.color === "var(--accent)" || !p.color && i % 2 === 0 ? "var(--paper)" : "var(--ink)",
          minWidth: 18
        }}>
            {p.eq >= 8 ? `${p.eq}` : ""}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
        {players.map((p, i) =>
        <span key={i} className="hand hand--sm" style={{ fontSize: 12 }}>
            <span style={{
            display: "inline-block", width: 9, height: 9, borderRadius: 2, marginRight: 4,
            border: "1px solid var(--ink)", verticalAlign: "middle",
            background: p.color || (i % 2 === 0 ? "var(--accent)" : "var(--paper-3)")
          }} />
            {p.name} <span style={{ color: "var(--ink-soft)" }}>{p.eq}%</span>
          </span>
        )}
      </div>
    </div>);

}

// Chat panel sketch
function Chat({ lines, dark = false, dense = false, height = 200 }) {
  const fallback = [
  ["dealer", "river: 2 of clubs"],
  ["spy_07", "nice hand"],
  ["whiskey", "lol"],
  ["dealer", "spy_07 wins $4,200"],
  ["mira", "gg"],
  ["redacted", "[REDACTED]"]];

  const items = lines || fallback;
  return (
    <div className="box" style={{
      background: dark ? "var(--ink)" : "var(--paper)",
      borderColor: dark ? "var(--ink-soft)" : "var(--ink)",
      color: dark ? "var(--paper)" : "var(--ink)",
      height, display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      <div style={{
        padding: "6px 10px", borderBottom: "1px dashed " + (dark ? "var(--ink-soft)" : "var(--rule)"),
        display: "flex", justifyContent: "space-between"
      }}>
        <span className="ml ml--accent">chat</span>
        <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>6 here</span>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: dense ? 3 : 5, overflow: "hidden" }}>
        {items.map(([who, msg], i) =>
        <div key={i} className="hand-2" style={{
          fontSize: dense ? 12 : 13, color: dark ? "var(--paper-2)" : "var(--ink)"
        }}>
            <span style={{
            color: who === "dealer" ? "var(--accent)" : dark ? "var(--paper)" : "var(--ink)",
            fontWeight: 700, marginRight: 6, fontFamily: "var(--hand)"
          }}>{who}</span>
            {msg}
          </div>
        )}
      </div>
      <div style={{ padding: "6px 10px", borderTop: "1px dashed " + (dark ? "var(--ink-soft)" : "var(--rule)") }}>
        <div className="hand-2" style={{
          fontSize: 12, color: dark ? "var(--paper-3)" : "var(--ink-soft)",
          fontStyle: "italic"
        }}>type a message…</div>
      </div>
    </div>);

}

// Action log streaming
function ActionLog({ entries, dense = false, height = 220 }) {
  const fallback = [
  ["pre", "spy_07 raises to 300"],
  ["pre", "mira calls 300"],
  ["pre", "whiskey folds"],
  ["flop", "A♠ K♦ 7♣"],
  ["flop", "spy_07 bets 500"],
  ["flop", "mira calls"],
  ["turn", "2♥"],
  ["turn", "spy_07 checks"],
  ["turn", "mira bets 1,200"],
  ["turn", "spy_07 raises to 3,000"],
  ["turn", "mira calls"],
  ["river", "2♣"]];

  const items = entries || fallback;
  return (
    <div className="box" style={{ height, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "6px 10px", borderBottom: "1px dashed var(--rule)", display: "flex", justifyContent: "space-between" }}>
        <span className="ml ml--accent">hand history</span>
        <span className="ml">#4,217</span>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: dense ? 2 : 3, overflow: "hidden" }}>
        {items.map(([street, line], i) =>
        <div key={i} style={{ display: "flex", gap: 8, fontFamily: "var(--mono)", fontSize: 11 }}>
            <span className="ml" style={{ width: 38, color: "var(--accent)" }}>{street}</span>
            <span style={{ color: "var(--ink)" }}>{line}</span>
          </div>
        )}
      </div>
    </div>);

}

// Pot odds breakdown panel
function PotOdds({ dense = false }) {
  return (
    <div className="box" style={{ padding: dense ? "10px 12px" : "14px 16px" }}>
      <div className="ml ml--accent" style={{ marginBottom: 6 }}>pot odds · sides</div>
      <div className="hand hand--sm" style={{ fontSize: 13, lineHeight: 1.5 }}>
        <Row k="main pot" v="$4,200" />
        <Row k="side 1 (mira)" v="$820" />
        <Row k="to call" v="$1,200" />
        <Row k="pot odds" v="22%" accent />
        <Row k="implied" v="~28%" />
      </div>
    </div>);

}
function Row({ k, v, accent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span className="hand-2" style={{ color: "var(--ink-soft)", fontSize: 12 }}>{k}</span>
      <span className="hand" style={{ fontWeight: 700, fontSize: 13, color: accent ? "var(--accent)" : "var(--ink)" }}>{v}</span>
    </div>);

}

// Stats panel (VPIP / PFR style)
function StatsPanel() {
  const rows = [
  ["spy_07", 46, 38, 8.2, 3.1],
  ["mira", 22, 18, 2.4, 1.6],
  ["whiskey", 38, 14, 1.1, 0.4],
  ["k0rax", 12, 10, 0.6, 0.2],
  ["nine", 28, 22, 4.0, 2.0],
  ["you", 31, 26, 3.5, 1.9]];

  return (
    <div className="box" style={{ padding: "10px 12px" }} data-comment-anchor="5fbf710fb4-div-368-5">
      <div className="ml ml--accent" style={{ marginBottom: 8 }}>player stats · last 200 hands</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 38px 38px 38px 38px", gap: "4px 8px", fontFamily: "var(--mono)", fontSize: 10 }}>
        <span className="ml" style={{ fontSize: 9 }}>name</span>
        <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>vpip</span>
        <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>pfr</span>
        <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>3bet</span>
        <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>af</span>
        {rows.map(([n, a, b, c, d]) =>
        <React.Fragment key={n}>
            <span className="hand" style={{ fontSize: 12 }}>{n}</span>
            <span style={{ textAlign: "right", color: "var(--ink)" }}>{a}</span>
            <span style={{ textAlign: "right", color: "var(--ink-soft)" }}>{b}</span>
            <span style={{ textAlign: "right", color: "var(--ink-soft)" }}>{c}</span>
            <span style={{ textAlign: "right", color: "var(--ink-soft)" }}>{d}</span>
          </React.Fragment>
        )}
      </div>
    </div>);

}

Object.assign(window, {
  FeltOval, Card, Seat, Board, Pot, Topbar, Note, ChipStack, EquityStack,
  Chat, ActionLog, PotOdds, StatsPanel
});