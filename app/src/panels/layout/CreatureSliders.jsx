// Creature / moth as amber TE value buttons (#1202).
// The hype/moth family: BODY, flap, TIGHT, breath, wind, METABOLISM.
// (CROOKED / OPEN / SQUASH are mark-shape — they live in APPEARANCE.)
// Mode-gated per #272; locks ride on the button.
// #716 — wind/breath/flap keep the MotionTile glyph (the tile visualizes
// the value); the rest are TE value buttons.
import { RangeRow } from '../../components/RangeRow.jsx';
import { MotionTile } from '../../components/MotionTile.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { SliderEditor } from '../build/te/editors.jsx';

const fmt2 = (v) => (Math.round(v * 100) / 100).toString();

export function CreatureSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = layoutParams.mode;
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';
  const bilateral = (layoutParams.symmetry ?? 'none') === 'bilateral';
  // #287 — flap drives bilateral wings and the radial-N fans alike.
  // #1202 — kaleido fans flap too.
  const radial = /^(?:radial|kaleido)-\d+$/.test(layoutParams.symmetry ?? 'none');

  const btn = (label, key, display, editor, { disabled, disabledReason } = {}) => (
    <ValueButton
      label={label}
      display={display}
      locked={lockedParams[key]}
      onToggleLock={() => lock(key)}
      disabled={disabled}
      disabledReason={disabledReason}
      onOpen={() => editor}
    />
  );

  return (
    <div className="param-block">
      <div className="param-subheader ttl">🦋 moth / hype</div>
      <div className="slider-stack">
        {btn('BODY', 'body', `${layoutParams.body ?? 3}`,
          <SliderEditor ariaLabel="Body" value={layoutParams.body ?? 3}
            min={1} max={7} step={1} onChange={(v) => set('body', Math.round(v))} />,
          { disabled: !isHype, disabledReason: 'Moth bodies only (hype mode)' })}
        {/* #716 — the motion keys wear the tile (glyph visualizes the value). */}
        <MotionTile kind="flap" label="flap" value={layoutParams.flap ?? 0.35} min={0} max={1} step={0.05}
          hint="Wing beat amplitude on bilateral wings and radial fans"
          disabled={!(isHype && (bilateral || radial))} disabledReason="Needs hype mode + bilateral or radial symmetry (wings/fans are only built for symmetric organisms)"
          onChange={v => set('flap', v)}
          locked={lockedParams.flap} onToggleLock={() => lock('flap')} />
        {btn('TIGHT', 'tight', fmt2(layoutParams.tight ?? 0.55),
          <SliderEditor ariaLabel="Tight" value={layoutParams.tight ?? 0.55}
            min={0.05} max={0.95} step={0.05} format={fmt2} onChange={(v) => set('tight', v)} />,
          { disabled: !isHype, disabledReason: 'Moth bodies only (hype mode)' })}
        <MotionTile kind="breath" label="breath" value={layoutParams.breath ?? 0} min={0} max={1} step={0.05}
          hint="Breathing swell on body scale — amplitude follows each creature's energy, so tired creatures breathe shallow"
          disabled={!(isSwarm || isHype)} disabledReason="Swarm or hype mode only"
          onChange={v => set('breath', v)}
          locked={lockedParams.breath} onToggleLock={() => lock('breath')} />
        <MotionTile kind="wind" label="wind" value={layoutParams.wind ?? 1} min={0} max={3} step={0.1}
          hint="Hype-only multiplier on the noise wind"
          disabled={!isHype} disabledReason="Hype mode only"
          onChange={v => set('wind', v)}
          locked={lockedParams.wind} onToggleLock={() => lock('wind')} />
        {btn('METABOLISM', 'metabolism', fmt2(layoutParams.metabolism ?? 0),
          <SliderEditor ariaLabel="Metabolism" value={layoutParams.metabolism ?? 0}
            min={0} max={2} step={0.1} format={fmt2} onChange={(v) => set('metabolism', v)} />,
          { disabled: !isHype, disabledReason: 'Hype mode only' })}
        {/* #268: MATERIAL removed — the GL backend renders every instance
            flat; the buttons changed nothing in the live instrument. */}
      </div>
    </div>
  );
}
