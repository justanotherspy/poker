// proto-rail.jsx — Right rail (tabs: chat, history, stats, agents, settings)

function Rail({ tabs, active, onChange, footer = null }) {
  return (
    <aside className="rail">
      <div className="rail-tabs" data-comment-anchor="59aa79e9ac-div-6-7">
        {tabs.map((t, i) =>
        <button key={t.key}
        className={`rail-tab${i === active ? " is-active" : ""}`}
        onClick={() => onChange && onChange(i)}>
            {t.label}
            {t.badge != null && <span className="rail-tab-badge">{t.badge}</span>}
          </button>
        )}
      </div>
      <div className="rail-body">
        {tabs[active] && tabs[active].render()}
      </div>
      {footer && <div className="rail-footer">{footer}</div>}
    </aside>);

}

// ── Chat ───────────────────────────────────────────────────────────
// Dan: spectators cannot chat → input replaced with a read-only notice.
// Dan: player messages should be "<name>: <message>".
function ChatPanel({ spectator = false }) {
  const lines = [
  ["dealer", "hand #4,217 — dealing flop", "system"],
  ["mira", "let's see what happens", "player"],
  ["spy_07", "tight game tonight", "hero"],
  ["whiskey", "lol", "player"],
  ["dealer", "turn: 2 of hearts", "system"],
  ["k0rax", "ouch", "player"],
  ["redacted", "[REDACTED]", "player"],
  ["mira", "spy your move", "player"]];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">chat</span>
        <span className="meta">6 here</span>
      </div>
      <div className="panel-body chat-stream">
        {lines.map(([who, msg, kind], i) =>
        <div key={i} className={`chat-line chat-line--${kind}`}>
            {kind === "system" ?
              <>
                <span className="chat-who">{who}</span>
                <span className="chat-msg">{msg}</span>
              </> :
              <>
                <span className="chat-who">{who}</span>
                <span className="chat-colon">:</span>
                <span className="chat-msg">{msg}</span>
              </>
            }
          </div>
        )}
      </div>
      <div className="panel-footer" data-comment-anchor="6102dddbc0-div-50-7">
        {spectator ?
          <div className="chat-spectator-notice">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
            <span>spectating — chat is read-only</span>
          </div> :
          <>
            <input className="chat-input" placeholder="Type a message…" />
            <button className="chat-send" aria-label="send">→</button>
          </>
        }
      </div>
    </div>);

}

// ── History ────────────────────────────────────────────────────────
function HistoryPanel() {
  const entries = [
  { street: "pre", text: "spy_07 raises to 300" },
  { street: "pre", text: "mira calls 300" },
  { street: "pre", text: "whiskey folds" },
  { street: "pre", text: "k0rax folds" },
  { street: "pre", text: "nine folds" },
  { street: "pre", text: "redacted calls 300" },
  { street: "flop", text: "A♠ K♦ 7♣", marker: true },
  { street: "flop", text: "spy_07 bets 500" },
  { street: "flop", text: "mira calls" },
  { street: "flop", text: "redacted folds" },
  { street: "turn", text: "2♥", marker: true },
  { street: "turn", text: "spy_07 checks" },
  { street: "turn", text: "mira bets 1,200" },
  { street: "turn", text: "spy_07 — to act", current: true }];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">hand history</span>
        <span className="meta">#4,217 · turn</span>
      </div>
      <div className="panel-body history-stream">
        {entries.map((e, i) =>
        <div key={i} className={`hist-line${e.marker ? " is-marker" : ""}${e.current ? " is-current" : ""}`}>
            <span className="hist-street">{e.street}</span>
            <span className="hist-text">{e.text}</span>
          </div>
        )}
      </div>
    </div>);

}

