// wf-explorations.jsx — card style + felt color treatment explorations

// ── Card style explorations (3) ─────────────────────────────────────

function CardStyleA() {
  // Classic — rank + suit corners + center pip cluster, ample white
  return (
    <CardArtboard title="A · classic" subtitle="rank+suit corners, pip cluster center">
      <div style={{ display: "flex", gap: 14, padding: 24, justifyContent: "center", flexWrap: "wrap" }} data-comment-anchor="92b7d28dab-div-9-7">
        <ClassicCard rank="A" suit="♠" />
        <ClassicCard rank="K" suit="♥" red />
        <ClassicCard rank="Q" suit="♦" red />
        <ClassicCard rank="T" suit="♣" />
        <ClassicCard facedown />
      </div>
    </CardArtboard>);

}
function ClassicCard({ rank = "A", suit = "♠", red = false, facedown = false }) {
  if (facedown) {
    return (
      <div style={{
        width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
        background: "repeating-linear-gradient(135deg, var(--accent) 0 4px, var(--paper-2) 4px 8px)"
      }} />);

  }
  const color = red ? "var(--accent)" : "var(--ink)";
  return (
    <div style={{
      width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
      background: "var(--paper)", position: "relative", color,
      fontFamily: "Georgia, serif", padding: "8px 10px"
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>{suit}</div>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)", fontSize: 36
      }}>{suit}</div>
      <div style={{
        position: "absolute", right: 10, bottom: 8,
        fontSize: 18, fontWeight: 700, transform: "rotate(180deg)", lineHeight: 1
      }}>{rank}</div>
    </div>);

}

function CardStyleB() {
  // Minimalist — single rank + small suit, paper-warm
  return (
    <CardArtboard title="B · minimal · paper" subtitle="single rank, suit on baseline">
      <div style={{ display: "flex", gap: 14, padding: 24, justifyContent: "center", flexWrap: "wrap" }}>
        <MinCard rank="A" suit="♠" />
        <MinCard rank="K" suit="♥" red />
        <MinCard rank="Q" suit="♦" red />
        <MinCard rank="T" suit="♣" />
        <MinCard facedown />
      </div>
    </CardArtboard>);

}
function MinCard({ rank = "A", suit = "♠", red = false, facedown = false }) {
  if (facedown) {
    return (
      <div style={{
        width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
        background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--accent)", opacity: .8
        }} />
      </div>);

  }
  const color = red ? "var(--accent)" : "var(--ink)";
  return (
    <div style={{
      width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
      background: "var(--paper)", position: "relative", color,
      fontFamily: "var(--serif)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 4
    }}>
      <div style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-1px" }}>{rank}</div>
      <div style={{ fontSize: 18, lineHeight: 1, opacity: .85 }}>{suit}</div>
    </div>);

}

function CardStyleC() {
  // Mono/typographic — Ah / Kd two-letter notation
  return (
    <CardArtboard title="C · typographic" subtitle='two-letter notation ("Ah", "Kd")'>
      <div style={{ display: "flex", gap: 14, padding: 24, justifyContent: "center", flexWrap: "wrap" }}>
        <MonoCard rank="A" suit="s" />
        <MonoCard rank="K" suit="h" red />
        <MonoCard rank="Q" suit="d" red />
        <MonoCard rank="T" suit="c" />
        <MonoCard facedown />
      </div>
    </CardArtboard>);

}
function MonoCard({ rank = "A", suit = "s", red = false, facedown = false }) {
  if (facedown) {
    return (
      <div style={{
        width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
        background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{
          fontFamily: "var(--mono)", color: "var(--accent)",
          fontSize: 10, letterSpacing: ".1em"
        }}>j.a.s.</span>
      </div>);

  }
  const color = red ? "var(--accent)" : "var(--ink)";
  const suitGlyph = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit];
  return (
    <div style={{
      width: 76, height: 108, borderRadius: 6, border: "1.5px solid var(--ink)",
      background: "var(--paper)", position: "relative", color,
      fontFamily: "var(--mono)", padding: "8px 10px"
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1 }}>
        <span>{rank}</span>
        <span style={{ fontSize: 18, opacity: .85 }}>{suit}</span>
      </div>
      <div style={{
        position: "absolute", right: 10, bottom: 8,
        fontSize: 22, fontFamily: "var(--serif)", lineHeight: 1, opacity: .9
      }}>{suitGlyph}</div>
    </div>);

}

function CardArtboard({ title, subtitle, children }) {
  return (
    <div className="wf" style={{ width: 460, height: 220, position: "relative", background: "var(--paper)" }}>
      <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="sh" style={{ fontSize: 18 }}>{title}</span>
        <span className="ml">{subtitle}</span>
      </div>
      {children}
    </div>);

}

// ── Felt color treatments (3) ───────────────────────────────────────

