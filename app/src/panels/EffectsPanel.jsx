// EffectsPanel (P07) — controls for the modular effect pipeline
// Each section toggles + tunes one effect (echo / trails / feedback / particles / blast / color)
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { RangeRow } from '../components/RangeRow.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import * as A from '../state/actions.js';

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay'];
const MOTION_TYPES = ['flow', 'swarm', 'orbit'];
const COLOR_STRATEGIES = ['band', 'zone', 'split'];
const COLOR_HARMONIES = ['none', 'complementary', 'triadic', 'analogous'];

function Toggle({ on, onClick, label }) {
  return (
    <button className={`tg ${on ? 'tg-on' : ''}`} onClick={onClick}>
      <span className="tg-box">{on ? '◉' : '○'}</span>
      {label}
    </button>
  );
}

function ChipRow({ options, value, onChange }) {
  return (
    <div className="preset-row">
      {options.map(opt => (
        <button
          key={opt}
          className={`preset-btn ${value === opt ? 'active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function EffectsPanel() {
  const { dispatch } = useApp();
  const { state } = useApp(s => ({
    blendMode: s.blendMode,
    blendStrength: s.blendStrength,
    echoEnabled: s.echoEnabled,
    echoCount: s.echoCount,
    echoDecay: s.echoDecay,
    trailEnabled: s.trailEnabled,
    trailLength: s.trailLength,
    feedbackEnabled: s.feedbackEnabled,
    feedbackStrength: s.feedbackStrength,
    feedbackDepth: s.feedbackDepth,
    particlesEnabled: s.particlesEnabled,
    particleCount: s.particleCount,
    particleSpeed: s.particleSpeed,
    motionEnabled: s.motionEnabled,
    motionType: s.motionType,
    blastRadiusEnabled: s.blastRadiusEnabled,
    blastRadius: s.blastRadius,
    blastForce: s.blastForce,
    colorStrategy: s.colorStrategy,
    colorHarmony: s.colorHarmony,
  }));
  const { open, toggle } = useCollapse(false);

  const set = (type, payload) => dispatch({ type, payload });

  const activeCount = [
    state.echoEnabled,
    state.trailEnabled,
    state.feedbackEnabled,
    state.particlesEnabled,
    state.motionEnabled,
    state.blastRadiusEnabled,
  ].filter(Boolean).length;

  return (
    <div className="panel panel-effects">
      <PanelHeader
        tag="P07"
        title="EFFECTS"
        subtitle={activeCount === 0 ? 'pipeline idle' : `${activeCount} active`}
        collapsed={!open}
        onToggle={toggle}
      >
        {activeCount > 0 && <span className="drift-badge">⚡ {activeCount}</span>}
      </PanelHeader>
      {open && (
        <div className="panel-body">
          {/* ── ECHO ───────────────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">ECHO</div>
            <div className="toggle-row">
              <Toggle on={state.echoEnabled} label="ENABLE" onClick={() => set(A.SET_ECHO_ENABLED, !state.echoEnabled)} />
            </div>
            <RangeRow label="COUNT" value={state.echoCount} min={1} max={10}
              onChange={v => set(A.SET_ECHO_COUNT, v)} defaultValue={3} />
            <RangeRow label="DECAY" value={state.echoDecay} min={0.1} max={0.95} step={0.05}
              onChange={v => set(A.SET_ECHO_DECAY, v)} defaultValue={0.5}
              readout={state.echoDecay.toFixed(2)} />
          </div>

          {/* ── TRAILS ─────────────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">TRAILS</div>
            <div className="toggle-row">
              <Toggle on={state.trailEnabled} label="ENABLE" onClick={() => set(A.SET_TRAIL_ENABLED, !state.trailEnabled)} />
            </div>
            <RangeRow label="LENGTH" value={state.trailLength} min={1} max={60}
              onChange={v => set(A.SET_TRAIL_LENGTH, v)} defaultValue={10} />
          </div>

          {/* ── FEEDBACK ───────────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">FEEDBACK <span style={{ opacity: 0.5, fontSize: 8 }}>(WebGL only)</span></div>
            <div className="toggle-row">
              <Toggle on={state.feedbackEnabled} label="ENABLE" onClick={() => set(A.SET_FEEDBACK_ENABLED, !state.feedbackEnabled)} />
            </div>
            <RangeRow label="STRENGTH" value={state.feedbackStrength} min={0} max={1} step={0.01}
              onChange={v => set(A.SET_FEEDBACK_STRENGTH, v)} defaultValue={0.1}
              readout={state.feedbackStrength.toFixed(2)} />
            <RangeRow label="DEPTH" value={state.feedbackDepth} min={1} max={20}
              onChange={v => set(A.SET_FEEDBACK_DEPTH, v)} defaultValue={5} />
          </div>

          {/* ── PARTICLES & MOTION ─────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">PARTICLES</div>
            <div className="toggle-row">
              <Toggle on={state.particlesEnabled} label="PARTICLES" onClick={() => set(A.SET_PARTICLES_ENABLED, !state.particlesEnabled)} />
              <Toggle on={state.motionEnabled} label="MOTION" onClick={() => set(A.SET_MOTION_ENABLED, !state.motionEnabled)} />
            </div>
            <RangeRow label="COUNT" value={state.particleCount} min={10} max={2000}
              onChange={v => set(A.SET_PARTICLE_COUNT, v)} defaultValue={100} />
            <RangeRow label="SPEED" value={state.particleSpeed} min={0.1} max={5} step={0.1}
              onChange={v => set(A.SET_PARTICLE_SPEED, v)} defaultValue={1.0}
              readout={state.particleSpeed.toFixed(1)} />
            <div className="preset-group-label" style={{ marginTop: 6 }}>MOTION TYPE</div>
            <ChipRow options={MOTION_TYPES} value={state.motionType} onChange={v => set(A.SET_MOTION_TYPE, v)} />
          </div>

          {/* ── BLAST RADIUS ───────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">BLAST RADIUS</div>
            <div className="toggle-row">
              <Toggle on={state.blastRadiusEnabled} label="ENABLE" onClick={() => set(A.SET_BLAST_RADIUS_ENABLED, !state.blastRadiusEnabled)} />
            </div>
            <RangeRow label="RADIUS" value={state.blastRadius} min={10} max={500}
              onChange={v => set(A.SET_BLAST_RADIUS, v)} defaultValue={50} />
            <RangeRow label="FORCE" value={state.blastForce} min={0} max={5} step={0.1}
              onChange={v => set(A.SET_BLAST_FORCE, v)} defaultValue={1.0}
              readout={state.blastForce.toFixed(1)} />
          </div>

          {/* ── BLENDS ─────────────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">BLEND MODE</div>
            <ChipRow options={BLEND_MODES} value={state.blendMode} onChange={v => set(A.SET_BLEND_MODE, v)} />
            <RangeRow label="STRENGTH" value={state.blendStrength} min={0} max={1} step={0.05}
              onChange={v => set(A.SET_BLEND_STRENGTH, v)} defaultValue={1.0}
              readout={state.blendStrength.toFixed(2)} />
          </div>

          {/* ── COLOR ──────────────────────────────────────── */}
          <div className="param-block">
            <div className="preset-group-label">COLOR STRATEGY</div>
            <ChipRow options={COLOR_STRATEGIES} value={state.colorStrategy} onChange={v => set(A.SET_COLOR_STRATEGY, v)} />
            <div className="preset-group-label" style={{ marginTop: 6 }}>HARMONY</div>
            <ChipRow options={COLOR_HARMONIES} value={state.colorHarmony} onChange={v => set(A.SET_COLOR_HARMONY, v)} />
          </div>
        </div>
      )}
    </div>
  );
}
