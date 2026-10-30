// LAYOUT values on the shelf (#1202; mode rows #1607). Continuous values
// render as mode rows — OFF · LOW · MID · HIGH detents under the exact
// readout, which opens the dock editor (Strata Q Phase 1). The Phase 0
// exemptions keep the value button: SCALE / ROTATE / ALPHA (dual ranges —
// a mode row cannot express a span) and DIVERGENCE (a precision param).
// Discrete = ink/red, values = amber (r5/r6). Locks ride on the row; the
// tap-name dialogs for SCALE/ROTATE/ALPHA live in the dock as range editors.
import {
  RANGE_HARD,
  PARAM_SPEC,
  DEFAULT_LAYOUT_PARAMS,
  ROTATE_SPIN_START,
  MIRROR_STATES,
  mirrorMultiplier,
} from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor, DualEditor } from '../build/te/editors.jsx';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { useStore } from '../../state/store.js';
import { nearestPatternBelow } from '../../pattern/ground.js'; // #1183: is there ground under this layer?
import { nearestWeatherAbove } from '../../gl/dishWeather.mjs'; // #1183 weather: is there haze over this layer?

const fmt1 = (v) => (Math.round(v * 10) / 10).toString();

// The canonical scale is { x:[lo,hi], y:[lo,hi] } (#1202); a legacy array
// reads as linked. Linked (the default) is today's behavior — a provable
// no-op in the engine.
function scaleRanges(scale) {
  if (Array.isArray(scale)) return { x: scale, y: scale, linked: true };
  const x = scale?.x ?? [0.4, 1.6];
  const y = scale?.y ?? x;
  const linked = JSON.stringify(x) === JSON.stringify(y);
  return { x, y, linked };
}

function scaleDisplay(scale) {
  const { x, y, linked } = scaleRanges(scale);
  const f = ([a, b]) => `${fmt1(a)}–${fmt1(b)}`;
  return linked ? f(x) : `X ${f(x)} / Y ${f(y)}`;
}

