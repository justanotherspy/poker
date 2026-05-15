// wf-consolidated.jsx — v2 wireframes that fold in Dan's feedback.
//
// Spectator v2: smaller oval table (from B) + per-seat equity bars in
// cards (from A) + right-side TABBED rail (chat/history) + bottom panel
// with player stats + pot odds + clear dealer/SB/BB/UTG + "to act"
// highlighted with timer. Paper-neutral light; dark felt only in dark.
//
// Player v2: bottom action bar with bet slider + accented CTAs (from A),
// right-side TABBED rail with chat/history/settings + auto-options.

// ── shared chrome bits ─────────────────────────────────────────────

function TabBar({ tabs = ["chat", "history", "stats"], active = 0, dark = false }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: -1 }}>
      {tabs.map((t, i) => (
        <div key={t} className="box" style={{
          padding: "6px 14px",
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          borderBottom: i === active
            ? `1px solid ${dark ? "var(--ink)" : "var(--paper)"}`
            : undefined,
          background: i === active
            ? (dark ? "var(--ink)" : "var(--paper)")
            : (dark ? "#0F0E0C" : "var(--paper-2)"),
          borderColor: dark ? "var(--ink-soft)" : "var(--ink)",
          fontFamily: "var(--hand)", fontWeight: 700, fontSize: 14,
          color: i === active
            ? "var(--accent)"
            : (dark ? "var(--paper-3)" : "var(--ink-soft)"),
          marginRight: -1,
        }}>{t}</div>
      ))}
    </div>
  );
}

