// CanvasPanel (P01) — live SVG preview
// Placement logic is in engine/placement.js — this is render-only

import { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { computePlacements } from '../engine/placement.js';
import { colorForPlacement, resolveColors } from '../engine/color.js';
import { mkRng } from '../engine/prng.js';
import { getPreset } from '../data/presets.js';
import { ParticleSystem } from '../engine/particles.js';

// Instantiate the single-source-of-truth particle engine
const swarmSystem = new ParticleSystem();

export function CanvasPanel() {
  const { palette, assets, canvasRef, svgRef } = useApp();
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    seed: s.seed,
    enabled: s.enabledAssets,
    evolveMode: s.evolveMode,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    motionSmoothing: s.motionSmoothing,
    caGrid: s.caGrid,
  }));
  const { layoutParams, seed, enabled, evolveMode, beatPulse, audioBands, motionSmoothing, caGrid } = state;
  const { open, toggle } = useCollapse(true);

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

  const preset = getPreset(layoutParams.composition);
  const activeAssets = useMemo(
    () => assets.filter(a => enabled[a.id]),
    [assets, enabled],
  );

  // Local frame count tick for 60fps swarm triggers
  const [tick, setTick] = useState(0);
  const attractorRef = useRef(null);

  // Sync physics update tick loop strictly when mode is swarm
  useEffect(() => {
    if (layoutParams.mode !== 'swarm') return;

    swarmSystem.init(
      layoutParams.particleCount || 150,
      canvasW,
      canvasH,
      activeAssets,
      palette,
      seed
    );

    let animId;
    const step = () => {
      swarmSystem.update(
        layoutParams,
        activeAssets,
        palette,
        seed,
        Date.now(),
        attractorRef.current
      );
      setTick(t => t + 1);
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [layoutParams.mode, activeAssets, palette, seed]);

  // Pointer Attraction Gravity Coordinates Tracking
  const handlePointerMove = (e) => {
    if (canvasDragRef.current.active) return;
    const svgEl = e.currentTarget;
    const rect = svgEl.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Correct zoom and pan transforms to resolve cursor coordinates accurately
    const unpanX = (x - pan.x) / zoom;
    const unpanY = (y - pan.y) / zoom;
    
    attractorRef.current = { x: unpanX, y: unpanY };
  };

  const handlePointerLeave = () => {
    attractorRef.current = null;
  };

  const onCanvasPointerMoveCombined = (e) => {
    if (canvasDragRef.current.active) {
      onCanvasPointerMove(e);
    } else {
      handlePointerMove(e);
    }
  };

  const onCanvasPointerUpCombined = (e) => {
    attractorRef.current = null;
    onCanvasPointerUp(e);
  };

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
      zTiers: layoutParams.zTiers,
      bleed: layoutParams.bleed,
      canvasW,
      canvasH,
      caGrid: layoutParams.mode === 'ca' ? caGrid : null,
      displacement: layoutParams.displacement,
      noiseFreq: layoutParams.noiseFreq,
      noiseSpeed: layoutParams.noiseSpeed,
    });
  }, [activeAssets.length, layoutParams, seed, canvasW, canvasH, caGrid]);

  // BUG-04 fix: memoize rng + item mapping so it's deterministic across renders
  const items = useMemo(() => {
    const rng = mkRng(seed + 1);
    let mapped = placements.map((p, i) => {
      const asset = activeAssets[i % activeAssets.length];
      const color = colorForPlacement({
        swatches: palette.swatches,
        strategy: preset.paletteShift || 'band',
        t: p.t,
        index: p.index,
        rng: () => rng(),
      });
      return { ...p, asset, color };
    });

    // FG-01: overlap — when OFF, sort by scale (ascending) for depth ordering
    if (!layoutParams.overlap) {
      mapped = [...mapped].sort((a, b) => a.scale - b.scale);
    }

    // FG-01: mirror — duplicate every item reflected around canvas center X
    if (layoutParams.mirror) {
      const mirrored = mapped.map(item => ({
        ...item,
        x: canvasW - item.x,
        _mirrored: true,
      }));
      mapped = [...mapped, ...mirrored];
    }

    return mapped;
  }, [placements, activeAssets, palette.swatches, preset.paletteShift, seed, layoutParams.overlap, layoutParams.mirror, canvasW]);

  // Dynamic selector for items mapping based on active layout modes
  const renderItems = useMemo(() => {
    if (layoutParams.mode === 'swarm') {
      let swarmItems = swarmSystem.getItems(activeAssets);
      
      // Apply z-sorting when overlap is OFF
      if (!layoutParams.overlap) {
        swarmItems = [...swarmItems].sort((a, b) => a.scale - b.scale);
      }
      
      // Apply mirror reflections if enabled
      if (layoutParams.mirror) {
        const mirrored = swarmItems.map(item => ({
          ...item,
          x: canvasW - item.x,
          rotation: -item.rotation,
          _mirrored: true,
        }));
        swarmItems = [...swarmItems, ...mirrored];
      }
      return swarmItems;
    }
    return items;
  }, [layoutParams.mode, items, activeAssets, layoutParams.overlap, layoutParams.mirror, tick]);

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${activeAssets.length} assets`} collapsed={!open} onToggle={toggle}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">
            BG: {bgMode.toUpperCase()}
          </button>
          <button className="chip-btn" onClick={() => { setZoom(1); setPan({x:0, y:0}); }} title="Reset View">
            RESET VIEW
          </button>
          <span className="meter-pill">{canvasW}×{canvasH}</span>
        </div>
      </PanelHeader>
      {open && (
        <div className={`canvas-wrap ${bgMode === 'transparent' ? 'checkerboard' : ''}`} ref={canvasRef}>
          <div className="canvas-bg" style={bgStyle} />
          <div className="canvas-rulers" />
          <svg className="canvas-svg" ref={svgRef} viewBox={`0 0 ${canvasW} ${canvasH}`} xmlns="http://www.w3.org/2000/svg"
            onWheel={onCanvasWheel}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMoveCombined}
            onPointerUp={onCanvasPointerUpCombined}
            onPointerCancel={onCanvasPointerUpCombined}
            onPointerLeave={handlePointerLeave}
          >
            <g transform={`translate(${canvasW/2}, ${canvasH/2}) scale(${zoom}) translate(${-canvasW/2}, ${-canvasH/2}) translate(${pan.x/zoom}, ${pan.y/zoom})`}>
              {renderItems.map((item, i) => {
                const ink = item.color;
                const accent = palette.swatches[(palette.swatches.indexOf(ink) + 3) % palette.swatches.length] || palette.swatches[0];
                const svgStr = resolveColors(item.asset.svg, ink, accent);
                return (
                  <g
                    key={i}
                    transform={`translate(${item.x}, ${item.y}) scale(${item._mirrored ? -item.scale : item.scale}, ${item.scale}) rotate(${item.rotation})`}
                    opacity={item.alpha / 100}
                    style={{
                      transition: motionSmoothing && layoutParams.mode !== 'swarm' ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease' : 'none',
                      transformOrigin: '0 0',
                    }}
                    dangerouslySetInnerHTML={{ __html: svgStr }}
                  />
                );
              })}
            </g>
          </svg>
          <span className="canvas-corner tl">0,0</span>
          <span className="canvas-corner tr">{layoutParams.mode}</span>
          <span className="canvas-corner bl">{preset.name}</span>
          <span className="canvas-corner br">{canvasW}×{canvasH}</span>
        </div>
      )}
    </div>
  );
}