export function LayoutSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = layoutParams.mode;
  // #1183 — GROUND only does something when a PATTERN layer sits below this one in the stack.
  const hasGround = useStore((st) => !!nearestPatternBelow(st.layers, st.activeLayerId));
  // #1183 weather — WEATHER only does something when an FX layer with HAZE sits above this one.
  const hasWeather = useStore((st) => !!nearestWeatherAbove(st.layers, st.activeLayerId));

  const { x: sx, y: sy, linked } = scaleRanges(layoutParams.scale);
  const setScale = (x, y) => set('scale', { x, y });
  const mirrorMult = mirrorMultiplier(layoutParams.mirror ?? 'off');
  const rotateSpin = layoutParams.rotateSpin ?? 0;

  return (
    <div className="slider-stack">
      <ModeRow
        label="COUNT"
        display={`${Math.round(layoutParams.count)}${mirrorMult > 1 ? ` ×${mirrorMult}` : ''}`}
        title={mirrorMult > 1 ? `Count ×${mirrorMult} with mirror — tap to edit` : 'Count — tap to edit'}
        value={layoutParams.count}
        stops={stopsFor('count')}
        onSelect={(v) => set('count', v)}
        locked={lockedParams.count}
        onToggleLock={() => lock('count')}
        onOpen={() => (
          <SliderEditor
            ariaLabel="Count"
            value={Math.round(layoutParams.count)}
            min={10}
            max={800}
            step={1}
            defaultValue={DEFAULT_LAYOUT_PARAMS.count}
            onChange={(v) => set('count', Math.round(v))}
          />
        )}
      />

      <ValueButton
        label="SCALE"
        display={scaleDisplay(layoutParams.scale)}
        locked={lockedParams.scale}
        onToggleLock={() => lock('scale')}
        onOpen={() => (
          <div className="te-editor">
            <div className="te-link-row">
              <button
                type="button"
                className={`te-link-btn${linked ? ' linked' : ''}`}
                aria-pressed={linked}
                title={linked ? "X/Y linked (today's behavior) — tap to split" : 'X/Y split — tap to link'}
                onClick={() => {
                  if (linked) setScale(sx, [...sx]);
                  else setScale(sx, sx);
                }}
              >
                {linked ? 'LINKED' : 'SPLIT'}
              </button>
            </div>
            <div className="te-editor-hint">
              {linked ? 'one range drives X and Y' : 'X and Y ranges drive independently'}
            </div>
            <DualEditor
              ariaLabel={linked ? 'Scale' : 'Scale X'}
              low={sx[0]}
              high={sx[1]}
              min={RANGE_HARD.scale.min}
              max={RANGE_HARD.scale.max}
              step={0.05}
              format={fmt1}
              onChange={(lo, hi) => {
                const x = [lo, hi];
                setScale(x, linked ? x : sy);
              }}
            />
            {!linked && (
              <DualEditor
                ariaLabel="Scale Y"
                low={sy[0]}
                high={sy[1]}
                min={RANGE_HARD.scale.min}
                max={RANGE_HARD.scale.max}
                step={0.05}
                format={fmt1}
                onChange={(lo, hi) => setScale(sx, [lo, hi])}
              />
            )}
            <div className="te-editor-hint">full hard range — tap-name dialog range, no separate dialog needed</div>
          </div>
        )}
      />

      <ValueButton
        label="ROTATE"
        display={`${Math.round(layoutParams.rotate?.[0] ?? -180)}°–${Math.round(layoutParams.rotate?.[1] ?? 180)}°${rotateSpin !== 0 ? ` ⟳${rotateSpin.toFixed(2)}` : ''}`}
        locked={lockedParams.rotate}
        onToggleLock={() => lock('rotate')}
        onOpen={() => (
          <div className="te-editor">
            <DualEditor
              ariaLabel="Rotate"
              low={layoutParams.rotate?.[0] ?? -180}
              high={layoutParams.rotate?.[1] ?? 180}
              min={RANGE_HARD.rotate.min}
              max={RANGE_HARD.rotate.max}
              step={1}
              unit="°"
              onChange={(lo, hi) => set('rotate', [lo, hi])}
            />
            <div className="te-editor-hint">full hard range — tap-name dialog range, no separate dialog needed</div>
            <div className="te-editor-readout" style={{ fontSize: 14 }}>
              SPIN {rotateSpin !== 0 ? `${rotateSpin.toFixed(2)} rev/s` : 'OFF'}
            </div>
            <TeaMatrix
              ariaLabel="Spin"
              options={['OFF', 'ON'].map((id) => ({ id, label: id }))}
              value={rotateSpin !== 0 ? 'ON' : 'OFF'}
              onChange={(id) => set('rotateSpin', id === 'ON' ? ROTATE_SPIN_START : 0)}
            />
            {rotateSpin !== 0 && (
              <SliderEditor
                ariaLabel="Spin speed"
                value={rotateSpin}
                min={0}
                max={PARAM_SPEC.rotateSpin.max}
                step={0.01}
                format={(v) => v.toFixed(2)}
                defaultValue={DEFAULT_LAYOUT_PARAMS.rotateSpin}
                onChange={(v) => set('rotateSpin', v)}
              />
            )}
          </div>
        )}
      />

      <ValueButton
        label="ALPHA"
        display={`${Math.round(layoutParams.alpha?.[0] ?? 60)}–${Math.round(layoutParams.alpha?.[1] ?? 100)}%`}
        locked={lockedParams.alpha}
        onToggleLock={() => lock('alpha')}
        onOpen={() => (
          <DualEditor
            ariaLabel="Alpha"
            low={layoutParams.alpha?.[0] ?? 60}
            high={layoutParams.alpha?.[1] ?? 100}
            min={RANGE_HARD.alpha.min}
            max={RANGE_HARD.alpha.max}
            step={1}
            unit="%"
            onChange={(lo, hi) => set('alpha', [lo, hi])}
          />
        )}
      />

      <ModeRow
        label="JITTER"
        display={`${Math.round(layoutParams.jitter ?? 0)}`}
        value={layoutParams.jitter ?? 0}
        stops={stopsFor('jitter')}
        onSelect={(v) => set('jitter', v)}
        locked={lockedParams.jitter}
        onToggleLock={() => lock('jitter')}
        onOpen={() => (
          <SliderEditor
            ariaLabel="Jitter"
            value={layoutParams.jitter ?? 0}
            min={0}
            max={200}
            step={1}
            defaultValue={DEFAULT_LAYOUT_PARAMS.jitter}
            onChange={(v) => set('jitter', Math.round(v))}
          />
        )}
      />

      <ModeRow
        label="DENSITY"
        display={`${Math.round(layoutParams.density ?? 80)}%`}
        value={layoutParams.density ?? 80}
        stops={stopsFor('density')}
        onSelect={(v) => set('density', v)}
        locked={lockedParams.density}
        onToggleLock={() => lock('density')}
        onOpen={() => (
          <SliderEditor
            ariaLabel="Density"
            value={layoutParams.density ?? 80}
            min={10}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.density}
            onChange={(v) => set('density', Math.round(v))}
          />
        )}
      />

      {/* #1183: how far this layer's marks take the colour of the pattern tile beneath them. Per layer; 0 is today's
            frame exactly. Visible but inert without a pattern below, with the reason (#272). */}
      <ModeRow
        label="GROUND"
        display={`${Math.round((layoutParams.groundLean ?? 0) * 100)}%`}
        value={layoutParams.groundLean ?? 0}
        stops={stopsFor('groundLean')}
        onSelect={(v) => set('groundLean', v)}
        locked={lockedParams.groundLean}
        onToggleLock={() => lock('groundLean')}
        disabled={!hasGround}
        disabledReason="Needs a PATTERN layer below this one"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Ground: how far marks take the colour of the pattern beneath them"
            value={Math.round((layoutParams.groundLean ?? 0) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.groundLean * 100}
            onChange={(v) => set('groundLean', Math.round(v) / 100)}
          />
        )}
      />

      {/* #1183 tile-edge nudge: marks ease off the edges of the pattern tile beneath them, so the grid reads
            through the layout. Per layer; 0 is today's frame exactly. Inert without a pattern below (#272). */}
      <ModeRow
        label="EDGE"
        display={`${Math.round((layoutParams.groundNudge ?? 0) * 100)}%`}
        value={layoutParams.groundNudge ?? 0}
        stops={stopsFor('groundNudge')}
        onSelect={(v) => set('groundNudge', v)}
        locked={lockedParams.groundNudge}
        onToggleLock={() => lock('groundNudge')}
        disabled={!hasGround}
        disabledReason="Needs a PATTERN layer below this one"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Edge: how strongly marks ease off the edges of the pattern tile beneath them"
            value={Math.round((layoutParams.groundNudge ?? 0) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.groundNudge * 100}
            onChange={(v) => set('groundNudge', Math.round(v) / 100)}
          />
        )}
      />

      {/* #1183 contact shadow: this layer's marks cast a soft shadow onto what lies beneath them, toward the sun
            when it is on, straight under them when it is off, in the palette's darkest colour. Per layer; 0 is
            today's frame exactly. Inert without a pattern below (#272). */}
      <ModeRow
        label="SHADOW"
        display={`${Math.round((layoutParams.groundShadow ?? 0) * 100)}%`}
        value={layoutParams.groundShadow ?? 0}
        stops={stopsFor('groundShadow')}
        onSelect={(v) => set('groundShadow', v)}
        locked={lockedParams.groundShadow}
        onToggleLock={() => lock('groundShadow')}
        disabled={!hasGround}
        disabledReason="Needs a PATTERN layer below this one"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Shadow: how dark a shadow the marks cast onto what lies beneath them"
            value={Math.round((layoutParams.groundShadow ?? 0) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.groundShadow * 100}
            onChange={(v) => set('groundShadow', Math.round(v) / 100)}
          />
        )}
      />

      {/* #1183 palette snap: this share of the layer's marks take the exact colours of the pattern tile beneath
            them (main and accent); the same marks every frame for a seed. Per layer; 0 is today's frame exactly.
            Inert without a pattern below (#272). */}
      <ModeRow
        label="SNAP"
        display={`${Math.round((layoutParams.groundSnap ?? 0) * 100)}%`}
        value={layoutParams.groundSnap ?? 0}
        stops={stopsFor('groundSnap')}
        onSelect={(v) => set('groundSnap', v)}
        locked={lockedParams.groundSnap}
        onToggleLock={() => lock('groundSnap')}
        disabled={!hasGround}
        disabledReason="Needs a PATTERN layer below this one"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Snap: the share of marks that take the exact colours of the pattern tile beneath them"
            value={Math.round((layoutParams.groundSnap ?? 0) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.groundSnap * 100}
            onChange={(v) => set('groundSnap', Math.round(v) / 100)}
          />
        )}
      />

      {/* #1183 weather slice 1 (FX as weather): this layer's marks fade into the haze of the nearest FX
            layer above them — colour toward the veil, alpha thinning in the thick mist. Per layer; 0 is
            today's frame exactly. Inert without a hazy FX layer above (#272). */}
      <ModeRow
        label="WEATHER"
        display={`${Math.round((layoutParams.weatherAir ?? 0) * 100)}%`}
        value={layoutParams.weatherAir ?? 0}
        stops={stopsFor('weatherAir')}
        onSelect={(v) => set('weatherAir', v)}
        locked={lockedParams.weatherAir}
        onToggleLock={() => lock('weatherAir')}
        disabled={!hasWeather}
        disabledReason="Needs an FX layer with HAZE above this one"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Weather: how far marks fade into the haze above them"
            value={Math.round((layoutParams.weatherAir ?? 0) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            defaultValue={DEFAULT_LAYOUT_PARAMS.weatherAir * 100}
            onChange={(v) => set('weatherAir', Math.round(v) / 100)}
          />
        )}
      />

      {/* #585: phyllotaxis divergence — mode-gated per #272: visible but
            inert outside phyllotaxis, with the reason. */}
      <ValueButton
        label="DIVERGENCE"
        display={`${fmt1(layoutParams.phylloDivergence ?? 0)}°`}
        locked={lockedParams.phylloDivergence}
        onToggleLock={() => lock('phylloDivergence')}
        disabled={mode !== 'phyllotaxis'}
        disabledReason="Phyllotaxis mode only"
        onOpen={() => (
          <SliderEditor
            ariaLabel="Phyllotaxis divergence"
            value={layoutParams.phylloDivergence ?? 0}
            min={-20}
            max={20}
            step={0.1}
            unit="°"
            format={fmt1}
            onChange={(v) => set('phylloDivergence', v)}
          />
        )}
      />
    </div>
  );
}

// Re-exported for the audit: the mirror states the COUNT readout accounts for.
export { MIRROR_STATES };
