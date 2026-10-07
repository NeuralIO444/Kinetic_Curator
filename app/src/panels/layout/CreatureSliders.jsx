// Creature / moth sliders — extracted from ParamBlock.jsx (UX-5 reorg).
// The hype/moth family: BODY, flap, TIGHT, breath, wind, METABOLISM.
// (CROOKED / OPEN / SQUASH are mark-shape — they live in APPEARANCE.)
import { RangeRow } from '../../components/RangeRow.jsx';
import { MotionTile } from '../../components/MotionTile.jsx';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function CreatureSliders({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;
  const mode = layoutParams.mode;
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';
  const bilateral = (layoutParams.symmetry ?? 'none') === 'bilateral';
  // #287 — flap drives bilateral wings and the radial-N fans alike.
  const radial = (layoutParams.symmetry ?? 'none').startsWith('radial-');

  return (
    <div className="param-block">
      <div className="param-subheader ttl">🦋 moth / hype</div>
      <RangeRow label="BODY" value={layoutParams.body ?? 3} min={1} max={7} step={1}
        hint="Spine length. 1 = spore, 3–7 = bug. Physics count unchanged."
        disabled={!isHype} disabledReason="Moth bodies only (hype mode)"
        onChange={v => set('body', v)} defaultValue={d('body', DEFAULT_LAYOUT_PARAMS.body)}
        locked={lockedParams.body} onToggleLock={() => lock('body')} />
      <MotionTile kind="flap" label="flap" value={layoutParams.flap ?? 0.35} min={0} max={1} step={0.05}
        hint="Wing beat amplitude on bilateral wings and radial fans"
        disabled={!(isHype && (bilateral || radial))} disabledReason="Needs hype mode + bilateral or radial symmetry (wings/fans are only built for symmetric organisms)"
        onChange={v => set('flap', v)} defaultValue={d('flap', DEFAULT_LAYOUT_PARAMS.flap)}
        locked={lockedParams.flap} onToggleLock={() => lock('flap')} />
      <RangeRow label="TIGHT" value={layoutParams.tight ?? 0.55} min={0.05} max={0.95} step={0.05}
        hint="How stiff the spine follows the leader"
        disabled={!isHype} disabledReason="Moth bodies only (hype mode)"
        onChange={v => set('tight', v)} defaultValue={d('tight', DEFAULT_LAYOUT_PARAMS.tight)}
        locked={lockedParams.tight} onToggleLock={() => lock('tight')} />
      {/* #287 — BREATH: the second of the two new sliders. Breathing swell
          on body scale; amplitude follows each creature's energy, so tired
          creatures breathe shallow. Scale is universal — it works on swarm
          dots, moths and stamps alike. */}
      <MotionTile kind="breath" label="breath" value={layoutParams.breath ?? 0} min={0} max={1} step={0.05}
        hint="Breathing swell on body scale — amplitude follows each creature's energy, so tired creatures breathe shallow"
        disabled={!(isSwarm || isHype)} disabledReason="Swarm or hype mode only"
        onChange={v => set('breath', v)} defaultValue={d('breath', DEFAULT_LAYOUT_PARAMS.breath)}
        locked={lockedParams.breath} onToggleLock={() => lock('breath')} />
      <MotionTile kind="wind" label="wind" value={layoutParams.wind ?? 1} min={0} max={3} step={0.1}
        hint="Hype-only multiplier on the noise wind"
        disabled={!isHype} disabledReason="Hype mode only"
        onChange={v => set('wind', v)} defaultValue={d('wind', DEFAULT_LAYOUT_PARAMS.wind)}
        locked={lockedParams.wind} onToggleLock={() => lock('wind')} />
      {/* #287 — METABOLISM: the first of the two new sliders. Speed of the
          creatures' inner life — hunger, fatigue, curiosity. 0 = drives off
          (classic behavior); higher = the cast tires visibly across a set. */}
      <RangeRow label="METABOLISM" value={layoutParams.metabolism ?? 0} min={0} max={2} step={0.1}
        hint="Speed of the creatures' inner life — hunger, fatigue and curiosity. 0 = drives off (classic behavior)"
        disabled={!isHype} disabledReason="Hype mode only"
        onChange={v => set('metabolism', v)} defaultValue={d('metabolism', DEFAULT_LAYOUT_PARAMS.metabolism)}
        locked={lockedParams.metabolism} onToggleLock={() => lock('metabolism')} />
      {/* #268: MATERIAL removed — the GL backend renders every instance
          flat; the buttons changed nothing in the live instrument. */}
    </div>
  );
}
