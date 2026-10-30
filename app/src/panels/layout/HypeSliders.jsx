// The hype/moth family as amber TE value buttons (#1202): CREATURES, BODY,
// flap, TIGHT, breath, wind, METABOLISM.
// #1694 S3 — this block is the creature family's BUILD home after the controls
// fold-in: CREATURES (how many live in the dish, 0..4) is a layout param like
// the rest and is set here, at the top of its family's stack. The DIRECTORS
// "moths" stepper and the creature-only framing (the butterfly header this
// block used to wear) retired; the motion params did not move — only the
// count joined them, in the home the Q3 ruling named.
// (CROOKED / OPEN / SQUASH are mark-shape — they live in APPEARANCE.)
// Mode-gated per #272; locks ride on the button. CREATURES itself is not
// mode-gated: the stepper never was — a count set in any mode is the count
// the dish gets.
// #716 — wind/breath/flap wore the MotionTile glyph (the tile visualized
// the value) through Phase 1; #1608 (Strata Q Phase 2) converts them to
// mode rows like every neighbour: the Phase 0 exemptions list is closed
// and never named the tiles, and D1's scope covers them. The MotionTile
// survives in STIMULI (life), outside the amendment's BUILD scope.
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor } from '../build/te/editors.jsx';

const fmt2 = (v) => (Math.round(v * 100) / 100).toString();

export function HypeSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = layoutParams.mode;
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';
  const bilateral = (layoutParams.symmetry ?? 'none') === 'bilateral';
  // #287 — flap drives bilateral wings and the radial-N fans alike.
  // #1202 — kaleido fans flap too.
  const radial = /^(?:radial|kaleido)-\d+$/.test(layoutParams.symmetry ?? 'none');

  // #1607 — the family's value buttons are mode rows now (detents under the
  // exact readout); #1608 — the motion keys join them (see the header).
  const btn = (label, key, display, editor, { disabled, disabledReason } = {}) => (
    <ModeRow
      label={label}
      display={display}
      value={layoutParams[key] ?? DEFAULT_LAYOUT_PARAMS[key]}
      stops={stopsFor(key)}
      onSelect={(v) => set(key, v)}
      locked={lockedParams[key]}
      onToggleLock={() => lock(key)}
      disabled={disabled}
      disabledReason={disabledReason}
      onOpen={() => editor}
    />
  );

  return (
    <div className="param-block">
      <div className="param-subheader ttl">hype / moth</div>
      <div className="slider-stack">
        {/* #1694 S3 — the count, at home: a quantized hand input with the same
            0..4 range and 0 default the retired stepper had, written through
            the same LAYOUT_PARAM door as every neighbour. */}
        {btn(
          'CREATURES',
          'creatures',
          `${layoutParams.creatures ?? 0}`,
          <SliderEditor
            ariaLabel="Creatures"
            value={layoutParams.creatures ?? 0}
            min={0}
            max={4}
            step={1}
            defaultValue={DEFAULT_LAYOUT_PARAMS.creatures}
            onChange={(v) => set('creatures', Math.round(v))}
          />,
        )}
        {btn(
          'BODY',
          'body',
          `${layoutParams.body ?? 3}`,
          <SliderEditor
            ariaLabel="Body"
            value={layoutParams.body ?? 3}
            min={1}
            max={7}
            step={1}
            defaultValue={DEFAULT_LAYOUT_PARAMS.body}
            onChange={(v) => set('body', Math.round(v))}
          />,
          { disabled: !isHype, disabledReason: 'Moth bodies only (hype mode)' },
        )}
        {/* #716's tile is a mode row since #1608 — same param, same gating.
            Written longhand, not via btn(): the gate reason is long enough
            that prettier wraps an object property, and unlockTree's reason
            census reads these strings per line (a JSX attribute is never
            wrapped). */}
        <ModeRow
          label="FLAP"
          display={fmt2(layoutParams.flap ?? 0.35)}
          value={layoutParams.flap ?? DEFAULT_LAYOUT_PARAMS.flap}
          stops={stopsFor('flap')}
          onSelect={(v) => set('flap', v)}
          locked={lockedParams.flap}
          onToggleLock={() => lock('flap')}
          disabled={!(isHype && (bilateral || radial))}
          disabledReason="Needs hype mode + bilateral or radial symmetry (wings/fans are only built for symmetric organisms)"
          onOpen={() => (
            <SliderEditor
              ariaLabel="Flap"
              value={layoutParams.flap ?? 0.35}
              min={0}
              max={1}
              step={0.05}
              format={fmt2}
              defaultValue={DEFAULT_LAYOUT_PARAMS.flap}
              onChange={(v) => set('flap', v)}
            />
          )}
        />
        {btn(
          'TIGHT',
          'tight',
          fmt2(layoutParams.tight ?? 0.55),
          <SliderEditor
            ariaLabel="Tight"
            value={layoutParams.tight ?? 0.55}
            min={0.05}
            max={0.95}
            step={0.05}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.tight}
            onChange={(v) => set('tight', v)}
          />,
          { disabled: !isHype, disabledReason: 'Moth bodies only (hype mode)' },
        )}
        {btn(
          'BREATH',
          'breath',
          fmt2(layoutParams.breath ?? 0),
          <SliderEditor
            ariaLabel="Breath"
            value={layoutParams.breath ?? 0}
            min={0}
            max={1}
            step={0.05}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.breath}
            onChange={(v) => set('breath', v)}
          />,
          { disabled: !(isSwarm || isHype), disabledReason: 'Swarm or hype mode only' },
        )}
        {btn(
          'WIND',
          'wind',
          fmt2(layoutParams.wind ?? 1),
          <SliderEditor
            ariaLabel="Wind"
            value={layoutParams.wind ?? 1}
            min={0}
            max={3}
            step={0.1}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.wind}
            onChange={(v) => set('wind', v)}
          />,
          { disabled: !isHype, disabledReason: 'Hype mode only' },
        )}
        {btn(
          'METABOLISM',
          'metabolism',
          fmt2(layoutParams.metabolism ?? 0),
          <SliderEditor
            ariaLabel="Metabolism"
            value={layoutParams.metabolism ?? 0}
            min={0}
            max={2}
            step={0.1}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.metabolism}
            onChange={(v) => set('metabolism', v)}
          />,
          { disabled: !isHype, disabledReason: 'Hype mode only' },
        )}
        {/* #268: MATERIAL removed — the GL backend renders every instance
            flat; the buttons changed nothing in the live instrument. */}
      </div>
    </div>
  );
}
