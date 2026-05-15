// wf-player.jsx — Player view wireframes A + B (of 4)

// Player view: hero sees only own cards, controls visible, chat present.
// 6 seats - hero is index 3 (bottom).

const PLAYER_OPPONENTS = [
{ initials: "K0", name: "k0rax", stack: "8,420", pos: "UTG", action: "checks" },
{ initials: "WH", name: "whiskey", stack: "5,100", pos: "MP", action: "folds", isFolded: true },
{ initials: "MI", name: "mira", stack: "11,250", pos: "CO", action: "bets 1,200" },
null, // hero slot
{ initials: "NI", name: "nine", stack: "6,300", pos: "SB", action: "folds", isFolded: true },
{ initials: "DE", name: "redacted", stack: "9,800", pos: "BB", action: "calls 1,200" }];


function OpponentSeat({ p, compact = false }) {
  if (!p) return null;
  return (
    <div className="box box--fill" style={{
      padding: compact ? "6px 8px" : "8px 10px", minWidth: compact ? 120 : 150,
      opacity: p.isFolded ? .45 : 1
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>{p.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hand hand--sm" style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span className="ml" style={{ fontSize: 9 }}>{p.pos}</span>
          </div>
          <div className="hand hand--sm" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
            <span style={{ color: "var(--accent)" }}>$</span>{p.stack}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 6 }}>
        <div style={{ display: "flex", gap: 3 }}>
          <Card facedown size="sm" />
          <Card facedown size="sm" />
        </div>
        {p.action && <span className="ml" style={{ fontSize: 10 }}>{p.action}</span>}
      </div>
    </div>);

}

// Hero seat — owner's view
function HeroSeat({ size = "md", inline = false, withChips = true }) {
  const big = size === "lg";
  return (
    <div className="box box--accent-strap" style={{
      padding: big ? "14px 18px" : "10px 14px",
      borderColor: "var(--accent)", borderWidth: 1.5,
      background: "var(--paper-2)",
      position: "relative"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="avatar" style={{
          background: "var(--accent)", color: "var(--paper)",
          width: big ? 42 : 32, height: big ? 42 : 32, fontSize: big ? 17 : 14
        }}>JS</span>
        <div style={{ flex: 1 }}>
          <div className="hand" style={{ fontSize: big ? 18 : 15, fontWeight: 700 }}>
            you · spy_07 <span className="ml" style={{ marginLeft: 6 }}>BTN</span>
          </div>
          <div className="hand-2" style={{ fontSize: big ? 14 : 13, color: "var(--ink-soft)" }}>
            stack <span style={{ color: "var(--accent)", fontWeight: 700 }}>$12,400</span> · in pot $300
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Card rank="A" suit="♠" size={big ? "xl" : "lg"} />
          <Card rank="K" suit="♠" size={big ? "xl" : "lg"} />
        </div>
      </div>
    </div>);

}

// Quick chip buttons (1/2 pot, pot, all-in)
function ChipPresets({ vertical = false, items = ["min", "½ pot", "pot", "2× pot", "all-in"] }) {
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 6 }}>
      {items.map((t, i) =>
      <button key={i} className="btn" style={{
        padding: "6px 10px", fontSize: 13, boxShadow: "1px 1px 0 var(--ink)",
        background: i === items.length - 1 ? "var(--ink)" : "var(--paper)",
        color: i === items.length - 1 ? "var(--paper)" : "var(--ink)"
      }}>{t}</button>
      )}
    </div>);

}

