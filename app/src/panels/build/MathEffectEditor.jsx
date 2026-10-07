// MathEffectEditor — #1010: the MATH track inspector.
//
// A MATH track holds an ordered chain of tone ops (default GAIN → CONTRAST).
// Each row: op dropdown, the op's knobs as sliders with artist-unit readouts,
// a per-knob MOD source selector (none / rms / flux / beatPulse), remove and
// reorder. "+ ADD OP" appends from the 12-op vocabulary.
//
// MOD semantics (see fx/mathFilters.js applyMathMod): the envelope pushes the
// knob toward its catalog max; silence is a true no-op.
import { useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { MATH_EFFECT_DEFS, MATH_OP_KINDS, MATH_MOD_SOURCES, formatMathParam } from '../../fx/mathFilters.js';
import { RangeRow } from '../../components/RangeRow.jsx';

const MOD_LABELS = { none: '—', rms: 'RMS', flux: 'FLUX', beatPulse: 'BEAT' };

function ModSelect({ value, title, onChange }) {
  return (
    <select
      className="math-mod-select"
      value={value || 'none'}
      title={title}
      onChange={(e) => onChange(e.target.value)}
    >
      {MATH_MOD_SOURCES.map((s) => (
        <option key={s} value={s}>{s === 'none' ? 'MOD —' : `MOD ${MOD_LABELS[s]}`}</option>
      ))}
    </select>
  );
}

function MathOpRow({ layerId, index, fx, count }) {
  const def = MATH_EFFECT_DEFS[fx.kind];
  if (!def) return null;
  const isHue = fx.kind === 'hueRotate';
  return (
    <div className="math-op" title={`${def.label} — ${def.hint}`}>
      <div className="math-op-head">
        <select
          className="math-op-select"
          value={fx.kind}
          title={`Op — ${def.hint}`}
          onChange={(e) => emit(Events.MATH_EFFECT_SET_KIND, { layerId, index, kind: e.target.value })}
        >
          {MATH_OP_KINDS.map((k) => (
            <option key={k} value={k}>{MATH_EFFECT_DEFS[k].label.toUpperCase()}</option>
          ))}
        </select>
        <button type="button" className="micro-btn" title="Move op earlier in the chain (runs first)"
          disabled={index === 0}
          onClick={() => emit(Events.MATH_EFFECT_REORDER, { layerId, index, delta: -1 })}>▲</button>
        <button type="button" className="micro-btn" title="Move op later in the chain (runs last)"
          disabled={index === count - 1}
          onClick={() => emit(Events.MATH_EFFECT_REORDER, { layerId, index, delta: 1 })}>▼</button>
        <button type="button" className="micro-btn" title="Remove this op"
          onClick={() => emit(Events.MATH_EFFECT_REMOVE, { layerId, index })}>✕</button>
      </div>
      {Object.entries(def.params).map(([key, p]) => {
        const v = fx.params?.[key] ?? p.def;
        return (
          <div className="fx-param" key={key}>
            <label title={p.hint}>{p.label}</label>
            <RangeRow layout="bare" tone="build" min={p.min} max={p.max} step={p.step} value={v}
              hint={p.hint}
              onReset={() => emit(Events.MATH_EFFECT_SET_PARAM, { layerId, index, key, value: p.def })}
              onChange={(v) => emit(Events.MATH_EFFECT_SET_PARAM, { layerId, index, key, value: v })}
            />
            <span className="fx-param-readout" title={p.hint}>{formatMathParam(fx.kind, key, v)}</span>
            <ModSelect
              value={fx.mod?.[key] || 'none'}
              title={`${p.label} — audio modulation source. The envelope pushes the knob toward its max; silence is a no-op.`}
              onChange={(mod) => emit(Events.MATH_EFFECT_SET_MOD, { layerId, index, key, mod })}
            />
          </div>
        );
      })}
      {isHue && (
        <div className="math-warn" title="HUE ROTATE compounds fast — the track is capped at 50% wet while it is in the chain.">
          ⚠ capped at 50% wet while in the chain
        </div>
      )}
    </div>
  );
}

export function MathEffectEditor({ layer, mathOrdinal }) {
  const [pick, setPick] = useState('gain');
  const effects = layer.effects || [];
  const capped = effects.some((fx) => fx?.kind === 'hueRotate');
  return (
    <div className="math-editor" title={`M ${mathOrdinal} — MATH chain. Order matters: the first op grades first.`}>
      {effects.map((fx, i) => (
        <MathOpRow key={`${fx.kind}-${i}`} layerId={layer.id} index={i} fx={fx} count={effects.length} />
      ))}
      <div className="math-add-row">
        <select value={pick} onChange={(e) => setPick(e.target.value)} title="Op to add">
          {MATH_OP_KINDS.map((k) => (
            <option key={k} value={k}>{MATH_EFFECT_DEFS[k].label.toUpperCase()}</option>
          ))}
        </select>
        <button className="chip-btn" onClick={() => emit(Events.MATH_EFFECT_ADD, { layerId: layer.id, kind: pick })}>
          + {MATH_EFFECT_DEFS[pick].label.toUpperCase()}
        </button>
      </div>
      {capped && (
        <div className="math-warn" title="HUE ROTATE is in this chain — wet capped at 50%.">
          ⚠ 50% wet ceiling active (HUE ROTATE)
        </div>
      )}
      <div className="math-order-note" title="Order is a creative control, never auto-fixed: gain-then-threshold reads differently from threshold-then-gain.">
        Order matters — first op grades first.
      </div>
    </div>
  );
}
