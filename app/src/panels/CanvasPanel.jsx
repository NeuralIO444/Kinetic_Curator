// CanvasPanel (P01) — live SVG preview
// Placement logic is in engine/placement.js — this is render-only

import { useMemo, useRef, useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { computePlacements } from '../engine/placement.js';
import { colorForPlacement, applyHarmony } from '../engine/color.js';
import { mkRng } from '../engine/prng.js';
import { getPreset } from '../data/presets.js';
import { processEffects } from '../engine/effects.js';
import { composeItems } from '../engine/compose.js';
import { PALETTES } from '../data/palettes.js';
import * as A from '../state/actions.js';

// WebGL renderer is heavy (pulls in PIXI). Lazy-load it.
const WebGLCanvas = lazy(() =>
  import('../components/WebGLCanvas.jsx').then(m => ({ default: m.WebGLCanvas }))
);

// GSAP is only needed in SVG mode. Dynamic-importing it keeps ~70 KB out of
// the initial bundle. The module cache is shared across renders.
let gsapModulePromise = null;
function loadGsap() {
  if (!gsapModulePromise) gsapModulePromise = import('gsap').then(m => m.gsap);
  return gsapModulePromise;
}

/**
 * Render one item as SVG. Two modes:
 *   live=true  → attach a ref so GSAP can animate it; apply per-item blend
 *   live=false → frozen snapshot, position via transform attr, no ref/blend
 */
function renderSvgItem(item, i, live, blendMode, blendStrength, itemRefs) {
  const blend = live && blendMode !== 'normal' ? blendMode : undefined;
  const liveOpacity = blendMode === 'normal' ? 1 : blendStrength;

  if (item.particle) {
    if (live) {
      return (
        <circle
          key={i}
          ref={el => (itemRefs.current[i] = el)}
          cx={item.x}
          cy={item.y}
          r={item.scale * 10}
          fill={item.color}
          opacity={(item.alpha / 100) * liveOpacity}
          style={{ transformOrigin: '0 0', mixBlendMode: blend }}
        />
      );
    }
    return (
      <circle
        key={i}
        cx={item.x}
        cy={item.y}
        r={item.scale * 10}
        fill={item.color}
        opacity={item.alpha / 100}
      />
    );
  }

  const svgStr = item.asset.svg
    .replace(/var\(--ink\)/g, item.color)
    .replace(/var\(--accent\)/g, item.accent);

  if (live) {
    return (
      <g
        key={i}
        ref={el => (itemRefs.current[i] = el)}
        style={{
          transformOrigin: '0 0',
          mixBlendMode: blend,
          opacity: blendMode === 'normal' ? undefined : (item.alpha / 100) * liveOpacity,
        }}
        dangerouslySetInnerHTML={{ __html: svgStr }}
      />
    );
  }
  return (
    <g
      key={i}
      transform={`translate(${item.x},${item.y}) scale(${item.scale}) rotate(${item.rotation})`}
      style={{ opacity: item.alpha / 100 }}
      dangerouslySetInnerHTML={{ __html: svgStr }}
    />
  );
}

export function CanvasPanel() {
  const { palette, assets, canvasRef, svgRef, dispatch } = useApp();
  // Note: `beatPulse` and `audioBands` are intentionally NOT subscribed here —
  // CanvasPanel doesn't read them in render, and pulling them in caused this
  // component to re-render at audio rate (~60 Hz) for no gain.
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    seed: s.seed,
    enabled: s.enabledAssets,
    running: s.running,
    evolveMode: s.evolveMode,
    motionSmoothing: s.motionSmoothing,
    renderingMode: s.renderingMode,
    perfMode: s.perfMode,
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
    layers: s.layers,
    activeLayerId: s.activeLayerId,
  }));
  const { layoutParams, seed, enabled, running, evolveMode, motionSmoothing, renderingMode, perfMode,
    blendMode, blendStrength, echoEnabled: rawEchoEnabled, echoCount, echoDecay, trailEnabled: rawTrailEnabled, trailLength,
    feedbackEnabled, feedbackStrength, feedbackDepth, particlesEnabled, particleCount: rawParticleCount, particleSpeed,
    motionEnabled, motionType, blastRadiusEnabled, blastRadius, blastForce, colorStrategy, colorHarmony, layers, activeLayerId } = state;

  // Perf mode caps: clamp particle count, disable accumulation effects.
  const echoEnabled = perfMode ? false : rawEchoEnabled;
  const trailEnabled = perfMode ? false : rawTrailEnabled;
  const particleCount = perfMode ? Math.min(rawParticleCount, 200) : rawParticleCount;
  const { open, toggle } = useCollapse(true);

  // Refs for animation
  const itemRefs = useRef([]);

  // Tick counter for time-based effects (motion, blast decay, trails)
  const [tick, setTick] = useState(0);

  // Blast center — set by click on canvas, decays over ~1s
  const [blastCenter, setBlastCenter] = useState(null);

  // Trail history — last N positions per particle index (out-of-band state)
  const trailHistoryRef = useRef([]);

  // Lazy GSAP — only fetch when SVG mode is active. Stored in state so the
  // animation effect re-fires once the module resolves.
  const [gsap, setGsap] = useState(null);
  useEffect(() => {
    if (renderingMode === 'svg' && !gsap) loadGsap().then(setGsap);
  }, [renderingMode, gsap]);

  // Canvas height: defaults to "use almost the whole viewport," leaving room
  // for the masthead + footer + a collapsed DAVIS panel below it. Studio mode
  // hides Stimulus so this is the right default. User can drag the bottom
  // grip to make it shorter, or click ↕ FIT to re-snap.
  const computeFitHeight = () => {
    if (typeof window === 'undefined') return 720;
    return Math.max(480, window.innerHeight - 220);
  };
  const [canvasHeight, setCanvasHeight] = useState(computeFitHeight);
  const fitCanvas = () => setCanvasHeight(computeFitHeight());

  // Re-fit on window resize (only if user hasn't dragged it shorter than fit).
  useEffect(() => {
    const onResize = () => setCanvasHeight((h) => {
      const fit = computeFitHeight();
      return h >= fit - 40 ? fit : h;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const dragRef = useRef({ active: false, startY: 0, startH: 0 });

  const onPointerDown = (e) => {
    dragRef.current = { active: true, startY: e.clientY, startH: canvasHeight };
    e.target.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.active) return;
    const delta = e.clientY - dragRef.current.startY;
    setCanvasHeight(Math.max(200, Math.min(1200, dragRef.current.startH + delta)));
  };

  const onPointerUp = (e) => {
    dragRef.current.active = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  // U12: Scroll-to-Zoom & Drag-to-Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasDragRef = useRef({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  const onCanvasWheel = (e) => {
    const zoomSpeed = 0.0015;
    const z = Math.max(0.1, Math.min(10, zoom - e.deltaY * zoomSpeed));
    setZoom(z);
  };

  const onCanvasPointerDown = (e) => {
    if (e.target.closest('.canvas-resize-handle')) return;
    canvasDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    e.target.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e) => {
    if (!canvasDragRef.current.active) return;
    const dx = e.clientX - canvasDragRef.current.startX;
    const dy = e.clientY - canvasDragRef.current.startY;
    setPan({ x: canvasDragRef.current.startPanX + dx, y: canvasDragRef.current.startPanY + dy });
  };

  const onCanvasPointerUp = (e) => {
    canvasDragRef.current.active = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  // U13: Background toggle
  const [bgMode, setBgMode] = useState('palette'); // palette | transparent | white
  const cycleBg = () => setBgMode(m => m === 'palette' ? 'transparent' : m === 'transparent' ? 'white' : 'palette');

  let bgStyle = { background: palette.bg };
  if (bgMode === 'white') bgStyle.background = '#ffffff';
  else if (bgMode === 'transparent') bgStyle.background = 'transparent';

  const canvasW = 1000;
  const canvasH = 700;

  const preset = useMemo(() => getPreset(layoutParams.composition), [layoutParams.composition]);
  const activeAssets = useMemo(
    () => assets.filter(a => enabled[a.id]),
    [assets, enabled],
  );

  const placements = useMemo(() => {
    if (activeAssets.length === 0) return [];
    return computePlacements({
      mode: layoutParams.mode,
      count: layoutParams.count,
      seed,
      scale: layoutParams.scale,
      rotate: layoutParams.rotate,
      alpha: layoutParams.alpha,
      jitter: layoutParams.jitter,
      density: layoutParams.density,
      canvasW,
      canvasH,
      caGrid: null, // CA grid managed separately
    });
  }, [activeAssets.length, layoutParams, seed, canvasW, canvasH]);

  // Apply harmony rotation to palette swatches if active
  const harmonizedSwatches = useMemo(
    () => applyHarmony(palette.swatches, colorHarmony),
    [palette.swatches, colorHarmony]
  );

  // Assign assets + colors to each placement.
  // Memoized: only re-runs when placements, palette, harmony, or strategy
  // change. Audio bands / FPS updates no longer trigger this loop.
  const coloredItems = useMemo(() => {
    if (placements.length === 0) return [];
    const rng = mkRng(seed + 1);
    const strategy = colorStrategy !== 'band' ? colorStrategy : (preset.paletteShift || 'band');
    const out = new Array(placements.length);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const asset = activeAssets[i % activeAssets.length];
      const color = colorForPlacement({
        swatches: harmonizedSwatches,
        strategy,
        t: p.t,
        index: p.index,
        rng: () => rng(),
      });
      const accent = harmonizedSwatches[(harmonizedSwatches.indexOf(color) + 3) % harmonizedSwatches.length] || harmonizedSwatches[0];
      out[i] = { ...p, asset, color, accent };
    }
    return out;
  }, [placements, activeAssets, harmonizedSwatches, colorStrategy, preset, seed]);

  // Compose frozen layer items. Layers are snapshots — they don't tick.
  const layerRenderItems = useMemo(() => {
    if (!layers || layers.length === 0) return [];
    const composeCtx = {
      canvasW, canvasH, assets, palettes: PALETTES,
      preset, tick: 0, blastCenter: null,
    };
    return layers
      .filter(l => l.visible)
      .map(l => ({ layer: l, items: composeItems(l.snapshot, composeCtx) }));
  }, [layers, canvasW, canvasH, assets, preset]);

  // Run effect pipeline. Memoized so it only recomputes when an input
  // actually changed — guards against the no-selector-fallback wakeups and
  // against tick churn when no time-dependent effects are active.
  const pipelineItems = useMemo(() => {
    const effectConfig = {
      echoEnabled, echoCount, echoDecay,
      particlesEnabled, particleCount, particleSpeed,
      motionEnabled, motionType,
      blastRadiusEnabled, blastRadius, blastForce,
    };
    const ctx = {
      canvasW, canvasH, seed,
      swatches: harmonizedSwatches,
      tick,
      blastCenter,
    };
    return processEffects(coloredItems, effectConfig, ctx);
  }, [
    coloredItems, canvasW, canvasH, seed, harmonizedSwatches, tick, blastCenter,
    echoEnabled, echoCount, echoDecay,
    particlesEnabled, particleCount, particleSpeed,
    motionEnabled, motionType,
    blastRadiusEnabled, blastRadius, blastForce,
  ]);

  // Working variable for downstream mutations (trails ghosts).
  let items = pipelineItems;

  // Trails: record current particle positions, prepend ghost copies
  if (trailEnabled) {
    const history = trailHistoryRef.current;
    const ghosts = [];
    let pIdx = 0;
    for (const it of items) {
      if (!it.particle) continue;
      if (!history[pIdx]) history[pIdx] = [];
      // Render past trail positions first, dimmest first
      const past = history[pIdx];
      for (let k = 0; k < past.length; k++) {
        const decay = (k + 1) / (past.length + 1); // older = lower
        ghosts.push({
          ...it,
          x: past[k].x,
          y: past[k].y,
          scale: it.scale * (0.4 + decay * 0.6),
          alpha: it.alpha * decay * 0.6,
          particle: true,
          trail: true,
        });
      }
      // Push current position into history, cap at trailLength
      past.push({ x: it.x, y: it.y });
      while (past.length > trailLength) past.shift();
      pIdx++;
    }
    // Trim history if particle count shrank
    history.length = pIdx;
    items = [...ghosts, ...items];
  } else if (trailHistoryRef.current.length) {
    trailHistoryRef.current = [];
  }

  // rAF loop for time-driven effects: bumps `tick`, throttled to ~30fps to
  // keep SVG re-render cost manageable. Gated on `running` so pause truly
  // freezes particle motion, trails, and blast decay.
  const blastActive = blastCenter && Date.now() - blastCenter.t < 1000;
  const tickActive = running && ((particlesEnabled && motionEnabled) || trailEnabled || blastActive);
  useEffect(() => {
    if (!tickActive) return;
    let raf;
    let start = performance.now();
    let lastTick = 0;
    const loop = (now) => {
      if (now - lastTick > 33) { // ~30fps
        setTick(now - start);
        lastTick = now;
        // If a blast has expired, clear it so we stop re-rendering
        if (blastCenter && now - blastCenter.t > 1100) {
          setBlastCenter(null);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tickActive, blastCenter]);

  // Blast click handler — converts client coords to canvas viewBox coords
  const onBlastClick = useCallback((e) => {
    if (!blastRadiusEnabled) return;
    // Only react to clicks (not drag pans). Ignore if shiftKey wasn't held? No — just use Alt as a modifier.
    if (!e.altKey) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * canvasW;
    const yRel = ((e.clientY - rect.top) / rect.height) * canvasH;
    setBlastCenter({ x: xRel, y: yRel, t: Date.now() });
  }, [blastRadiusEnabled, canvasW, canvasH]);

  // Animate items with GSAP (SVG mode only, non-particles only).
  // GSAP is lazy-loaded — re-fires when the module resolves.
  useEffect(() => {
    if (renderingMode === 'webgl' || !gsap) return;
    items.forEach((item, i) => {
      if (item.particle) return; // skip particles + trail ghosts
      const el = itemRefs.current[i];
      if (!el) return;
      if (motionSmoothing) {
        gsap.to(el, {
          x: item.x, y: item.y, scale: item.scale, rotation: item.rotation,
          opacity: item.alpha / 100,
          duration: 0.4, ease: 'power2.out',
        });
      } else {
        gsap.set(el, {
          x: item.x, y: item.y, scale: item.scale, rotation: item.rotation,
          opacity: item.alpha / 100,
        });
      }
    });
  }, [items, motionSmoothing, renderingMode, gsap]);

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${activeAssets.length} assets`} collapsed={!open} onToggle={toggle}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">
            BG: {bgMode.toUpperCase()}
          </button>
          <button className="chip-btn" onClick={fitCanvas} title="Expand canvas to fill the column (or drag the bottom grip)">
            ↕ FIT
          </button>
          <button className="chip-btn" onClick={() => { setZoom(1); setPan({x:0, y:0}); }} title="Reset View">
            RESET VIEW
          </button>
          <span className="meter-pill">{canvasW}×{canvasH}</span>
        </div>
      </PanelHeader>
      {open && (
        <div className={`canvas-wrap ${bgMode === 'transparent' ? 'checkerboard' : ''}`} ref={canvasRef} style={{ height: canvasHeight }}>
          <div className="canvas-bg" style={bgStyle} />
          <div className="canvas-rulers" />
          {renderingMode === 'webgl' ? (
            <Suspense fallback={
              <div className="canvas-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink)', fontSize: '14px' }}>
                Loading WebGL renderer…
              </div>
            }>
              <WebGLCanvas
                items={activeLayerId ? [] : items}
                layerRenderItems={
                  activeLayerId
                    ? layerRenderItems.map(lr =>
                        lr.layer.id === activeLayerId ? { ...lr, items } : lr
                      )
                    : layerRenderItems
                }
                canvasW={canvasW}
                canvasH={canvasH}
                zoom={zoom}
                pan={pan}
                blendMode={blendMode}
                blendStrength={blendStrength}
                feedback={{ enabled: feedbackEnabled, strength: feedbackStrength, depth: feedbackDepth }}
                onWheel={onCanvasWheel}
                onPointerDown={(e) => { onBlastClick(e); onCanvasPointerDown(e); }}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
              />
            </Suspense>
          ) : (
            <svg className="canvas-svg" ref={svgRef} viewBox={`0 0 ${canvasW} ${canvasH}`} xmlns="http://www.w3.org/2000/svg"
              onWheel={onCanvasWheel}
              onPointerDown={(e) => { onBlastClick(e); onCanvasPointerDown(e); }}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
            >
              <g
                transform={`translate(${canvasW/2}, ${canvasH/2}) scale(${zoom}) translate(${-canvasW/2}, ${-canvasH/2}) translate(${pan.x/zoom}, ${pan.y/zoom})`}
                style={{ isolation: 'isolate' }}
              >
                {/* Layers (oldest first). If a layer is active, its slot
                    renders the LIVE items (with GSAP refs + per-item blend). */}
                {layerRenderItems.map(({ layer, items: layerItems }) => {
                  const isActive = layer.id === activeLayerId;
                  const renderItems = isActive ? items : layerItems;
                  const layerBlend = layer.blendMode === 'normal' ? undefined : layer.blendMode;
                  return (
                    <g key={layer.id} style={{ opacity: layer.opacity, mixBlendMode: layerBlend }}>
                      {renderItems.map((item, i) => renderSvgItem(item, i, isActive, blendMode, blendStrength, itemRefs))}
                    </g>
                  );
                })}
                {/* Live composition on top — only when not editing a layer in place. */}
                {!activeLayerId && items.map((item, i) => renderSvgItem(item, i, true, blendMode, blendStrength, itemRefs))}
              </g>
            </svg>
          )}
          <span className="canvas-corner tl">0,0</span>
          <span className="canvas-corner tr">{layoutParams.mode}{blastRadiusEnabled ? ' · alt-click=blast' : ''}</span>
          <span className="canvas-corner bl">{preset.name}</span>
          <span className="canvas-corner br">{canvasW}×{canvasH}</span>
          
          {/* Resize handle */}
          <div className="canvas-resize-handle"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="resize-grip"></div>
          </div>
        </div>
      )}
    </div>
  );
}
