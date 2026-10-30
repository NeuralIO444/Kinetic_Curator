// SWARM physics as mode rows (#1202; detents #1607, Strata Q Phase 1).
// PARTICLES / COHESION / GRAVITY / DAMPING plus NOISE SPEED.
// Mode-gated per #272; locks ride on the row.
import { isOrganismMode, DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ModeRow } from '../build/te/ModeRow.jsx';
import { stopsFor } from '../build/te/modeStops.mjs';
import { SliderEditor } from '../build/te/editors.jsx';

const fmt2 = (v) => (Math.round(v * 100) / 100).toString();

export function SwarmSliders({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = layoutParams.mode;
  // #280: murmuration is a voice over the swarm engine — it gets the swarm
  // physics sliders, not the moth ones.
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';

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
      <div className="param-subheader ttl">🧬 swarm physic forces</div>
      <div className="slider-stack">
        {btn(
          'PARTICLES',
          'particleCount',
          `${Math.round(layoutParams.particleCount ?? 150)}`,
          <SliderEditor
            ariaLabel="Particles"
            value={layoutParams.particleCount ?? 150}
            min={10}
            max={500}
            step={5}
            defaultValue={DEFAULT_LAYOUT_PARAMS.particleCount}
            onChange={(v) => set('particleCount', Math.round(v))}
          />,
          { disabled: !(isSwarm || isHype), disabledReason: 'Swarm or hype mode only' },
        )}
        {btn(
          'COHESION',
          'swarmCohesion',
          fmt2(layoutParams.swarmCohesion ?? 0),
          <SliderEditor
            ariaLabel="Cohesion"
            value={layoutParams.swarmCohesion ?? 0}
            min={0}
            max={0.6}
            step={0.05}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.swarmCohesion}
            onChange={(v) => set('swarmCohesion', v)}
          />,
          {
            disabled: !isSwarm,
            disabledReason: isOrganismMode(mode) ? 'BEHAVE table drives cohesion in hype mode' : 'Swarm mode only',
          },
        )}
        {btn(
          'GRAVITY',
          'gravityWells',
          fmt2(layoutParams.gravityWells ?? 0),
          <SliderEditor
            ariaLabel="Gravity"
            value={layoutParams.gravityWells ?? 0}
            min={0}
            max={5.0}
            step={0.1}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.gravityWells}
            onChange={(v) => set('gravityWells', v)}
          />,
          { disabled: !(isSwarm || isHype), disabledReason: 'Swarm or hype mode only' },
        )}
        {btn(
          'DAMPING',
          'damping',
          fmt2(layoutParams.damping ?? 0.9),
          <SliderEditor
            ariaLabel="Damping"
            value={layoutParams.damping ?? 0.9}
            min={0.8}
            max={0.99}
            step={0.01}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.damping}
            onChange={(v) => set('damping', v)}
          />,
          {
            disabled: !isSwarm,
            disabledReason: isHype ? 'Moth bodies pin damping ≥ 0.97 for stability' : 'Swarm physics only',
          },
        )}
        {btn(
          'NOISE SPEED',
          'noiseSpeed',
          fmt2(layoutParams.noiseSpeed ?? 1),
          <SliderEditor
            ariaLabel="Noise speed"
            value={layoutParams.noiseSpeed ?? 1}
            min={0.1}
            max={3.0}
            step={0.1}
            format={fmt2}
            defaultValue={DEFAULT_LAYOUT_PARAMS.noiseSpeed}
            onChange={(v) => set('noiseSpeed', v)}
          />,
        )}
      </div>
    </div>
  );
}
