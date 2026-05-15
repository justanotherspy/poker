// proto-table.jsx — Felt + seats + chips + board + pot

// ── Felt: clean oval with subtle inner rim, theme-aware ─────────────
function Felt({ w = 760, h = 380 }) {
  const id = `felt-grad-${w}-${h}`;
  return (
    <svg className="felt-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <defs>
        <radialGradient id={id} cx="50%" cy="48%" r="58%">
          <stop offset="0%" stopColor="var(--felt-center)" />
          <stop offset="100%" stopColor="var(--felt-edge)" />
        </radialGradient>
      </defs>
      {/* outer rim ring */}
      <rect x="2" y="2" width={w - 4} height={h - 4} rx={(h - 4) / 2}
      fill="var(--felt-rim)" />
      {/* felt surface */}
      <rect x="14" y="14" width={w - 28} height={h - 28} rx={(h - 28) / 2}
      fill={`url(#${id})`} data-comment-anchor="49e3132c9a-rect-18-7" />
      {/* faint inner ring */}
      <rect x="22" y="22" width={w - 44} height={h - 44} rx={(h - 44) / 2}
      fill="none" stroke="var(--felt-line)" strokeWidth="1" opacity="0.5" />
    </svg>);

}

// ── Community board: 5 slots ───────────────────────────────────────
function Board({ cards = [], size = "lg" }) {
  return (
    <div className="board">
      {[0, 1, 2, 3, 4].map((i) =>
      cards[i] ?
      <Card key={i} rank={cards[i][0]} suit={cards[i][1]} size={size} /> :
      <CardSlot key={i} size={size} />
      )}
    </div>);

}

// ── Pot indicator (center of felt) ─────────────────────────────────
function Pot({ amount = 4200, side, label = "pot" }) {
  return (
    <div className="pot">
      <span className="pot-label">{label}</span>
      <span className="pot-amt">
        <span className="pot-amt-sign">$</span>{amount.toLocaleString()}
      </span>
      {side != null && side > 0 &&
      <span className="pot-side">+ side ${side.toLocaleString()}</span>
      }
    </div>);

}

// ── Seat ────────────────────────────────────────────────────────────
// Shows: avatar, name, position, stack, hole cards, last action.
// Phase = "active" | "showdown". On showdown, winners get a halo and
// the seat shows the hand strength.
// Clickable=true (spectator + AI) makes the seat focusable + nudges up
// on hover (Dan: hover animation, click AI → agents tab).
function Seat({ p, showHand = true, hero = false, phase = "active", showdownInfo, clickable = false, onClick }) {
  const isWinner = phase === "showdown" && showdownInfo && showdownInfo.win;
  const isLoser  = phase === "showdown" && showdownInfo && !showdownInfo.win && showdownInfo.shows;

  const cls = [
  "seat",
  p.folded ? "is-folded" : "",
  p.toAct ? "is-to-act" : "",
  hero ? "is-hero" : "",
  p.kind === "agent" ? "is-agent" : "",
  clickable ? "is-clickable" : "",
  isWinner ? "is-winner" : "",
  isLoser ? "is-loser" : ""].
  filter(Boolean).join(" ");

  const handleClick = clickable && onClick ? () => onClick(p) : undefined;
  const handleKey = clickable && onClick ? (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(p); }
  } : undefined;

  return (
    <div className={cls}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={clickable ? `Inspect ${p.name}'s agent thoughts` : undefined}>
      {/* To-act chip floats ABOVE the seat (Dan: don't cover the name) */}
      {p.toAct && phase === "active" &&
      <div className="seat-toact" data-comment-anchor="e908a8bef5-div-69-9">
          <span className="seat-toact-pulse" />
          to act · {p.timer ?? 18}s
        </div>
      }
      {isWinner &&
      <div className="seat-winner-banner">
        <span className="seat-winner-amt">+${(showdownInfo.amount || 0).toLocaleString()}</span>
        <span className="seat-winner-label">wins</span>
      </div>
      }
      {p.kind === "agent" &&
      <span className="seat-agent-badge" title={`${p.model} \u00b7 ${p.persona}`}>AI</span>
      }
      <div className="seat-row">
        <Avatar initials={p.initials} hero={p.hero} size={32} />
        <div className="seat-id">
          <div className="seat-name">{p.name}</div>
          <div className="seat-meta">
            <span className="seat-stack"><span className="seat-stack-sign">$</span>{p.stack.toLocaleString()}</span>
            <span className="seat-pos">{p.pos}</span>
          </div>
        </div>
      </div>
      <div className="seat-hand">
        <span className="seat-holecards">
          {showHand && !p.folded ?
            p.hand.map(([r, s], i) => <Card key={i} rank={r} suit={s} size="sm" />) :
            p.hand.map((_, i) => <Card key={i} facedown size="sm" />)}
        </span>
        {p.action && !p.toAct && phase === "active" &&
        <span className="seat-action">{p.action}</span>
        }
        {phase === "showdown" && showdownInfo &&
        <span className="seat-action seat-action--showdown">
          <span className="sd-line1">{showdownInfo.rankName}{showdownInfo.kicker ? "," : ""}</span>
          {showdownInfo.kicker && <span className="sd-line2">{showdownInfo.kicker}</span>}
        </span>
        }
      </div>
    </div>);

}

// ── The bet chip stack that sits between seat and pot ────────────────
// Dan: amount label was overlapping the community cards. It's now
// rendered as a separate badge under each seat (see <SeatBetBadge/>).
function SeatBet({ p }) {
  if (!p.bet) return null;
  return (
    <div className="seat-bet">
      <ChipStack amount={p.bet} scale={0.85} showAmt={false} />
    </div>);

}

