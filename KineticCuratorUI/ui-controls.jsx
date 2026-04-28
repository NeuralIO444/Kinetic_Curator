// LayoutManager + InputRouter + Output panels

const { useState: useStateLM, useEffect: useEffectLM, useRef: useRefLM } = React;

// ───────────────────────────────────────────────────────────────
// Range slider (dual handles) — minimal monospace style
// ───────────────────────────────────────────────────────────────
function RangeRow({ label, unit, min, max, step, value, onChange, dual = true }) {
  if (dual) {
    const [lo, hi] = value;
    return (
      <div className="range-row">
        <span className="range-label">{label}</span>
        <span className="range-readout mono">[{lo}{unit} — {hi}{unit}]</span>
        <div className="dual-slider">
          <input type="range" min={min} max={max} step={step} value={lo}
            onChange={e => onChange([Math.min(+e.target.value, hi), hi])} />
          <input type="range" min={min} max={max} step={step} value={hi}
            onChange={e => onChange([lo, Math.max(+e.target.value, lo)])} />
          <span className="dual-track" />
          <span className="dual-fill" style={{
            left: ((lo - min) / (max - min)) * 100 + '%',
            right: (1 - (hi - min) / (max - min)) * 100 + '%',
          }} />
        </div>
      </div>
    );
  }
  return (
    <div className="range-row">
      <span className="range-label">{label}</span>
      <span className="range-readout mono">{value}{unit}</span>
      <input className="single-slider" type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// LayoutManager
// ───────────────────────────────────────────────────────────────
const LAYOUT_MODES = [
  { id: 'random',    name: 'random',    glyph: 'rand' },
  { id: 'grid',      name: 'grid',      glyph: 'grid' },
  { id: 'fibonacci', name: 'fibonacci', glyph: 'phi'  },
  { id: 'radial',    name: 'radial',    glyph: 'rad'  },
  { id: 'swarm',     name: 'swarm·hype',glyph: 'hype' },
  { id: 'flow',      name: 'flow',      glyph: 'flow' },
  { id: 'layers',    name: 'layers',    glyph: 'z'    },
  { id: 'rails',     name: 'rails',     glyph: 'rail' },
  { id: 'ca',        name: 'cellular',  glyph: 'ca'   },
];

const COMPOSITION_PRESETS = [
  {
    id: 'praystation',
    name: 'PRAYSTATION',
    desc: 'dense bloom of glyphs and color bursts',
    categories: ['organic', 'radial', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'fibonacci', count: 300, scale: [0.35, 1.4], rotate: [-140, 140], alpha: [24, 96],
      zTiers: 5, jitter: 42, density: 92, bleed: false, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'dripfield',
    name: 'DRIP FIELD',
    desc: 'linework + drops with a wild spread',
    categories: ['linework', 'organic', 'dots'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 340, scale: [0.28, 1.25], rotate: [-160, 160], alpha: [32, 88],
      zTiers: 6, jitter: 66, density: 100, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'eyearchipelago',
    name: 'EYE ARCHIPELAGO',
    desc: 'radial anchors with clustered organic glyphs',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 220, scale: [0.4, 1.5], rotate: [-90, 90], alpha: [38, 98],
      zTiers: 5, jitter: 28, density: 82, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'knotgrid',
    name: 'KNOT GRID',
    desc: 'tight grid clusters with offset traps',
    categories: ['geometric', 'linework', 'floral'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 260, scale: [0.3, 1.1], rotate: [-140, 140], alpha: [26, 88],
      zTiers: 4, jitter: 48, density: 86, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'fujimoto-prism',
    name: 'FUJIMOTO PRISM',
    desc: 'kinetic laser scan — sharp geometry in rapid color zones (Shohei Fujimoto)',
    categories: ['geometric', 'linework', 'crystalline'],
    paletteShift: 'zone',
    params: {
      mode: 'grid', count: 380, scale: [0.25, 1.6], rotate: [-180, 180], alpha: [18, 72],
      zTiers: 7, jitter: 52, density: 105, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'meinesz-bloom',
    name: 'MEINESZ BLOOM',
    desc: 'bio-synthetic growth — organic radials in flowing color (Lisa Meinesz)',
    categories: ['organic', 'radial', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'radial', count: 250, scale: [0.42, 1.8], rotate: [-120, 120], alpha: [28, 92],
      zTiers: 6, jitter: 35, density: 78, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
  {
    id: 'halftime-glitch',
    name: 'HALFTIME GLITCH',
    desc: 'fragmented bass aesthetic — crystalline + scanlines in split tones (Rendah Mag)',
    categories: ['geometric', 'fragments', 'scanlines'],
    paletteShift: 'split',
    params: {
      mode: 'swarm', count: 420, scale: [0.2, 1.3], rotate: [-170, 170], alpha: [20, 85],
      zTiers: 8, jitter: 74, density: 112, bleed: true, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'bitshifter-chaos',
    name: 'BITSHIFTER CHAOS',
    desc: 'cellular automaton + bitwise mutations — chaotic evolution (motion-driven)',
    categories: ['geometric', 'crystalline', 'fragments'],
    paletteShift: 'split',
    params: {
      mode: 'ca', count: 180, scale: [0.25, 1.1], rotate: [-180, 180], alpha: [30, 90],
      zTiers: 4, jitter: 28, density: 88, bleed: false, recolor: true, mirror: false, overlap: true,
    },
  },
  {
    id: 'ca-growth',
    name: 'CA GROWTH',
    desc: 'life-like cellular automaton — emergent organic patterns from digital rules',
    categories: ['organic', 'geometric', 'biosynthetic'],
    paletteShift: 'band',
    params: {
      mode: 'ca', count: 240, scale: [0.35, 1.5], rotate: [-90, 90], alpha: [40, 100],
      zTiers: 5, jitter: 18, density: 75, bleed: false, recolor: true, mirror: true, overlap: true,
    },
  },
];

function LayoutManager({ params, setParams }) {
  const set = (k, v) => setParams({ ...params, [k]: v });
  const applyPreset = (preset) => setParams({ ...params, ...preset.params, composition: preset.id });
  const [collapsed, toggle] = useCollapse(false);
  return (
    <section className="panel panel-layout">
      <PanelHeader tag="P04" title="LAYOUT_MANAGER.pde" subtitle="distribution · transform ranges · alpha"
        collapsed={collapsed} onToggle={toggle}
        right={<span className="meter-pill mono">{params.mode} · {params.composition}</span>} />
      {!collapsed && (
      <div className="panel-body">
        <div className="preset-row">
          {COMPOSITION_PRESETS.map(p => (
            <button key={p.id}
              className={classNames('preset-btn', params.composition === p.id && 'active')}
              onClick={() => applyPreset(p)}
              title={p.desc}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mode-grid">
          {LAYOUT_MODES.map(m => (
            <button key={m.id}
              className={classNames('mode-tile', params.mode === m.id && 'active')}
              onClick={() => set('mode', m.id)}>
              <ModeGlyph mode={m.id} active={params.mode === m.id} />
              <span className="mode-name">{m.name}</span>
            </button>
          ))}
        </div>
        <div className="param-block">
          <RangeRow label="count"   unit=""    min={1}    max={800}  step={1}     value={params.count}    onChange={v => set('count', v)} dual={false} />
          <RangeRow label="scale"   unit="×"   min={0.1}  max={3}    step={0.05}  value={params.scale}    onChange={v => set('scale', v)} />
          <RangeRow label="rotate"  unit="°"   min={-180} max={180}  step={1}     value={params.rotate}   onChange={v => set('rotate', v)} />
          <RangeRow label="alpha"   unit="%"   min={0}    max={100}  step={1}     value={params.alpha}    onChange={v => set('alpha', v)} />
          <RangeRow label="z-tier"  unit=""    min={1}    max={8}    step={1}     value={params.zTiers}   onChange={v => set('zTiers', v)} dual={false} />
          <RangeRow label="jitter"  unit="px"  min={0}    max={200}  step={1}     value={params.jitter}   onChange={v => set('jitter', v)} dual={false} />
          <RangeRow label="density" unit="%"   min={0}    max={100}  step={1}     value={params.density}  onChange={v => set('density', v)} dual={false} />
        </div>
        <div className="toggle-row">
          <Toggle label="bleed edges" v={params.bleed} on={v => set('bleed', v)} />
          <Toggle label="recolor inks" v={params.recolor} on={v => set('recolor', v)} />
          <Toggle label="mirror axis"  v={params.mirror} on={v => set('mirror', v)} />
          <Toggle label="overlap ok"   v={params.overlap} on={v => set('overlap', v)} />
        </div>
      </div>
      )}
    </section>
  );
}

function Toggle({ label, v, on }) {
  return (
    <button className={classNames('tg', v && 'tg-on')} onClick={() => on(!v)}>
      <span className="tg-box">{v ? '■' : '□'}</span>
      <span className="tg-label">{label}</span>
    </button>
  );
}

function ModeGlyph({ mode, active }) {
  const stroke = active ? 'var(--bg)' : 'var(--ink)';
  const fill = active ? 'var(--bg)' : 'var(--ink)';
  const common = { width: 32, height: 32, viewBox: '0 0 32 32' };
  switch (mode) {
    case 'random':    return <svg {...common}><g fill={fill}><circle cx="6" cy="9" r="2"/><circle cx="22" cy="6" r="2"/><circle cx="14" cy="16" r="2"/><circle cx="26" cy="20" r="2"/><circle cx="9" cy="24" r="2"/><circle cx="20" cy="27" r="2"/></g></svg>;
    case 'grid':      return <svg {...common}><g fill={fill}><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="24" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><circle cx="24" cy="16" r="2"/><circle cx="8" cy="24" r="2"/><circle cx="16" cy="24" r="2"/><circle cx="24" cy="24" r="2"/></g></svg>;
    case 'fibonacci': return <svg {...common}><path d="M16 16 m0 0 a2 2 0 1 1 0 -0.1 a4 4 0 1 1 0 -0.2 a7 7 0 1 1 0 -0.3 a11 11 0 1 1 0 -0.4" stroke={stroke} strokeWidth="1.5" fill="none"/></svg>;
    case 'radial':    return <svg {...common}><circle cx="16" cy="16" r="2" fill={fill}/><g fill={fill}><circle cx="16" cy="6" r="1.5"/><circle cx="26" cy="16" r="1.5"/><circle cx="16" cy="26" r="1.5"/><circle cx="6" cy="16" r="1.5"/><circle cx="23" cy="9" r="1.5"/><circle cx="23" cy="23" r="1.5"/><circle cx="9" cy="23" r="1.5"/><circle cx="9" cy="9" r="1.5"/></g></svg>;
    case 'swarm':     return <svg {...common}><g fill={fill}><circle cx="10" cy="14" r="2"/><circle cx="14" cy="11" r="2"/><circle cx="18" cy="14" r="2"/><circle cx="14" cy="18" r="2"/><circle cx="20" cy="20" r="2"/><circle cx="22" cy="11" r="1.5"/></g></svg>;
    case 'flow':      return <svg {...common}><g stroke={stroke} strokeWidth="1.5" fill="none"><path d="M4 10 Q12 6 20 10 T28 10"/><path d="M4 16 Q12 12 20 16 T28 16"/><path d="M4 22 Q12 18 20 22 T28 22"/></g></svg>;
    case 'layers':    return <svg {...common}><g stroke={stroke} strokeWidth="1.5" fill="none"><rect x="4" y="6" width="20" height="6"/><rect x="6" y="13" width="20" height="6"/><rect x="8" y="20" width="20" height="6"/></g></svg>;
    case 'rails':     return <svg {...common}><g fill={fill}><circle cx="6" cy="16" r="1.5"/><circle cx="11" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="21" cy="16" r="1.5"/><circle cx="26" cy="16" r="1.5"/></g><g stroke={stroke} strokeWidth="1" opacity="0.5"><line x1="4" y1="10" x2="28" y2="10"/><line x1="4" y1="22" x2="28" y2="22"/></g></svg>;
    default:          return <svg {...common}/>;
  }
}

// ───────────────────────────────────────────────────────────────
// InputRouter
// ───────────────────────────────────────────────────────────────
const ROUTES = [
  { src: 'motion.x',     label: 'horizontal motion'    },
  { src: 'motion.y',     label: 'vertical motion'      },
  { src: 'motion.mass',  label: 'total motion mass'    },
  { src: 'audio.amp',    label: 'audio amplitude'      },
  { src: 'audio.bands',  label: 'frequency bands [4]'  },
  { src: 'osc./cue',     label: 'osc /cue trigger'     },
];
const TARGETS = ['—', 'count', 'scale', 'rotate', 'alpha', 'jitter', 'density', 'palette.shift', 'mode.cycle'];

function InputRouter({ routes, setRoutes }) {
  const motionRef = useRefLM(null);
  // tiny animated motion-zone visualizer (mock webcam)
  useEffectLM(() => {
    const cv = motionRef.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    let raf, t = 0;
    const draw = () => {
      t += 0.02;
      ctx.fillStyle = '#0c0c0e';
      ctx.fillRect(0, 0, cv.width, cv.height);
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const x = (i / 4) * cv.width;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
        const y = (i / 4) * cv.height;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
      }
      // simulated motion blobs
      for (let i = 0; i < 5; i++) {
        const x = cv.width * (0.5 + 0.35 * Math.sin(t * (1 + i * 0.3) + i));
        const y = cv.height * (0.5 + 0.3 * Math.cos(t * (0.7 + i * 0.2) + i * 1.3));
        const r = 12 + 8 * Math.sin(t * 2 + i);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,45,111,0.6)');
        grd.addColorStop(1, 'rgba(255,45,111,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      // crosshair following biggest blob
      const cx = cv.width * (0.5 + 0.35 * Math.sin(t));
      const cy = cv.height * (0.5 + 0.3 * Math.cos(t * 0.7));
      ctx.strokeStyle = '#00d9ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.stroke();
      ctx.strokeRect(cx - 14, cy - 14, 28, 28);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const [collapsed, toggle] = useCollapse(false);
  const activeRoutes = routes.filter(r => r.target !== '—').length;
  return (
    <section className="panel panel-router">
      <PanelHeader tag="P03" title="INPUT_ROUTER.pde" subtitle="webcam.motion → params"
        collapsed={collapsed} onToggle={toggle}
        right={
          <span className="meter-pill mono">{activeRoutes}/{routes.length} routes</span>
        }/>
      {!collapsed && (
      <div className="router-body">
        <div className="cam-wrap">
          <canvas ref={motionRef} width={280} height={210} />
          <div className="cam-overlay-tl">REC · MOTION</div>
          <div className="cam-overlay-tr">▲ 0.42</div>
          <div className="cam-overlay-bl">x:0.61 y:0.48</div>
          <div className="cam-overlay-br">mock feed</div>
        </div>
        <div className="route-table">
          <div className="route-header">
            <span className="col-src">source</span>
            <span className="col-arrow"></span>
            <span className="col-tgt">target</span>
            <span className="col-gain">gain</span>
            <span className="col-act"></span>
          </div>
          {ROUTES.map((r, i) => (
            <RouteRow key={r.src} src={r.src} label={r.label} route={routes[i]} setRoute={nv => {
              const next = routes.slice(); next[i] = nv; setRoutes(next);
            }} />
          ))}
        </div>
      </div>
      )}
    </section>
  );
}

function RouteRow({ src, label, route, setRoute }) {
  return (
    <div className={classNames('route-row', route.target !== '—' && 'route-active')}>
      <span className="col-src">
        <span className="src-id mono">{src}</span>
        <span className="src-label">{label}</span>
      </span>
      <span className="col-arrow mono">→</span>
      <span className="col-tgt">
        <select value={route.target} onChange={e => setRoute({ ...route, target: e.target.value })}>
          {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </span>
      <span className="col-gain">
        <input type="range" min={0} max={2} step={0.05} value={route.gain}
          onChange={e => setRoute({ ...route, gain: +e.target.value })} />
        <span className="mono gain-readout">×{route.gain.toFixed(2)}</span>
      </span>
      <span className="col-act">
        <span className={classNames('signal', route.target !== '—' && 'signal-on')}>
          {route.target !== '—' ? '●' : '○'}
        </span>
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Output / snapshot
// ───────────────────────────────────────────────────────────────
function OutputPanel({ palette, layout, seed, snapshots, addSnapshot }) {
  const [size, setSize] = useStateLM('1080x1080');
  const [collapsed, toggle] = useCollapse(true);
  return (
    <section className="panel panel-output">
      <PanelHeader tag="P05" title="OUTPUT.pde" subtitle="snapshot · pdf · config export"
        collapsed={collapsed} onToggle={toggle}
        right={<span className="meter-pill mono">{snapshots.length} saved</span>} />
      {!collapsed && (
      <div className="panel-body output-body">
        <div className="output-row">
          <label className="field">
            <span className="field-label">format</span>
            <select value={size} onChange={e => setSize(e.target.value)}>
              <option>1080x1080</option>
              <option>1920x1080</option>
              <option>2160x2700</option>
              <option>3000x3000</option>
            </select>
          </label>
          <button className="big-btn" onClick={() => addSnapshot('png')}>↓ PNG</button>
          <button className="big-btn" onClick={() => addSnapshot('pdf')}>↓ PDF (key:s)</button>
          <button className="big-btn" onClick={() => addSnapshot('json')}>↓ CONFIG.json</button>
        </div>
        <div className="snapshot-strip">
          {snapshots.length === 0 && <span className="placeholder">no snapshots yet · key [s] in sketch saves to /out</span>}
          {snapshots.map((s, i) => (
            <div key={i} className="snap">
              <div className="snap-thumb" style={{ background: palette.bg }}>
                <span className="snap-fmt">{s.fmt}</span>
              </div>
              <div className="snap-meta mono">
                <span>{s.id}</span>
                <span>{s.ts}</span>
                <span>seed:{s.seed.toString(16).slice(0, 6)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}

window.LayoutManager = LayoutManager;
window.InputRouter = InputRouter;
window.OutputPanel = OutputPanel;
