// APPEARANCE sliders — extracted from ParamBlock.jsx (UX-5 reorg).
// The finish: HUE ROTATE, CROOKED / OPEN / SQUASH (mark shape),
// GROWTH RATE / BRANCHING (DLA / Eden organisms).
import { RangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function AppearanceSliders({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;
  const mode = layoutParams.mode;

  return (
    <div className="param-block">
      {/* #310: Z-TIERS / NOISE FREQ / DISPLACE leave performer sight — they
          stay in state and presets/voices still set them, but the live knobs
          are gone. (MATERIAL and SHADING were already voice-only via #268.) */}
      <RangeRow label="HUE ROTATE" value={layoutParams.hueRotate} min={0} max={360}
        hint="Global hue shift applied to the whole canvas"
        readout={`${layoutParams.hueRotate}°`} onChange={v => set('hueRotate', v)} defaultValue={0}
        locked={lockedParams.hueRotate} onToggleLock={() => lock('hueRotate')} />
      {/* #594 PR3 — squash-and-stretch: moving marks already stretch along
          their motion (#309); this thins them across it so they keep their
          mass. Works on anything that moves. */}
      <RangeRow label="CROOKED" value={layoutParams.crooked ?? 0} min={0} max={1} step={0.01}
        hint="Zero is today's quad. Higher shears and pinches each mark from its own seed."
        onChange={v => set('crooked', v)} defaultValue={0}
        locked={lockedParams.crooked} onToggleLock={() => lock('crooked')} />
      <RangeRow label="SQUASH" value={layoutParams.squash ?? 0} min={0} max={1} step={0.05}
        hint="Moving marks thin across their motion as they stretch — 1 keeps their mass, 0 is stretch only"
        onChange={v => set('squash', v)} defaultValue={d('squash', DEFAULT_LAYOUT_PARAMS.squash)}
        locked={lockedParams.squash} onToggleLock={() => lock('squash')} />
      {/* #720: GROWTH RATE / BRANCHING drive the DLA / Eden organisms —
          mode-gated per #272 like DIVERGENCE: visible but inert outside
          dla/eden, with the reason. The audio→growth mapping itself is the
          curator engine's (#762); these are the exposed knobs it will drive. */}
      <RangeRow label="GROWTH RATE" value={layoutParams.growthRate ?? 3} min={0} max={12} step={0.5}
        hint="Cells grown per tick at full drive — never 0, the piece never freezes"
        readout={`${(layoutParams.growthRate ?? 3).toFixed(1)}/tick`}
        disabled={mode !== 'dla' && mode !== 'eden'} disabledReason="DLA / Eden growth modes only"
        onChange={v => set('growthRate', v)} defaultValue={d('growthRate', DEFAULT_LAYOUT_PARAMS.growthRate)}
        locked={lockedParams.growthRate} onToggleLock={() => lock('growthRate')} />
      <RangeRow label="BRANCHING" value={layoutParams.growthBranch ?? 0.8} min={0} max={1} step={0.01}
        hint="DLA stick probability — high grows coral, low grows dense (Eden ignores it)"
        readout={`${Math.round((layoutParams.growthBranch ?? 0.8) * 100)}%`}
        disabled={mode !== 'dla' && mode !== 'eden'} disabledReason="DLA / Eden growth modes only"
        onChange={v => set('growthBranch', v)} defaultValue={d('growthBranch', DEFAULT_LAYOUT_PARAMS.growthBranch)}
        locked={lockedParams.growthBranch} onToggleLock={() => lock('growthBranch')} />
    </div>
  );
}
