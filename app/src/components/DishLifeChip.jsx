import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { helpText } from '../data/helpCopy.js';
import { RangeRow } from './RangeRow.jsx';
import {
  dishLifeChipModel,
  readDishLifePref,
  writeDishLifePref,
  STRENGTH_MIN,
  STRENGTH_MAX,
} from './dishLifeChip.model.mjs';

// DishLifeChip — the footer's DISH LIFE control (#1923): a glider glyph that lights while the quiet Game of Life layer
// is running, a click to turn it on/off, and the ONE strength dial while it is on. Phase 2 (#1923) adds the
// COUPLING dial beside it — a strength slider, not a switch: coupling above 0 is what turns the invisible
// field culture's asset-driving on (Matt's ruling; it starts at 0). The choice is a per-viewer
// preference (localStorage, wrapped), restored once at mount — never part of a saved project.

// A glider on a 3×3 grid: the five live cells.
const GLIDER = [
  [1, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

export function DishLifeChip() {
  const dishLife = useStore((s) => s.dishLife);
  const dishLifeAwake = useStore((s) => s.dishLifeAwake);
  const dishLifeShed = useStore((s) => s.dishLifeShed);
  const dishLifeStrength = useStore((s) => s.dishLifeStrength);
  const dishLifeCoupling = useStore((s) => s.dishLifeCoupling);
  const setDishLife = useStore((s) => s.setDishLife);
  const setStrength = useStore((s) => s.setDishLifeStrength);
  const setCoupling = useStore((s) => s.setDishLifeCoupling);
  const m = dishLifeChipModel({ dishLife, dishLifeAwake, dishLifeShed, dishLifeStrength });
  const couplingPct = Math.round(dishLifeCoupling * 100);

  // restore the viewer's choice once
  useEffect(() => {
    const pref = readDishLifePref(typeof localStorage !== 'undefined' ? localStorage : null);
    if (pref) {
      setStrength(pref.strength);
      setCoupling(pref.coupling);
      setDishLife(pref.on);
    }
  }, [setDishLife, setStrength, setCoupling]);

  const save = (on, strength, coupling) =>
    writeDishLifePref(typeof localStorage !== 'undefined' ? localStorage : null, { on, strength, coupling });
  const toggle = () => {
    setDishLife(!dishLife);
    save(!dishLife, dishLifeStrength, dishLifeCoupling);
  };
  const onDial = (pct) => {
    const v = Number(pct) / 100;
    setStrength(v);
    save(dishLife, v, dishLifeCoupling);
  };
  const onCoupling = (pct) => {
    const v = Number(pct) / 100;
    setCoupling(v);
    save(dishLife, dishLifeStrength, v);
  };

  return (
    <div className="undo-group dish-life" role="group" aria-label="Dish life">
      <button
        type="button"
        className={`undo-btn dish-life-chip ${m.lit ? '' : 'disabled'}`}
        data-dish-life={m.state}
        onClick={toggle}
        aria-pressed={dishLife === true}
        aria-label={m.label}
        title={m.title}
      >
        <svg className="dish-life-glyph" viewBox="0 0 5 3" width="20" height="12" aria-hidden="true">
          {GLIDER.map(([x, y]) =>
            m.state === 'off' || m.state === 'arming' ? (
              <rect
                key={`${x}${y}`}
                x={x + 0.15}
                y={y + 0.15}
                width="0.7"
                height="0.7"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.15"
                strokeDasharray={m.state === 'arming' ? '0.3 0.2' : undefined}
              />
            ) : (
              <rect key={`${x}${y}`} x={x + 0.1} y={y + 0.1} width="0.8" height="0.8" fill="currentColor" />
            ),
          )}
          {m.state === 'slowed' ? <rect x="4" y="0.6" width="0.5" height="1.8" fill="currentColor" /> : null}
          {m.state === 'held' ? (
            <>
              <rect x="3.7" y="0.6" width="0.45" height="1.8" fill="currentColor" />
              <rect x="4.45" y="0.6" width="0.45" height="1.8" fill="currentColor" />
            </>
          ) : null}
        </svg>
      </button>
      {dishLife ? (
        <>
          <RangeRow
            layout="bare"
            className="dish-life-dial"
            min={Math.round(STRENGTH_MIN * 100)}
            max={Math.round(STRENGTH_MAX * 100)}
            step={5}
            value={m.percent}
            defaultValue={35}
            onChange={onDial}
            ariaLabel="Dish life strength"
            hint={`${helpText('dish-life-strength')} (${m.percent}%)`}
          />
          <RangeRow
            layout="bare"
            className="dish-life-dial"
            min={0}
            max={100}
            step={5}
            value={couplingPct}
            defaultValue={0}
            onChange={onCoupling}
            ariaLabel="Dish life coupling"
            hint={`${helpText('dish-life-coupling')} (${couplingPct}%)`}
          />
        </>
      ) : null}
    </div>
  );
}