// ── Stats ──────────────────────────────────────────────────────────
// Dan: each column should be sortable + more detail on what stats mean.
const STAT_COLS = [
  { key: "name",   label: "name",  type: "text", desc: "player handle" },
  { key: "vpip",   label: "vpip",  type: "num",  desc: "Voluntarily Put In Pot. % of hands the player voluntarily put money in pre-flop (excludes blinds). Higher = looser." },
  { key: "pfr",    label: "pfr",   type: "num",  desc: "Pre-Flop Raise. % of hands the player raised pre-flop. Gap from VPIP shows passive vs aggressive open style." },
  { key: "tb",     label: "3b",    type: "num",  desc: "3-Bet %. How often the player re-raises pre-flop when facing a raise." },
  { key: "af",     label: "af",    type: "num",  desc: "Aggression Factor: (bets + raises) ÷ calls on post-flop streets. > 2 is aggressive, < 1 is passive." },
  { key: "wtsd",   label: "wtsd",  type: "num",  desc: "Went To Showdown. % of seen flops that reached showdown." },
];

const STATS_ROWS = [
  { name: "spy_07",   hands: 218, vpip: 46, pfr: 38, tb: 8.2, af: 3.1, wtsd: 28, hero: true,  kind: "human" },
  { name: "mira",     hands: 218, vpip: 22, pfr: 18, tb: 2.4, af: 1.6, wtsd: 31, kind: "agent" },
  { name: "whiskey",  hands: 218, vpip: 38, pfr: 14, tb: 1.1, af: 0.4, wtsd: 42, kind: "human" },
  { name: "k0rax",    hands: 218, vpip: 12, pfr: 10, tb: 0.6, af: 0.2, wtsd: 18, kind: "agent" },
  { name: "nine",     hands: 218, vpip: 28, pfr: 22, tb: 4.0, af: 2.0, wtsd: 24, kind: "agent" },
  { name: "redacted", hands: 218, vpip: 31, pfr: 26, tb: 3.5, af: 1.9, wtsd: 33, kind: "agent" },
];

