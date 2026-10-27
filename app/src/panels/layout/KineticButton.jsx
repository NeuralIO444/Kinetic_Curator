// KINETIC button (#942 shell, #945 heat, #1772 the sweep) — the top-menu storm generator.
//
// Tap routing (#1772): every tap runs through the heat model (routeKineticTapHeat in kineticHeat.mjs), and the run
// sweeps left to right. A fresh tap is a LOOK pass — a fresh Look + a pool coherent with it. The next warm tap (~2s)
// is a VOICE pass — a fresh voice's motion + palette over the standing look. Every further warm tap is a CURATOR
// pass — Davis nudges a few params by a capped amount, or keeps the piece. Sustained rapid tapping (each tap <600ms
// after the last) builds heat; past the curator it breaks the CHAOS ceiling — the full kitchen-sink re-roll
// (kineticRoll) — in one undo step. The armed roll scope (#964) is the ceiling over every pass.
//
// Heat lives here in the component, not the store: tap timestamps are human
// gestures (like #268's swell envelope and #944's warm window), and the #806
// must-loop law bans Date.now() in layoutSlice. The router itself is pure
// and wall-clock-free; the component passes `now` in and renders heat out.
//
// The button breathes: `--heat` (0..1) drives x-expansion + glow in CSS, so
// the width IS the heat meter. A cooling interval decays the displayed heat
// when idle; it stops itself at zero. Collapsed width stays a comfortable
// touch target; expansion borrows space gracefully (same max-width cap as
// the hover expansion).
import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../state/store.js';
import { useHotkeys } from '../../hooks/useHotkeys.js';
import { scopeDecks } from '../../state/kineticScope.mjs';
import { routeKineticTapHeat, decayHeat, heatLevel, publishShownHeat, kineticLayerLabel } from './kineticHeat.mjs';
import { Events, emit } from '../../composition/eventBus.js';
import { ExpandLabel } from '../../components/ExpandLabel.jsx';
import { useTapOpen } from '../../hooks/useTapOpen.js';
import { useColdOpen } from '../../hooks/useColdOpen.js';
import { TAP_PULSE_MS } from '../../hooks/coldOpen.mjs';
import { useInvite } from '../../hooks/useInvite.js';

export function KineticButton() {
  const kineticLookPass = useStore((s) => s.kineticLookPass);
  const kineticVoicePass = useStore((s) => s.kineticVoicePass);
  const kineticCuratorPass = useStore((s) => s.kineticCuratorPass);
  const kineticRoll = useStore((s) => s.kineticRoll);
  const scopeChaos = useStore((s) => scopeDecks(s.startupMode).chaos); // #1772 — hammering reaches CHAOS only at KOZ
  // Heat run state (#945): heat/taps as of the last tap + its timestamp.
  // The router returns the next run; the cooling interval below decays the
  // *displayed* heat between taps. All wall-clock stays in this component.
  const runRef = useRef({ heat: 0, taps: 0, lastTapAt: 0 });
  const coolTimerRef = useRef(null);
  const [heat, setHeat] = useState(0);
  const [cooling, setCooling] = useState(false); // #1103 — heating is instant; only cooling glides
  const [lastLayer, setLastLayer] = useState(null); // #1122 — TE micro-label: the layer the last tap ran
  const tapOpen = useTapOpen(); // #1103 — touch has no hover
  const cold = useColdOpen(); // #1103 — the first ~2 s of a page load show the full name
  const [shimmer, markUsed] = useInvite('kinetic'); // #1103 — the sheen invites a press until it gets one

  const restartCooling = () => {
    if (coolTimerRef.current) clearInterval(coolTimerRef.current);
    coolTimerRef.current = setInterval(() => {
      const run = runRef.current;
      const h = decayHeat(run.heat, Date.now() - run.lastTapAt);
      if (h <= 0.01) {
        clearInterval(coolTimerRef.current);
        coolTimerRef.current = null;
        runRef.current = { ...run, heat: 0 };
        publishShownHeat(0);
        setHeat(0);
        setCooling(false);
      } else {
        publishShownHeat(h);
        setHeat(h);
        setCooling(true);
      }
    }, 150);
  };

  useEffect(
    () => () => {
      if (coolTimerRef.current) clearInterval(coolTimerRef.current);
    },
    [],
  );

  const tap = () => {
    const now = Date.now();
    const r = routeKineticTapHeat(runRef.current, now, { chaos: scopeChaos });
    runRef.current = { heat: r.heat, taps: r.taps, lastTapAt: r.lastTapAt };
    publishShownHeat(r.heat);
    setHeat(r.heat);
    setLastLayer(r.layer); // #1122 — the layer is discrete: LOOK / VOICE / CURATOR / CHAOS (#1772)
    // LOIS honest feed: the single observable for a KINETIC tap (button + K).
    emit(Events.KINETIC_TAP, { kind: r.layer });
    if (r.layer === 'chaos') kineticRoll();
    else if (r.layer === 'curator') kineticCuratorPass();
    else if (r.layer === 'voice') kineticVoicePass();
    else kineticLookPass();
    // #1107 — the guard re-deals a dead frame by undoing the roll; a curator pass that kept the piece pushed no undo
    // entry, so there is nothing of its own to undo (and undoing would eat the voice pass before it). #1772
    const passed = r.layer === 'curator' && !useStore.getState().kineticNudge?.moves?.length;
    if (!passed) emit(Events.ROLL_GUARD, { kind: r.layer });
    restartCooling();
    setCooling(false);
    tapOpen.pulse(TAP_PULSE_MS); // #1103 — the button AND the K key flash the full name, then cool down
    markUsed();
  };
  // useHotkeys matches e.key then e.key.toLowerCase(), so 'k' covers 'K'.
  useHotkeys({ k: tap });

  const level = heatLevel(heat);
  return (
    <button
      type="button"
      className={`kinetic-btn xl tb-pill${shimmer ? ' xl-shimmer' : ''}`}
      data-heat-level={level}
      data-cooling={cooling ? 'true' : undefined}
      data-open={tapOpen.open || cold ? 'true' : undefined}
      {...tapOpen.props}
      style={{ '--heat': heat.toFixed(3) }}
      onClick={tap}
      title="KINETIC — tap: a new look; tap again: a new voice; keep tapping: the curator nudges; hammer it: chaos (K)"
      aria-label={`Kinetic — heat ${level}. Tap for a new look, tap again for a new voice, keep tapping for a curator nudge, rapid hammering breaks into chaos`}
    >
      {/* #1122 — ● is heat → Davis: the circle glows with the run's heat */}
      <span className="tb-circle" aria-hidden="true" />
      <ExpandLabel short="KIN" full="KINETIC" tailClass="kinetic-rest" />
      {/* #1122 — the layer is discrete → TE micro-label; visible while the run is warm */}
      {heat > 0.01 && lastLayer && (
        <span className="tb-micro red" title={`last tap ran the ${lastLayer} pass`}>
          {kineticLayerLabel(lastLayer)}
        </span>
      )}
    </button>
  );
}
