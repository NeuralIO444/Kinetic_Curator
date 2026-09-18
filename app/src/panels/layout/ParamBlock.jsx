// Parameter block — RangeRows with tooltips (#14)
import { RangeRow, DualRangeRow } from '../../components/RangeRow.jsx';
import { DEFAULT_LAYOUT_PARAMS, SYMMETRY_MODES, BEHAVE_MODES } from '../../data/layout-modes.js';
import { getPreset } from '../../data/presets.js';
import { emit, Events } from '../../composition/eventBus.js';

export function ParamBlock({ layoutParams, lockedParams }) {
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const d = (key, fallback) => defaults[key] !== undefined ? defaults[key] : fallback;

  // #272: physics controls are mode-gated. A slider that does nothing in the
  // current mode stays visible but inert, with a one-line reason — honest.
  const mode = layoutParams.mode;
  const isSwarm = mode === 'swarm';
  const isHype = mode === 'hype';
  const bilateral = (layoutParams.symmetry ?? 'none') === 'bilateral';

  return (
    <div className="param-block">
      <RangeRow label="COUNT" value={layoutParams.count} min={10} max={800}
        hint="Number of asset placements drawn"
        onChange={v => set('count', v)} defaultValue={d('count', DEFAULT_LAYOUT_PARAMS.count)}
        locked={lockedParams.count} onToggleLock={() => lock('count')} />
      <DualRangeRow label="SCALE" low={layoutParams.scale[0]} high={layoutParams.scale[1]}
        min={0.1} max={3.0} step={0.05}
        hint="Min–max size range for each placement"
        onChangeLow={v => set('scale', [v, layoutParams.scale[1]])}
        onChangeHigh={v => set('scale', [layoutParams.scale[0], v])}
        readout={`${layoutParams.scale[0].toFixed(1)}–${layoutParams.scale[1].toFixed(1)}`}
        defaultLow={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[0]} defaultHigh={d('scale', DEFAULT_LAYOUT_PARAMS.scale)[1]}
        locked={lockedParams.scale} onToggleLock={() => lock('scale')} />
      <DualRangeRow label="ROTATE" low={layoutParams.rotate[0]} high={layoutParams.rotate[1]}
        min={-180} max={180} hint="Min–max rotation in degrees"
        onChangeLow={v => set('rotate', [v, layoutParams.rotate[1]])}
        onChangeHigh={v => set('rotate', [layoutParams.rotate[0], v])}
        readout={`${layoutParams.rotate[0]}°–${layoutParams.rotate[1]}°`}
        defaultLow={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[0]} defaultHigh={d('rotate', DEFAULT_LAYOUT_PARAMS.rotate)[1]}
        locked={lockedParams.rotate} onToggleLock={() => lock('rotate')} />
      <DualRangeRow label="ALPHA" low={layoutParams.alpha[0]} high={layoutParams.alpha[1]}
        min={0} max={100} hint="Min–max opacity (%)"
        onChangeLow={v => set('alpha', [v, layoutParams.alpha[1]])}
        onChangeHigh={v => set('alpha', [layoutParams.alpha[0], v])}
        readout={`${layoutParams.alpha[0]}–${layoutParams.alpha[1]}%`}
        defaultLow={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[0]} defaultHigh={d('alpha', DEFAULT_LAYOUT_PARAMS.alpha)[1]}
        locked={lockedParams.alpha} onToggleLock={() => lock('alpha')} />
      <RangeRow label="JITTER" value={layoutParams.jitter} min={0} max={200}
        hint="Random position scatter around the layout grid"
        onChange={v => set('jitter', v)} defaultValue={d('jitter', DEFAULT_LAYOUT_PARAMS.jitter)}
        locked={lockedParams.jitter} onToggleLock={() => lock('jitter')} />
      <RangeRow label="DENSITY" value={layoutParams.density} min={10} max={100}
        hint="How tightly placements pack; higher = denser"
        onChange={v => set('density', v)} defaultValue={d('density', DEFAULT_LAYOUT_PARAMS.density)}
        locked={lockedParams.density} onToggleLock={() => lock('density')} />
      {/* #310: Z-TIERS / NOISE FREQ / DISPLACE leave performer sight — they
          stay in state and presets/voices still set them, but the live knobs
          are gone. (MATERIAL and SHADING were already voice-only via #268.) */}
      <RangeRow label="HUE ROTATE" value={layoutParams.hueRotate} min={0} max={360}
        hint="Global hue shift applied to the whole canvas"
        readout={`${layoutParams.hueRotate}°`} onChange={v => set('hueRotate', v)} defaultValue={0} />

      <div className="param-subheader">🌪️ TURBULENCE & DISPLACEMENT</div>
      <RangeRow label="NOISE SPEED" value={layoutParams.noiseSpeed} min={0.1} max={3.0} step={0.1}
        hint="How fast the noise field evolves over time"
        onChange={v => set('noiseSpeed', v)} defaultValue={d('noiseSpeed', DEFAULT_LAYOUT_PARAMS.noiseSpeed)}
        locked={lockedParams.noiseSpeed} onToggleLock={() => lock('noiseSpeed')} />

      <div className="param-subheader">🧬 SWARM PHYSIC FORCES</div>
      <RangeRow label="PARTICLES" value={layoutParams.particleCount} min={10} max={500} step={5}
        hint="Particle count in swarm mode — organism count in hype mode"
        disabled={!(isSwarm || isHype)} disabledReason="Swarm or hype mode only"
        onChange={v => set('particleCount', v)} defaultValue={d('particleCount', DEFAULT_LAYOUT_PARAMS.particleCount)}
        locked={lockedParams.particleCount} onToggleLock={() => lock('particleCount')} />
      <RangeRow label="COHESION" value={layoutParams.swarmCohesion} min={0} max={0.6} step={0.05}
        hint="How strongly particles steer toward the center of their local flock (past ~0.6 the flock is one blob)"
        disabled={!isSwarm} disabledReason="Swarm mode only"
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

      <div className="param-subheader">🦋 MOTH / HYPE</div>
      <RangeRow label="BODY" value={layoutParams.body ?? 3} min={1} max={7} step={1}
        hint="Spine length. 1 = spore, 3–7 = bug. Physics count unchanged."
        disabled={!isHype} disabledReason="Moth bodies only (hype mode)"
        onChange={v => set('body', v)} defaultValue={d('body', DEFAULT_LAYOUT_PARAMS.body)}
        locked={lockedParams.body} onToggleLock={() => lock('body')} />
      <RangeRow label="FLAP" value={layoutParams.flap ?? 0.35} min={0} max={1} step={0.05}
        hint="Wing beat amplitude on bilateral attachments"
        disabled={!(isHype && bilateral)} disabledReason="Needs hype mode + bilateral symmetry (wings are only built for bilateral organisms)"
        onChange={v => set('flap', v)} defaultValue={d('flap', DEFAULT_LAYOUT_PARAMS.flap)}
        locked={lockedParams.flap} onToggleLock={() => lock('flap')} />
      <RangeRow label="TIGHT" value={layoutParams.tight ?? 0.55} min={0.05} max={0.95} step={0.05}
        hint="How stiff the spine follows the leader"
        disabled={!isHype} disabledReason="Moth bodies only (hype mode)"
        onChange={v => set('tight', v)} defaultValue={d('tight', DEFAULT_LAYOUT_PARAMS.tight)}
        locked={lockedParams.tight} onToggleLock={() => lock('tight')} />
      <RangeRow label="WIND" value={layoutParams.wind ?? 1} min={0} max={3} step={0.1}
        hint="Hype-only multiplier on the noise wind"
        disabled={!isHype} disabledReason="Hype mode only"
        onChange={v => set('wind', v)} defaultValue={d('wind', DEFAULT_LAYOUT_PARAMS.wind)}
        locked={lockedParams.wind} onToggleLock={() => lock('wind')} />

      <div className="davis-source-row" style={{ marginTop: 6 }}>
        <span className="davis-label">SYMMETRY</span>
        {SYMMETRY_MODES.map((s) => (
          <button key={s} type="button" className={`chip-btn ${(layoutParams.symmetry || 'none') === s ? 'active' : ''}`} onClick={() => set('symmetry', s)}>{s.toUpperCase()}</button>
        ))}
      </div>
      <div className="davis-source-row" style={{ marginTop: 6 }}>
        <span className="davis-label">BEHAVE</span>
        {BEHAVE_MODES.map((s) => (
          <button key={s} type="button" className={`chip-btn ${(layoutParams.behave || 'cruise') === s ? 'active' : ''}`} onClick={() => set('behave', s)}>{s.toUpperCase()}</button>
        ))}
      </div>
      {/* #268: MATERIAL removed — the GL backend renders every instance
          flat; the buttons changed nothing in the live instrument. */}
    </div>
  );
}
