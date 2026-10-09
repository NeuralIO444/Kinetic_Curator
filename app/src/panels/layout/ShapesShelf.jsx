// SHAPES as a TE button matrix (#1202). Swap the asset pool only.
// Mixable sets keep the 4-state LED chip (#733): three stepped pips under
// the label, tap cycles off → 1 → 2 → 3 → off.
import { useStore } from '../../state/store.js';
import { SHAPE_SETS, MIXABLE_SHAPE_IDS, SHAPE_MIX_MAX, isShapeSetActive, liveShapeLevels } from '../../data/voices.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';

export function ShapesShelf() {
  const loadShapeSet = useStore((s) => s.loadShapeSet);
  const cycleShapeLevel = useStore((s) => s.cycleShapeLevel);
  const shapeLevels = liveShapeLevels(useStore((s) => s.shapeLevels), useStore((s) => s.enabledAssets));
  const enabledAssets = useStore((s) => s.enabledAssets);

  // TeaMatrix is single-select; the shelf is multi-select with LED levels,
  // so it renders its own grid on the same te-cell language.
  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl">shapes</span>
      <div className="te-matrix" role="group" aria-label="Shapes" style={{ marginBottom: 8 }}>
        {SHAPE_SETS.map((x) => {
          const mixable = MIXABLE_SHAPE_IDS.includes(x.id);
          const lv = shapeLevels[x.id] || 0;
          const active = mixable ? lv > 0 : isShapeSetActive(enabledAssets, x);
          return (
            <button
              key={x.id}
              type="button"
              className={`te-cell${active ? ' sel' : ''}`}
              aria-pressed={active}
              aria-label={mixable ? `${x.name}, level ${lv} of 3` : x.name}
              title={mixable
                ? `${x.name} — level ${lv}/3. Tap: off → 1 → 2 → 3 → off. Up to ${SHAPE_MIX_MAX} on.`
                : `${x.name} — ${x.ids.length} shapes`}
              onClick={() => (mixable ? cycleShapeLevel(x.id) : loadShapeSet(x.id))}
            >
              <span className="te-cell-label">{x.name}</span>
              {mixable && (
                <span className="te-pips" aria-hidden="true">
                  {[1, 2, 3].map((n) => <i key={n} className={lv >= n ? 'lit' : ''} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
