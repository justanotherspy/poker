// proto-app.jsx — Root composition: topbar, table, rail, action bar (player)

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "spectator",
  "phase": "active",
  "theme": "light",
  "card_style": "classic",
  "card_back": "weave",
  "felt_width": 720,
  "show_grid_guides": false
} /*EDITMODE-END*/;

// ── Topbar ─────────────────────────────────────────────────────────
function Topbar({ view, theme, phase, onView, onTheme, onPhase }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" data-comment-anchor="5cc304b197-span-17-11" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 1.4c1.6 2.5 4.4 4.4 4.4 7 0 1.5-1 2.7-2.4 2.7-.6 0-1.1-.2-1.5-.5l.5 2.8h-2l.5-2.8c-.4.3-.9.5-1.5.5-1.4 0-2.4-1.2-2.4-2.7 0-2.6 2.8-4.5 4.4-7z" />
            </svg>
          </span>
          <span className="brand-name">justanotherspy <span className="brand-sep">/</span> poker</span>
        </div>
        <span className="topbar-sep">·</span>
        <span className="topbar-context">
          {view === "spectator" ?
          <>spectating <span className="meta">table #1284 · 6-max NLH</span></> :
          <>seat 4 · spy_07 <span className="meta">BTN · blinds 50/100</span></>}
        </span>
      </div>
      <div className="topbar-right">
        <span className="meta">hand #4,217 · 04h 12m</span>
        {/* Phase selector — flips between active hand and the showdown
            view we prototyped for the end-of-hand state. */}
        <div className="seg-group">
          <button className={`seg seg--sm${phase === "active" ? " is-active" : ""}`}
            onClick={() => onPhase("active")}>active</button>
          <button className={`seg seg--sm${phase === "showdown" ? " is-active" : ""}`}
            onClick={() => onPhase("showdown")}>showdown</button>
        </div>
        <div className="seg-group">
          <button className={`seg seg--sm${view === "spectator" ? " is-active" : ""}`}
            onClick={() => onView("spectator")}>spectator</button>
          <button className={`seg seg--sm${view === "player" ? " is-active" : ""}`}
            onClick={() => onView("player")}>player</button>
        </div>
        <button className="theme-toggle" onClick={() => onTheme(theme === "light" ? "dark" : "light")}
          aria-label="toggle theme">
          {theme === "light" ?
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M16 11a6 6 0 1 1-7-7 5 5 0 0 0 7 7z" fill="currentColor" />
            </svg> :
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="3.5" fill="currentColor" />
              <g strokeLinecap="round">
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M3.9 16.1l1.4-1.4M14.7 5.3l1.4-1.4" />
              </g>
            </svg>
          }
        </button>
      </div>
    </header>);

}

// Small ? help glyph with hover tooltip. Used by the auto-actions row
// (Dan: "a ? we can hover over that explains what each of these buttons
// does"). Pure CSS tooltip — no JS.
function HelpHint({ children, label = "what is this?" }) {
  return (
    <span className="help-hint" tabIndex={0} aria-label={label}>
      <span className="help-hint-glyph">?</span>
      <span className="help-hint-tip" role="tooltip">{children}</span>
    </span>
  );
}