// Bet slider — wireframe representation
function BetSlider({ value = 1500, min = 200, max = 12400, vertical = false, width = 360 }) {
  const pct = (value - min) / (max - min) * 100;
  return (
    <div style={{ width: vertical ? 40 : width }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="ml">bet</span>
        <span className="hand" style={{ fontWeight: 700, color: "var(--accent)" }}>
          <span>$</span>{value.toLocaleString()}
        </span>
      </div>
      <div style={{
        height: 14, border: "1.5px solid var(--ink)", borderRadius: 7,
        background: "var(--paper)", position: "relative"
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: "var(--accent)",
          borderRadius: "6px 0 0 6px", borderRight: "1px solid var(--ink)"
        }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: -5,
          transform: "translateX(-50%)", width: 22, height: 22,
          borderRadius: "50%", border: "1.5px solid var(--ink)",
          background: "var(--paper)", boxShadow: "1px 1px 0 var(--ink)"
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span className="ml">min $200</span>
        <span className="ml">max $12,400</span>
      </div>
    </div>);

}

// Render the table for a player view — hero hidden from grid (rendered below)
function PlayerTable({ w, h, hideHeroSeat = true }) {
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <FeltOval w={w} h={h} />
      <div style={{ position: "absolute", inset: 0 }}>
        {PLAYER_OPPONENTS.map((p, i) => {
          if (!p && hideHeroSeat) return null;
          const pos = SEAT_POSITIONS_6[i];
          return (
            <div key={i} style={{
              position: "absolute", left: pos.left, top: pos.top,
              transform: `translate(${pos.tx}, ${pos.ty})`
            }}>
              <OpponentSeat p={p} />
            </div>);

        })}
        <div style={{
          position: "absolute", left: "50%", top: "44%",
          transform: "translate(-50%, -50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10
        }}>
          <Pot amount="4,200" />
          <Board cards={[["A", "♠"], ["K", "♦"], ["7", "♣"], ["2", "♥"]]} />
        </div>
      </div>
    </div>);

}

// ────────────────────────────────────────────────────────────────────
// Variant A — "Big Bottom Bar"  · full-width control rail at bottom
// ────────────────────────────────────────────────────────────────────
function PlayerA({ w = 1400, h = 900 }) {
  const tableH = h - 60 - 200; // bar = 200
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="seat 4 · spy_07 · BTN" right={
      <span className="ml">your turn · 18s · blinds 50/100</span>
      } />
      {/* Table */}
      <div style={{ padding: "20px 280px 0 20px", position: "relative" }}>
        <PlayerTable w={w - 300} h={tableH} />
        {/* Chat docked left */}
        <div style={{ position: "absolute", right: 20, top: 20, width: 240 }}>
          <Chat height={tableH - 20} />
        </div>
      </div>
      {/* Bottom action bar */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        borderTop: "1.5px solid var(--ink)",
        background: "var(--paper-2)", padding: "16px 24px",
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, alignItems: "center"
      }} data-comment-anchor="2f7c87f745-div-177-7">
        {/* Left: hero hand */}
        <HeroSeat size="lg" />
        {/* Middle: bet slider + presets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BetSlider />
          <ChipPresets />
        </div>
        {/* Right: actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <button className="btn" style={{ padding: "16px 8px", fontSize: 18 }}>fold</button>
          <button className="btn" style={{ padding: "16px 8px", fontSize: 18 }}>call $1,200</button>
          <button className="btn btn--primary" style={{ padding: "16px 8px", fontSize: 18 }}>raise $1,500</button>
        </div>
      </div>
      <Note x={w / 2 - 180} y={h - 100} w={120} rotate={-2}>
        primary CTA in accent
      </Note>
    </div>);

}

// ────────────────────────────────────────────────────────────────────
// Variant B — "Floating Radial Dial"  · circular dial at hero seat
// ────────────────────────────────────────────────────────────────────
function PlayerB({ w = 1400, h = 900 }) {
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="seat 4 · radial controls" right={
      <span className="ml">your turn · 22s</span>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", height: h - 60 }}>
        <div style={{ position: "relative", padding: "30px 30px 60px" }} data-comment-anchor="b1c0400144-div-214-9">
          <PlayerTable w={w - 260 - 60} h={h - 60 - 90} />
          {/* Floating dial near hero seat */}
          <div style={{
            position: "absolute", bottom: 30, left: "50%",
            transform: "translateX(-50%)"
          }}>
            <RadialDial />
          </div>
          {/* Hero hand pinned bottom-left over felt */}
          <div style={{ position: "absolute", left: 50, bottom: 70 }}>
            <HeroHandFloating />
          </div>
          <Note x={w / 2 - 320} y={h - 250} w={170} rotate={-3} arrow="M0,0 q 60,30 120,15">
            tap an arc → action. drag center → bet size.
          </Note>
        </div>
        <div style={{ padding: "14px 16px 14px 0" }}>
          <Chat height={h - 60 - 28} />
        </div>
      </div>
    </div>);

}

