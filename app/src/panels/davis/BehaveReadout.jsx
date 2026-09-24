import { useEffect, useState } from 'react';
import { resolveEffectiveBehave, resolveWindMode, BEHAVE_OVERRIDE_FIELDS } from '../../engine/organisms/behave.js';
import { isOrganismMode } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';

// #479 — Option A shipped a read-only readout; this is Option B, per Matt's
// Night Migration sign-off (2026-09-23) unfreezing Stage 1: the same block
// becomes a real per-layer editor. Every field an operator hasn't touched
// still shows (and drives motion with) the table row — editing one sets a
// `layoutParams.behaveX` override (null = no override), which round-trips
// through the project doc the same as every other layoutParams field, no
// separate persistence path needed.
const FIELDS = [
  ['sep', 'SEP'], ['ali', 'ALI'], ['coh', 'COH'],
  ['sepR', 'SEP R'], ['aliR', 'ALI R'], ['cohR', 'COH R'],
  ['wind', 'WIND'], ['attract', 'ATTRACT'],
];
const overrideKey = (key) => `behave${key[0].toUpperCase()}${key.slice(1)}`;

// The BEHAVE chip lives in BUILD's ParamBlock, this readout lives in DAVIS —
// different tabs, so DavisPanel (and this component) unmounts and remounts
// on every tab switch. Module scope survives that remount (there is only
// ever one DAVIS panel mounted at a time); a per-component ref would forget
// "what changed" the instant the operator clicks the chip and switches
// tabs to look, which is exactly the real flow this exists for.
let lastKnown = null; // { behave, profile, windMode }

export function BehaveReadout({ layoutParams }) {
  const behave = layoutParams.behave || 'cruise';
  const organism = isOrganismMode(layoutParams.mode);
  const profile = resolveEffectiveBehave(layoutParams);
  // #479 — the one hidden non-table change: FLOCK/MOLD also flip wind
  // point -> curl, invisible anywhere in the UI until now.
  const windMode = resolveWindMode(layoutParams);

  // React's documented "adjust state during render" pattern (not an
  // effect): comparing against state and calling setState mid-render lets
  // React redo this render immediately with the settled values, before
  // paint. An earlier setTimeout-based version lived in a useEffect and hit
  // a real StrictMode bug: React's dev-only double-invoke of effects let
  // one effect's cleanup cancel a timer a sibling effect had just armed,
  // leaving the flash stuck on forever. This version has no timer to race.
  //
  // The comparison must be against `lastKnown` (module state, survives the
  // BUILD<->DAVIS tab-switch unmount/remount), not a component-local "last
  // rendered behave" — a `useState(behave)` initializer on a BRAND NEW
  // mount always starts equal to the current prop by construction, so a
  // local-only comparison can never see the transition that happened while
  // this exact component instance didn't exist, which is the one case this
  // whole feature is for.
  const [flash, setFlash] = useState(null); // { gen, fields: Set, forBehave }
  if (flash?.forBehave !== behave) {
    const prev = lastKnown; // read only — the write happens in the effect below
    const changed = new Set();
    if (prev) {
      for (const [key] of FIELDS) {
        if ((prev.profile[key] ?? 0) !== (profile[key] ?? 0)) changed.add(key);
      }
      if (prev.windMode !== windMode) changed.add('wind-mode');
    }
    setFlash({ gen: (flash?.gen || 0) + 1, fields: changed, forBehave: behave });
  }
  // The mutation itself is a side effect (updates module state so the NEXT
  // mount, possibly after a tab-switch unmount, has something to diff
  // against) and belongs in an effect, not render — render above only
  // reads lastKnown. Idempotent regardless of how many times this runs for
  // the same `behave`, so StrictMode's dev-only double-invoke is harmless.
  useEffect(() => {
    lastKnown = { behave, profile, windMode };
  }, [behave, profile, windMode]);

  if (!organism) return null;

  const hasAnyOverride = BEHAVE_OVERRIDE_FIELDS.some((key) => layoutParams[overrideKey(key)] != null);
  const setOverride = (key, value) => emit(Events.LAYOUT_PARAM, { key: overrideKey(key), value });
  const resetAll = () => {
    for (const key of BEHAVE_OVERRIDE_FIELDS) emit(Events.LAYOUT_PARAM, { key: overrideKey(key), value: null });
  };

  // No JS timer clears the flash: the CSS animation plays once and holds
  // its end state (animation-fill-mode: forwards in panels.css), so the
  // color settles back to normal on its own. `key` includes the generation
  // counter so a field that flashes again on a LATER transition gets a
  // fresh DOM node and the animation restarts from 0%, rather than being a
  // no-op because the 'flash' class was already present from last time.
  const fieldKey = (key) => (flash?.fields.has(key) ? `${key}-flash-${flash.gen}` : key);
  const fieldClass = (key, overridden) =>
    `behave-field${flash?.fields.has(key) ? ' flash' : ''}${overridden ? ' overridden' : ''}`;

  return (
    <div className="davis-source-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
      title="The resolved BEHAVE steering profile actually driving motion — edit a field to override this layer's table row; RESET clears every override back to the chip's default.">
      <span className="davis-label">PROFILE</span>
      <div className="behave-readout">
        {FIELDS.map(([key, label]) => {
          const overridden = layoutParams[overrideKey(key)] != null;
          return (
            <label key={fieldKey(key)} className={fieldClass(key, overridden)}
              title={overridden ? `${label}: edited for this layer, overriding the ${behave} table row` : `${label}: at the ${behave} table row's default`}>
              {label}{' '}
              <input
                type="number" step="0.01"
                className="behave-field-input"
                value={Number(profile[key] ?? 0).toFixed(2)}
                onChange={(e) => setOverride(key, e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
          );
        })}
        <span key={fieldKey('wind-mode')} className={fieldClass('wind-mode', false)}>
          WIND KERNEL <b>{windMode.toUpperCase()}</b>
        </span>
        {hasAnyOverride && (
          <button type="button" className="micro-btn" onClick={resetAll}
            title="Clear every BEHAVE override on this layer — back to the chip's table row">
            RESET
          </button>
        )}
      </div>
    </div>
  );
}
