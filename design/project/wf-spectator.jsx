// wf-spectator.jsx — Spectator view wireframes (4 variants)

// Reusable seat layout around the felt
const SEAT_POSITIONS_6 = [
// 6-max seats around a stadium oval — { left%, top%, anchor }
{ left: "50%", top: "8%", tx: "-50%", ty: "0%" }, // 0 top
{ left: "92%", top: "26%", tx: "-100%", ty: "0%" }, // 1 top-right
{ left: "92%", top: "70%", tx: "-100%", ty: "-100%" }, // 2 bot-right
{ left: "50%", top: "92%", tx: "-50%", ty: "-100%" }, // 3 bot (hero)
{ left: "8%", top: "70%", tx: "0%", ty: "-100%" }, // 4 bot-left
{ left: "8%", top: "26%", tx: "0%", ty: "0%" } // 5 top-left
];

const SAMPLE_PLAYERS = [
{ initials: "K0", name: "k0rax", stack: "8,420", hand: [["Q", "♣"], ["J", "♣"]], action: "checks", eq: 14, pos: "UTG" },
{ initials: "WH", name: "whiskey", stack: "5,100", hand: [["7", "♦"], ["7", "♥"]], action: "folds", isFolded: true, eq: 0, pos: "MP" },
{ initials: "MI", name: "mira", stack: "11,250", hand: [["A", "♥"], ["Q", "♦"]], action: "bets 1,200", eq: 41, pos: "CO" },
{ initials: "JS", name: "you · spy_07", stack: "12,400", hand: [["A", "♠"], ["K", "♠"]], isHero: true,
  action: "to act", isToAct: true, timer: 18, eq: 38, pos: "BTN", hasButton: true },
{ initials: "NI", name: "nine", stack: "6,300", hand: [["5", "♠"], ["5", "♦"]], action: "folds", isFolded: true, eq: 0, pos: "SB" },
{ initials: "DE", name: "redacted", stack: "9,800", hand: [["T", "♣"], ["9", "♣"]], action: "calls 1,200", eq: 7, pos: "BB" }];


// ────────────────────────────────────────────────────────────────────
// Variant A — "Broadcast"  · classic table-center, right rail
// ────────────────────────────────────────────────────────────────────
function SpectatorA({ w = 1400, h = 900 }) {
  return (
    <div className="wf felt" style={{ width: w, height: h, position: "relative" }}>
      <Topbar title="spectating · table #1284" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: h - 60 }}>
        {/* Felt area */}
        <div style={{ position: "relative", padding: 28 }} data-comment-anchor="25136a9716-div-33-9">
          <FeltOval w={w - 320 - 56} h={h - 60 - 56} />
          {/* Seats around felt */}
          <div style={{ position: "absolute", inset: 28 }}>
            {SAMPLE_PLAYERS.map((p, i) => {
              const pos = SEAT_POSITIONS_6[i];
              return (
                <div key={i} style={{
                  position: "absolute", left: pos.left, top: pos.top,
                  transform: `translate(${pos.tx}, ${pos.ty})`
                }}>
                  <Seat {...p} equity={p.eq} />
                </div>);

            })}
            {/* Center: board + pot */}
            <div style={{
              position: "absolute", left: "50%", top: "46%",
              transform: "translate(-50%, -50%)",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14
            }}>
              <Pot amount="4,200" />
              <Board cards={[["A", "♠"], ["K", "♦"], ["7", "♣"], ["2", "♥"]]} />
              <span className="ml">turn · waiting for river</span>
            </div>
            {/* Hint annotation */}
            <Note x={w - 320 - 280} y={h * 0.5 - 30} w={170} rotate={-2}>
              equity % under each seat → at-a-glance read
            </Note>
          </div>
        </div>
        {/* Right rail */}
        <div style={{
          padding: "14px 16px 14px 0", display: "flex", flexDirection: "column", gap: 12
        }} data-comment-anchor="028284ed36-div-65-9">
          <Chat height={280} />
          <ActionLog height={280} />
        </div>
      </div>
    </div>);

}

// ────────────────────────────────────────────────────────────────────
// Variant B — "Equity Stack"  · stacked equity bar over the pot
// ────────────────────────────────────────────────────────────────────
function SpectatorB({ w = 1400, h = 900 }) {
  const stackedEquity = SAMPLE_PLAYERS.filter((p) => !p.isFolded).map((p, i) => ({
    name: p.name, eq: p.eq,
    color: i === 0 ? "var(--accent)" : i === 1 ? "var(--ink)" : i === 2 ? "#8C7A5F" : "var(--paper-3)"
  }));
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="spectating · table #1284 · equity-first" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: h - 60 }}>
        <div style={{ position: "relative", padding: 28 }}>
          {/* Equity stacked bar over pot */}
          <div style={{ maxWidth: 720, margin: "0 auto 14px" }}>
            <EquityStack players={stackedEquity} />
          </div>
          {/* Slightly smaller felt */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ position: "relative" }}>
              <FeltOval w={760} h={420} />
              <div style={{ position: "absolute", inset: 0 }} data-comment-anchor="a7ac9195b8-div-97-15">
                {SAMPLE_PLAYERS.map((p, i) => {
                  const pos = SEAT_POSITIONS_6[i];
                  return (
                    <div key={i} style={{
                      position: "absolute", left: pos.left, top: pos.top,
                      transform: `translate(${pos.tx}, ${pos.ty})`
                    }}>
                      <Seat {...p} compact />
                    </div>);

                })}
                <div style={{
                  position: "absolute", left: "50%", top: "50%",
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10
                }}>
                  <Pot amount="4,200" />
                  <Board cards={[["A", "♠"], ["K", "♦"], ["7", "♣"], ["2", "♥"]]} size="md" />
                </div>
              </div>
            </div>
          </div>
          {/* Pot odds + stats below */}
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, marginTop: 24 }}>
            <PotOdds />
            <StatsPanel />
          </div>
          <Note x={28} y={84} w={200} rotate={-2}>
            big equity strip over the pot — colors map to seats
          </Note>
        </div>
        {/* Right rail: tabs */}
        <div style={{ padding: "14px 16px 14px 0", display: "flex", flexDirection: "column", gap: 0, height: "100%" }} data-comment-anchor="7d95dc1774-div-130-9">
          <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
            {["chat", "history", "stats"].map((t, i) =>
            <div key={t} className="box" style={{
              padding: "6px 14px", borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
              borderBottom: i === 0 ? "1px solid var(--paper)" : undefined,
              background: i === 0 ? "var(--paper)" : "var(--paper-2)",
              fontFamily: "var(--hand)", fontWeight: 700, fontSize: 14,
              color: i === 0 ? "var(--accent)" : "var(--ink-soft)",
              marginRight: -1
            }}>{t}</div>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Chat height={460} />
          </div>
        </div>
      </div>
    </div>);

}

window.SpectatorA = SpectatorA;
window.SpectatorB = SpectatorB;
window.SAMPLE_PLAYERS = SAMPLE_PLAYERS;
window.SEAT_POSITIONS_6 = SEAT_POSITIONS_6;