// ── Player action bar (bottom of left column in player view) ────────
function ActionBar({ blinds = { sb: 50, bb: 100 }, toCall = 1200, pot = 4200, stack = 12400 }) {
  const min = Math.max(blinds.bb * 2, toCall * 2);
  const max = stack;
  const [bet, setBet] = useState(min);
  // Clamp the slider display to [0, 100] so the thumb/fill never escape
  // the track when the typed/preset bet falls below min (Dan).
  const rawPct = (bet - min) / (max - min) * 100;
  const pct = Math.max(0, Math.min(100, rawPct));
  const belowMin = bet < min;

  const presets = [
  { label: "min",    v: min },
  { label: "3× BB",  v: blinds.bb * 3 },
  { label: "½ pot",  v: Math.round(pot * 0.5) },
  { label: "pot",    v: pot },
  { label: "2× pot", v: pot * 2 },
  { label: "all-in", v: max }];


  return (
    <div className="actionbar">
      {/* Row 1: hero hand cards + stack readout + auto toggles */}
      <div className="actionbar-top">
        <div className="hero-summary">
          <div className="hero-cards">
            <Card rank="A" suit="♠" size="lg" />
            <Card rank="K" suit="♠" size="lg" />
          </div>
          <div className="hero-id">
            <div className="hero-name">spy_07 <span className="hero-pos">BTN</span></div>
            <div className="hero-stack">
              stack <b>$12,400</b> · committed $300 · <span style={{ color: "var(--accent)" }}>38% to win</span>
            </div>
          </div>
        </div>

        <div className="auto-actions" data-comment-anchor="a66f7801d7-div-98-9">
          <span className="label">auto on next</span>
          <button className="auto-chip">check / fold</button>
          <button className="auto-chip is-on">muck losers</button>
          <button className="auto-chip">sit out</button>
          <HelpHint label="what auto-actions do">
            <p><b>check / fold</b> — auto-check when no bet faces you; otherwise fold instantly when action comes.</p>
            <p><b>muck losers</b> — auto-muck (hide) your hand at showdown when you can't win.</p>
            <p><b>sit out</b> — fold every hand starting next deal until you sit back in.</p>
            <p className="hint-foot">Auto-actions execute on your next decision point.</p>
          </HelpHint>
        </div>
      </div>

      {/* Row 2: bet slider + presets + actions */}
      <div className="actionbar-bottom">
        <div className="bet-block">
          <div className="bet-readout">
            <span className="label">your bet</span>
            <span className="bet-amt" data-comment-anchor="f72dca9f4a-span-96-13">${bet.toLocaleString()}</span>
          </div>
          <div className="bet-slider">
            <div className="bet-track">
              <div className="bet-fill" style={{ width: `${pct}%` }} />
              <input type="range" min={min} max={max} step={50}
                value={Math.max(min, Math.min(max, bet))}
                onChange={(e) => setBet(+e.target.value)}
                className="bet-input" data-comment-anchor="a76da19677-input-116-15" />
              <div className="bet-thumb" style={{ left: `${pct}%` }} />
            </div>
            <div className="bet-presets" data-comment-anchor="961174d911-div-106-13">
              {presets.map((p) => {
                const disabled = p.v < min;
                return (
                  <button key={p.label}
                    className={`preset${bet === p.v ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                    onClick={() => !disabled && setBet(p.v)}
                    disabled={disabled}
                    title={disabled ? `below minimum bet ($${min.toLocaleString()})` : `set bet to $${p.v.toLocaleString()}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <Button variant="fold" size="lg">
            <span className="btn-main">Fold</span>
          </Button>
          <Button variant="call" size="lg">
            <span className="btn-main">Call</span>
            <span className="btn-sub">${toCall.toLocaleString()}</span>
          </Button>
          <Button variant="raise" size="lg" disabled={belowMin}>
            <span className="btn-main">Raise</span>
            <span className="btn-sub">${bet.toLocaleString()}</span>
          </Button>
        </div>
      </div>
    </div>);

}

// ── End-of-hand bar (player view, showdown) ──────────────────────────
// Replaces the action bar when the hand is over.
function EndOfHandBar({ won = false }) {
  return (
    <div className={`endbar${won ? " endbar--won" : ""}`}>
      <div className="endbar-left">
        <div className="endbar-headline">
          {won ?
            <>You win <b>$4,200</b> · two pair, aces &amp; kings</> :
            <>spy_07 wins <b>$4,200</b> · two pair, aces &amp; kings</>
          }
        </div>
        <div className="endbar-sub">
          Next hand starting in <b>5s</b>. <span className="meta">small blind moves to seat 5</span>
        </div>
      </div>
      <div className="endbar-right">
        <button className="btn btn--md endbar-secondary">View hand replay</button>
        <button className="btn btn--md endbar-primary">Ready for next →</button>
      </div>
    </div>
  );
}

// ── Spectator status bar (minimal — detailed info lives in tabs) ─────
function SpectatorStatusBar({ phase = "active" }) {
  if (phase === "showdown") {
    return (
      <div className="statusbar statusbar--showdown">
        <div className="statusbar-item">
          <span className="label">winner</span>
          <span className="statusbar-val statusbar-val--accent">spy_07</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="label">hand</span>
          <span className="statusbar-val">two pair, A &amp; K</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="label">pot</span>
          <span className="statusbar-val">$4,200</span>
        </div>
        <div className="statusbar-divider" />
        <div className="statusbar-item">
          <span className="label">next hand</span>
          <span className="statusbar-val statusbar-val--mono">in 5s</span>
        </div>
        <div className="statusbar-spacer" />
        <div className="statusbar-meta">
          <button className="btn btn--md endbar-secondary">View replay</button>
        </div>
      </div>
    );
  }
  return (
    <div className="statusbar">
      <div className="statusbar-item">
        <span className="label">street</span>
        <span className="statusbar-val">turn</span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">to act</span>
        <span className="statusbar-val statusbar-val--accent">spy_07 · 18s</span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">main pot</span>
        <span className="statusbar-val">$4,200</span>
      </div>
      <div className="statusbar-divider" />
      <div className="statusbar-item">
        <span className="label">last</span>
        <span className="statusbar-val statusbar-val--mono">mira bets $1,200</span>
      </div>
      <div className="statusbar-spacer" />
      <div className="statusbar-meta">
        <span className="meta">details in tabs →</span>
      </div>
    </div>);

}

// ── Root ───────────────────────────────────────────────────────────
function PokerPrototype() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const view = t.view || "player";
  const phase = t.phase || "active";
  const theme = t.theme || "light";
  const cardStyle = t.card_style || "classic";
  const cardBack = t.card_back || "weave";
  const feltW = +t.felt_width || 800;

  const spectator = view === "spectator";

  const [tab, setTab] = useState(spectator ? 3 : 0);
  const [agentFocus, setAgentFocus] = useState(null);
  const dark = theme === "dark";

  const setView = (v) => {
    setTweak("view", v);
    setTab(v === "spectator" ? 3 : 0);
  };
  const setTheme = (th) => setTweak("theme", th);
  const setPhase = (p) => setTweak("phase", p);
  const setCardStyle = (cs) => setTweak("card_style", cs);
  const setCardBack = (cb) => setTweak("card_back", cb);

  // Clicking an AI seat in spectator → Agents tab + focus that agent.
  const handleInspectAgent = (p) => {
    setAgentFocus(p.name);
    // Find the agents tab index in the current tab list (it's only
    // present in spectator mode).
    const tabs = railTabs;
    const idx = tabs.findIndex((t) => t.key === "agents");
    if (idx >= 0) setTab(idx);
  };

  const railTabs = [
    { key: "chat",    label: "Chat",    badge: spectator ? null : 3, render: () => <ChatPanel spectator={spectator} /> },
    { key: "history", label: "History", render: () => <HistoryPanel /> },
    { key: "stats",   label: "Stats",   render: () => <StatsPanel /> },
    spectator && { key: "agents", label: "Agents", badge: 4, render: () => <AgentsPanel focusName={agentFocus} onFocusChange={setAgentFocus} /> },
    { key: "settings", label: "Settings", render: () =>
      <SettingsPanel
        spectator={spectator}
        dark={dark} onToggleDark={(v) => setTheme(v ? "dark" : "light")}
        cardStyle={cardStyle} onCardStyle={setCardStyle}
        cardBack={cardBack} onCardBack={setCardBack} />
    },
  ].filter(Boolean);

  const safeTab = Math.min(tab, railTabs.length - 1);

  return (
    <Scaler theme={theme}>
    <div className="proto" data-theme={theme} data-card-style={cardStyle} data-card-back={cardBack} data-phase={phase}>
      <Topbar view={view} theme={theme} phase={phase} onView={setView} onTheme={setTheme} onPhase={setPhase} />
      <main className="proto-main">
        <section className="proto-stage">
          <div className="stage-felt-wrap">
            <Table
                feltW={feltW}
                feltH={Math.round(feltW * 0.47)}
                players={PLAYERS}
                spectator={spectator}
                phase={phase}
                showdown={phase === "showdown" ? SHOWDOWN : null}
                onInspectAgent={spectator ? handleInspectAgent : null} />
          </div>
          {spectator ?
            <SpectatorStatusBar phase={phase} /> :
            (phase === "showdown" ? <EndOfHandBar won /> : <ActionBar />)
          }
        </section>
        <Rail tabs={railTabs} active={safeTab} onChange={setTab} />
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="View">
          <TweakRadio label="Mode" value={view} onChange={setView}
            options={[{ label: "Spectator", value: "spectator" }, { label: "Player", value: "player" }]} />
          <TweakRadio label="Phase" value={phase} onChange={setPhase}
            options={[{ label: "Active", value: "active" }, { label: "Showdown", value: "showdown" }]} />
          <TweakRadio label="Theme" value={theme} onChange={(v) => setTweak("theme", v)}
            options={[{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} />
        </TweakSection>
        <TweakSection label="Look">
          <TweakRadio label="Card face" value={cardStyle} onChange={setCardStyle}
            options={[
            { label: "Classic", value: "classic" },
            { label: "Minimal", value: "minimal" },
            { label: "Typo", value: "typographic" }]
            } />
          <TweakRadio label="Card back" value={cardBack} onChange={setCardBack}
            options={[
            { label: "Weave", value: "weave" },
            { label: "Dots", value: "dots" },
            { label: "Check", value: "checker" }]
            } />
          <TweakSlider label="Felt width" value={feltW}
            min={640} max={820} step={20}
            onChange={(v) => setTweak("felt_width", v)} />
        </TweakSection>
        <TweakSection label="Round 2 — Dan's notes">
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
            <p>✓ Showdown / end-of-hand view (toggle "Phase" above)</p>
            <p>✓ Seats lift on hover; AI seats clickable → Agents tab</p>
            <p>✓ "?" help bubble on auto-actions row</p>
            <p>✓ Slider thumb stays inside track when bet &lt; min</p>
            <p>✓ Presets below min greyed out + disabled</p>
            <p>✓ Active auto-chip keeps its accent on hover (no flip)</p>
            <p>✓ Side chip stacks pushed outward — no more card overlap</p>
            <p>✓ Bet amount moved to a badge under each seat</p>
            <p>✓ Rail tabs tightened — Settings tab no longer cut off</p>
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
   </Scaler>);

}

function Scaler({ theme, children }) {
  const [s, setS] = useState(1);
  useEffect(() => {
    function fit() {
      const W = window.innerWidth,H = window.innerHeight;
      const sx = W / 1400,sy = H / 880;
      setS(Math.min(sx, sy, 1));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="proto-host" data-theme={theme}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "center center", flexShrink: 0 }}>
        {children}
      </div>
    </div>);

}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<PokerPrototype />);