function RadialDial() {
  // 4 arcs around a central bet-amount display
  return (
    <svg viewBox="-130 -130 260 260" width="260" height="260" style={{ overflow: "visible" }}>
      {/* outer ring */}
      <circle cx="0" cy="0" r="118" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
      {/* dividers */}
      {[45, 135, 225, 315].map((a) => {
        const rad = a * Math.PI / 180;
        return (
          <line key={a} x1={Math.cos(rad) * 60} y1={Math.sin(rad) * 60}
          x2={Math.cos(rad) * 118} y2={Math.sin(rad) * 118}
          stroke="var(--ink)" strokeWidth="1" />);

      })}
      {/* quadrant labels */}
      <text x="0" y="-90" textAnchor="middle" style={{ font: "700 22px Caveat, cursive", fill: "var(--ink)" }}>raise</text>
      <text x="90" y="6" textAnchor="middle" style={{ font: "700 22px Caveat, cursive", fill: "var(--ink)" }}>call</text>
      <text x="90" y="22" textAnchor="middle" style={{ font: "10px monospace", fill: "var(--ink-soft)", letterSpacing: ".08em" }}>$1,200</text>
      <text x="0" y="100" textAnchor="middle" style={{ font: "700 22px Caveat, cursive", fill: "var(--ink)" }}>check</text>
      <text x="-90" y="6" textAnchor="middle" style={{ font: "700 22px Caveat, cursive", fill: "var(--accent)" }}>fold</text>
      {/* center */}
      <circle cx="0" cy="0" r="58" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.5" />
      <text x="0" y="-6" textAnchor="middle" style={{ font: "10px monospace", fill: "var(--paper-2)", letterSpacing: ".08em" }}>BET</text>
      <text x="0" y="22" textAnchor="middle" style={{ font: "700 32px Caveat, cursive", fill: "var(--paper)" }}>$1,500</text>
      {/* drag hint arrow */}
      <path d="M -40 -40 q 10 -20 40 -10" className="scribble scribble--soft" />
      <text x="-46" y="-46" style={{ font: "italic 13px Caveat, cursive", fill: "var(--ink-soft)" }}>drag</text>
    </svg>);

}

function HeroHandFloating() {
  return (
    <div className="box box--fill" style={{
      padding: "10px 14px", display: "flex", gap: 12, alignItems: "center",
      borderColor: "var(--accent)", borderWidth: 1.5
    }}>
      <div style={{ display: "flex", gap: 4 }}>
        <Card rank="A" suit="♠" size="lg" />
        <Card rank="K" suit="♠" size="lg" />
      </div>
      <div>
        <div className="hand" style={{ fontSize: 14, fontWeight: 700 }}>you · BTN</div>
        <div className="hand-2" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span style={{ color: "var(--accent)" }}>$</span>12,400
        </div>
      </div>
    </div>);

}

window.PlayerA = PlayerA;
window.PlayerB = PlayerB;
window.PLAYER_OPPONENTS = PLAYER_OPPONENTS;
window.HeroSeat = HeroSeat;
window.OpponentSeat = OpponentSeat;
window.PlayerTable = PlayerTable;
window.BetSlider = BetSlider;
window.ChipPresets = ChipPresets;