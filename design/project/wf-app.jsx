// wf-app.jsx — Root app

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "all",
  "show_v1": false
}/*EDITMODE-END*/;

function PokerWireframes() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const view    = t.view || "all";
  const showV1  = !!t.show_v1;

  const showSpec = view === "all" || view === "spectator";
  const showPlay = view === "all" || view === "player";
  const showExp  = view === "all" || view === "explorations";

  return (
    <React.Fragment>
      <DesignCanvas>
        {/* ── v2: incorporates Dan's feedback ───────────────────── */}
        <DCSection
          id="v2-spectator"
          title="spectator · v2"
          subtitle="smaller felt · per-seat equity cards · tabbed right rail · stats strip on the bottom"
        >
          <DCArtboard id="spec-v2-light" label="light · paper" width={1400} height={900}>
            <SpectatorV2 dark={false} />
          </DCArtboard>
          <DCArtboard id="spec-v2-dark" label="dark mode" width={1400} height={900}>
            <SpectatorV2 dark={true} />
          </DCArtboard>
        </DCSection>

        <DCSection
          id="v2-player"
          title="player · v2"
          subtitle="bottom action bar · accented CTAs · right rail with chat / history / settings + auto-options"
        >
          <DCArtboard id="play-v2-light" label="light · paper" width={1400} height={900}>
            <PlayerV2 dark={false} />
          </DCArtboard>
          <DCArtboard id="play-v2-dark" label="dark mode" width={1400} height={900}>
            <PlayerV2 dark={true} />
          </DCArtboard>
        </DCSection>

        {/* ── refined explorations: cards (default classic) ─────── */}
        {showExp && (
          <DCSection
            id="cards"
            title="card style"
            subtitle="three takes — settings panel lets players choose, default is classic"
          >
            <DCArtboard id="card-a" label="A · classic (default)" width={460} height={220}>
              <CardStyleA />
            </DCArtboard>
            <DCArtboard id="card-b" label="B · minimal" width={460} height={220}>
              <CardStyleB />
            </DCArtboard>
            <DCArtboard id="card-c" label="C · typographic" width={460} height={220}>
              <CardStyleC />
            </DCArtboard>
          </DCSection>
        )}

        {/* ── v1 archived behind a toggle ─────────────────────── */}
        {showV1 && showSpec && (
          <DCSection id="v1-spectator" title="spectator · v1 (archive)" subtitle="earlier exploration — kept for reference">
            <DCArtboard id="spec-a" label="A · broadcast" width={1400} height={900}>
              <SpectatorA />
            </DCArtboard>
            <DCArtboard id="spec-b" label="B · equity-first" width={1400} height={900}>
              <SpectatorB />
            </DCArtboard>
            <DCArtboard id="spec-c" label="C · data console" width={1400} height={900}>
              <SpectatorC />
            </DCArtboard>
          </DCSection>
        )}
        {showV1 && showPlay && (
          <DCSection id="v1-player" title="player · v1 (archive)" subtitle="A was the chosen direction; others archived">
            <DCArtboard id="play-a" label="A · big bottom bar" width={1400} height={900}>
              <PlayerA />
            </DCArtboard>
            <DCArtboard id="play-c" label="C · right rail" width={1400} height={900}>
              <PlayerC />
            </DCArtboard>
          </DCSection>
        )}
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Show">
          <TweakRadio
            label="Section"
            value={view}
            onChange={v => setTweak("view", v)}
            options={[
              { label: "All",         value: "all" },
              { label: "Spectator",   value: "spectator" },
              { label: "Player",      value: "player" },
              { label: "Cards",       value: "explorations" },
            ]}
          />
          <TweakToggle
            label="Show v1 archive"
            value={showV1}
            onChange={v => setTweak("show_v1", v)}
          />
        </TweakSection>
        <TweakSection label="Decisions captured">
          <div style={{ fontFamily: "Caveat, cursive", fontSize: 15, lineHeight: 1.35, color: "#4a4640" }}>
            <p style={{ marginBottom: 8 }}>✓ Spectator: smaller felt + per-seat equity cards + tabbed rail + bottom stats strip</p>
            <p style={{ marginBottom: 8 }}>✓ Player: bottom action bar + tabbed right rail + auto-options</p>
            <p style={{ marginBottom: 8 }}>✓ Dealer / SB / BB chips on seats · "to act" highlight + timer</p>
            <p style={{ marginBottom: 8 }}>✓ Classic cards default · users can swap in settings</p>
            <p style={{ marginBottom: 8 }}>✓ Paper-neutral in light mode · dark felt only in dark mode</p>
            <p style={{ marginBottom: 0, color: "#A85C3A" }}>✕ Cut: radial dial · floating buttons · minimal spectator · sienna felt · stacked equity bar</p>
          </div>
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<PokerWireframes />);
