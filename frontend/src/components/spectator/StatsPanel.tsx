// Stats panel. Backend aggregation isn't built yet, so v1 renders mock
// rows for every seat when `view.stats === null`. The mock note makes
// the placeholder explicit.

import type { SpectatorView } from "@/lib/types";

interface Row {
  name: string;
  vpip: number;
  pfr: number;
  tb: number;
  af: number;
  wtsd: number;
}

const MOCK_DEFAULT: Omit<Row, "name"> = {
  vpip: 0,
  pfr: 0,
  tb: 0,
  af: 0,
  wtsd: 0,
};

function buildRows(view: SpectatorView): Row[] {
  if (view.stats) {
    return view.seats.map((s) => {
      const stat = view.stats?.[s.name] ?? {};
      return {
        name: s.name,
        vpip: stat["vpip"] ?? 0,
        pfr: stat["pfr"] ?? 0,
        tb: stat["tb"] ?? 0,
        af: stat["af"] ?? 0,
        wtsd: stat["wtsd"] ?? 0,
      };
    });
  }
  return view.seats.map((s) => ({ name: s.name, ...MOCK_DEFAULT }));
}

export function StatsPanel({ view }: { view: SpectatorView }) {
  const rows = buildRows(view);
  const isMock = view.stats == null;
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="label">player stats</span>
        <span className="meta">{isMock ? "no data yet" : "live"}</span>
      </div>
      <div className="panel-body">
        <div className="stats-table">
          <div className="stats-row stats-row--head">
            <span>name</span>
            <span className="stats-num">vpip</span>
            <span className="stats-num">pfr</span>
            <span className="stats-num">3b</span>
            <span className="stats-num">af</span>
            <span className="stats-num">wtsd</span>
          </div>
          {rows.map((r) => (
            <div key={r.name} className="stats-row">
              <span className="stats-name">{r.name}</span>
              <span className="stats-num">{r.vpip}</span>
              <span className="stats-num stats-num--muted">{r.pfr}</span>
              <span className="stats-num stats-num--muted">{r.tb}</span>
              <span className="stats-num stats-num--muted">{r.af}</span>
              <span className="stats-num stats-num--muted">{r.wtsd}</span>
            </div>
          ))}
        </div>
        {isMock && (
          <p className="stats-mock-note">
            cross-hand stats aggregation isn&apos;t wired up yet — values are
            placeholders.
          </p>
        )}
      </div>
    </div>
  );
}