// A small "bet $X" badge that sits underneath the seat, so the chip-amount
// no longer overlaps the felt's centre cards (Dan).
function SeatBetBadge({ p, position }) {
  if (!p.bet) return null;
  return (
    <span className={`seat-bet-badge seat-bet-badge--${position}`}>
      <span className="seat-bet-badge-sign">$</span>{p.bet.toLocaleString()}
    </span>
  );
}

// ── Dealer / blind tokens positioned near each seat on the felt rim ──
function SeatTokens({ p, layout }) {
  const tokens = [];
  if (p.button) tokens.push(<DealerButton key="d" size={24} />);
  if (p.blind === "SB") tokens.push(<BlindToken key="sb" kind="SB" size={22} />);
  if (p.blind === "BB") tokens.push(<BlindToken key="bb" kind="BB" size={22} />);
  if (!tokens.length) return null;
  return (
    <div className="seat-tokens">{tokens}</div>);

}

// ── Composed table ──────────────────────────────────────────────────
function Table({
  feltW = 720,
  feltH = 340,
  players = PLAYERS,
  board = [["A", "♠"], ["K", "♦"], ["7", "♣"], ["2", "♥"]],
  pot = 4200,
  stage = "turn · waiting for river",
  spectator = true,
  phase = "active",
  showdown = null,
  onInspectAgent = null,
}) {
  const ringW = feltW + 360;
  const ringH = feltH + 290;
  const cx = ringW / 2;
  const cy = ringH / 2;

  // In showdown we may render the river card if available, and pull chips
  // toward the winner. Players who showed get their hands revealed.
  const sdBoard = phase === "showdown" ? [["A","♠"], ["K","♦"], ["7","♣"], ["2","♥"], ["8","♣"]] : board;
  const sdStage = phase === "showdown" ? "showdown · hand complete" : stage;
  const sdPotShown = phase === "showdown" ? 0 : pot; // pot moved to winner

  const winnerName = phase === "showdown" && showdown ? showdown.winners[0] : null;

  return (
    <div className={`table-ring${phase === "showdown" ? " is-showdown" : ""}`}
      style={{ width: ringW, height: ringH }}
      data-comment-anchor="d2e0bf7f64-div-137-5">
      {/* felt at center */}
      <div className="table-felt" style={{ left: cx - feltW / 2, top: cy - feltH / 2 }}>
        <Felt w={feltW} h={feltH} />
        <div className="table-center">
          <span className="table-stage">{sdStage}</span>
          {phase === "active" ? (
            <Pot amount={sdPotShown} />
          ) : (
            <div className="pot pot--collected">
              <span className="pot-label">collected</span>
              <span className="pot-amt"><span className="pot-amt-sign">$</span>{pot.toLocaleString()}</span>
              <span className="pot-side">→ {winnerName}</span>
            </div>
          )}
          <Board cards={sdBoard} size="lg" />
        </div>
      </div>

      {/* seat bets (chip stacks) on the felt. Hidden during showdown
          because chips have been collected into the pot/winner stack. */}
      {phase === "active" && players.map((p, i) => {
        const L = SEAT_LAYOUT[i];
        if (!L) return null;
        return (
          <div key={`bet-${i}`} className="table-seatbet-wrap"
          style={{ left: cx + L.chipX, top: cy + L.chipY }}>
            <SeatBet p={p} />
          </div>);
      })}

      {/* chip-flow: a single chip stack representing pot moving to winner */}
      {phase === "showdown" && winnerName && (() => {
        const wi = players.findIndex((p) => p.name === winnerName);
        const L = SEAT_LAYOUT[wi];
        if (!L) return null;
        // halfway between centre and winner seat
        return (
          <div key="chipflow" className="table-chipflow"
            style={{ left: cx + L.chipX, top: cy + L.chipY }}>
            <ChipStack amount={pot} scale={1} showAmt={true} />
          </div>
        );
      })()}

      {/* seats */}
      {players.map((p, i) => {
        const L = SEAT_LAYOUT[i];
        if (!L) return null;
        const showHand = spectator || !!p.hero ||
          (phase === "showdown" && showdown?.hands?.[p.name]?.shows);
        const heroFlag = !spectator && !!p.hero && phase === "active";
        const sd = showdown?.hands?.[p.name];
        const sdInfo = sd ? {
          ...sd,
          amount: sd.win ? showdown.pot : 0,
        } : null;
        // AI seats are clickable in spectator → directs to Agents tab
        // (Dan). Player view: nothing happens on click.
        const clickable = spectator && p.kind === "agent" && onInspectAgent;
        return (
          <div key={`seat-${i}`} className={`table-seat table-seat--${L.align}`}
          style={{ left: cx + L.x, top: cy + L.y }}>
            <Seat
              p={p}
              showHand={showHand}
              hero={heroFlag}
              phase={phase}
              showdownInfo={sdInfo}
              clickable={clickable}
              onClick={onInspectAgent} />
            <SeatTokens p={p} layout={L} />
            {/* Bet amount badge sits UNDER the seat so it doesn't overlap
                the board cards on the felt (Dan). Position varies per seat
                so it always points TOWARD the centre chip stack. */}
            {phase === "active" && <SeatBetBadge p={p} position={L.align} />}
          </div>);
      })}
    </div>);

}

Object.assign(window, { Felt, Board, Pot, Seat, SeatBet, SeatBetBadge, SeatTokens, Table });