function FeltStyleA() {
  return (
    <FeltArtboard title="A · paper neutral" subtitle="no felt — just deepened paper">
      <FeltOval w={520} h={260} theme="paper" />
      <FeltContents />
    </FeltArtboard>);

}
function FeltStyleB() {
  return (
    <FeltArtboard title="B · warm sienna wash" subtitle="accent at 25% — implies felt without aping vegas green">
      <FeltOval w={520} h={260} theme="accent" />
      <FeltContents />
    </FeltArtboard>);

}
function FeltStyleC() {
  return (
    <FeltArtboard title="C · dark mode" subtitle="warm near-black, sienna stroke">
      <FeltOval w={520} h={260} theme="dark" strokeAccent />
      <FeltContents dark />
    </FeltArtboard>);

}
function FeltContents({ dark = false }) {
  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 8
    }}>
      <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>pot</span>
      <span className="hand" style={{
        fontSize: 30, color: dark ? "var(--paper)" : "var(--ink)"
      }}>
        <span style={{ color: "var(--accent)" }}>$</span>4,200
      </span>
      <Board cards={[["A", "♠"], ["K", "♦"], ["7", "♣"], ["2", "♥"]]} size="md" />
    </div>);

}

function FeltArtboard({ title, subtitle, children }) {
  return (
    <div className="wf" style={{ width: 560, height: 330, position: "relative", background: "var(--paper)", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <span className="sh" style={{ fontSize: 18 }}>{title}</span>
        <span className="ml">{subtitle}</span>
      </div>
      <div style={{ position: "relative", width: 520, height: 260 }}>
        {children}
      </div>
    </div>);

}

// ── Equity viz explorations (3) ─────────────────────────────────────
function EquityVizA() {
  // Horizontal bar per seat (already in spectator A)
  return (
    <EquityVizFrame title="A · bar per seat" subtitle="inline under each seat — at-a-glance">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }} data-comment-anchor="ddd81bee8e-div-214-7">
        {SAMPLE_PLAYERS.slice(0, 4).map((p) =>
        <div key={p.name} style={{ display: "grid", gridTemplateColumns: "120px 1fr 40px", gap: 10, alignItems: "center" }}>
            <span className="hand" style={{ fontSize: 14, fontWeight: p.isHero ? 700 : 400, color: p.isHero ? "var(--accent)" : "var(--ink)" }}>{p.name}</span>
            <div className="equity"><i style={{ width: `${p.eq}%`, background: p.isHero ? "var(--accent)" : "var(--ink)" }} /></div>
            <span className="hand" style={{ fontSize: 13, textAlign: "right", color: p.isHero ? "var(--accent)" : "var(--ink)" }}>{p.eq}%</span>
          </div>
        )}
      </div>
    </EquityVizFrame>);

}
function EquityVizB() {
  // Stacked over pot
  return (
    <EquityVizFrame title="B · stacked over pot" subtitle="colors map to seats — see balance at-a-glance">
      <div style={{ padding: 18 }}>
        <EquityStack players={SAMPLE_PLAYERS.filter((p) => !p.isFolded).map((p, i) => ({
          name: p.name, eq: p.eq,
          color: i === 0 ? "var(--accent)" : i === 1 ? "var(--ink)" : "#8C7A5F"
        }))} />
      </div>
    </EquityVizFrame>);

}
function EquityVizC() {
  // Big number badge per seat
  return (
    <EquityVizFrame title="C · big circular badge" subtitle="equity as a number, no chart">
      <div style={{ display: "flex", gap: 16, padding: 24, justifyContent: "center", flexWrap: "wrap" }} data-comment-anchor="8e2bd37601-div-243-7">
        {SAMPLE_PLAYERS.filter((p) => !p.isFolded).map((p) =>
        <div key={p.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="hand" style={{
            width: 54, height: 54, borderRadius: "50%",
            border: `2px solid ${p.isHero ? "var(--accent)" : "var(--ink)"}`,
            background: p.isHero ? "var(--accent)" : "var(--paper-2)",
            color: p.isHero ? "var(--paper)" : "var(--ink)",
            fontSize: 20, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>{p.eq}<span style={{ fontSize: 10, marginLeft: 1, opacity: .8 }}>%</span></div>
            <span className="hand hand--sm" style={{ fontSize: 12 }}>{p.name}</span>
          </div>
        )}
      </div>
    </EquityVizFrame>);

}
function EquityVizFrame({ title, subtitle, children }) {
  return (
    <div className="wf" style={{ width: 520, height: 240, position: "relative", background: "var(--paper)" }}>
      <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="sh" style={{ fontSize: 18 }}>{title}</span>
        <span className="ml">{subtitle}</span>
      </div>
      {children}
    </div>);

}

Object.assign(window, {
  CardStyleA, CardStyleB, CardStyleC,
  FeltStyleA, FeltStyleB, FeltStyleC,
  EquityVizA, EquityVizB, EquityVizC
});