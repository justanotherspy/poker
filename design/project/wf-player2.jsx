// wf-player2.jsx — Player variants C + D

// ────────────────────────────────────────────────────────────────────
// Variant C — "Compact Right Rail"  · vertical actions on the right
// ────────────────────────────────────────────────────────────────────
function PlayerC({ w = 1400, h = 900 }) {
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="seat 4 · right-rail controls" right={
      <span className="ml">your turn · 14s</span>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 230px 240px", height: h - 60 }}>
        {/* Felt area */}
        <div style={{ position: "relative", padding: "24px 0 90px 24px" }}>
          <PlayerTable w={w - 230 - 240 - 24} h={h - 60 - 24 - 90} />
          {/* Hero seat docked under felt */}
          <div style={{ position: "absolute", left: 24, right: 0, bottom: 14 }}>
            <HeroSeat size="lg" />
          </div>
        </div>
        {/* Action rail */}
        <div style={{
          padding: "20px 14px", display: "flex", flexDirection: "column",
          gap: 12, borderLeft: "1px dashed var(--rule)"
        }} data-comment-anchor="fa20c143b0-div-22-9">
          <div className="ml ml--accent">your action</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="btn" style={{ padding: "14px 12px", fontSize: 17, width: "100%" }}>fold</button>
            <button className="btn" style={{ padding: "14px 12px", fontSize: 17, width: "100%" }}>call <span style={{ color: "var(--accent)", marginLeft: 4 }}>$1,200</span></button>
            <button className="btn btn--primary" style={{ padding: "14px 12px", fontSize: 17, width: "100%" }}>raise <span style={{ marginLeft: 4 }}>$1,500</span></button>
          </div>
          <div style={{ marginTop: 6 }}>
            <BetSlider width={200} />
          </div>
          <div style={{ marginTop: 6 }}>
            <ChipPresets vertical items={["min", "½ pot", "pot", "all-in"]} />
          </div>
          <div className="box" style={{ padding: "8px 10px", marginTop: "auto" }} data-comment-anchor="fec1df5cc6-div-38-11">
            <div className="ml ml--accent" style={{ marginBottom: 4 }}>auto-actions</div>
            <label className="hand hand--sm" style={{ display: "flex", gap: 6, fontSize: 13 }}>
              <span className="chip" style={{ borderColor: "var(--ink)", background: "var(--accent)" }} />
              auto-muck losing hand
            </label>
            <label className="hand hand--sm" style={{ display: "flex", gap: 6, fontSize: 13, marginTop: 4 }}>
              <span className="chip" style={{ borderColor: "var(--ink)" }} />
              check/fold
            </label>
          </div>
        </div>
        {/* Chat rail */}
        <div style={{ padding: "14px 14px 14px 0" }}>
          <Chat height={h - 60 - 28} />
        </div>
      </div>
      <Note x={w - 470 - 80} y={120} w={160} rotate={2} arrow="M0,0 q 60,-10 110,5">
        compact rail keeps felt full
      </Note>
    </div>);

}

// ────────────────────────────────────────────────────────────────────
// Variant D — "Inline Overlay"  · buttons hover over hole cards
// ────────────────────────────────────────────────────────────────────
function PlayerD({ w = 1400, h = 900 }) {
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="seat 4 · inline overlay · cards-first" right={
      <span className="ml">your turn · 9s</span>
      } />
      <div style={{ position: "relative", height: h - 60 }}>
        {/* Full felt, no rails */}
        <div style={{ padding: "20px 20px 290px" }}>
          <PlayerTable w={w - 40} h={h - 60 - 310} />
        </div>
        {/* Big hand display at bottom center */}
        <div style={{
          position: "absolute", bottom: 30, left: "50%",
          transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16
        }} data-comment-anchor="eb81cad81e-div-77-9">
          {/* Inline action chips above cards */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn" style={{ padding: "10px 18px", fontSize: 16 }}>fold</button>
            <button className="btn" style={{ padding: "10px 18px", fontSize: 16 }}>
              call <span style={{ color: "var(--accent)", marginLeft: 4, fontWeight: 700 }}>$1,200</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn btn--primary" style={{ padding: "10px 18px", fontSize: 16 }}>
                raise to <span style={{ marginLeft: 4 }}>$1,500</span>
              </button>
              <BetSlider width={260} />
            </div>
          </div>
          {/* Inline chip presets */}
          <ChipPresets items={["min", "½ pot", "pot", "2× pot", "all-in"]} />
          {/* Hole cards huge */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Card rank="A" suit="♠" size="xl" style={{ width: 80, height: 110, fontSize: 36 }} />
              <Card rank="K" suit="♠" size="xl" style={{ width: 80, height: 110, fontSize: 36 }} />
            </div>
            <div style={{
              position: "absolute", left: "50%", bottom: -28,
              transform: "translateX(-50%)", whiteSpace: "nowrap"
            }}>
              <span className="hand" style={{ fontSize: 15, fontWeight: 700 }}>
                you · spy_07 · BTN
              </span>
              <span className="hand-2" style={{ fontSize: 13, color: "var(--ink-soft)", marginLeft: 8 }}>
                <span style={{ color: "var(--accent)" }}>$</span>12,400
              </span>
            </div>
          </div>
        </div>
        {/* Floating chat collapsed */}
        <div style={{ position: "absolute", right: 24, bottom: 24 }}>
          <div className="box box--fill" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ml ml--accent">chat</span>
            <span className="hand-2" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              mira: gg
            </span>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "var(--accent)",
              color: "var(--paper)", fontFamily: "var(--hand)", fontWeight: 700, fontSize: 12,
              display: "inline-flex", alignItems: "center", justifyContent: "center"
            }}>3</span>
          </div>
        </div>
        {/* Floating mini-log top-left */}
        <div style={{ position: "absolute", left: 24, top: 90, width: 220 }}>
          <ActionLog height={180} dense />
        </div>
        <Note x={w / 2 - 240} y={h - 240} w={200} rotate={-2}>
          your cards are the anchor — controls fly in only on your turn
        </Note>
      </div>
    </div>);

}

window.PlayerC = PlayerC;
window.PlayerD = PlayerD;