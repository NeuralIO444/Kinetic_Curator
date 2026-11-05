import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { RangeRow } from './RangeRow.jsx';
import {
  dishLifeChipModel,
  readDishLifePref,
  writeDishLifePref,
  STRENGTH_MIN,
  STRENGTH_MAX,
} from './dishLifeChip.model.mjs';

// DishLifeChip — the footer's DISH LIFE control (#1923): a glider glyph that lights while the quiet Game of Life layer
// is running, a click to turn it on/off, and the ONE strength dial while it is on. The choice is a per-viewer
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
  const setDishLife = useStore((s) => s.setDishLife);
  const setStrength = useStore((s) => s.setDishLifeStrength);
  const m = dishLifeChipModel({ dishLife, dishLifeAwake, dishLifeShed, dishLifeStrength });

  // restore the viewer's choice once
  useEffect(() => {
    const pref = readDishLifePref(typeof localStorage !== 'undefined' ? localStorage : null);
    if (pref) {
      setStrength(pref.strength);
      setDishLife(pref.on);
    }
  }, [setDishLife, setStrength]);

  const save = (on, strength) =>
    writeDishLifePref(typeof localStorage !== 'undefined' ? localStorage : null, { on, strength });
  const toggle = () => {
    setDishLife(!dishLife);
    save(!dishLife, dishLifeStrength);
  };
  const onDial = (pct) => {
    const v = Number(pct) / 100;
    setStrength(v);
    save(dishLife, v);
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
        <svg className="dish-life-glyph" viewBox="0 0 3 3" width="12" height="12" aria-hidden="true">
          {GLIDER.map(([x, y]) => (
            <rect key={`${x}${y}`} x={x + 0.1} y={y + 0.1} width="0.8" height="0.8" fill="currentColor" />
          ))}
        </svg>
      </button>
      {dishLife ? (
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
          hint={`Dish life strength — ${m.percent}%. Always a quiet layer; this only sets how present it is.`}
        />
      ) : null}
    </div>
  );
}
