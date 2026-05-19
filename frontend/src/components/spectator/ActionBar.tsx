"use client";

import { useState } from "react";
import type { PlayerView, SpectatorSeat, SpectatorView } from "@/lib/types";
import { Card } from "./Card";

const PHRASES: Record<number, string> = {
  1: "Nice hand.",
  2: "Wow, lucky!",
  3: "I see you.",
  4: "Bold move.",
  5: "Let's go.",
  6: "Good game.",
  7: "Really?",
  8: "Interesting.",
  9: "Time to go.",
  10: "All in!",
};

// Clamp to [0, 100] so thumb never escapes the track.
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function HelpHint({ children }: { children: React.ReactNode }) {
  return (
    <span className="help-hint" tabIndex={0} aria-label="what is this?">
      <span className="help-hint-glyph">?</span>
      <span className="help-hint-tip" role="tooltip">
        {children}
      </span>
    </span>
  );
}

export function ActionBar({
  view,
  playerView,
  heroSeat,
  onAct,
  onSay,
}: {
  view: SpectatorView;
  playerView: PlayerView;
  heroSeat: SpectatorSeat;
  onAct: (
    action: "fold" | "check" | "call" | "raise" | "bet",
    opts?: { amount?: number; bluffDeclared?: boolean },
  ) => Promise<void>;
  onSay: (phraseId: number) => Promise<void>;
}) {
  const isMyturn = view.current_actor === heroSeat.seat_id;

  // Derive BB from the table (smallest non-zero blind amount among non-hero seats,
  // or fall back to 1 to avoid division-by-zero).
  const bb = Math.max(
    1,
    view.seats
      .filter((s) => s.blind === "BB")
      .map((s) => s.bet)
      .find((b) => b > 0) ?? 100,
  );

  const toCall = playerView.to_call;
  const minBet = Math.max(bb * 2, toCall > 0 ? toCall * 2 : bb * 2);
  const maxBet = heroSeat.stack;
  const initialBet = clamp(minBet, minBet, maxBet);

  const [bet, setBet] = useState(initialBet);
  const [autoCheckFold, setAutoCheckFold] = useState(false);
  const [autoMuckLosers, setAutoMuckLosers] = useState(true);
  const [autoSitOut, setAutoSitOut] = useState(false);
  const [acting, setActing] = useState(false);

  const rawPct = maxBet > minBet ? ((bet - minBet) / (maxBet - minBet)) * 100 : 0;
  const pct = clamp(rawPct, 0, 100);
  const belowMin = bet < minBet;
  const raiseDisabled =
    belowMin || bet < (playerView.min_raise ?? minBet) || !isMyturn || acting;

  const presets = [
    { label: "min", v: minBet },
    { label: "3× BB", v: bb * 3 },
    { label: "½ pot", v: Math.round(view.pot * 0.5) },
    { label: "pot", v: view.pot },
    { label: "2× pot", v: view.pot * 2 },
    { label: "all-in", v: maxBet },
  ];

  const doAct = async (
    action: "fold" | "check" | "call" | "raise" | "bet",
    amount?: number,
  ) => {
    setActing(true);
    try {
      await onAct(action, { amount, bluffDeclared: false });
    } finally {
      setActing(false);
    }
  };

  const canCheck = toCall === 0;

  return (
    <div className="actionbar">
      {/* Row 1: hero summary + auto-actions */}
      <div className="actionbar-top">
        <div className="hero-summary">
          <div className="hero-cards">
            {heroSeat.hole_cards.length > 0
              ? heroSeat.hole_cards.map((c, i) => (
                  <Card key={i} card={c} size="lg" />
                ))
              : [0, 1].map((i) => <Card key={i} facedown size="lg" />)}
          </div>
          <div className="hero-id">
            <div className="hero-name">
              {heroSeat.name}{" "}
              <span className="hero-pos">{heroSeat.position}</span>
            </div>
            <div className="hero-stack">
              stack <b>${heroSeat.stack.toLocaleString()}</b>
              {toCall > 0 && (
                <>
                  {" "}
                  · to call{" "}
                  <span style={{ color: "var(--accent)" }}>
                    ${toCall.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="auto-actions">
          <span className="label">auto on next</span>
          <button
            className={`auto-chip${autoCheckFold ? " is-on" : ""}`}
            onClick={() => setAutoCheckFold((v) => !v)}
          >
            check / fold
          </button>
          <button
            className={`auto-chip${autoMuckLosers ? " is-on" : ""}`}
            onClick={() => setAutoMuckLosers((v) => !v)}
          >
            muck losers
          </button>
          <button
            className={`auto-chip${autoSitOut ? " is-on" : ""}`}
            onClick={() => setAutoSitOut((v) => !v)}
          >
            sit out
          </button>
          <HelpHint>
            <p>
              <b>check / fold</b> — auto-check when no bet faces you; otherwise
              fold instantly.
            </p>
            <p>
              <b>muck losers</b> — auto-muck your hand at showdown when you
              can&apos;t win.
            </p>
            <p>
              <b>sit out</b> — fold every hand starting next deal until you sit
              back in.
            </p>
            <p className="hint-foot">
              Auto-actions execute on your next decision point.
            </p>
          </HelpHint>
        </div>
      </div>

      {/* Row 2: bet slider + action buttons */}
      <div className="actionbar-bottom">
        <div className="bet-block">
          <div className="bet-readout">
            <span className="label">your bet</span>
            <span className="bet-amt">${bet.toLocaleString()}</span>
          </div>
          <div className="bet-slider">
            <div className="bet-track">
              <div className="bet-fill" style={{ width: `${pct}%` }} />
              <input
                type="range"
                min={minBet}
                max={maxBet}
                step={Math.max(1, Math.floor(bb / 2))}
                value={clamp(bet, minBet, maxBet)}
                onChange={(e) => setBet(Number(e.target.value))}
                className="bet-input"
                disabled={!isMyturn || acting}
              />
              <div className="bet-thumb" style={{ left: `${pct}%` }} />
            </div>
            <div className="bet-presets">
              {presets.map((p) => {
                const disabled = p.v < minBet || p.v > maxBet;
                return (
                  <button
                    key={p.label}
                    className={`preset${bet === p.v ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
                    onClick={() => !disabled && setBet(p.v)}
                    disabled={disabled || !isMyturn || acting}
                    title={
                      disabled
                        ? `below minimum ($${minBet.toLocaleString()})`
                        : `set to $${p.v.toLocaleString()}`
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="btn btn--md btn--fold"
            disabled={!isMyturn || acting}
            onClick={() => doAct("fold")}
          >
            <span className="btn-main">Fold</span>
          </button>

          <button
            className="btn btn--md btn--call"
            disabled={!isMyturn || acting}
            onClick={() => doAct(canCheck ? "check" : "call")}
          >
            <span className="btn-main">{canCheck ? "Check" : "Call"}</span>
            {!canCheck && (
              <span className="btn-sub">${toCall.toLocaleString()}</span>
            )}
          </button>

          <button
            className="btn btn--md btn--raise"
            disabled={raiseDisabled}
            onClick={() =>
              doAct(toCall > 0 ? "raise" : "bet", bet)
            }
          >
            <span className="btn-main">{toCall > 0 ? "Raise" : "Bet"}</span>
            <span className="btn-sub">${bet.toLocaleString()}</span>
          </button>
        </div>
      </div>

      {!isMyturn && (
        <div className="actionbar-waiting">
          waiting for your turn…
        </div>
      )}
    </div>
  );
}
