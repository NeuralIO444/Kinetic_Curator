#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/app/src/panels/build/LayerStack.jsx"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old_imp = "import { FX_EFFECT_DEFS, FX_RACK, availableFxKinds, isFxLayer } from '../../fx/fxFilters.js';"
new_imp = "import { FX_EFFECT_DEFS, availableFxKinds, isFxLayer } from '../../fx/fxFilters.js';\nimport { rackSlotForFxOrdinal } from '../../fx/fxTrack.js';"
if old_imp in t:
    t = t.replace(old_imp, new_imp, 1)
elif "rackSlotForFxOrdinal" not in t:
    raise SystemExit('import block not found')

start = t.find('function FxEffectEditor({ layer })')
end = t.find('export function LayerStack()')
if start < 0 or end < 0:
    raise SystemExit('editor block not found')
editor = '''function FxEffectEditor({ layer, fxOrdinal }) {
  const [pick, setPick] = useState(null);
  const slot = rackSlotForFxOrdinal(fxOrdinal);
  const effects = layer.effects || [];
  if (!slot) return null;
  const filledIdx = effects.findIndex((fx) => slot.kinds.includes(fx.kind));
  const filled = filledIdx >= 0 ? effects[filledIdx] : null;
  const slotKinds = slot.kinds.filter((k) => availableFxKinds(effects).includes(k) || (filled && filled.kind === k));

  if (filled) {
    const def = FX_EFFECT_DEFS[filled.kind];
    if (!def) return null;
    return (
      <div className="fx-editor" title={`${slot.label} · one family`}>
        <div className="fx-slot">
          <div className="fx-effect-head">
            <span className="fx-slot-label">FX {fxOrdinal}</span>
            <span className="fx-effect-name" title={def.hint}>{def.label}</span>
            <button className="micro-btn" onClick={() => emit(Events.FX_EFFECT_REMOVE, { layerId: layer.id, index: filledIdx })}>×</button>
          </div>
          {Object.entries(def.params).map(([key, p]) => (
            <div className="fx-param" key={key}>
              <label title={p.hint}>{p.label}</label>
              <input type="range" min={p.min} max={p.max} step={p.step} value={filled.params?.[key] ?? p.def}
                onDoubleClick={() => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: p.def })}
                onChange={(e) => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: Number(e.target.value) })} />
              <span className="fx-param-readout">{filled.params?.[key] ?? p.def}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const effectiveKind = slotKinds.includes(pick) ? pick : (slotKinds[0] ?? null);
  return (
    <div className="fx-editor" title={`${slot.label} · one family`}>
      <div className="fx-slot fx-slot-empty">
        <span className="fx-slot-label">FX {fxOrdinal}</span>
        <span className="fx-slot-family">{slot.label}</span>
        {slot.stubs.map((s) => (
          <span key={s} className="fx-stub" title="Planned — not yet available">{s.toUpperCase()}</span>
        ))}
        {effectiveKind && (
          <>
            {slotKinds.length > 1 && (
              <select className="tg" value={effectiveKind} onChange={(e) => setPick(e.target.value)}>
                {slotKinds.map((k) => <option key={k} value={k}>{FX_EFFECT_DEFS[k].label.toUpperCase()}</option>)}
              </select>
            )}
            <button className="chip-btn" onClick={() => emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind: effectiveKind })}>
              + {slotKinds.length === 1 ? FX_EFFECT_DEFS[effectiveKind].label.toUpperCase() : 'ADD'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

'''
t = t[:start] + editor + t[end:]
t = t.replace('{fx && isFxSelected && <FxEffectEditor layer={layer} />}',
              '{fx && isFxSelected && <FxEffectEditor layer={layer} fxOrdinal={ordinals.get(layer.id) || 1} />}')
p.write_text(t)
print('patched', p)
PY
