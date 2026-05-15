// wf-spectator2.jsx — Spectator variants C + D

// ────────────────────────────────────────────────────────────────────
// Variant C — "Data Console"  · Twitch-style, table top-left, dense right column
// ────────────────────────────────────────────────────────────────────
function SpectatorC({ w = 1400, h = 900 }) {
  const sorted = [...SAMPLE_PLAYERS].sort((a, b) => b.eq - a.eq);
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="spectating · table #1284 · console" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: h - 60 }}>
        {/* Left: compact felt + community below */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ position: "relative", height: 480 }}>
            <FeltOval w={w - 380 - 48} h={480} />
            <div style={{ position: "absolute", inset: 0 }}>
              {SAMPLE_PLAYERS.map((p, i) => {
                const pos = SEAT_POSITIONS_6[i];
                return (
                  <div key={i} style={{
                    position: "absolute", left: pos.left, top: pos.top,
                    transform: `translate(${pos.tx}, ${pos.ty})`,
                  }}>
                    <Seat {...p} compact />
                  </div>
                );
              })}
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              }}>
                <Pot amount="4,200" side="820" />
                <Board cards={[["A","♠"],["K","♦"],["7","♣"],["2","♥"]]} />
              </div>
            </div>
          </div>
          {/* Bottom strip: equity leaderboard + pot odds */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, flex: 1 }}>
            <div className="box" style={{ padding: "12px 14px" }}>
              <div className="ml ml--accent" style={{ marginBottom: 8 }}>live equity · sorted</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sorted.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 130px 1fr 50px", gap: 10, alignItems: "center" }}>
                    <span className="hand hand--sm" style={{ color: "var(--ink-soft)" }}>#{i + 1}</span>
                    <span className="hand" style={{
                      fontSize: 14, fontWeight: 600,
                      textDecoration: p.isFolded ? "line-through" : "none",
                      color: p.isFolded ? "var(--ink-soft)" : "var(--ink)",
                    }}>{p.name}</span>
                    <div className="equity" style={{ height: 12 }}>
                      <i style={{ width: `${p.eq}%`, background: p.isHero ? "var(--accent)" : (p.isFolded ? "var(--rule)" : "var(--ink)") }} />
                    </div>
                    <span className="hand" style={{
                      fontWeight: 700, fontSize: 14, textAlign: "right",
                      color: p.isHero ? "var(--accent)" : "var(--ink)",
                    }}>{p.eq}%</span>
                  </div>
                ))}
              </div>
            </div>
            <PotOdds />
          </div>
        </div>
        {/* Right: action log, then chat */}
        <div style={{ padding: "14px 16px 14px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <ActionLog height={430} />
          <Chat height={325} dense />
        </div>
      </div>
      <Note x={26} y={84} w={170} rotate={-3} arrow="M0,0 q 40,30 100,40">
        leaderboard re-sorts every street
      </Note>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Variant D — "Minimal"  · big numbers, floating overlays
// ────────────────────────────────────────────────────────────────────
function SpectatorD({ w = 1400, h = 900 }) {
  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: "var(--paper)" }}>
      <Topbar title="spectating · table #1284 · minimal" />
      <div style={{ position: "relative", height: h - 60 }}>
        {/* Full-width felt */}
        <div style={{ padding: 40, height: "100%" }}>
          <FeltOval w={w - 80} h={h - 60 - 80} />
        </div>
        {/* Seats around felt — equity is a BIG badge */}
        <div style={{ position: "absolute", inset: 40 }}>
          {SAMPLE_PLAYERS.map((p, i) => {
            const pos = SEAT_POSITIONS_6[i];
            return (
              <div key={i} style={{
                position: "absolute", left: pos.left, top: pos.top,
                transform: `translate(${pos.tx}, ${pos.ty})`,
              }}>
                <BigBadgeSeat {...p} />
              </div>
            );
          })}
          {/* Center stack */}
          <div style={{
            position: "absolute", left: "50%", top: "48%",
            transform: "translate(-50%, -50%)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <span className="ml">main pot</span>
            <span className="hand" style={{ fontSize: 56, lineHeight: .9, color: "var(--ink)" }}>
              <span style={{ color: "var(--accent)" }}>$</span>4,200
            </span>
            <Board cards={[["A","♠"],["K","♦"],["7","♣"],["2","♥"]]} size="xl" />
          </div>
        </div>
        {/* Floating action log — top left */}
        <div style={{ position: "absolute", left: 24, top: 78, width: 240 }}>
          <ActionLog height={220} dense />
        </div>
        {/* Floating chat — bottom right */}
        <div style={{ position: "absolute", right: 24, bottom: 24, width: 280 }}>
          <Chat height={240} dense />
        </div>
        <Note x={w / 2 - 110} y={140} w={220} rotate={-1.5}>
          everything else floats. felt is the canvas.
        </Note>
      </div>
    </div>
  );
}

function BigBadgeSeat({ initials, name, stack, hand, isHero, isFolded, isToAct, hasButton, eq, action }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: isFolded ? .4 : 1 }}>
      {/* Equity badge — big circle */}
      <div style={{ position: "relative" }}>
        <div className="hand" style={{
          width: 64, height: 64, borderRadius: "50%",
          border: `2px solid ${isToAct ? "var(--accent)" : "var(--ink)"}`,
          background: isHero ? "var(--accent)" : "var(--paper-2)",
          color: isHero ? "var(--paper)" : "var(--ink)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontWeight: 700,
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{isFolded ? "—" : `${eq}`}</span>
          <span className="ml" style={{ color: isHero ? "var(--paper-2)" : "var(--ink-soft)", fontSize: 9 }}>%</span>
        </div>
        {hasButton && (
          <span style={{
            position: "absolute", top: -4, right: -4, width: 22, height: 22,
            borderRadius: "50%", border: "1.5px solid var(--ink)", background: "var(--paper)",
            fontFamily: "var(--hand)", fontWeight: 700, fontSize: 13,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>D</span>
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="hand" style={{ fontSize: 15, lineHeight: 1.1, fontWeight: 700 }}>{name}</div>
        <div className="hand-2" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span style={{ color: "var(--accent)" }}>$</span>{stack}
        </div>
      </div>
      <div style={{ display: "flex", gap: 3 }}>
        {hand.map(([r, s], i) => (
          !isFolded ? <Card key={i} rank={r} suit={s} size="sm" /> : <Card key={i} facedown size="sm" />
        ))}
      </div>
      {action && !isFolded && (
        <div className="hand" style={{ fontSize: 12, color: "var(--accent)", marginTop: 2 }}>{action}</div>
      )}
    </div>
  );
}

window.SpectatorC = SpectatorC;
window.SpectatorD = SpectatorD;
