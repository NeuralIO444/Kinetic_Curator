// FerroFluidChip (#1997) — FERROFLUID, the dish's second mode: a Gray-Scott ferrofluid field
// living in the dish under the stage, biased by placed magnets and coupled to the culture both
// ways. The chip follows the dish family's posture exactly (the DISH LIFE chip beside it in the
// Master bar): a glyph button that lights while the mode runs, and while on, the governing
// dials as bare RangeRows — FLOW the feed pressure, PULL the magnets' grip, COUPLE the two-way
// conversation with the culture — plus the MAGNETS arm: while armed, canvas presses place
// magnets, drags move them, alt-presses lift them off (gl/dishFluidMagnetsDom.mjs). The
// governor's shed reads on the glyph the way it does on the glider: one bar while shedding,
// two when held. The mode's stamped state (on/off, dials, magnets, shed) is the store's
// dishFluid* fields, which the live loop reads onto the resolver input every frame — nothing
// here renders the fluid itself. State + preference live in dishFluidChip.model.mjs (pure,
// headless-verified); the preference (on/off + dials) is per-viewer, restored once at mount —
// never part of a saved project. The magnet ARM is not in the preference: arming the hand is
// a moment, not a preference.
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { helpText } from '../data/helpCopy.js';
import { RangeRow } from './RangeRow.jsx';
import { ferroChipState, FERRO_HELP, loadFerroPref, saveFerroPref } from './dishFluidChip.model.mjs';

// A droplet cluster over a pool line: beads that fill while the fluid runs.
const BEADS = [
  [6, 8, 1.9],
  [12, 5.4, 2.5],
  [18, 8, 1.9],
];

export default function FerroFluidChip() {
  const on = useStore((s) => s.dishFluid);
  const setOn = useStore((s) => s.setDishFluid);
  const flow = useStore((s) => s.dishFluidFlow);
  const setFlow = useStore((s) => s.setDishFluidFlow);
  const pull = useStore((s) => s.dishFluidPull);
  const setPull = useStore((s) => s.setDishFluidPull);
  const couple = useStore((s) => s.dishFluidCouple);
  const setCouple = useStore((s) => s.setDishFluidCouple);
  const magnetCount = useStore((s) => s.dishFluidMagnets.length);
  const arming = useStore((s) => s.dishFluidMagnetArm);
  const setArming = useStore((s) => s.setDishFluidMagnetArm);
  const shed = useStore((s) => s.dishFluidShed);

  // the performer's preference, restored once (the dishLife pref's discipline)
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const pref = loadFerroPref(typeof localStorage !== 'undefined' ? localStorage : null);
    if (pref.on) setOn(true);
    setFlow(pref.flow);
    setPull(pref.pull);
    setCouple(pref.couple);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    saveFerroPref(typeof localStorage !== 'undefined' ? localStorage : null, { on, flow, pull, couple });
  }, [on, flow, pull, couple]);

  const state = ferroChipState({ on, arming, shed });
  const lit = state === 'on' || state === 'slowed' || state === 'held';
  const pct = (v) => Math.round(v * 100);
  const dial = (setter) => (p) => setter(Math.min(1, Math.max(0, p / 100)));

  return (
    <div className="undo-group dish-life ferro" role="group" aria-label="Ferrofluid">
      <button
        type="button"
        className={`undo-btn dish-life-chip ferro-chip ${lit ? '' : 'disabled'}`}
        data-ferro={state}
        onClick={() => setOn(!on)}
        aria-pressed={on}
        aria-label={`Ferrofluid ${on ? 'on' : 'off'}`}
        title={helpText(FERRO_HELP[state])}
      >
        <svg className="dish-life-glyph" viewBox="0 0 24 14" width="22" height="13" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="8.5" ry="1.6" fill="currentColor" opacity={lit ? 0.5 : 0.25} />
          {BEADS.map(([x, y, r]) =>
            lit ? (
              <circle key={x} cx={x} cy={y} r={r} fill="currentColor" />
            ) : (
              <circle
                key={x}
                cx={x}
                cy={y}
                r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.9"
                strokeDasharray={state === 'arming' ? '1.6 1.1' : undefined}
              />
            ),
          )}
          {state === 'slowed' ? <rect x="21.4" y="3.4" width="1.1" height="5" fill="currentColor" /> : null}
          {state === 'held' ? (
            <>
              <rect x="20.6" y="3.4" width="1" height="5" fill="currentColor" />
              <rect x="22.2" y="3.4" width="1" height="5" fill="currentColor" />
            </>
          ) : null}
        </svg>
      </button>
      {on ? (
        <>
          <RangeRow
            layout="bare"
            className="dish-life-dial"
            min={0}
            max={100}
            step={5}
            value={pct(flow)}
            defaultValue={50}
            onChange={dial(setFlow)}
            ariaLabel="Ferrofluid flow"
            hint={`${helpText('ferro-flow')} (${pct(flow)}%)`}
          />
          <RangeRow
            layout="bare"
            className="dish-life-dial"
            min={0}
            max={100}
            step={5}
            value={pct(pull)}
            defaultValue={70}
            onChange={dial(setPull)}
            ariaLabel="Ferrofluid magnet pull"
            hint={`${helpText('ferro-pull')} (${pct(pull)}%)`}
          />
          <RangeRow
            layout="bare"
            className="dish-life-dial"
            min={0}
            max={100}
            step={5}
            value={pct(couple)}
            defaultValue={50}
            onChange={dial(setCouple)}
            ariaLabel="Ferrofluid culture coupling"
            hint={`${helpText('ferro-couple')} (${pct(couple)}%)`}
          />
          <button
            type="button"
            className="undo-btn ferro-arm"
            onClick={() => setArming(!arming)}
            aria-pressed={arming}
            aria-label={arming ? 'Stop placing magnets' : 'Place magnets on the dish'}
            title={helpText('ferro-magnets')}
            style={{ fontSize: '10px', letterSpacing: '0.06em' }}
          >
            MAGNETS{magnetCount ? ` ${magnetCount}` : ''}
          </button>
        </>
      ) : null}
    </div>
  );
}
