// CanvasPanel (P01) — live SVG preview + optional accumulation buffer (#28)
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { AssetSpriteSheet } from '../components/AssetSpriteSheet.jsx';
import { MaterialSheet } from '../components/MaterialSheet.jsx';
import { getQualityCaps, shouldRenderGloss } from '../data/quality.js';
import { clampCount } from '../engine/buildPlacements.js';
import { getAssetCost } from '../assets/cost.js';
import { resolvePalette } from '../data/palettes.js';
import { getPreset } from '../data/presets.js';
import { useCanvasViewport, CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { useCanvasLife } from '../hooks/useCanvasLife.js';
import { useAccumulationBuffer } from '../hooks/useAccumulationBuffer.js';
import { Layer } from './canvas/Layer.jsx';
import { isFxLayer, fxFilterId, compileFxPrimitives } from '../fx/fxFilters.js';
import { FxFilterDefs } from '../fx/FxFilterDefs.jsx';

/**
 * Fold the layer stack bottom-up for rendering: content layers accumulate;
 * each applied FX layer wraps the accumulator so far in
 * <g filter="url(#fx-…)">, then accumulation continues above it.
 * Non-applied FX layers (shed by the governor or over budget) pass their
 * accumulated content through unwrapped.
 */
function buildLayerStack(resolvedLayers, fxActiveIds, renderContent) {
  const out = [];
  let acc = [];
  for (const rl of resolvedLayers) {
    if (rl.isFx) {
      if (acc.length > 0 && fxActiveIds.has(rl.layer.id)) {
        out.push(
          <g key={`fxwrap-${rl.layer.id}`} filter={`url(#${fxFilterId(rl.layer.id)})`} opacity={rl.layer.layerOpacity}>
            {acc}
          </g>,
        );
      } else {
        out.push(...acc);
      }
      acc = [];
    } else {
      acc.push(renderContent(rl));
    }
  }
  out.push(...acc);
  return out;
}

function resolveLayerSource(layer, state) {
  if (layer.id === state.activeLayerId) {
    // #107 §2 / §5: ambient life drift and the performance governor's last-
    // resort density cut both live in ephemeral overlay slots, not in
    // layoutParams — merge them in for render only, active layer only
    // (matches where each used to land before being moved out of document
    // state).
    const layoutParams = (state.driftOverlay || state.perfClampOverride)
      ? { ...state.layoutParams, ...state.driftOverlay, ...state.perfClampOverride }
      : state.layoutParams;
    return {
      seed: state.seed,
      paletteId: state.paletteId,
      paletteOverrides: state.paletteOverrides,
      layoutParams,
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
    driftOverlay: s.driftOverlay,
    perfClampOverride: s.perfClampOverride,
    slowRender: s.slowRender,
    perfTier1: s.perfTier1,
    assetThin: s.assetThin,
  }));
  const {
    layoutParams, weightOverrides, evolveMode, beatPulse, audioBands,
    motionSmoothing, quality, running, layers, activeLayerId, slowRender,
    perfTier1, assetThin,
    // resolveLayerSource's full read set — kept as explicit memo deps below
    // so beatPulse/audioBands frames don't redo layer resolution.
    seed, paletteId, paletteOverrides, caGrid, enabledAssets, layerSnapshots,
    userPalettes, driftOverlay, perfClampOverride,
  } = state;

  // Narrow, stable-identity view of exactly what layer resolution reads.
  // The old code passed the whole `state` object here, so every beatPulse /
  // audioBands tick (60fps during audio) re-ran palette resolution, asset
  // filtering and cost sorting for every layer. If resolveLayerSource ever
  // reads a new state field, add it here AND to the memo deps below.
  const layerSrcState = useMemo(() => ({
    activeLayerId, driftOverlay, perfClampOverride, layoutParams,
    seed, paletteId, paletteOverrides, caGrid, enabledAssets, layerSnapshots,
  }), [
    activeLayerId, driftOverlay, perfClampOverride, layoutParams,
    seed, paletteId, paletteOverrides, caGrid, enabledAssets, layerSnapshots,
  ]);

  const preset = getPreset(layoutParams.composition);
  const caps = getQualityCaps(quality || 'balanced');
  // #107 §4 tier 1: ACCUM is a render-only buffer (see useAccumulationBuffer),
  // so shedding it under sustained low FPS is another render-only override —
  // same treatment as driftOverlay/perfClampOverride, just gated here instead
  // of merged into layoutParams.
  const accumOn = !!layoutParams.accumulation && !perfTier1;
  const viewport = useCanvasViewport();
  const { zoom, pan } = viewport;
  const [bgMode, setBgMode] = useState('palette');
  const cycleBg = () => setBgMode(m => m === 'palette' ? 'transparent' : m === 'transparent' ? 'white' : 'palette');

  let bgStyle = { background: activePalette.bg };
  if (bgMode === 'white') bgStyle.background = '#ffffff';
  else if (bgMode === 'transparent') bgStyle.background = 'transparent';

  const visibleLayers = useMemo(() => layers.filter(l => l.visible), [layers]);
  const resolvedLayers = useMemo(() => visibleLayers.map(layer => {
    // FX layers hold no content — they wrap the accumulated stack below in
    // a filter group. Skip the whole content-resolution path for them.
    if (isFxLayer(layer)) return { layer, isFx: true, activeAssets: [] };
    const src = resolveLayerSource(layer, layerSrcState);
    // #107 §4 tier 1: unlike driftOverlay/perfClampOverride (active layer
    // only), mirror sheds on EVERY visible layer — an inactive snapshot can
    // be the one costing the frame.
    const layoutParams = (perfTier1 && src.layoutParams.mirror)
      ? { ...src.layoutParams, mirror: false }
      : src.layoutParams;
    const palette = resolvePalette(src.paletteId, src.paletteOverrides, userPalettes);
    let activeAssets = assets
      .filter(a => src.enabledAssets[a.id])
      .map(a => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a));
    // Showrunner cut 5: cost-aware thinning. When the governor engages it,
    // the most expensive assets drop first (highest costScore), instead of
    // thinning uniformly — the visual loss per frame saved is minimized.
    // Render-only: enabledAssets in the project are untouched.
    if (assetThin && activeAssets.length > 1) {
      const ranked = [...activeAssets].sort((a, b) => getAssetCost(b) - getAssetCost(a));
      const drop = Math.max(1, Math.ceil(ranked.length * 0.25));
      const dropped = new Set(ranked.slice(0, drop).map(a => a.id));
      activeAssets = activeAssets.filter(a => !dropped.has(a.id));
    }
    const safeCount = clampCount(layoutParams.count, layoutParams.mirror, caps);
    const safeParticles = Math.min(layoutParams.particleCount || 150, caps.maxParticles);
    return { layer, ...src, layoutParams, palette, activeAssets, safeCount, safeParticles };
  }), [visibleLayers, layerSrcState, userPalettes, assets, weightOverrides, caps, perfTier1, assetThin]);

  // Cheap-first sprite order (§6): the sprite sheet renders its cache in
  // cost order, so if anything downstream ever has to drop a sprite, the
  // expensive ones are already at the tail.
  const spriteAssets = useMemo(() => {
    const seen = new Map();
    for (const rl of resolvedLayers) for (const a of rl.activeAssets) seen.set(a.id, a);
    return [...seen.values()].sort((a, b) => getAssetCost(a) - getAssetCost(b));
  }, [resolvedLayers]);

  // -- FX layer stack ------------------------------------------------------
  // Fold bottom-up: content layers accumulate; each applied FX layer wraps
  // the accumulator in <g filter="url(#fx-…)">, then stacking continues.
  // Which FX layers apply: ALL of them. #192 retired both the Showrunner
  // FX cut ladder and the per-tier maxFxLayers budgets — FX layers are never
  // culled in normal operation (the silent-cull trap: a layer shown in the
  // UI while its effect was shed). Layers with an empty effect stack compile
  // to nothing and pass content through unwrapped. Hidden FX layers never
  // reach here (visibleLayers filtered them) — no filter cost, per spec.
  const fxCtx = useMemo(() => ({
    octaves: caps.turbulenceOctaves,
    primBudget: caps.maxFilterPrimitives,
    dxMod: (typeof beatPulse === 'number' ? beatPulse : 0) * 3,
  }), [caps, beatPulse]);

  const fxActive = useMemo(() => {
    const out = [];
    for (const rl of resolvedLayers) {
      if (!rl.isFx) continue;
      if (compileFxPrimitives(rl.layer.effects, fxCtx).length > 0) {
        out.push(rl.layer);
      }
    }
    return out;
  }, [resolvedLayers, fxCtx]);
  const fxActiveIds = useMemo(() => new Set(fxActive.map((l) => l.id)), [fxActive]);

  const life = useCanvasLife({ running, layoutParams, beatPulse, audioBands });
  const { scaleMul, alphaBoost, breathScale, breathRot, glow, effectiveScale, effectiveAlpha } = life;
  const [layerCounts, setLayerCounts] = useState({});
  const reportCount = useCallback((layerId, count) => {
    setLayerCounts(prev => (prev[layerId] === count ? prev : { ...prev, [layerId]: count }));
  }, []);
  const totalNodeCount = resolvedLayers.reduce((sum, rl) => sum + (layerCounts[rl.layer.id] || 0), 0);
  const activeCount = layerCounts[activeLayerId] || 0;
  const activeSafeCount = resolvedLayers.find(rl => rl.layer.id === activeLayerId)?.safeCount ?? 0;
  const showGloss = shouldRenderGloss(quality, layoutParams.shading, activeCount) && !perfTier1;
  const { clear: clearAccum } = useAccumulationBuffer({
    svgRef, accumRef, enabled: accumOn,
    fade: layoutParams.accumulationFade ?? 0.88,
    background: activePalette.bg,
    // #107 §4: pause the per-frame serialize/composite work under
    // slowRender, not `enabled` — toggling `enabled` re-clears the buffer
    // (see useAccumulationBuffer), which would wipe the trail history on
    // every perf dip. `running` already just skips the frame's work.
    running: running && !slowRender,
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
            <button className="chip-btn" onClick={clearAccum} title="Wipe pixel buffer only. Live SVG stays hidden while ACCUM is on." style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>CLEAR ACCUM</button>
          )}
          <span className="meter-pill">{CANVAS_W}×{CANVAS_H}</span>
          {accumOn && <span className="meter-pill" title="Showing pixel buffer. Live SVG is hidden. WEBM does not record this buffer — use studio --accum for trail stills." style={{ color: 'var(--accent)' }}>ACCUM</span>}
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
            <FxFilterDefs layers={fxActive} ctx={fxCtx} />
          </defs>
          <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) scale(${zoom}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
            <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) rotate(${breathRot}) scale(${breathScale}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2})`}
              style={{ transition: 'transform 0.06s linear', isolation: 'isolate' }}>
              {buildLayerStack(resolvedLayers, fxActiveIds, (rl) => (
                // #107 §3: one bad layer (a poisoned snapshot, a missing asset)
                // must not take the other layers or the rest of the Shell down
                // with it. `fallback={() => null}` because a DOM error card
                // is not valid markup inside <svg> — componentDidCatch still
                // logs it, and the layer just stops contributing shapes.
                <ErrorBoundary key={rl.layer.id} label={`layer:${rl.layer.id}`} fallback={() => null}>
                  <Layer layoutParams={rl.layoutParams} seed={rl.seed} activeAssets={rl.activeAssets}
                    palette={rl.palette} caGrid={rl.caGrid} caps={caps} safeCount={rl.safeCount} safeParticles={rl.safeParticles}
                    effectiveScale={effectiveScale} effectiveAlpha={effectiveAlpha} canvasW={CANVAS_W} canvasH={CANVAS_H}
                    scaleMul={scaleMul} alphaBoost={alphaBoost} motionSmoothing={motionSmoothing} quality={quality}
                    perfTier1={perfTier1}
                    layerBlendMode={rl.layer.layerBlendMode} layerOpacity={rl.layer.layerOpacity}
                    attractorRef={viewport.attractorRef} onCount={(count) => reportCount(rl.layer.id, count)} />
                </ErrorBoundary>
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
