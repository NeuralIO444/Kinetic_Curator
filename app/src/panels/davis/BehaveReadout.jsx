import { useEffect, useState } from 'react';
import { resolveBehave, resolveWindMode } from '../../engine/organisms/behave.js';
import { isOrganismMode } from '../../data/layout-modes.js';

// #479 — Option A: a read-only readout of the steering weights actually
// driving motion right now. Clicking a BEHAVE chip visibly changes the
// animation, but nothing showed the values behind it — this is the
// diagnosis ask verbatim, zero feel risk, no persistence/edit questions.
const FIELDS = [
  ['sep', 'SEP'], ['ali', 'ALI'], ['coh', 'COH'],
  ['sepR', 'SEP R'], ['aliR', 'ALI R'], ['cohR', 'COH R'],
  ['wind', 'WIND'], ['attract', 'ATTRACT'],
];

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
  const profile = resolveBehave(behave);
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

  // No JS timer clears the flash: the CSS animation plays once and holds
  // its end state (animation-fill-mode: forwards in panels.css), so the
  // color settles back to normal on its own. `key` includes the generation
  // counter so a field that flashes again on a LATER transition gets a
  // fresh DOM node and the animation restarts from 0%, rather than being a
  // no-op because the 'flash' class was already present from last time.
  const fieldKey = (key) => (flash?.fields.has(key) ? `${key}-flash-${flash.gen}` : key);
  const fieldClass = (key) => `behave-field${flash?.fields.has(key) ? ' flash' : ''}`;

  return (
    <div className="davis-source-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
      title="Read-only: the resolved BEHAVE steering profile actually driving motion right now">
      <span className="davis-label">PROFILE</span>
      <div className="behave-readout">
        {FIELDS.map(([key, label]) => (
          <span key={fieldKey(key)} className={fieldClass(key)}>
            {label} <b>{Number(profile[key] ?? 0).toFixed(2)}</b>
          </span>
        ))}
        <span key={fieldKey('wind-mode')} className={fieldClass('wind-mode')}>
          WIND KERNEL <b>{windMode.toUpperCase()}</b>
        </span>
      </div>
    </div>
  );
}
