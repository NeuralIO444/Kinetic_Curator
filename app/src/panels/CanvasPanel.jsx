// CanvasPanel (P01) — live SVG preview + optional accumulation buffer (#28)

import { useMemo, useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { AssetSpriteSheet } from '../components/AssetSpriteSheet.jsx';
import { getQualityCaps, shouldRenderGloss } from '../data/quality.js';
import { clampCount } from '../engine/buildPlacements.js';
import { useCanvasViewport, CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { useCanvasLife } from '../hooks/useCanvasLife.js';
import { useSwarmTick } from '../hooks/useSwarmTick.js';
import { useCanvasItems } from '../hooks/useCanvasItems.js';
import { useAccumulationBuffer } from '../hooks/useAccumulationBuffer.js';

const ASSET_SIZE = 100;

export function CanvasPanel() {
  const { palette, assets, canvasRef, svgRef, accumRef, dispatch } = useApp();
  const { state } = useApp(s => ({
    layoutParams: s.layoutParams,
    seed: s.seed,
    enabled: s.enabledAssets,
    weightOverrides: s.assetWeightOverrides || {},
    evolveMode: s.evolveMode,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    motionSmoothing: s.motionSmoothing,
    caGrid: s.caGrid,
    quality: s.quality,
    running: s.running,
  }));
  const {
    layoutParams, seed, enabled, weightOverrides, evolveMode, beatPulse, audioBands,
    motionSmoothing, caGrid, quality, running,
  } = state;

  const caps = getQualityCaps(quality || 'balanced');
  const accumOn = !!layoutParams.accumulation;

  const viewport = useCanvasViewport();
  const { zoom, pan } = viewport;

  const [bgMode, setBgMode] = useState('palette');
  const cycleBg = () => setBgMode(m => m === 'palette' ? 'transparent' : m === 'transparent' ? 'white' : 'palette');

  let bgStyle = { background: palette.bg };
  if (bgMode === 'white') bgStyle.background = '#ffffff';
  else if (bgMode === 'transparent') bgStyle.background = 'transparent';

  const activeAssets = useMemo(
    () => assets
      .filter(a => enabled[a.id])
      .map(a => (weightOverrides[a.id] ? { ...a, weight: weightOverrides[a.id] } : a)),
    [assets, enabled, weightOverrides],
  );

  const safeCount = clampCount(layoutParams.count, layoutParams.mirror, caps);
  const safeParticles = Math.min(layoutParams.particleCount || 150, caps.maxParticles);

  const life = useCanvasLife({ running, layoutParams, beatPulse, audioBands });
  const { scaleMul, alphaBoost, breathScale, breathRot, glow, effectiveScale, effectiveAlpha } = life;

  const { preset, items } = useCanvasItems({
    layoutParams, seed, activeAssets, palette, caGrid, safeCount,
    effectiveScale, effectiveAlpha, canvasW: CANVAS_W, canvasH: CANVAS_H, caps,
  });

  const { swarmItems } = useSwarmTick({
    mode: layoutParams.mode,
    safeParticles, activeAssets, palette, seed, layoutParams,
    canvasW: CANVAS_W, canvasH: CANVAS_H, scaleMul, alphaBoost, caps,
  });

  const renderItems = layoutParams.mode === 'swarm' ? swarmItems : items;
  const nodeCount = renderItems?.length || 0;
  const showGloss = shouldRenderGloss(quality, layoutParams.shading, nodeCount);

  const { clear: clearAccum } = useAccumulationBuffer({
    svgRef,
    accumRef,
    enabled: accumOn,
    fade: layoutParams.accumulationFade ?? 0.88,
    background: palette.bg,
    running,
  });

  useEffect(() => {
    if (typeof dispatch === 'function' && renderItems) {
      dispatch({ type: 'SET_NODE_COUNT', payload: renderItems.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderItems?.length, dispatch]);

  const half = ASSET_SIZE / 2;

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${activeAssets.length} assets`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">BG: {bgMode.toUpperCase()}</button>
          <button className="chip-btn" onClick={viewport.resetView} title="Reset View">RESET VIEW</button>
          {accumOn && (
            <button className="chip-btn" onClick={clearAccum} title="Clear accumulation buffer" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
              CLEAR ACCUM
            </button>
          )}
          <span className="meter-pill">{CANVAS_W}×{CANVAS_H}</span>
          {accumOn && (
            <span className="meter-pill" title="Accumulation buffer active" style={{ color: 'var(--accent)' }}>ACCUM</span>
          )}
          {safeCount < layoutParams.count && (
            <span className="meter-pill" title="Count clamped by quality preset" style={{ color: '#ffaa00' }}>
              CLAMPED {safeCount}
            </span>
          )}
          {layoutParams.shading === 'gloss' && !showGloss && (
            <span className="meter-pill" title="Gloss LOD: skipped under PERF or high node count" style={{ color: '#ffaa00' }}>
              GLOSS OFF
            </span>
          )}
        </div>
      </PanelHeader>
      <div
          className={`canvas-wrap ${bgMode === 'transparent' ? 'checkerboard' : ''}`}
          ref={canvasRef}
          style={{
            boxShadow: glow > 0.05
              ? `inset 0 0 ${20 + glow * 40}px rgba(0, 217, 255, ${0.08 + glow * 0.25})`
              : undefined,
            transition: 'box-shadow 0.08s linear',
            position: 'relative',
          }}
        >
          <div className="canvas-bg" style={bgStyle} />
          <div className="canvas-rulers" />
          <svg
            className="canvas-svg"
            ref={svgRef}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            xmlns="http://www.w3.org/2000/svg"
            style={{
              ...(layoutParams.hueRotate ? { filter: `hue-rotate(${layoutParams.hueRotate}deg)` } : {}),
              // When ACCUM is on, hide SVG visually but keep it in DOM for composite + export source
              ...(accumOn ? { opacity: 0, pointerEvents: 'none' } : {}),
            }}
            onWheel={viewport.onWheel}
            onPointerDown={viewport.onPointerDown}
            onPointerMove={viewport.onPointerMoveCombined}
            onPointerUp={viewport.onPointerUpCombined}
            onPointerCancel={viewport.onPointerUpCombined}
            onPointerLeave={viewport.clearAttractor}
          >
            <AssetSpriteSheet assets={activeAssets} />
            <defs>
              <radialGradient id="kc-gloss-grad" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#fff" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) scale(${zoom}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
              <g
                transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) rotate(${breathRot}) scale(${breathScale}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2})`}
                style={{ transition: 'transform 0.06s linear', isolation: 'isolate' }}
              >
                {renderItems && renderItems.map((item, i) => {
                  if (!item.assetId) return null;
                  const sx = item._mirrored ? -item.scale : item.scale;
                  const reactKey = item.key || `${item.assetId}-${i}${item._mirrored ? '-m' : ''}`;
                  return (
                    <g
                      key={reactKey}
                      transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation}) scale(${sx}, ${item.scale}) translate(${-half}, ${-half})`}
                      opacity={item.alpha / 100}
                      style={{
                        ['--ink']: item.color,
                        ['--accent']: item.accent || item.color,
                        transition: motionSmoothing && layoutParams.mode !== 'swarm'
                          ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease'
                          : 'none',
                        transformOrigin: '0 0',
                        mixBlendMode: layoutParams.blendMode !== 'normal' ? layoutParams.blendMode : undefined,
                      }}
                    >
                      <use href={`#kc-asset-${item.assetId}`} width={ASSET_SIZE} height={ASSET_SIZE} />
                      {showGloss && (
                        <use
                          href={`#kc-asset-${item.assetId}`}
                          width={ASSET_SIZE}
                          height={ASSET_SIZE}
                          style={{ ['--ink']: 'url(#kc-gloss-grad)', ['--accent']: 'url(#kc-gloss-grad)', mixBlendMode: 'soft-light' }}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
          {accumOn && (
            <canvas
              ref={accumRef}
              className="canvas-accum"
              width={CANVAS_W}
              height={CANVAS_H}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                pointerEvents: 'auto',
                zIndex: 2,
              }}
              onWheel={viewport.onWheel}
              onPointerDown={viewport.onPointerDown}
              onPointerMove={viewport.onPointerMoveCombined}
              onPointerUp={viewport.onPointerUpCombined}
              onPointerCancel={viewport.onPointerUpCombined}
              onPointerLeave={viewport.clearAttractor}
            />
          )}
          <span className="canvas-corner tl">0,0</span>
          <span className="canvas-corner tr">{layoutParams.mode}{accumOn ? ' · ACCUM' : ''}</span>
          <span className="canvas-corner bl">{preset.name}</span>
          <span className="canvas-corner br">{CANVAS_W}×{CANVAS_H}</span>
      </div>
    </div>
  );
}
