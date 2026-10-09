// LAYOUT values as amber TE value buttons (#1202). Each opens a dock editor
// (slider/dual/dial/stepper per DS #1121 r2); discrete = ink/red, values =
// amber (r5/r6). Locks ride on the button; the tap-name dialogs for
// SCALE/ROTATE/ALPHA move into the dock as range editors.
import { RANGE_HARD, PARAM_SPEC, ROTATE_SPIN_START, MIRROR_STATES, mirrorMultiplier } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { SliderEditor, DualEditor } from '../build/te/editors.jsx';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';

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

  const { x: sx, y: sy, linked } = scaleRanges(layoutParams.scale);
  const setScale = (x, y) => set('scale', { x, y });
  const mirrorMult = mirrorMultiplier(layoutParams.mirror ?? 'off');
  const rotateSpin = layoutParams.rotateSpin ?? 0;

  return (
    <div className="slider-stack">
        <ValueButton
          label="COUNT"
          display={`${Math.round(layoutParams.count)}${mirrorMult > 1 ? ` ×${mirrorMult}` : ''}`}
          title={mirrorMult > 1 ? `Count ×${mirrorMult} with mirror — tap to edit` : 'Count — tap to edit'}
          locked={lockedParams.count}
          onToggleLock={() => lock('count')}
          onOpen={() => (
            <SliderEditor
              ariaLabel="Count"
              value={Math.round(layoutParams.count)}
              min={10} max={800} step={1}
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
                  title={linked ? 'X/Y linked (today\'s behavior) — tap to split' : 'X/Y split — tap to link'}
                  onClick={() => {
                    if (linked) setScale(sx, [...sx]);
                    else setScale(sx, sx);
                  }}
                >
                  {linked ? 'LINKED' : 'SPLIT'}
                </button>
              </div>
              <div className="te-editor-hint">{linked ? 'one range drives X and Y' : 'X and Y ranges drive independently'}</div>
              <DualEditor
                ariaLabel={linked ? 'Scale' : 'Scale X'}
                low={sx[0]} high={sx[1]}
                min={RANGE_HARD.scale.min} max={RANGE_HARD.scale.max} step={0.05}
                format={fmt1}
                onChange={(lo, hi) => {
                  const x = [lo, hi];
                  setScale(x, linked ? x : sy);
                }}
              />
              {!linked && (
                <DualEditor
                  ariaLabel="Scale Y"
                  low={sy[0]} high={sy[1]}
                  min={RANGE_HARD.scale.min} max={RANGE_HARD.scale.max} step={0.05}
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
                min={RANGE_HARD.rotate.min} max={RANGE_HARD.rotate.max} step={1}
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
                  min={0} max={PARAM_SPEC.rotateSpin.max} step={0.01}
                  format={(v) => v.toFixed(2)}
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
              min={RANGE_HARD.alpha.min} max={RANGE_HARD.alpha.max} step={1}
              unit="%"
              onChange={(lo, hi) => set('alpha', [lo, hi])}
            />
          )}
        />

        <ValueButton
          label="JITTER"
          display={`${Math.round(layoutParams.jitter ?? 0)}`}
          locked={lockedParams.jitter}
          onToggleLock={() => lock('jitter')}
          onOpen={() => (
            <SliderEditor
              ariaLabel="Jitter"
              value={layoutParams.jitter ?? 0}
              min={0} max={200} step={1}
              onChange={(v) => set('jitter', Math.round(v))}
            />
          )}
        />

        <ValueButton
          label="DENSITY"
          display={`${Math.round(layoutParams.density ?? 80)}%`}
          locked={lockedParams.density}
          onToggleLock={() => lock('density')}
          onOpen={() => (
            <SliderEditor
              ariaLabel="Density"
              value={layoutParams.density ?? 80}
              min={10} max={100} step={1}
              unit="%"
              onChange={(v) => set('density', Math.round(v))}
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
              min={-20} max={20} step={0.1}
              unit="°" format={fmt1}
              onChange={(v) => set('phylloDivergence', v)}
            />
          )}
        />
      </div>
  );
}

// Re-exported for the audit: the mirror states the COUNT readout accounts for.
export { MIRROR_STATES };