function StatsPanel() {
  const [sortKey, setSortKey] = useState("vpip");
  const [sortDir, setSortDir] = useState("desc");
  const [openLegend, setOpenLegend] = useState(false);

  const onSort = (k) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...STATS_ROWS].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [sortKey, sortDir]);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">player stats</span>
        <span className="meta">last 218 hands</span>
      </div>
      <div className="panel-body stats-body" data-comment-anchor="30b30ce84f-div-110-7">
        <div className="stats-table">
          <div className="stats-row stats-row--head" data-comment-anchor="2b9e3efeb4-div-112-11">
            {STAT_COLS.map((c) => (
              <button key={c.key}
                className={`stats-th${sortKey === c.key ? " is-sorted" : ""}`}
                onClick={() => onSort(c.key)}
                title={c.desc}>
                <span>{c.label}</span>
                <span className="stats-th-arrow">
                  {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                </span>
              </button>
            ))}
          </div>
          {sorted.map((r) =>
          <div key={r.name} className={`stats-row${r.hero ? " is-hero" : ""}`}>
              <span className="stats-name">
                {r.name}
                {r.kind === "agent" && <span className="stats-kind">AI</span>}
              </span>
              <span className="stats-num">{r.vpip}</span>
              <span className="stats-num stats-num--muted">{r.pfr}</span>
              <span className="stats-num stats-num--muted">{r.tb}</span>
              <span className="stats-num stats-num--muted">{r.af}</span>
              <span className="stats-num stats-num--muted">{r.wtsd}</span>
            </div>
          )}
        </div>

        <button className="stats-legend-toggle" onClick={() => setOpenLegend(!openLegend)}>
          <span>{openLegend ? "Hide" : "What do these mean?"}</span>
          <span className="stats-legend-chev">{openLegend ? "▾" : "▸"}</span>
        </button>
        {openLegend && (
          <div className="stats-legend">
            {STAT_COLS.filter((c) => c.key !== "name").map((c) => (
              <div key={c.key} className="stats-legend-row">
                <div className="stats-legend-head">
                  <span className="stats-legend-key">{c.label}</span>
                  <span className="stats-legend-full">{LEGEND_FULL[c.key]}</span>
                </div>
                <p className="stats-legend-desc">{c.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>);

}

const LEGEND_FULL = {
  vpip:  "voluntarily put $ in pot",
  pfr:   "pre-flop raise",
  tb:    "3-bet",
  af:    "aggression factor",
  wtsd:  "went to showdown",
};

// ── Agents ─────────────────────────────────────────────────────────
// Dan: a tab for Claude agents — token in/out, model, persona, and an
// internal thoughts feed (polled from the game server's agent API,
// SPECTATOR ONLY).
function AgentsPanel({ focusName = null, onFocusChange }) {
  const agents = PLAYERS.filter((p) => p.kind === "agent");
  const [internalSelected, setInternalSelected] = useState(agents[1]?.name || agents[0]?.name);
  // If a focusName is set from outside (clicked AI seat), use it.
  const selectedName = focusName && agents.some((a) => a.name === focusName) ? focusName : internalSelected;
  const selected = agents.find((a) => a.name === selectedName) || agents[0];
  const thoughts = (AGENT_THOUGHTS[selected.name] || []);

  const setSelectedName = (name) => {
    setInternalSelected(name);
    if (onFocusChange) onFocusChange(name);
  };

  const totalIn = agents.reduce((s, a) => s + a.tokensIn, 0);
  const totalOut = agents.reduce((s, a) => s + a.tokensOut, 0);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">agents</span>
        <span className="meta">{agents.length} active · {(totalIn + totalOut).toLocaleString()} tok</span>
      </div>
      <div className="panel-body agents-body">
        <div className="agents-list">
          {agents.map((a) => {
            const active = a.name === selected.name;
            return (
              <button key={a.name}
                className={`agent-card${active ? " is-active" : ""}`}
                onClick={() => setSelectedName(a.name)}>
                <div className="agent-card-top">
                  <Avatar initials={a.initials} size={26} />
                  <div className="agent-card-id">
                    <div className="agent-card-name">{a.name}</div>
                    <div className="agent-card-model">{a.model}</div>
                  </div>
                  <span className={`agent-card-status${a.toAct ? " is-thinking" : ""}`}>
                    {a.toAct ? "thinking…" : a.folded ? "folded" : "idle"}
                  </span>
                </div>
                <div className="agent-card-persona">“{a.persona}”</div>
                <div className="agent-card-tokens">
                  <span><span className="tk-arrow">↓</span> in {a.tokensIn.toLocaleString()}</span>
                  <span><span className="tk-arrow tk-arrow--out">↑</span> out {a.tokensOut.toLocaleString()}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="agent-detail">
          <div className="agent-detail-head">
            <span className="label">internal thoughts</span>
            <span className="meta">{selected.name} · live</span>
          </div>
          <div className="agent-thoughts">
            {thoughts.length === 0 ?
              <div className="agent-thoughts-empty">
                Agent has not posted thoughts for this hand yet.
              </div> :
              thoughts.map((t, i) => (
                <div key={i} className="thought-line">
                  <span className="thought-street">{t.street}</span>
                  <span className="thought-text">{t.text}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────
// Dan: "Timer warning sound" is not an auto-action — moved under its own
// Sound section. Card-style picker shows visual previews and adds a
// separate Card Back selector (3 backs).
function SettingsPanel({ dark, onToggleDark, cardStyle, onCardStyle, cardBack, onCardBack, spectator }) {
  const [autoMuck, setAutoMuck] = useState(true);
  const [autoPost, setAutoPost] = useState(true);
  const [autoCheckFold, setAutoCheckFold] = useState(false);
  const [sound, setSound] = useState(true);
  const [showOppEq, setShowOppEq] = useState(true);
  const [muteChat, setMuteChat] = useState(false);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">settings</span>
      </div>
      <div className="panel-body settings-body">
        {!spectator &&
          <div className="settings-group">
            <h4 className="settings-h">Auto actions</h4>
            <Toggle checked={autoMuck} onChange={setAutoMuck} label="Auto-muck losing hand" />
            <Toggle checked={autoPost} onChange={setAutoPost} label="Auto-post blinds" />
            <Toggle checked={autoCheckFold} onChange={setAutoCheckFold} label="Check / fold when not facing bet" />
          </div>
        }

        <div className="settings-group">
          <h4 className="settings-h">Sound</h4>
          <Toggle checked={sound} onChange={setSound} label="Timer warning sound" />
          <Toggle checked={true} onChange={() => {}} label="Action effects (bet, fold, deal)" />
        </div>

        <div className="settings-group">
          <h4 className="settings-h">Display</h4>
          <Toggle checked={dark} onChange={onToggleDark} label="Dark mode" />
          <Toggle checked={showOppEq} onChange={setShowOppEq} label="Show opponent equity (spectator only)" />

          <div className="settings-select" data-comment-anchor="6e506290a5-div-167-11">
            <label>Card face</label>
            <div className="card-style-picker">
              {[
                { id: "classic",     name: "Classic",     hint: "rank + suit corners with watermark" },
                { id: "minimal",     name: "Minimal",     hint: "single tiny corner index" },
                { id: "typographic", name: "Typographic", hint: "big centred rank, serif" },
              ].map((opt) => (
                <button key={opt.id}
                  className={`card-style-opt${cardStyle === opt.id ? " is-active" : ""}`}
                  onClick={() => onCardStyle && onCardStyle(opt.id)}
                  title={opt.hint}>
                  <CardStylePreview variant={opt.id} />
                  <span className="card-style-name">{opt.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-select">
            <label>Card back</label>
            <div className="card-style-picker">
              {[
                { id: "weave",  name: "Weave"  },
                { id: "dots",   name: "Dots"   },
                { id: "checker",name: "Checker"},
              ].map((opt) => (
                <button key={opt.id}
                  className={`card-style-opt${cardBack === opt.id ? " is-active" : ""}`}
                  onClick={() => onCardBack && onCardBack(opt.id)}>
                  <CardBackPreview variant={opt.id} />
                  <span className="card-style-name">{opt.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4 className="settings-h">Chat</h4>
          <Toggle checked={muteChat} onChange={setMuteChat} label="Mute chat" />
        </div>
      </div>
    </div>);

}

// Small preview chip used in the card-face picker so users can choose
// visually (Dan: "little icons here of examples").
function CardStylePreview({ variant }) {
  return (
    <span className={`pc card-style-preview card-style-preview--${variant}`} data-card-style={variant}>
      {variant === "classic" && (
        <>
          <span className="pc-corner pc-corner--tl">
            <span className="pc-rank">A</span>
            <span className="pc-suit">♠</span>
          </span>
          <span className="pc-center">♠</span>
          <span className="pc-corner pc-corner--br">
            <span className="pc-rank">A</span>
            <span className="pc-suit">♠</span>
          </span>
        </>
      )}
      {variant === "minimal" && (
        <span className="pc-corner pc-corner--tl">
          <span className="pc-rank">A</span>
          <span className="pc-suit">♠</span>
        </span>
      )}
      {variant === "typographic" && (
        <span className="pc-typo">
          <span className="pc-typo-rank">A</span>
          <span className="pc-typo-suit">♠</span>
        </span>
      )}
    </span>
  );
}

function CardBackPreview({ variant }) {
  return <span className={`pc pc--back card-back-preview card-back-preview--${variant}`} />;
}

Object.assign(window, { Rail, ChatPanel, HistoryPanel, StatsPanel, AgentsPanel, SettingsPanel, CardStylePreview, CardBackPreview });
