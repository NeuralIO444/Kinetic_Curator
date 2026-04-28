// Canvas preview — visualizes the current LayoutManager output using the active assets
// Mock: positions assets per the chosen mode using a deterministic seeded PRNG

const { useEffect: useEffectCV, useRef: useRefCV, useMemo: useMemoCV } = React;

// xorshift32 — tiny seeded PRNG
function mkRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

const COMPOSITION_PRESETS = [
  {
    id: 'praystation',
    categories: ['organic', 'radial', 'stamps'],
    paletteShift: 'band',
  },
  {
    id: 'dripfield',
    categories: ['linework', 'organic', 'dots'],
    paletteShift: 'split',
  },
  {
    id: 'eyearchipelago',
    categories: ['radial', 'organic', 'stamps'],
    paletteShift: 'band',
  },
  {
    id: 'knotgrid',
    categories: ['geometric', 'linework', 'floral'],
    paletteShift: 'zone',
  },
];

function CanvasPreview({ palette, params, enabled, seed, running, fps, onFpsTick }) {
  const wrapRef = useRefCV(null);
  const innerRef = useRefCV(null);

  const activeAssets = useMemoCV(() => window.ASSETS.filter(a => enabled[a.id]), [enabled]);

  const compositionPreset = useMemoCV(() => {
    return COMPOSITION_PRESETS.find(p => p.id === params.composition) || COMPOSITION_PRESETS[0];
  }, [params.composition]);

  const weightForAsset = (asset) => {
    const weightMap = { light: 0.8, medium: 1, heavy: 1.3 };
    const densityMap = { sparse: 0.85, medium: 1, dense: 1.2 };
    let base = weightMap[asset.weight] || 1;
    base *= densityMap[asset.density] || 1;
    if (compositionPreset.categories.includes(asset.category)) base *= 1.3;
    return base;
  };

  const pickAsset = (rng) => {
    const pool = activeAssets.filter(a => compositionPreset.categories.includes(a.category));
    const source = pool.length > 0 ? pool : activeAssets;
    const weights = source.map(weightForAsset);
    const total = weights.reduce((sum, v) => sum + v, 0);
    let roll = rng() * total;
    for (let i = 0; i < source.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return source[i];
    }
    return source[source.length - 1];
  };

  const colorForPlacement = (y, idx, rng) => {
    const sw = palette.swatches;
    if (!params.recolor) return { ink: sw[0], accent: sw[1] };
    if (compositionPreset.paletteShift === 'band') {
      const band = Math.min(sw.length - 1, Math.floor((y / 700) * sw.length));
      return { ink: sw[band], accent: sw[(band + 2) % sw.length] };
    }
    if (compositionPreset.paletteShift === 'zone') {
      const zone = idx % sw.length;
      return { ink: sw[zone], accent: sw[(zone + 3) % sw.length] };
    }
    if (compositionPreset.paletteShift === 'split') {
      const ink = idx % 2 === 0 ? sw[0] : sw[2] || sw[0];
      const accent = idx % 2 === 0 ? sw[2] || sw[1] : sw[1];
      return { ink, accent };
    }
    const ink = sw[Math.floor(rng() * sw.length)];
    let accent = sw[Math.floor(rng() * sw.length)];
    while (accent === ink && sw.length > 1) accent = sw[Math.floor(rng() * sw.length)];
    return { ink, accent };
  };

  // Compute placements when relevant inputs change
  const placements = useMemoCV(() => {
    if (activeAssets.length === 0) return [];
    const W = 1000, H = 700;
    const rng = mkRng(seed);
    const n = Math.max(1, Math.round(params.count * (params.density / 100)));
    const out = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      let x, y;
      switch (params.mode) {
        case 'grid': {
          const cols = Math.ceil(Math.sqrt(n * (W / H)));
          const rows = Math.ceil(n / cols);
          const cx = i % cols, cy = Math.floor(i / cols);
          x = (cx + 0.5) / cols * W;
          y = (cy + 0.5) / rows * H;
          x += (rng() - 0.5) * params.jitter;
          y += (rng() - 0.5) * params.jitter;
          break;
        }
        case 'fibonacci': {
          const r = Math.sqrt(i / n) * Math.min(W, H) * 0.46;
          const a = i * phi;
          x = W / 2 + r * Math.cos(a);
          y = H / 2 + r * Math.sin(a);
          break;
        }
        case 'radial': {
          const ring = Math.floor(i / 12) + 1;
          const a = (i % 12) / 12 * Math.PI * 2;
          const r = ring * 36;
          x = W / 2 + r * Math.cos(a);
          y = H / 2 + r * Math.sin(a);
          break;
        }
        case 'swarm': {
          const cx = W / 2 + (rng() - 0.5) * 200;
          const cy = H / 2 + (rng() - 0.5) * 140;
          const r = rng() * 220;
          const a = rng() * Math.PI * 2;
          x = cx + r * Math.cos(a);
          y = cy + r * Math.sin(a);
          break;
        }
        case 'flow': {
          const t = i / n;
          x = t * W + Math.sin(t * 12) * 40;
          y = H / 2 + Math.sin(t * 8 + rng() * 2) * 200 + (rng() - 0.5) * params.jitter;
          break;
        }
        case 'layers': {
          const tier = i % params.zTiers;
          y = (tier + 0.5) / params.zTiers * H + (rng() - 0.5) * params.jitter;
          x = rng() * W;
          break;
        }
        case 'rails': {
          const lane = i % 4;
          y = (lane + 0.5) / 4 * H;
          x = (i / n) * W * 1.05 - 20;
          y += (rng() - 0.5) * params.jitter;
          break;
        }
        case 'random':
        default: {
          x = rng() * W;
          y = rng() * H;
        }
      }
      const pad = params.bleed ? -40 : 30;
      if (x < pad || x > W - pad || y < pad || y > H - pad) {
        if (!params.bleed) continue;
      }
      const asset = pickAsset(rng);
      const sc = params.scale[0] + rng() * (params.scale[1] - params.scale[0]);
      const baseScale = asset.scale[0] + rng() * (asset.scale[1] - asset.scale[0]);
      const finalScale = sc * baseScale;
      let rot = 0;
      if (asset.rotate === 'free') rot = params.rotate[0] + rng() * (params.rotate[1] - params.rotate[0]);
      else if (asset.rotate === 'step45') rot = Math.floor(rng() * 8) * 45;
      else if (asset.rotate === 'step60') rot = Math.floor(rng() * 6) * 60;
      else if (asset.rotate === 'step90') rot = Math.floor(rng() * 4) * 90;
      const alpha = (params.alpha[0] + rng() * (params.alpha[1] - params.alpha[0])) / 100;
      const tier = Math.floor(rng() * params.zTiers);
      if (params.mirror && i % 2 === 0) x = W - x;
      const { ink, accent } = colorForPlacement(y, i, rng);
      out.push({ x, y, scale: finalScale, rot, alpha, tier, ink, accent, svg: asset.svg, id: asset.id + '_' + i });
    }
    out.sort((a, b) => a.tier - b.tier);
    return out;
  }, [seed, params, activeAssets, palette]);

  // Soft FPS sim — scale with placement count
  useEffectCV(() => {
    if (!running) return;
    let raf, last = performance.now(), frames = 0, acc = 0;
    const tick = (now) => {
      const dt = now - last; last = now; acc += dt; frames++;
      if (acc >= 500) {
        const f = (frames * 1000) / acc;
        // Add slight noise for realism
        onFpsTick(Math.max(8, f - placements.length * 0.01 + (Math.random() - 0.5) * 2));
        frames = 0; acc = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, placements.length]);

  return (
    <section className="panel panel-canvas">
      <PanelHeader tag="P01" title="KINETIC_CURATOR.pde" subtitle="P3D · 1000×700 preview" right={
        <div className="header-tools">
          <span className="status-pill"><span className={classNames('status-dot', running && 'live')}/>{running ? 'render' : 'idle'}</span>
          <span className="meter-pill mono">obj {placements.length}</span>
          <span className="meter-pill mono">mode {params.mode}</span>
          <span className="meter-pill mono">preset {compositionPreset.id}</span>
        </div>
      }/>
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-bg" style={{ background: palette.bg }} />
        <div className="canvas-rulers" />
        <svg ref={innerRef} className="canvas-svg" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet">
          {placements.length === 0 && (
            <g>
              <rect x="0" y="0" width="1000" height="700" fill={palette.bg}/>
              <text x="500" y="350" textAnchor="middle" fontFamily="ui-monospace,monospace" fontSize="20" fill={palette.ink} opacity="0.6">
                pool empty · enable assets in P02
              </text>
            </g>
          )}
          {placements.map(p => (
            <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.scale})`} opacity={p.alpha}
              dangerouslySetInnerHTML={{ __html: `<g style="--ink:${p.ink};--accent:${p.accent}" transform="translate(-50 -50)">${p.svg}</g>` }} />
          ))}
        </svg>
        <div className="canvas-corner tl mono">[0,0]</div>
        <div className="canvas-corner tr mono">[1000,0]</div>
        <div className="canvas-corner bl mono">[0,700]</div>
        <div className="canvas-corner br mono">[1000,700]</div>
      </div>
    </section>
  );
}

window.CanvasPreview = CanvasPreview;