// Seat that explicitly tags position (UTG/MP/CO/BTN/SB/BB) + dealer button
// + to-act highlight. For spectator mode showHand=true.
function SeatV2({ p, showHand = true, dark = false, compact = false }) {
  const eq = p.eq;
  const isFolded = p.isFolded;
  const isToAct = p.isToAct;
  const tone = {
    bg:     dark ? "var(--surface-dk, #252220)" : "var(--paper-2)",
    text:   dark ? "var(--paper)" : "var(--ink)",
    muted:  dark ? "var(--paper-3)" : "var(--ink-soft)",
    border: isToAct ? "var(--accent)" : (dark ? "var(--ink-soft)" : "var(--ink)"),
  };
  return (
    <div style={{
      position: "relative",
      padding: compact ? "8px 10px" : "10px 12px",
      minWidth: compact ? 150 : 180,
      borderWidth: isToAct ? 2 : 1.25,
      borderStyle: "solid",
      borderColor: tone.border,
      borderRadius: 6,
      background: tone.bg, color: tone.text,
      opacity: isFolded ? .42 : 1,
    }}>
      {/* dealer / blind chip — sits top-right, outside the card */}
      {(p.hasButton || p.blind) && (
        <span style={{
          position: "absolute", top: -10, right: -10,
          width: 22, height: 22, borderRadius: "50%",
          border: "1.5px solid " + (dark ? "var(--paper)" : "var(--ink)"),
          background: p.hasButton ? "var(--paper)" : (p.blind === "SB" ? "var(--paper-2)" : "var(--accent)"),
          color: p.blind === "BB" ? "var(--paper)" : "var(--ink)",
          fontFamily: "var(--hand)", fontWeight: 700, fontSize: 12,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{p.hasButton ? "D" : (p.blind === "SB" ? "sb" : "bb")}</span>
      )}
      {/* TO ACT pill */}
      {isToAct && (
        <span className="ml ml--accent" style={{
          position: "absolute", top: -8, left: 10,
          background: dark ? "var(--ink)" : "var(--paper)",
          padding: "0 6px",
        }}>to act · {p.timer ?? 18}s</span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="avatar" style={{
          width: 30, height: 30, fontSize: 13,
          background: p.isHero ? "var(--accent)" : (dark ? "var(--ink)" : "var(--paper)"),
          color: p.isHero ? "var(--paper)" : tone.text,
          borderColor: dark ? "var(--paper-3)" : "var(--ink)",
        }}>{p.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hand" style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 14 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: tone.text }}>{p.name}</span>
            <span className="ml" style={{ fontSize: 9, color: tone.muted }}>{p.pos}</span>
          </div>
          <div className="hand-2" style={{ color: tone.muted, fontSize: 12 }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>$</span>{p.stack}
          </div>
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 6, gap: 6,
      }}>
        <div style={{ display: "flex", gap: 3 }}>
          {p.hand.map(([r, s], i) => (
            showHand && !isFolded
              ? <Card key={i} rank={r} suit={s} size="md" />
              : <Card key={i} facedown size="md" />
          ))}
        </div>
        {p.action && <span className="ml" style={{ fontSize: 10, color: tone.text }}>{p.action}</span>}
      </div>
      {eq != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span className="ml" style={{ color: tone.muted }}>win</span>
            <span className="hand" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>{eq}%</span>
          </div>
          <div className="equity" style={{
            borderColor: dark ? "var(--paper-3)" : "var(--ink)",
            background: dark ? "#0F0E0C" : "var(--paper)",
          }}>
            <i style={{ width: `${eq}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// Enriched players with blind labels (in addition to the existing SAMPLE_PLAYERS pos)
function enrichPlayers(spectator = true) {
  // We map roles onto the existing 6 sample players. Hero is index 3.
  // Sample positions in order: UTG, MP, CO, BTN(hero), SB, BB.
  return [
    { ...SAMPLE_PLAYERS[0] },                                  // UTG
    { ...SAMPLE_PLAYERS[1] },                                  // MP
    { ...SAMPLE_PLAYERS[2] },                                  // CO
    { ...SAMPLE_PLAYERS[3], hasButton: true },                 // BTN (hero)
    { ...SAMPLE_PLAYERS[4], blind: "SB" },                     // SB
    { ...SAMPLE_PLAYERS[5], blind: "BB" },                     // BB
  ].map(p => spectator ? p : { ...p, hand: p.isHero ? p.hand : [["?", "?"], ["?", "?"]] });
}

// Felt — paper for light, dark for dark mode (Dan's feedback)
function FeltV2({ w, h, dark }) {
  return <FeltOval w={w} h={h} theme={dark ? "dark" : "paper"} strokeAccent={dark} />;
}

// Bottom strip combining PotOdds + StatsPanel + ActionLog summary
function BottomStrip({ dark = false }) {
  const surface = dark ? "var(--ink)" : "var(--paper-2)";
  const border = dark ? "var(--ink-soft)" : "var(--ink)";
  const text = dark ? "var(--paper)" : "var(--ink)";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "260px 1fr 260px",
      gap: 14, padding: "12px 16px",
      borderTop: `1px dashed ${dark ? "var(--ink-soft)" : "var(--rule)"}`,
    }}>
      {/* Pot odds */}
      <div className="box" style={{ background: surface, borderColor: border, color: text, padding: "10px 12px" }}>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>pot odds · sides</div>
        <div className="hand hand--sm" style={{ fontSize: 13, lineHeight: 1.55 }}>
          <RowV2 k="main pot"   v="$4,200" dark={dark} />
          <RowV2 k="side (mira)" v="$820"   dark={dark} />
          <RowV2 k="to call"    v="$1,200" dark={dark} />
          <RowV2 k="pot odds"   v="22%"    accent dark={dark} />
          <RowV2 k="implied"    v="~28%"   dark={dark} />
        </div>
      </div>
      {/* Player stats — full ring */}
      <div className="box" style={{ background: surface, borderColor: border, color: text, padding: "10px 12px" }}>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>player stats · last 200 hands</div>
        <StatsTable dark={dark} />
      </div>
      {/* Quick action recap */}
      <div className="box" style={{ background: surface, borderColor: border, color: text, padding: "10px 12px" }}>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>this hand · turn</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.6 }}>
          {[
            ["pre",  "spy_07 raises to 300"],
            ["pre",  "mira calls · whiskey folds"],
            ["flop", "A♠ K♦ 7♣ · spy_07 bets 500"],
            ["turn", "2♥ · mira bets 1,200"],
            ["turn", "spy_07 — to act"],
          ].map(([s, txt], i) => (
            <li key={i} style={{ display: "flex", gap: 8 }}>
              <span className="ml" style={{ width: 38, color: "var(--accent)" }}>{s}</span>
              <span style={{ color: text }}>{txt}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
function RowV2({ k, v, accent, dark }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span className="hand-2" style={{ fontSize: 12, color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>{k}</span>
      <span className="hand" style={{ fontWeight: 700, fontSize: 13, color: accent ? "var(--accent)" : (dark ? "var(--paper)" : "var(--ink)") }}>{v}</span>
    </div>
  );
}
function StatsTable({ dark }) {
  const rows = [
    ["spy_07",  46, 38, 8.2, 3.1],
    ["mira",    22, 18, 2.4, 1.6],
    ["whiskey", 38, 14, 1.1, 0.4],
    ["k0rax",   12, 10, 0.6, 0.2],
    ["nine",    28, 22, 4.0, 2.0],
    ["redacted",31, 26, 3.5, 1.9],
  ];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 32px 32px 32px 32px",
      gap: "3px 8px", fontFamily: "var(--mono)", fontSize: 10,
    }}>
      <span className="ml" style={{ fontSize: 9 }}>name</span>
      <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>vpip</span>
      <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>pfr</span>
      <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>3bet</span>
      <span className="ml" style={{ fontSize: 9, textAlign: "right" }}>af</span>
      {rows.map(([n, a, b, c, d]) => (
        <React.Fragment key={n}>
          <span className="hand" style={{ fontSize: 12, color: dark ? "var(--paper)" : "var(--ink)" }}>{n}</span>
          <span style={{ textAlign: "right", color: dark ? "var(--paper)" : "var(--ink)" }}>{a}</span>
          <span style={{ textAlign: "right", color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>{b}</span>
          <span style={{ textAlign: "right", color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>{c}</span>
          <span style={{ textAlign: "right", color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>{d}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// Right rail with tabs — spectator: chat / history / stats
function TabbedRail({ tabs, active = 0, dark = false, height = 600 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <TabBar tabs={tabs.map(t => t.label)} active={active} dark={dark} />
      <div className="box" style={{
        flex: 1, padding: 0, overflow: "hidden",
        borderTopLeftRadius: 0,
        background: dark ? "var(--ink)" : "var(--paper)",
        borderColor: dark ? "var(--ink-soft)" : "var(--ink)",
        color: dark ? "var(--paper)" : "var(--ink)",
        height,
      }}>
        {tabs[active].render()}
      </div>
    </div>
  );
}

// Seat positions for V2 — positioned OUTSIDE/around a centred felt so
// seat cards don't overlap the pot/board.
// Each entry is a full set of position props to spread directly onto the seat
// wrapper. Coordinates are relative to a ring whose inner area is the felt.
const V2_SEAT_POSITIONS = [
  // 0 top center
  { left: "50%", top: 0,            transform: "translateX(-50%)" },
  // 1 top right
  { right: 0,    top: 30,           transform: "none" },
  // 2 bottom right
  { right: 0,    bottom: 30,        transform: "none" },
  // 3 bottom center (hero)
  { left: "50%", bottom: 0,         transform: "translateX(-50%)" },
  // 4 bottom left
  { left: 0,     bottom: 30,        transform: "none" },
  // 5 top left
  { left: 0,     top: 30,           transform: "none" },
];

// ── Spectator v2 ───────────────────────────────────────────────────

function SpectatorV2({ w = 1400, h = 900, dark = false }) {
  const players = enrichPlayers(true);
  const surfaceBg = dark ? "var(--bg-dark, #1A1814)" : "var(--paper)";

  // Inner Chat/History as render fns for tabs
  const railTabs = [
    { label: "chat",    render: () => <ChatInner dark={dark} /> },
    { label: "history", render: () => <HistoryInner dark={dark} /> },
    { label: "stats",   render: () => <StatsInner dark={dark} /> },
  ];

  const feltW = 720, feltH = 280;
  const ringW = 1000, ringH = 600;

  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: surfaceBg, color: dark ? "var(--paper)" : "var(--ink)" }}>
      <TopbarV2 title="spectating · table #1284" dark={dark} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: h - 60 }}>
        {/* Left column: felt area + bottom strip */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", padding: "20px 24px 12px", flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ position: "relative", width: ringW, height: ringH }}>
              {/* felt centered inside the seat ring */}
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                <FeltV2 w={feltW} h={feltH} dark={dark} />
                <div style={{
                  position: "absolute", left: "50%", top: "50%",
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}>
                  <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>pot</span>
                  <span className="hand" style={{ fontSize: 30, color: dark ? "var(--paper)" : "var(--ink)" }}>
                    <span style={{ color: "var(--accent)" }}>$</span>4,200
                  </span>
                  <Board cards={[["A","♠"],["K","♦"],["7","♣"],["2","♥"]]} size="md" />
                  <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>turn · waiting for river</span>
                </div>
              </div>
              {players.map((p, i) => {
                const pos = V2_SEAT_POSITIONS[i];
                return (
                  <div key={i} style={{ position: "absolute", ...pos }}>
                    <SeatV2 p={p} dark={dark} compact />
                  </div>
                );
              })}
            </div>
            <Note x={28} y={84} w={180} rotate={-2}>
              equity bar lives in each seat card — Dan's preferred read
            </Note>
          </div>
          <BottomStrip dark={dark} />
        </div>
        {/* Right rail: tabbed */}
        <div style={{ padding: "14px 16px 14px 0", display: "flex", flexDirection: "column" }}>
          <TabbedRail tabs={railTabs} active={0} dark={dark} height={h - 60 - 28} />
        </div>
      </div>
    </div>
  );
}

// ── Player v2 ──────────────────────────────────────────────────────

function PlayerV2({ w = 1400, h = 900, dark = false }) {
  const players = enrichPlayers(false); // opponents face-down
  const surfaceBg = dark ? "var(--bg-dark, #1A1814)" : "var(--paper)";
  const bottomBarH = 210;

  const railTabs = [
    { label: "chat",     render: () => <ChatInner dark={dark} /> },
    { label: "history",  render: () => <HistoryInner dark={dark} /> },
    { label: "settings", render: () => <SettingsInner dark={dark} /> },
  ];

  const feltW = 720, feltH = 240;
  const ringW = 1000, ringH = 560;

  return (
    <div className="wf" style={{ width: w, height: h, position: "relative", background: surfaceBg, color: dark ? "var(--paper)" : "var(--ink)" }}>
      <TopbarV2 title="seat 4 · spy_07" dark={dark} right={
        <span className="ml ml--accent">your turn · 18s · blinds 50/100</span>
      } />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", height: h - 60 }}>
        {/* Left column: felt + bottom bar */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", padding: "20px 24px 12px", flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ position: "relative", width: ringW, height: ringH }}>
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                <FeltV2 w={feltW} h={feltH} dark={dark} />
                <div style={{
                  position: "absolute", left: "50%", top: "50%",
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}>
                  <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>pot</span>
                  <span className="hand" style={{ fontSize: 28, color: dark ? "var(--paper)" : "var(--ink)" }}>
                    <span style={{ color: "var(--accent)" }}>$</span>4,200
                  </span>
                  <Board cards={[["A","♠"],["K","♦"],["7","♣"],["2","♥"]]} size="md" />
                </div>
              </div>
              {players.map((p, i) => {
                if (p.isHero) return null; // hero is in the bottom bar
                const pos = V2_SEAT_POSITIONS[i];
                return (
                  <div key={i} style={{ position: "absolute", ...pos }}>
                    <SeatV2 p={p} dark={dark} showHand={false} compact />
                  </div>
                );
              })}
            </div>
          </div>
          {/* Bottom bar */}
          <div style={{
            borderTop: `1.5px solid ${dark ? "var(--ink-soft)" : "var(--ink)"}`,
            background: dark ? "var(--ink)" : "var(--paper-2)",
            padding: "16px 24px",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 24, alignItems: "center",
            color: dark ? "var(--paper)" : "var(--ink)",
            height: bottomBarH,
          }}>
            <HeroSeatV2 dark={dark} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <BetSliderV2 dark={dark} />
              <ChipPresets />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <button className="btn" style={{ padding: "16px 8px", fontSize: 17, background: dark ? "var(--ink)" : "var(--paper)", color: dark ? "var(--paper)" : "var(--ink)", borderColor: dark ? "var(--paper-3)" : "var(--ink)", boxShadow: dark ? "1.5px 1.5px 0 var(--paper-3)" : "1.5px 1.5px 0 var(--ink)" }}>fold</button>
              <button className="btn" style={{ padding: "16px 8px", fontSize: 17, background: dark ? "var(--ink)" : "var(--paper)", color: dark ? "var(--paper)" : "var(--ink)", borderColor: dark ? "var(--paper-3)" : "var(--ink)", boxShadow: dark ? "1.5px 1.5px 0 var(--paper-3)" : "1.5px 1.5px 0 var(--ink)" }}>call $1,200</button>
              <button className="btn btn--primary" style={{ padding: "16px 8px", fontSize: 17 }}>raise $1,500</button>
            </div>
          </div>
        </div>
        {/* Right rail: tabbed */}
        <div style={{ padding: "14px 16px 14px 0", display: "flex", flexDirection: "column" }}>
          <TabbedRail tabs={railTabs} active={0} dark={dark} height={h - 60 - 28} />
        </div>
      </div>
    </div>
  );
}

function HeroSeatV2({ dark }) {
  return (
    <div style={{
      borderWidth: 1.5, borderStyle: "solid",
      borderColor: "var(--accent)", borderRadius: 6,
      padding: "12px 16px",
      background: dark ? "#0F0E0C" : "var(--paper)",
      color: dark ? "var(--paper)" : "var(--ink)",
      position: "relative",
    }}>
      <span style={{
        position: "absolute", top: -1.5, left: -1.5, right: -1.5,
        height: 2.5, background: "var(--accent)", borderRadius: "6px 6px 0 0",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="avatar" style={{
          width: 40, height: 40, fontSize: 16, background: "var(--accent)", color: "var(--paper)",
        }}>JS</span>
        <div style={{ flex: 1 }}>
          <div className="hand" style={{ fontSize: 17, fontWeight: 700 }}>
            you · spy_07 <span className="ml" style={{ marginLeft: 6 }}>BTN · D</span>
          </div>
          <div className="hand-2" style={{ fontSize: 13, color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>
            stack <span style={{ color: "var(--accent)", fontWeight: 700 }}>$12,400</span> · in pot $300
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Card rank="A" suit="♠" size="lg" />
          <Card rank="K" suit="♠" size="lg" />
        </div>
      </div>
    </div>
  );
}

function BetSliderV2({ dark, value = 1500, min = 200, max = 12400 }) {
  const pct = (value - min) / (max - min) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>bet</span>
        <span className="hand" style={{ fontWeight: 700, color: "var(--accent)" }}>
          <span>$</span>{value.toLocaleString()}
        </span>
      </div>
      <div style={{
        height: 14, border: `1.5px solid ${dark ? "var(--paper-3)" : "var(--ink)"}`,
        borderRadius: 7, background: dark ? "#0F0E0C" : "var(--paper)", position: "relative",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`, background: "var(--accent)",
          borderRadius: "6px 0 0 6px", borderRight: `1px solid ${dark ? "var(--paper)" : "var(--ink)"}`,
        }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: -5,
          transform: "translateX(-50%)", width: 22, height: 22,
          borderRadius: "50%", border: `1.5px solid ${dark ? "var(--paper)" : "var(--ink)"}`,
          background: dark ? "var(--ink)" : "var(--paper)",
          boxShadow: dark ? "1px 1px 0 var(--paper-3)" : "1px 1px 0 var(--ink)",
        }} />
      </div>
    </div>
  );
}

// ── Tab content renderers ─────────────────────────────────────────

function ChatInner({ dark }) {
  const lines = [
    ["dealer", "river: 2 of clubs"],
    ["spy_07", "nice hand"],
    ["whiskey", "lol"],
    ["dealer", "spy_07 wins $4,200"],
    ["mira", "gg"],
    ["redacted", "[REDACTED]"],
    ["k0rax", "rip whiskey"],
    ["dealer", "new hand starting · blinds 50/100"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "6px 10px",
        borderBottom: `1px dashed ${dark ? "var(--ink-soft)" : "var(--rule)"}`,
        display: "flex", justifyContent: "space-between",
      }}>
        <span className="ml ml--accent">chat</span>
        <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>6 here</span>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
        {lines.map(([who, msg], i) => (
          <div key={i} className="hand-2" style={{
            fontSize: 13, color: dark ? "var(--paper-2)" : "var(--ink)",
          }}>
            <span style={{
              color: who === "dealer" ? "var(--accent)" : (dark ? "var(--paper)" : "var(--ink)"),
              fontWeight: 700, marginRight: 6, fontFamily: "var(--hand)",
            }}>{who}</span>
            {msg}
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 10px", borderTop: `1px dashed ${dark ? "var(--ink-soft)" : "var(--rule)"}` }}>
        <div className="hand-2" style={{
          fontSize: 13, color: dark ? "var(--paper-3)" : "var(--ink-soft)", fontStyle: "italic",
        }}>type a message…</div>
      </div>
    </div>
  );
}

function HistoryInner({ dark }) {
  const entries = [
    ["pre", "spy_07 raises to 300"],
    ["pre", "mira calls 300"],
    ["pre", "whiskey folds"],
    ["pre", "k0rax folds"],
    ["pre", "nine folds"],
    ["pre", "redacted calls 200"],
    ["flop", "A♠ K♦ 7♣"],
    ["flop", "spy_07 bets 500"],
    ["flop", "mira calls"],
    ["turn", "2♥"],
    ["turn", "spy_07 checks"],
    ["turn", "mira bets 1,200"],
    ["turn", "spy_07 — to act"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "6px 10px",
        borderBottom: `1px dashed ${dark ? "var(--ink-soft)" : "var(--rule)"}`,
        display: "flex", justifyContent: "space-between",
      }}>
        <span className="ml ml--accent">hand history · #4,217</span>
        <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>turn</span>
      </div>
      <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
        {entries.map(([street, line], i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontFamily: "var(--mono)", fontSize: 11 }}>
            <span className="ml" style={{ width: 38, color: "var(--accent)" }}>{street}</span>
            <span style={{ color: dark ? "var(--paper)" : "var(--ink)" }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsInner({ dark }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "6px 10px",
        borderBottom: `1px dashed ${dark ? "var(--ink-soft)" : "var(--rule)"}`,
      }}>
        <span className="ml ml--accent">player stats · last 200</span>
      </div>
      <div style={{ flex: 1, padding: "10px 12px", overflow: "hidden" }}>
        <StatsTable dark={dark} />
        <div className="hand-2" style={{ fontSize: 12, color: dark ? "var(--paper-3)" : "var(--ink-soft)", marginTop: 12, lineHeight: 1.4 }}>
          vpip — voluntarily put in pot · pfr — pre-flop raise · 3bet — 3-bet % · af — aggression factor
        </div>
      </div>
    </div>
  );
}

function SettingsInner({ dark }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px 12px", gap: 14 }}>
      <div>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>auto-actions</div>
        <ToggleRow label="auto-muck losing hand" checked dark={dark} />
        <ToggleRow label="auto-post blinds" checked dark={dark} />
        <ToggleRow label="check / fold when not facing bet" dark={dark} />
        <ToggleRow label="show timer warning sound" checked dark={dark} />
      </div>
      <div>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>display</div>
        <ToggleRow label="dark mode" checked={dark} dark={dark} />
        <ToggleRow label="show opponent equity (spectator)" checked dark={dark} />
        <SelectRow label="card style" value="classic" options={["classic", "minimal", "typographic"]} dark={dark} />
        <SelectRow label="felt theme" value="paper" options={["paper", "dark (matches mode)"]} dark={dark} />
      </div>
      <div>
        <div className="ml ml--accent" style={{ marginBottom: 6 }}>chat</div>
        <ToggleRow label="mute chat" dark={dark} />
        <ToggleRow label="mute emotes" dark={dark} />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked = false, dark }) {
  return (
    <label className="hand-2" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "4px 0", fontSize: 13, color: dark ? "var(--paper)" : "var(--ink)",
    }}>
      <span style={{
        width: 28, height: 16, borderRadius: 8,
        border: `1.25px solid ${dark ? "var(--paper-3)" : "var(--ink)"}`,
        background: checked ? "var(--accent)" : (dark ? "var(--ink)" : "var(--paper)"),
        position: "relative", flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 1, left: checked ? 12 : 1, width: 12, height: 12,
          borderRadius: "50%",
          background: dark ? "var(--paper)" : "var(--paper)",
          border: `1px solid ${dark ? "var(--paper-3)" : "var(--ink)"}`,
        }} />
      </span>
      {label}
    </label>
  );
}
function SelectRow({ label, value, options, dark }) {
  return (
    <div style={{ padding: "4px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span className="hand-2" style={{ fontSize: 13, color: dark ? "var(--paper)" : "var(--ink)" }}>{label}</span>
      <span className="hand" style={{
        fontSize: 13, fontWeight: 700, padding: "3px 10px",
        border: `1.25px solid ${dark ? "var(--paper-3)" : "var(--ink)"}`, borderRadius: 4,
        background: dark ? "var(--ink)" : "var(--paper)",
        color: dark ? "var(--paper)" : "var(--ink)",
      }}>{value} ▾</span>
    </div>
  );
}

function TopbarV2({ title, right, dark }) {
  return (
    <div className="topbar" style={{
      borderBottomColor: dark ? "var(--ink-soft)" : "var(--rule)",
      background: dark ? "var(--ink)" : "transparent",
      color: dark ? "var(--paper)" : "var(--ink)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="sh" style={{ fontSize: 20, color: dark ? "var(--paper)" : "var(--ink)" }}>justanotherspy / poker</span>
        <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>/ {title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {right || <span className="ml" style={{ color: dark ? "var(--paper-3)" : "var(--ink-soft)" }}>blinds 50/100 · hand #4,217 · 04h 12m</span>}
      </div>
    </div>
  );
}

window.SpectatorV2 = SpectatorV2;
window.PlayerV2    = PlayerV2;
