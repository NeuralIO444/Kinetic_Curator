// SWARM physics sliders — extracted from ParamBlock.jsx (UX-5 reorg).
// PARTICLES / COHESION / GRAVITY / DAMPING plus NOISE SPEED (the noise
// field's time behavior). Mode-gated per #272.
import { RangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS, isOrganismMode } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function SwarmSliders({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;
  const mode = layoutParams.mode;
  // #280: murmuration is a voice over the swarm engine — it gets the swarm
  // physics sliders, not the moth ones.
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';

  return (
    <div className="param-block">
      <div className="param-subheader">🧬 SWARM PHYSIC FORCES</div>
      <RangeRow label="PARTICLES" value={layoutParams.particleCount} min={10} max={500} step={5}
        hint="Particle count in swarm mode — organism count in hype mode"
        disabled={!(isSwarm || isHype)} disabledReason="Swarm or hype mode only"
        onChange={v => set('particleCount', v)} defaultValue={d('particleCount', DEFAULT_LAYOUT_PARAMS.particleCount)}
        locked={lockedParams.particleCount} onToggleLock={() => lock('particleCount')} />
      <RangeRow label="COHESION" value={layoutParams.swarmCohesion} min={0} max={0.6} step={0.05}
        hint="How strongly particles steer toward the center of their local flock (past ~0.6 the flock is one blob)"
        disabled={!isSwarm} disabledReason={isOrganismMode(mode) ? "BEHAVE table drives cohesion in hype mode" : "Swarm mode only"}
        onChange={v => set('swarmCohesion', v)} defaultValue={d('swarmCohesion', DEFAULT_LAYOUT_PARAMS.swarmCohesion)}
        locked={lockedParams.swarmCohesion} onToggleLock={() => lock('swarmCohesion')} />
      <RangeRow label="GRAVITY" value={layoutParams.gravityWells} min={0} max={5.0} step={0.1}
        hint="Mouse attractor strength — only pulls while your cursor is over the canvas"
        disabled={!(isSwarm || isHype)} disabledReason="Swarm or hype mode only"
        onChange={v => set('gravityWells', v)} defaultValue={d('gravityWells', DEFAULT_LAYOUT_PARAMS.gravityWells)}
        locked={lockedParams.gravityWells} onToggleLock={() => lock('gravityWells')} />
      <RangeRow label="DAMPING" value={layoutParams.damping} min={0.80} max={0.99} step={0.01}
        hint="Velocity decay each frame; higher = smoother / slower"
        disabled={!isSwarm} disabledReason={isHype ? "Moth bodies pin damping ≥ 0.97 for stability" : "Swarm physics only"}
        onChange={v => set('damping', v)} defaultValue={d('damping', DEFAULT_LAYOUT_PARAMS.damping)}
        locked={lockedParams.damping} onToggleLock={() => lock('damping')} />
      <RangeRow label="NOISE SPEED" value={layoutParams.noiseSpeed} min={0.1} max={3.0} step={0.1}
        hint="How fast the noise field evolves over time"
        onChange={v => set('noiseSpeed', v)} defaultValue={d('noiseSpeed', DEFAULT_LAYOUT_PARAMS.noiseSpeed)}
        locked={lockedParams.noiseSpeed} onToggleLock={() => lock('noiseSpeed')} />
    </div>
  );
}
