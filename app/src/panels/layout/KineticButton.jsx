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
// the width IS the heat meter — heat is a continuous signal and renders
// Davis (#2050): it decays on the router's halving clock, no digits, no
// steps. A cooling interval decays the displayed heat when idle; it stops
// itself at zero. Collapsed width stays a comfortable touch target;
// expansion borrows space gracefully (same max-width cap as the hover
// expansion).
//
// The pass the NEXT tap will fire is a discrete fact and renders TE (#2050):
// a detent naming LOOK / VOICE / CUR / CHAOS, derived by asking the router
// itself (nextKineticLayer over the standing run + the same clock) — never
// a parallel prediction. The #1122 post-hoc "last pass" label retires: the
// landed pass is knowable from the stage and the take record.
import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../state/store.js';
import { useHotkeys } from '../../hooks/useHotkeys.js';
import { scopeDecks } from '../../state/kineticScope.mjs';
import {
  routeKineticTapHeat,
  decayHeat,
  heatLevel,
  publishShownHeat,
  nextKineticLayer,
  kineticNextLabel,
  KINETIC_WARM_MS,
} from './kineticHeat.mjs';
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
  // #2050 — the detent's clock: the instant the next-pass readout is derived
  // at. Taps and the watch interval below move it, so the detent steps down
  // as heat halves and returns to LOOK when the run lapses — on the same
  // clock the router routes on. (0 is safe: an untouched run reads LOOK at
  // any instant.)
  const [nowMs, setNowMs] = useState(0);
  // #2050 — a state mirror of runRef for the render derivation: refs are
  // handler-side only (the lint rules insist, rightly), so every write to
  // runRef below is paired with the same value here.
  const [runSnap, setRunSnap] = useState({ heat: 0, taps: 0, lastTapAt: 0 });
  const tapOpen = useTapOpen(); // #1103 — touch has no hover
  const cold = useColdOpen(); // #1103 — the first ~2 s of a page load show the full name
  const [shimmer, markUsed] = useInvite('kinetic'); // #1103 — the sheen invites a press until it gets one

  const restartCooling = () => {
    if (coolTimerRef.current) clearInterval(coolTimerRef.current);
    coolTimerRef.current = setInterval(() => {
      const run = runRef.current;
      const now = Date.now();
      const h = decayHeat(run.heat, now - run.lastTapAt);
      // #2050 — every tick re-derives the detent at the tick's instant, so
      // label and breath decay together and can never disagree.
      setNowMs(now);
      // The watch ends when the heat is spent AND the run has lapsed. A
      // heat-0 run (a calm tap builds none) still holds the watch until its
      // window closes, so the detent's return to LOOK is rendered, not stale.
      const lapsed = run.lastTapAt === 0 || now - run.lastTapAt >= KINETIC_WARM_MS;
      if (h <= 0.01 && lapsed) {
        clearInterval(coolTimerRef.current);
        coolTimerRef.current = null;
        runRef.current = { ...run, heat: 0 };
        setRunSnap(runRef.current); // #2050 — keep the render mirror in step
        publishShownHeat(0);
        setHeat(0);
        setCooling(false);
      } else if (h > 0.01) {
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
    setRunSnap(runRef.current); // #2050 — keep the render mirror in step
    publishShownHeat(r.heat);
    setHeat(r.heat);
    setNowMs(now); // #2050 — the detent re-derives in the same commit as the tap: it already names the NEXT pass
    // LOIS honest feed: the single observable for a KINETIC tap (button + K).
    emit(Events.KINETIC_TAP, { kind: r.layer });
    if (r.layer === 'chaos') kineticRoll();
    else if (r.layer === 'curator') kineticCuratorPass();
    else if (r.layer === 'voice') kineticVoicePass();
    else kineticLookPass();
    // #1107 — the guard re-deals a dead frame by undoing the roll; a curator pass that kept the piece moved no param,
    // so the guard skips it (undoing could eat the voice pass before it). #1772 · #1918: such a pass may still have
    // re-dealt the poem (its own undo entry) — that lands stamps over a frame already judged live, so it stays unguarded.
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
  // #2050 — the detent, derived in render from the router's standing state:
  // the run (via its state mirror), the detent clock, and the scope's chaos
  // gate — the same inputs the next real tap routes on, so a scope change
  // mid-run re-derives it in the same commit (below KOZ it can never read
  // CHAOS).
  const nextLayer = nextKineticLayer(runSnap, nowMs, { chaos: scopeChaos });
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
      aria-label={`Kinetic — heat ${level}, next tap fires the ${nextLayer} pass. Tap for a new look, tap again for a new voice, keep tapping for a curator nudge, rapid hammering breaks into chaos`}
    >
      {/* #1122 — ● is heat → Davis: the circle glows with the run's heat */}
      <span className="tb-circle" aria-hidden="true" />
      <ExpandLabel short="KIN" full="KINETIC" tailClass="kinetic-rest" />
      {/* #2050 — the next pass is discrete → TE detent: LOOK / VOICE / CUR /
          CHAOS, always standing (at rest it honestly reads LOOK). Only the
          CHAOS promise spends the one red. */}
      <span className="tb-micro kin-next" data-next={nextLayer} title={`next tap: the ${nextLayer} pass`}>
        {kineticNextLabel(nextLayer)}
      </span>
    </button>
  );
}
