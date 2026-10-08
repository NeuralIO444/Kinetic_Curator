// LAYOUT sliders — extracted from ParamBlock.jsx (UX-5 reorg).
// Structure-first knobs: COUNT, SCALE, ROTATE, ALPHA, JITTER, DENSITY,
// DIVERGENCE.
import { RangeRow, DualRangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS, RANGE_SPEC, RANGE_HARD, PARAM_SPEC, ROTATE_SPIN_START } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function LayoutSliders({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;
  const mode = layoutParams.mode;

  return (
    <div className="param-block">
      <RangeRow label="COUNT" value={layoutParams.count} min={10} max={800}
        hint="Number of asset placements drawn"
        onChange={v => set('count', v)} defaultValue={d('count', DEFAULT_LAYOUT_PARAMS.count)}
        locked={lockedParams.count} onToggleLock={() => lock('count')} />
      <DualRangeRow label="SCALE" low={layoutParams.scale[0]} high={layoutParams.scale[1]}
        min={RANGE_SPEC.scale.min} max={RANGE_SPEC.scale.max} step={0.05}
        dialog={{ key: 'layout.scale', title: 'SCALE', hard: RANGE_HARD.scale }}
        hint="Min–max size range for each placement"
        onChangeLow={v => set('scale', [v, layoutParams.scale[1]])}
        onChangeHigh={v => set('scale', [layoutParams.scale[0], v])}
        onChangeRange={(lo, hi) => set('scale', [lo, hi])}
        readout={`${layoutParams.scale[0].toFixed(1)}–${layoutParams.scale[1].toFixed(1)}`}
        defaultLow={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[0]} defaultHigh={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[1]}
        locked={lockedParams.scale} onToggleLock={() => lock('scale')} />
      <DualRangeRow label="ROTATE" low={layoutParams.rotate[0]} high={layoutParams.rotate[1]}
        min={RANGE_SPEC.rotate.min} max={RANGE_SPEC.rotate.max} hint="Min–max rotation in degrees. Spin: how fast the marks turn (tap the name)"
        dialog={{ key: 'layout.rotate', title: 'ROTATE', hard: RANGE_HARD.rotate,
          spin: { value: layoutParams.rotateSpin ?? 0, onChange: (v) => set('rotateSpin', v), defaultValue: DEFAULT_LAYOUT_PARAMS.rotateSpin, startValue: ROTATE_SPIN_START, max: PARAM_SPEC.rotateSpin.max } }}
        onChangeLow={v => set('rotate', [v, layoutParams.rotate[1]])}
        onChangeHigh={v => set('rotate', [layoutParams.rotate[0], v])}
        onChangeRange={(lo, hi) => set('rotate', [lo, hi])}
        readout={`${layoutParams.rotate[0]}°–${layoutParams.rotate[1]}°`}
        defaultLow={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[0]} defaultHigh={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[1]}
        locked={lockedParams.rotate} onToggleLock={() => lock('rotate')} />
      <DualRangeRow label="ALPHA" low={layoutParams.alpha[0]} high={layoutParams.alpha[1]}
        min={RANGE_SPEC.alpha.min} max={RANGE_SPEC.alpha.max} hint="Min–max opacity (%)"
        dialog={{ key: 'layout.alpha', title: 'ALPHA', hard: RANGE_HARD.alpha }}
        onChangeLow={v => set('alpha', [v, layoutParams.alpha[1]])}
        onChangeHigh={v => set('alpha', [layoutParams.alpha[0], v])}
        onChangeRange={(lo, hi) => set('alpha', [lo, hi])}
        readout={`${layoutParams.alpha[0]}–${layoutParams.alpha[1]}%`}
        defaultLow={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[0]} defaultHigh={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[1]}
        locked={lockedParams.alpha} onToggleLock={() => lock('alpha')} />
      <RangeRow label="JITTER" value={layoutParams.jitter} min={0} max={200}
        hint="Random position scatter around the layout grid"
        onChange={v => set('jitter', v)} defaultValue={d('jitter', DEFAULT_LAYOUT_PARAMS.jitter)}
        locked={lockedParams.jitter} onToggleLock={() => lock('jitter')} />
      <RangeRow label="DENSITY" value={layoutParams.density} min={10} max={100}
        hint="How tightly placements pack; higher = denser"
        onChange={v => set('density', v)} defaultValue={d('density', DEFAULT_LAYOUT_PARAMS.density)}
        locked={lockedParams.density} onToggleLock={() => lock('density')} />
      {/* #585: phyllotaxis divergence — offset in degrees from the golden
          angle. The only knob that changes the parastichy (visible spiral-arm
          count). At 0 the sampler is bit-identical to fibonacci; a fraction
          of a degree off and the eye counts a different family. Mode-gated
          per #272: visible but inert outside phyllotaxis, with the reason. */}
      <RangeRow label="DIVERGENCE" value={layoutParams.phylloDivergence ?? 0} min={-20} max={20} step={0.1}
        hint="Offset in degrees from the golden angle — changes the count of visible spiral arms (0 = same as the fibonacci tile)"
        readout={`${(layoutParams.phylloDivergence ?? 0).toFixed(1)}°`}
        disabled={mode !== 'phyllotaxis'} disabledReason="Phyllotaxis mode only"
        onChange={v => set('phylloDivergence', v)} defaultValue={d('phylloDivergence', DEFAULT_LAYOUT_PARAMS.phylloDivergence)}
        locked={lockedParams.phylloDivergence} onToggleLock={() => lock('phylloDivergence')} />
    </div>
  );
}
