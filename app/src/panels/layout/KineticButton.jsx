// KINETIC button (#942 shell, #943 RULES, #944 WEATHER, #945 heat + CHAOS) —
// the top-menu storm generator.
//
// Tap routing (#945): every tap runs through the heat model
// (routeKineticTapHeat in kineticHeat.mjs). A cool tap is a RULES pass — a
// restrained structural reworking plus a fresh palette from the full pool
// (#952: every KIN tap deals a new palette). A second tap while warm (~2s)
// is a WEATHER pass — palette weather, light mood, atmospheric FX over the
// same structure. Sustained rapid tapping (each tap <600ms after the last) builds heat; past
// the weather layer it breaks the CHAOS ceiling — the full kitchen-sink
// re-roll (kineticRoll: seed, palette, composition, mode, FX chain, blend
// modes, assets, density/count, behave) — in one undo step.
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
import {
  routeKineticTapHeat,
  decayHeat,
  heatLevel,
} from './kineticHeat.mjs';
import { Events, emit } from '../../composition/eventBus.js';
import { ExpandLabel } from '../../components/ExpandLabel.jsx';
import { useTapOpen } from '../../hooks/useTapOpen.js';
import { useColdOpen } from '../../hooks/useColdOpen.js';
import { TAP_PULSE_MS } from '../../hooks/coldOpen.mjs';
import { useInvite } from '../../hooks/useInvite.js';

export function KineticButton() {
  const kineticRulesPass = useStore((s) => s.kineticRulesPass);
  const kineticWeatherPass = useStore((s) => s.kineticWeatherPass);
  const kineticRoll = useStore((s) => s.kineticRoll);
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
        setHeat(0);
        setCooling(false);
      } else {
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
    const r = routeKineticTapHeat(runRef.current, now);
    runRef.current = { heat: r.heat, taps: r.taps, lastTapAt: r.lastTapAt };
    setHeat(r.heat);
    setLastLayer(r.layer); // #1122 — the layer is discrete: RULES / WEATHER / CHAOS
    // LOIS honest feed: the single observable for a KINETIC tap (button + K).
    emit(Events.KINETIC_TAP, { kind: r.layer });
    if (r.layer === 'chaos') kineticRoll();
    else if (r.layer === 'weather') kineticWeatherPass();
    else kineticRulesPass();
    emit(Events.ROLL_GUARD, { kind: r.layer === 'chaos' || r.layer === 'weather' ? r.layer : 'rules' }); // #1107
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
      className={`kinetic-btn xl${shimmer ? ' xl-shimmer' : ''}`}
      data-heat-level={level}
      data-cooling={cooling ? 'true' : undefined}
      data-open={tapOpen.open || cold ? 'true' : undefined}
      {...tapOpen.props}
      style={{ '--heat': heat.toFixed(3) }}
      onClick={tap}
      title="KINETIC — tap: recompose under design rules; warm tap: drift the atmosphere; hammer it: chaos (K)"
      aria-label={`Kinetic — heat ${level}. Tap to recompose, warm tap drifts the atmosphere, rapid hammering breaks into chaos`}
    >
      <span className="kinetic-glyph" aria-hidden="true">◉</span>
      <ExpandLabel short="KIN" full="KINETIC" tailClass="kinetic-rest" />
      {/* #1122 — the layer is discrete → TE micro-label; visible while the run is warm */}
      {heat > 0.01 && lastLayer && (
        <span className="kinetic-layer" title={`last tap ran the ${lastLayer} layer`}>
          {lastLayer === 'chaos' ? 'C' : lastLayer === 'weather' ? 'W' : 'R'}
        </span>
      )}
    </button>
  );
}
