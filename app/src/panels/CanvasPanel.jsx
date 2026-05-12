// CanvasPanel (P01) — live SVG preview
// Placement logic is in engine/placement.js — this is render-only

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { computePlacements } from '../engine/placement.js';
import { colorForPlacement } from '../engine/color.js';
import { mkRng } from '../engine/prng.js';
import { getPreset } from '../data/presets.js';

export function CanvasPanel() {
  const { state, palette, assets, canvasRef, svgRef } = useApp();
  const { layoutParams, seed, enabled, evolveMode } = state;
  const { open, toggle } = useCollapse(true);

  // U14: Drag-resize canvas
  const [canvasHeight, setCanvasHeight] = useState(480);
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

  const preset = getPreset(layoutParams.composition);
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

  // Assign assets + colors to each placement
  const rng = mkRng(seed + 1);
  const items = placements.map((p, i) => {
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
        <div className={`canvas-wrap ${bgMode === 'transparent' ? 'checkerboard' : ''}`} ref={canvasRef} style={{ height: canvasHeight }}>
          <div className="canvas-bg" style={bgStyle} />
          <div className="canvas-rulers" />
          <svg className="canvas-svg" ref={svgRef} viewBox={`0 0 ${canvasW} ${canvasH}`} xmlns="http://www.w3.org/2000/svg"
            onWheel={onCanvasWheel}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          >
            <g transform={`translate(${canvasW/2}, ${canvasH/2}) scale(${zoom}) translate(${-canvasW/2}, ${-canvasH/2}) translate(${pan.x/zoom}, ${pan.y/zoom})`}>
              {items.map((item, i) => {
              const ink = item.color;
              const accent = palette.swatches[(palette.swatches.indexOf(ink) + 3) % palette.swatches.length] || palette.swatches[0];
              const svgStr = item.asset.svg.replace(/var\(--ink\)/g, ink).replace(/var\(--accent\)/g, accent);
              return (
                <g
                  key={i}
                  transform={`translate(${item.x}, ${item.y}) scale(${item.scale}) rotate(${item.rotation})`}
                  opacity={item.alpha / 100}
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
