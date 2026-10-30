// APPEARANCE as mode rows (#1202; detents #1607, Strata Q Phase 1).
// Mark shape + organism finish: CROOKED / SQUASH (mark shape),
// GROWTH RATE / BRANCHING (DLA / Eden organisms, mode-gated per #272).
// Locks ride on the row.
// #1587: HUE ROTATE (the whole-canvas finish) moved into the CHIAROSCURO
// section's floating editor — it is render-engine, not mark finish.
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor } from '../build/te/editors.jsx';

export function AppearanceSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = layoutParams.mode;
  const growthGated = mode !== 'dla' && mode !== 'eden';

  const btn = (label, display, key, editor, { disabled, disabledReason, hint } = {}) => (
    <ModeRow
      label={label}
      display={display}
      title={hint}
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
      {/* #310: Z-TIERS / NOISE FREQ / DISPLACE leave performer sight — they
          stay in state and presets/voices still set them, but the live knobs
          are gone. (MATERIAL and SHADING were already voice-only via #268.) */}
      <div className="slider-stack">
        {/* #594 PR3 — squash-and-stretch: moving marks already stretch along
            their motion (#309); this thins them across it so they keep their
            mass. Works on anything that moves. */}
        {btn(
          'CROOKED',
          `${Math.round((layoutParams.crooked ?? 0) * 100)}%`,
          'crooked',
          <SliderEditor
            ariaLabel="Crooked"
            value={layoutParams.crooked ?? 0}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.crooked}
            onChange={(v) => set('crooked', v)}
          />,
          { hint: "Zero is today's quad. Higher shears and pinches each mark from its own seed." },
        )}
        {btn(
          'SQUASH',
          `${Math.round((layoutParams.squash ?? 0) * 100)}%`,
          'squash',
          <SliderEditor
            ariaLabel="Squash"
            value={layoutParams.squash ?? 0}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.squash}
            onChange={(v) => set('squash', v)}
          />,
          { hint: 'Moving marks thin across their motion as they stretch — 1 keeps their mass, 0 is stretch only' },
        )}
        {/* #720: GROWTH RATE / BRANCHING drive the DLA / Eden organisms —
            mode-gated per #272 like DIVERGENCE: visible but inert outside
            dla/eden, with the reason. The audio→growth mapping itself is the
            curator engine's (#762); these are the exposed knobs it will drive. */}
        {btn(
          'GROWTH RATE',
          `${(layoutParams.growthRate ?? 3).toFixed(1)}/tick`,
          'growthRate',
          <SliderEditor
            ariaLabel="Growth rate"
            value={layoutParams.growthRate ?? 3}
            min={0}
            max={12}
            step={0.5}
            format={(v) => `${v.toFixed(1)}/tick`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.growthRate}
            onChange={(v) => set('growthRate', v)}
          />,
          {
            disabled: growthGated,
            disabledReason: 'DLA / Eden growth modes only',
            hint: 'Cells grown per tick at full drive — never 0, the piece never freezes',
          },
        )}
        {btn(
          'BRANCHING',
          `${Math.round((layoutParams.growthBranch ?? 0.8) * 100)}%`,
          'growthBranch',
          <SliderEditor
            ariaLabel="Branching"
            value={layoutParams.growthBranch ?? 0.8}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.growthBranch}
            onChange={(v) => set('growthBranch', v)}
          />,
          {
            disabled: growthGated,
            disabledReason: 'DLA / Eden growth modes only',
            hint: 'DLA stick probability — high grows coral, low grows dense (Eden ignores it)',
          },
        )}
      </div>
    </div>
  );
}
