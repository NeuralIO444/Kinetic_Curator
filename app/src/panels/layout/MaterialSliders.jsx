// MATERIAL body tunables as mode rows (#1585, Materials M4; detents #1607,
// Strata Q Phase 1 — the plate centre keeps the value button: position
// params are exempt from mode rows as a class, Phase 0 stop-table law).
// The four material bodies' scalar settings, live per-Look: glass alpha,
// plate radius + centre, wash strength + spread, stipple dot scale.
// Each knob is gated on the stratum's material — visible but inert under
// any other material, with the reason (the #272 growth-knob pattern).
// The defaults are the shipped constants the bodies were tuned at
// (GLASS_BODY_ALPHA 0.78, PLATE_RADIUS 1.05, PLATE_CENTER (0.36, 0.30),
// STIPPLE_DOT_SCALE 2.5, the wash ramp at full strength/full spread):
// a Look that never touches these renders exactly as it did before M4.
// (There is no material picker in BUILD — material itself is voice-set
// since #268 — so the knobs sit with the appearance controls, beside
// the finish knobs in AppearanceSliders.)
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor } from '../build/te/editors.jsx';

export function MaterialSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const material = layoutParams.material;

  // #1607 — the magnitude knobs are mode rows (Strata Q Phase 1). The plate
  // CENTRE rows pass `exempt`: coordinates are position params, exempt as a
  // class under the stop-table law — OFF/LOW/MID/HIGH has no meaning for a
  // point, so they keep the value button and its exact editor.
  const btn = (label, display, key, editor, { disabled, disabledReason, hint, exempt } = {}) =>
    exempt ? (
      <ValueButton
        label={label}
        display={display}
        title={hint}
        locked={lockedParams[key]}
        onToggleLock={() => lock(key)}
        disabled={disabled}
        disabledReason={disabledReason}
        onOpen={() => editor}
      />
    ) : (
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
  const NAMES = { glass: 'Glass', plate: 'Plate', wash: 'Wash', stipple: 'Stipple' };
  const gate = (m) => (material === m ? {} : { disabled: true, disabledReason: `${NAMES[m]} material only` });
  const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;

  return (
    <div className="param-block">
      <div className="slider-stack">
        {btn(
          'GLASS ALPHA',
          pct(layoutParams.glassAlpha ?? 0.78),
          'glassAlpha',
          <SliderEditor
            ariaLabel="Glass alpha"
            value={layoutParams.glassAlpha ?? 0.78}
            min={0}
            max={1}
            step={0.01}
            format={(v) => pct(v)}
            defaultValue={DEFAULT_LAYOUT_PARAMS.glassAlpha}
            onChange={(v) => set('glassAlpha', v)}
          />,
          { ...gate('glass'), hint: 'How much of its rolled alpha a glass body keeps — 0.78 is the shipped tune' },
        )}
        {btn(
          'PLATE RADIUS',
          `×${(layoutParams.plateRadius ?? 1.05).toFixed(2)}`,
          'plateRadius',
          <SliderEditor
            ariaLabel="Plate radius"
            value={layoutParams.plateRadius ?? 1.05}
            min={0.2}
            max={2}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.plateRadius}
            onChange={(v) => set('plateRadius', v)}
          />,
          { ...gate('plate'), hint: "The plate gradient's radius in glyph-box units — 1.05 is the shipped tune" },
        )}
        {btn(
          'PLATE CENTRE X',
          pct(layoutParams.plateCenterX ?? 0.36),
          'plateCenterX',
          <SliderEditor
            ariaLabel="Plate centre X"
            value={layoutParams.plateCenterX ?? 0.36}
            min={0}
            max={1}
            step={0.01}
            format={(v) => pct(v)}
            onChange={(v) => set('plateCenterX', v)}
          />,
          {
            ...gate('plate'),
            exempt: true,
            hint: "Where the plate gradient's core sits across the glyph — 36% is the shipped tune",
          },
        )}
        {btn(
          'PLATE CENTRE Y',
          pct(layoutParams.plateCenterY ?? 0.3),
          'plateCenterY',
          <SliderEditor
            ariaLabel="Plate centre Y"
            value={layoutParams.plateCenterY ?? 0.3}
            min={0}
            max={1}
            step={0.01}
            format={(v) => pct(v)}
            onChange={(v) => set('plateCenterY', v)}
          />,
          {
            ...gate('plate'),
            exempt: true,
            hint: "Where the plate gradient's core sits down the glyph — 30% is the shipped tune",
          },
        )}
        {btn(
          'WASH STRENGTH',
          pct(layoutParams.washStrength ?? 1),
          'washStrength',
          <SliderEditor
            ariaLabel="Wash strength"
            value={layoutParams.washStrength ?? 1}
            min={0}
            max={1}
            step={0.01}
            format={(v) => pct(v)}
            defaultValue={DEFAULT_LAYOUT_PARAMS.washStrength}
            onChange={(v) => set('washStrength', v)}
          />,
          { ...gate('wash'), hint: 'How far the wash ramp travels from accent to ink — 100% is the shipped ramp' },
        )}
        {btn(
          'WASH SPREAD',
          `×${(layoutParams.washSpread ?? 1).toFixed(2)}`,
          'washSpread',
          <SliderEditor
            ariaLabel="Wash spread"
            value={layoutParams.washSpread ?? 1}
            min={0.25}
            max={4}
            step={0.05}
            format={(v) => `×${v.toFixed(2)}`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.washSpread}
            onChange={(v) => set('washSpread', v)}
          />,
          {
            ...gate('wash'),
            hint: 'The height over which the wash ramp runs — under 1 compresses it to the top, over 1 leaves the bottom short of ink',
          },
        )}
        {btn(
          'STIPPLE DOTS',
          `×${(layoutParams.stippleDotScale ?? 2.5).toFixed(2)}`,
          'stippleDotScale',
          <SliderEditor
            ariaLabel="Stipple dot scale"
            value={layoutParams.stippleDotScale ?? 2.5}
            min={0.5}
            max={5}
            step={0.1}
            format={(v) => `×${v.toFixed(2)}`}
            defaultValue={DEFAULT_LAYOUT_PARAMS.stippleDotScale}
            onChange={(v) => set('stippleDotScale', v)}
          />,
          {
            ...gate('stipple'),
            hint: "The stipple dots' size against the authored field — 2.50 is Matt's shipped tune",
          },
        )}
      </div>
    </div>
  );
}
