// LayoutPanel (P04) — preset selection + parameter controls
// Bundle 3: lock, dice, randomize-unlocked, preset match indicator
import { useMemo } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { RangeRow, DualRangeRow } from '../components/RangeRow.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { LAYOUT_MODES, DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { getPresetsByGroup, getPreset } from '../data/presets.js';
import * as A from '../state/actions.js';

export function LayoutPanel() {
  const { dispatch } = useApp();
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    lockedParams: s.lockedParams,
  }));
  const { layoutParams, lockedParams } = state;
  const { open, toggle } = useCollapse(true);
  const groups = getPresetsByGroup();

  const setParam = (key, value) => dispatch({ type: A.SET_LAYOUT_PARAM, key, value });
  const applyPreset = (preset) => dispatch({ type: A.APPLY_PRESET, preset });
  const toggleLock = (key) => dispatch({ type: A.TOGGLE_PARAM_LOCK, key });
  const randomizeParam = (key) => dispatch({ type: A.RANDOMIZE_PARAM, key });
  const randomizeUnlocked = () => dispatch({ type: A.RANDOMIZE_UNLOCKED });

  // Current preset defaults for double-click reset
  const preset = getPreset(layoutParams.composition);
  const defaults = preset.params;

  // Preset match indicator: how many params differ from preset defaults
  const driftCount = useMemo(() => {
    let n = 0;
    const keys = [
      'count', 'jitter', 'density', 'zTiers',
      'noiseFreq', 'noiseSpeed', 'displacement',
      'particleCount', 'swarmCohesion', 'gravityWells', 'damping'
    ];
    keys.forEach(k => {
      const defVal = defaults[k] !== undefined ? defaults[k] : DEFAULT_LAYOUT_PARAMS[k];
      if (layoutParams[k] !== defVal) n++;
    });
    ['scale', 'rotate', 'alpha'].forEach(k => {
      const defVal = defaults[k] !== undefined ? defaults[k] : DEFAULT_LAYOUT_PARAMS[k];
      if (layoutParams[k][0] !== defVal[0] || layoutParams[k][1] !== defVal[1]) n++;
    });
    return n;
  }, [layoutParams, defaults]);

  const lockCount = Object.values(lockedParams).filter(Boolean).length;

  return (
    <div className="panel panel-layout">
      <PanelHeader tag="P04" title="LAYOUT" subtitle={layoutParams.composition} collapsed={!open} onToggle={toggle}>
        {lockCount > 0 && <span className="lock-badge">🔒 {lockCount}</span>}
        {driftCount > 0 && <span className="drift-badge" title={`${driftCount} params differ from preset`}>⚡ {driftCount} drifted</span>}
      </PanelHeader>
      {open && (
        <div className="panel-body">
          {/* Grouped presets */}
          <div className="preset-groups">
            {groups.map(g => (
              <div key={g.id} className="preset-group">
                <div className="preset-group-label">
                  {g.label}
                </div>
              <div className="preset-row">
                {g.presets.map(p => (
                  <button
                     key={p.id}
                     className={`preset-btn ${layoutParams.composition === p.id ? 'active' : ''}`}
                     onClick={() => applyPreset(p)}
                     title={p.desc}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              </div>
            ))}
          </div>

          {/* Mode tiles */}
          <div className="mode-grid">
            {LAYOUT_MODES.map(m => (
              <button
                key={m.id}
                className={`mode-tile ${layoutParams.mode === m.id ? 'active' : ''}`}
                onClick={() => setParam('mode', m.id)}
              >
                <span style={{ fontSize: '11px' }}>{m.glyph}</span>
                {m.name}
              </button>
            ))}
          </div>

          {/* Randomize Unlocked button */}
          <div className="randomize-bar">
            <button className="randomize-btn" onClick={randomizeUnlocked}>
              🎲 RANDOMIZE UNLOCKED
            </button>
            <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked` : 'all unlocked'}</span>
          </div>

          {/* Parameters */}
          <div className="param-block">
            <RangeRow label="COUNT" value={layoutParams.count} min={10} max={800}
              onChange={v => setParam('count', v)} defaultValue={defaults.count}
              locked={lockedParams.count} onToggleLock={() => toggleLock('count')}
              onRandomize={() => randomizeParam('count')} />

            <DualRangeRow label="SCALE" low={layoutParams.scale[0]} high={layoutParams.scale[1]}
              min={0.1} max={3.0} step={0.05}
              onChangeLow={v => setParam('scale', [v, layoutParams.scale[1]])}
              onChangeHigh={v => setParam('scale', [layoutParams.scale[0], v])}
              readout={`${layoutParams.scale[0].toFixed(1)}–${layoutParams.scale[1].toFixed(1)}`}
              defaultLow={defaults.scale[0]} defaultHigh={defaults.scale[1]}
              locked={lockedParams.scale} onToggleLock={() => toggleLock('scale')}
              onRandomize={() => randomizeParam('scale')} />

            <DualRangeRow label="ROTATE" low={layoutParams.rotate[0]} high={layoutParams.rotate[1]}
              min={-180} max={180}
              onChangeLow={v => setParam('rotate', [v, layoutParams.rotate[1]])}
              onChangeHigh={v => setParam('rotate', [layoutParams.rotate[0], v])}
              readout={`${layoutParams.rotate[0]}°–${layoutParams.rotate[1]}°`}
              defaultLow={defaults.rotate[0]} defaultHigh={defaults.rotate[1]}
              locked={lockedParams.rotate} onToggleLock={() => toggleLock('rotate')}
              onRandomize={() => randomizeParam('rotate')} />

            <DualRangeRow label="ALPHA" low={layoutParams.alpha[0]} high={layoutParams.alpha[1]}
              min={0} max={100}
              onChangeLow={v => setParam('alpha', [v, layoutParams.alpha[1]])}
              onChangeHigh={v => setParam('alpha', [layoutParams.alpha[0], v])}
              readout={`${layoutParams.alpha[0]}–${layoutParams.alpha[1]}%`}
              defaultLow={defaults.alpha[0]} defaultHigh={defaults.alpha[1]}
              locked={lockedParams.alpha} onToggleLock={() => toggleLock('alpha')}
              onRandomize={() => randomizeParam('alpha')} />

            <RangeRow label="JITTER" value={layoutParams.jitter} min={0} max={200}
              onChange={v => setParam('jitter', v)} defaultValue={defaults.jitter}
              locked={lockedParams.jitter} onToggleLock={() => toggleLock('jitter')}
              onRandomize={() => randomizeParam('jitter')} />

            <RangeRow label="DENSITY" value={layoutParams.density} min={10} max={120}
              onChange={v => setParam('density', v)} defaultValue={defaults.density}
              locked={lockedParams.density} onToggleLock={() => toggleLock('density')}
              onRandomize={() => randomizeParam('density')} />

            <RangeRow label="Z-TIERS" value={layoutParams.zTiers} min={1} max={12}
              onChange={v => setParam('zTiers', v)} defaultValue={defaults.zTiers}
              locked={lockedParams.zTiers} onToggleLock={() => toggleLock('zTiers')}
              onRandomize={() => randomizeParam('zTiers')} />

            {/* Turbulence & Displacement */}
            <div className="param-subheader">🌪️ TURBULENCE & DISPLACEMENT</div>

            <RangeRow label="NOISE FREQ" value={layoutParams.noiseFreq} min={0.001} max={0.03} step={0.001}
              onChange={v => setParam('noiseFreq', v)} defaultValue={defaults.noiseFreq !== undefined ? defaults.noiseFreq : DEFAULT_LAYOUT_PARAMS.noiseFreq}
              locked={lockedParams.noiseFreq} onToggleLock={() => toggleLock('noiseFreq')}
              onRandomize={() => randomizeParam('noiseFreq')} />

            <RangeRow label="NOISE SPEED" value={layoutParams.noiseSpeed} min={0.1} max={3.0} step={0.1}
              onChange={v => setParam('noiseSpeed', v)} defaultValue={defaults.noiseSpeed !== undefined ? defaults.noiseSpeed : DEFAULT_LAYOUT_PARAMS.noiseSpeed}
              locked={lockedParams.noiseSpeed} onToggleLock={() => toggleLock('noiseSpeed')}
              onRandomize={() => randomizeParam('noiseSpeed')} />

            <RangeRow label="DISPLACE" value={layoutParams.displacement} min={0} max={250} step={1}
              onChange={v => setParam('displacement', v)} defaultValue={defaults.displacement !== undefined ? defaults.displacement : DEFAULT_LAYOUT_PARAMS.displacement}
              locked={lockedParams.displacement} onToggleLock={() => toggleLock('displacement')}
              onRandomize={() => randomizeParam('displacement')} />

            {/* Particle Swarm */}
            <div className="param-subheader">🧬 SWARM PHYSIC FORCES</div>

            <RangeRow label="PARTICLES" value={layoutParams.particleCount} min={10} max={500} step={5}
              onChange={v => setParam('particleCount', v)} defaultValue={defaults.particleCount !== undefined ? defaults.particleCount : DEFAULT_LAYOUT_PARAMS.particleCount}
              locked={lockedParams.particleCount} onToggleLock={() => toggleLock('particleCount')}
              onRandomize={() => randomizeParam('particleCount')} />

            <RangeRow label="COHESION" value={layoutParams.swarmCohesion} min={0} max={5.0} step={0.1}
              onChange={v => setParam('swarmCohesion', v)} defaultValue={defaults.swarmCohesion !== undefined ? defaults.swarmCohesion : DEFAULT_LAYOUT_PARAMS.swarmCohesion}
              locked={lockedParams.swarmCohesion} onToggleLock={() => toggleLock('swarmCohesion')}
              onRandomize={() => randomizeParam('swarmCohesion')} />

            <RangeRow label="GRAVITY" value={layoutParams.gravityWells} min={0} max={5.0} step={0.1}
              onChange={v => setParam('gravityWells', v)} defaultValue={defaults.gravityWells !== undefined ? defaults.gravityWells : DEFAULT_LAYOUT_PARAMS.gravityWells}
              locked={lockedParams.gravityWells} onToggleLock={() => toggleLock('gravityWells')}
              onRandomize={() => randomizeParam('gravityWells')} />

            <RangeRow label="DAMPING" value={layoutParams.damping} min={0.80} max={0.99} step={0.01}
              onChange={v => setParam('damping', v)} defaultValue={defaults.damping !== undefined ? defaults.damping : DEFAULT_LAYOUT_PARAMS.damping}
              locked={lockedParams.damping} onToggleLock={() => toggleLock('damping')}
              onRandomize={() => randomizeParam('damping')} />
          </div>

          {/* Toggles */}
          <div className="toggle-row">
            {['bleed', 'recolor', 'mirror', 'overlap'].map(key => (
              <button key={key} className={`tg ${layoutParams[key] ? 'tg-on' : ''}`}
                onClick={() => setParam(key, !layoutParams[key])}>
                <span className="tg-box">{layoutParams[key] ? '◉' : '○'}</span>
                {key.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
