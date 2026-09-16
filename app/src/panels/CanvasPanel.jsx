// CanvasPanel (P01) — live SVG preview + optional accumulation buffer (#28)
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { AssetSpriteSheet } from '../components/AssetSpriteSheet.jsx';
import { MaterialSheet } from '../components/MaterialSheet.jsx';
import { getQualityCaps, shouldRenderGloss } from '../data/quality.js';
import { clampCount } from '../engine/buildPlacements.js';
import { resolvePalette } from '../data/palettes.js';
import { getPreset } from '../data/presets.js';
import { useCanvasViewport, CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { useCanvasLife } from '../hooks/useCanvasLife.js';
import { useAccumulationBuffer } from '../hooks/useAccumulationBuffer.js';
import { Layer } from './canvas/Layer.jsx';

function resolveLayerSource(layer, state) {
  if (layer.id === state.activeLayerId) {
    return {
      seed: state.seed,
      paletteId: state.paletteId,
      paletteOverrides: state.paletteOverrides,
      layoutParams: state.layoutParams,
      caGrid: state.caGrid,
      enabledAssets: state.enabledAssets,
    };
  }
  return state.layerSnapshots[layer.id] || {
    seed: state.seed,
    paletteId: state.paletteId,
    paletteOverrides: null,
    layoutParams: state.layoutParams,
    caGrid: null,
    enabledAssets: state.enabledAssets,
  };
}

export function CanvasPanel() {
  const { palette: activePalette, assets, canvasRef, svgRef, accumRef, dispatch } = useApp();
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    seed: s.seed,
    paletteId: s.paletteId,
    paletteOverrides: s.paletteOverrides,
    enabledAssets: s.enabledAssets,
    weightOverrides: s.assetWeightOverrides || {},
    evolveMode: s.evolveMode,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    motionSmoothing: s.motionSmoothing,
    caGrid: s.caGrid,
    quality: s.quality,
    running: s.running,
    userPalettes: s.userPalettes,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    layerSnapshots: s.layerSnapshots,
  }));
  const {
    layoutParams, weightOverrides, evolveMode, beatPulse, audioBands,
    motionSmoothing, quality, running, layers, activeLayerId,
  } = state;

  const preset = getPreset(layoutParams.composition);
  const caps = getQualityCaps(quality || 'balanced');
  const accumOn = !!layoutParams.accumulation;
  const viewport = useCanvasViewport();
  const { zoom, pan } = viewport;
  const [bgMode, setBgMode] = useState('palette');
  const cycleBg = () => setBgMode(m => m === 'palette' ? 'transparent' : m === 'transparent' ? 'white' : 'palette');

  let bgStyle = { background: activePalette.bg };
  if (bgMode === 'white') bgStyle.background = '#ffffff';
  else if (bgMode === 'transparent') bgStyle.background = 'transparent';

  const visibleLayers = useMemo(() => layers.filter(l => l.visible), [layers]);
  const resolvedLayers = useMemo(() => visibleLayers.map(layer => {
    const src = resolveLayerSource(layer, state);
    const palette = resolvePalette(src.paletteId, src.paletteOverrides, state.userPalettes);
    const activeAssets = assets
      .filter(a => src.enabledAssets[a.id])
      .map(a => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));
    const safeCount = clampCount(src.layoutParams.count, src.layoutParams.mirror, caps);
    const safeParticles = Math.min(src.layoutParams.particleCount || 150, caps.maxParticles);
    return { layer, ...src, palette, activeAssets, safeCount, safeParticles };
  }), [visibleLayers, state, assets, weightOverrides, caps]);

  const spriteAssets = useMemo(() => {
    const seen = new Map();
    for (const rl of resolvedLayers) for (const a of rl.activeAssets) seen.set(a.id, a);
    return [...seen.values()];
  }, [resolvedLayers]);

  const life = useCanvasLife({ running, layoutParams, beatPulse, audioBands });
  const { scaleMul, alphaBoost, breathScale, breathRot, glow, effectiveScale, effectiveAlpha } = life;
  const [layerCounts, setLayerCounts] = useState({});
  const reportCount = useCallback((layerId, count) => {
    setLayerCounts(prev => (prev[layerId] === count ? prev : { ...prev, [layerId]: count }));
  }, []);
  const totalNodeCount = resolvedLayers.reduce((sum, rl) => sum + (layerCounts[rl.layer.id] || 0), 0);
  const activeCount = layerCounts[activeLayerId] || 0;
  const activeSafeCount = resolvedLayers.find(rl => rl.layer.id === activeLayerId)?.safeCount ?? 0;
  const showGloss = shouldRenderGloss(quality, layoutParams.shading, activeCount);
  const { clear: clearAccum } = useAccumulationBuffer({
    svgRef, accumRef, enabled: accumOn,
    fade: layoutParams.accumulationFade ?? 0.88,
    background: activePalette.bg, running,
  });

  useEffect(() => {
    if (typeof dispatch === 'function') dispatch({ type: 'SET_NODE_COUNT', payload: totalNodeCount });
  }, [totalNodeCount, dispatch]);

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${spriteAssets.length} assets · ${layers.length} layer${layers.length > 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">BG: {bgMode.toUpperCase()}</button>
          <button className="chip-btn" onClick={viewport.resetView} title="Reset View">RESET VIEW</button>
          {accumOn && (
            <button className="chip-btn" onClick={clearAccum} title="Clear accumulation buffer" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>CLEAR ACCUM</button>
          )}
          <span className="meter-pill">{CANVAS_W}×{CANVAS_H}</span>
          {accumOn && <span className="meter-pill" title="Accumulation buffer active" style={{ color: 'var(--accent)' }}>ACCUM</span>}
          {activeSafeCount < layoutParams.count && (
            <span className="meter-pill" title="Count clamped by quality preset" style={{ color: '#ffaa00' }}>CLAMPED {activeSafeCount}</span>
          )}
          {layoutParams.shading === 'gloss' && !showGloss && (
            <span className="meter-pill" title="Gloss LOD: skipped under PERF or high node count" style={{ color: '#ffaa00' }}>GLOSS OFF</span>
          )}
        </div>
      </PanelHeader>
      <div className={`canvas-wrap ${bgMode === 'transparent' ? 'checkerboard' : ''}`} ref={canvasRef}
        style={{ boxShadow: glow > 0.05 ? `inset 0 0 ${20 + glow * 40}px rgba(0, 217, 255, ${0.08 + glow * 0.25})` : undefined, transition: 'box-shadow 0.08s linear', position: 'relative' }}>
        <div className="canvas-bg" style={bgStyle} />
        <div className="canvas-rulers" />
        <svg className="canvas-svg" ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} xmlns="http://www.w3.org/2000/svg"
          style={accumOn ? { opacity: 0, pointerEvents: 'none' } : undefined}
          onWheel={viewport.onWheel} onPointerDown={viewport.onPointerDown} onPointerMove={viewport.onPointerMoveCombined}
          onPointerUp={viewport.onPointerUpCombined} onPointerCancel={viewport.onPointerUpCombined} onPointerLeave={viewport.clearAttractor}>
          <AssetSpriteSheet assets={spriteAssets} />
          <MaterialSheet />
          <defs>
            <radialGradient id="kc-gloss-grad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) scale(${zoom}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
            <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) rotate(${breathRot}) scale(${breathScale}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2})`}
              style={{ transition: 'transform 0.06s linear', isolation: 'isolate' }}>
              {resolvedLayers.map(rl => (
                <Layer key={rl.layer.id} layoutParams={rl.layoutParams} seed={rl.seed} activeAssets={rl.activeAssets}
                  palette={rl.palette} caGrid={rl.caGrid} caps={caps} safeCount={rl.safeCount} safeParticles={rl.safeParticles}
                  effectiveScale={effectiveScale} effectiveAlpha={effectiveAlpha} canvasW={CANVAS_W} canvasH={CANVAS_H}
                  scaleMul={scaleMul} alphaBoost={alphaBoost} motionSmoothing={motionSmoothing} quality={quality}
                  layerBlendMode={rl.layer.layerBlendMode} layerOpacity={rl.layer.layerOpacity}
                  attractorRef={viewport.attractorRef} onCount={(count) => reportCount(rl.layer.id, count)} />
              ))}
            </g>
          </g>
        </svg>
        {accumOn && (
          <canvas ref={accumRef} className="canvas-accum" width={CANVAS_W} height={CANVAS_H}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'auto', zIndex: 2 }}
            onWheel={viewport.onWheel} onPointerDown={viewport.onPointerDown} onPointerMove={viewport.onPointerMoveCombined}
            onPointerUp={viewport.onPointerUpCombined} onPointerCancel={viewport.onPointerUpCombined} onPointerLeave={viewport.clearAttractor} />
        )}
        <span className="canvas-corner tl">0,0</span>
        <span className="canvas-corner tr">{layoutParams.mode}{accumOn ? ' · ACCUM' : ''}</span>
        <span className="canvas-corner bl">{preset.name}</span>
        <span className="canvas-corner br">{CANVAS_W}×{CANVAS_H}</span>
      </div>
    </div>
  );
}
