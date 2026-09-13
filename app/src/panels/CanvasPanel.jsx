// CanvasPanel (P01) — live SVG preview
// Assets via <symbol>+<use>; quality caps from store

import { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { computePlacements } from '../engine/placement.js';
import { colorForPlacement } from '../engine/color.js';
import { mkRng } from '../engine/prng.js';
import { getPreset } from '../data/presets.js';
import { ParticleSystem } from '../engine/particles.js';
import { AssetSpriteSheet } from '../components/AssetSpriteSheet.jsx';
import { getQualityCaps } from '../data/quality.js';

const ASSET_SIZE = 100;
const swarmSystem = new ParticleSystem();

export function CanvasPanel() {
  const { palette, assets, canvasRef, svgRef, dispatch } = useApp();
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    seed: s.seed,
    enabled: s.enabledAssets,
    evolveMode: s.evolveMode,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    motionSmoothing: s.motionSmoothing,
    caGrid: s.caGrid,
    quality: s.quality,
  }));
  const { layoutParams, seed, enabled, evolveMode, motionSmoothing, caGrid, quality } = state;
  const { open, toggle } = useCollapse(true);

  const caps = getQualityCaps(quality || 'balanced');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasDragRef = useRef({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });

  const onCanvasWheel = (e) => {
    const z = Math.max(0.1, Math.min(10, zoom - e.deltaY * 0.0015));
    setZoom(z);
  };

  const onCanvasPointerDown = (e) => {
    if (e.target.closest('.canvas-resize-handle')) return;
    canvasDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    e.target.setPointerCapture(e.pointerId);
  };

  const onCanvasPointerMove = (e) => {
    if (!canvasDragRef.current.active) return;
    setPan({
      x: canvasDragRef.current.startPanX + (e.clientX - canvasDragRef.current.startX),
      y: canvasDragRef.current.startPanY + (e.clientY - canvasDragRef.current.startY),
    });
  };

  const onCanvasPointerUp = (e) => {
    canvasDragRef.current.active = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  const [bgMode, setBgMode] = useState('palette');
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

  // Quality-aware soft clamp
  const maxForMirror = layoutParams.mirror ? caps.maxCountMirrored : caps.maxCount;
  const safeCount = Math.min(Math.max(1, layoutParams.count), maxForMirror);
  const safeParticles = Math.min(layoutParams.particleCount || 150, caps.maxParticles);

  const [tick, setTick] = useState(0);
  const attractorRef = useRef(null);

  useEffect(() => {
    if (layoutParams.mode !== 'swarm') return;

    swarmSystem.init(safeParticles, canvasW, canvasH, activeAssets, palette, seed);

    let animId;
    const step = () => {
      swarmSystem.update(layoutParams, activeAssets, palette, seed, Date.now(), attractorRef.current);
      setTick(t => t + 1);
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [layoutParams.mode, activeAssets, palette, seed, safeParticles]);

  const handlePointerMove = (e) => {
    if (canvasDragRef.current.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasW / rect.width);
    const y = (e.clientY - rect.top) * (canvasH / rect.height);
    attractorRef.current = { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
  };

  const handlePointerLeave = () => { attractorRef.current = null; };

  const onCanvasPointerMoveCombined = (e) => {
    if (canvasDragRef.current.active) onCanvasPointerMove(e);
    else handlePointerMove(e);
  };

  const onCanvasPointerUpCombined = (e) => {
    attractorRef.current = null;
    onCanvasPointerUp(e);
  };

  const placements = useMemo(() => {
    if (activeAssets.length === 0) return [];
    return computePlacements({
      mode: layoutParams.mode,
      count: safeCount,
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
  }, [activeAssets.length, layoutParams, seed, canvasW, canvasH, caGrid, safeCount]);

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
      const accent = palette.swatches[(palette.swatches.indexOf(color) + 3) % palette.swatches.length] || palette.swatches[0];
      return { ...p, assetId: asset.id, color, accent };
    });

    if (!layoutParams.overlap) mapped = [...mapped].sort((a, b) => a.scale - b.scale);

    // Respect quality allowMirror
    if (layoutParams.mirror && caps.allowMirror) {
      const mirrored = mapped.map(item => ({ ...item, x: canvasW - item.x, _mirrored: true }));
      mapped = [...mapped, ...mirrored];
    }

    return mapped;
  }, [placements, activeAssets, palette.swatches, preset.paletteShift, seed, layoutParams.overlap, layoutParams.mirror, canvasW, caps.allowMirror]);

  const renderItems = useMemo(() => {
    if (layoutParams.mode === 'swarm') {
      let swarmItems = swarmSystem.getItems(activeAssets).map(item => {
        const accent = palette.swatches[(palette.swatches.indexOf(item.color) + 3) % palette.swatches.length] || palette.swatches[0];
        return { ...item, assetId: item.asset?.id, accent };
      });

      if (!layoutParams.overlap) swarmItems = [...swarmItems].sort((a, b) => a.scale - b.scale);

      if (layoutParams.mirror && caps.allowMirror) {
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
  }, [layoutParams.mode, items, activeAssets, layoutParams.overlap, layoutParams.mirror, tick, canvasW, palette.swatches, caps.allowMirror]);

  useEffect(() => {
    if (typeof dispatch === 'function') {
      dispatch({ type: 'SET_NODE_COUNT', payload: renderItems.length });
    }
  }, [renderItems.length, dispatch]);

  const half = ASSET_SIZE / 2;

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${activeAssets.length} assets`} collapsed={!open} onToggle={toggle}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">BG: {bgMode.toUpperCase()}</button>
          <button className="chip-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset View">RESET VIEW</button>
          <span className="meter-pill">{canvasW}×{canvasH}</span>
          {safeCount < layoutParams.count && (
            <span className="meter-pill" title="Count clamped by quality preset" style={{ color: '#ffaa00' }}>
              CLAMPED {safeCount}
            </span>
          )}
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
            <AssetSpriteSheet assets={assets} />
            <g transform={`translate(${canvasW / 2}, ${canvasH / 2}) scale(${zoom}) translate(${-canvasW / 2}, ${-canvasH / 2}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
              {renderItems.map((item, i) => {
                if (!item.assetId) return null;
                const sx = item._mirrored ? -item.scale : item.scale;
                return (
                  <g
                    key={i}
                    transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation}) scale(${sx}, ${item.scale}) translate(${-half}, ${-half})`}
                    opacity={item.alpha / 100}
                    style={{
                      ['--ink']: item.color,
                      ['--accent']: item.accent || item.color,
                      transition: motionSmoothing && layoutParams.mode !== 'swarm'
                        ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease'
                        : 'none',
                      transformOrigin: '0 0',
                    }}
                  >
                    <use href={`#kc-asset-${item.assetId}`} width={ASSET_SIZE} height={ASSET_SIZE} />
                  </g>
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
