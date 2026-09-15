// Parameter block — RangeRows with tooltips (#14)
import { RangeRow, DualRangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function ParamBlock({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;

  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const rand = (key) => emit(Events.LAYOUT_RANDOMIZE, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;

  return (
    <div className="param-block">
      <RangeRow label="COUNT" value={layoutParams.count} min={10} max={800}
        hint="Number of asset placements drawn"
        onChange={v => set('count', v)} defaultValue={d('count', DEFAULT_LAYOUT_PARAMS.count)}
        locked={lockedParams.count} onToggleLock={() => lock('count')}
        onRandomize={() => rand('count')} />

      <DualRangeRow label="SCALE" low={layoutParams.scale[0]} high={layoutParams.scale[1]}
        min={0.1} max={3.0} step={0.05}
        hint="Min–max size range for each placement"
        onChangeLow={v => set('scale', [v, layoutParams.scale[1]])}
        onChangeHigh={v => set('scale', [layoutParams.scale[0], v])}
        readout={`${layoutParams.scale[0].toFixed(1)}–${layoutParams.scale[1].toFixed(1)}`}
        defaultLow={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[0]} defaultHigh={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[1]}
        locked={lockedParams.scale} onToggleLock={() => lock('scale')}
        onRandomize={() => rand('scale')} />

      <DualRangeRow label="ROTATE" low={layoutParams.rotate[0]} high={layoutParams.rotate[1]}
        min={-180} max={180}
        hint="Min–max rotation in degrees"
        onChangeLow={v => set('rotate', [v, layoutParams.rotate[1]])}
        onChangeHigh={v => set('rotate', [layoutParams.rotate[0], v])}
        readout={`${layoutParams.rotate[0]}°–${layoutParams.rotate[1]}°`}
        defaultLow={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[0]} defaultHigh={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[1]}
        locked={lockedParams.rotate} onToggleLock={() => lock('rotate')}
        onRandomize={() => rand('rotate')} />

      <DualRangeRow label="ALPHA" low={layoutParams.alpha[0]} high={layoutParams.alpha[1]}
        min={0} max={100}
        hint="Min–max opacity (%)"
        onChangeLow={v => set('alpha', [v, layoutParams.alpha[1]])}
        onChangeHigh={v => set('alpha', [layoutParams.alpha[0], v])}
        readout={`${layoutParams.alpha[0]}–${layoutParams.alpha[1]}%`}
        defaultLow={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[0]} defaultHigh={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[1]}
        locked={lockedParams.alpha} onToggleLock={() => lock('alpha')}
        onRandomize={() => rand('alpha')} />

      <RangeRow label="JITTER" value={layoutParams.jitter} min={0} max={200}
        hint="Random position scatter around the layout grid"
        onChange={v => set('jitter', v)} defaultValue={d('jitter', DEFAULT_LAYOUT_PARAMS.jitter)}
        locked={lockedParams.jitter} onToggleLock={() => lock('jitter')}
        onRandomize={() => rand('jitter')} />

      <RangeRow label="DENSITY" value={layoutParams.density} min={10} max={120}
        hint="How tightly placements pack; higher = denser"
        onChange={v => set('density', v)} defaultValue={d('density', DEFAULT_LAYOUT_PARAMS.density)}
        locked={lockedParams.density} onToggleLock={() => lock('density')}
        onRandomize={() => rand('density')} />

      <RangeRow label="Z-TIERS" value={layoutParams.zTiers} min={1} max={12}
        hint="Number of depth layers; rear tiers draw smaller"
        onChange={v => set('zTiers', v)} defaultValue={d('zTiers', DEFAULT_LAYOUT_PARAMS.zTiers)}
        locked={lockedParams.zTiers} onToggleLock={() => lock('zTiers')}
        onRandomize={() => rand('zTiers')} />

      <RangeRow label="HUE ROTATE" value={layoutParams.hueRotate} min={0} max={360}
        hint="Global hue shift applied to the whole canvas"
        readout={`${layoutParams.hueRotate}°`}
        onChange={v => set('hueRotate', v)} defaultValue={0} />

      <div className="param-subheader">🌪️ TURBULENCE & DISPLACEMENT</div>

      <RangeRow label="NOISE FREQ" value={layoutParams.noiseFreq} min={0.001} max={0.03} step={0.001}
        hint="Spatial frequency of the fractal noise field"
        onChange={v => set('noiseFreq', v)} defaultValue={d('noiseFreq', DEFAULT_LAYOUT_PARAMS.noiseFreq)}
        locked={lockedParams.noiseFreq} onToggleLock={() => lock('noiseFreq')}
        onRandomize={() => rand('noiseFreq')} />

      <RangeRow label="NOISE SPEED" value={layoutParams.noiseSpeed} min={0.1} max={3.0} step={0.1}
        hint="How fast the noise field evolves over time"
        onChange={v => set('noiseSpeed', v)} defaultValue={d('noiseSpeed', DEFAULT_LAYOUT_PARAMS.noiseSpeed)}
        locked={lockedParams.noiseSpeed} onToggleLock={() => lock('noiseSpeed')}
        onRandomize={() => rand('noiseSpeed')} />

      <RangeRow label="DISPLACE" value={layoutParams.displacement} min={0} max={250} step={1}
        hint="Fractal noise warping of placement positions"
        onChange={v => set('displacement', v)} defaultValue={d('displacement', DEFAULT_LAYOUT_PARAMS.displacement)}
        locked={lockedParams.displacement} onToggleLock={() => lock('displacement')}
        onRandomize={() => rand('displacement')} />

      <div className="param-subheader">🧬 SWARM PHYSIC FORCES</div>

      <RangeRow label="PARTICLES" value={layoutParams.particleCount} min={10} max={500} step={5}
        hint="Particle count in swarm mode"
        onChange={v => set('particleCount', v)} defaultValue={d('particleCount', DEFAULT_LAYOUT_PARAMS.particleCount)}
        locked={lockedParams.particleCount} onToggleLock={() => lock('particleCount')}
        onRandomize={() => rand('particleCount')} />

      <RangeRow label="COHESION" value={layoutParams.swarmCohesion} min={0} max={5.0} step={0.1}
        hint="How strongly particles steer toward the center of their local flock"
        onChange={v => set('swarmCohesion', v)} defaultValue={d('swarmCohesion', DEFAULT_LAYOUT_PARAMS.swarmCohesion)}
        locked={lockedParams.swarmCohesion} onToggleLock={() => lock('swarmCohesion')}
        onRandomize={() => rand('swarmCohesion')} />

      <RangeRow label="GRAVITY" value={layoutParams.gravityWells} min={0} max={5.0} step={0.1}
        hint="Mouse attractor strength in swarm mode"
        onChange={v => set('gravityWells', v)} defaultValue={d('gravityWells', DEFAULT_LAYOUT_PARAMS.gravityWells)}
        locked={lockedParams.gravityWells} onToggleLock={() => lock('gravityWells')}
        onRandomize={() => rand('gravityWells')} />

      <RangeRow label="DAMPING" value={layoutParams.damping} min={0.80} max={0.99} step={0.01}
        hint="Velocity decay each frame; higher = smoother / slower"
        onChange={v => set('damping', v)} defaultValue={d('damping', DEFAULT_LAYOUT_PARAMS.damping)}
        locked={lockedParams.damping} onToggleLock={() => lock('damping')}
        onRandomize={() => rand('damping')} />
    </div>
  );
}
