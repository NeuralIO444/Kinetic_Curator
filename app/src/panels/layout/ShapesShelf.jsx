// SHAPES chips + LED mix — extracted from ModeGrid.jsx (UX-5 reorg).
// Swap the asset pool only. Mixable sets get the 4-state LED chip (#733).
import { useStore } from '../../state/store.js';
import { SHAPE_SETS, MIXABLE_SHAPE_IDS, SHAPE_MIX_MAX, isShapeSetActive, liveShapeLevels } from '../../data/voices.js';

export function ShapesShelf() {
  const loadShapeSet = useStore((s) => s.loadShapeSet);
  const cycleShapeLevel = useStore((s) => s.cycleShapeLevel);
  const shapeLevels = liveShapeLevels(useStore((s) => s.shapeLevels), useStore((s) => s.enabledAssets));
  const enabledAssets = useStore((s) => s.enabledAssets);
  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl">shapes</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
        {SHAPE_SETS.map((x) => {
          if (!MIXABLE_SHAPE_IDS.includes(x.id)) {
            return (
              <button
                key={x.id}
                type="button"
                className={`chip-btn ${isShapeSetActive(enabledAssets, x) ? 'active' : ''}`}
                onClick={() => loadShapeSet(x.id)}
                title={`${x.name} — ${x.ids.length} shapes`}
              >
                {x.name}
              </button>
            );
          }
          // #733 — 4-state LED chip: three stepped pips under the label.
          const lv = shapeLevels[x.id] || 0;
          return (
            <button
              key={x.id}
              type="button"
              className={`chip-btn shape-mix ${lv ? 'active' : ''}`}
              onClick={() => cycleShapeLevel(x.id)}
              aria-label={`${x.name}, level ${lv} of 3`}
              title={`${x.name} — level ${lv}/3. Tap: off → 1 → 2 → 3 → off. Up to ${SHAPE_MIX_MAX} on.`}
            >
              {x.name}
              <span className="shape-pips" aria-hidden="true">
                {[1, 2, 3].map((n) => <i key={n} className={lv >= n ? 'lit' : ''} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
