// CanvasPanel (P01) — live SVG preview
// Refactored: viewport, life, swarm, items extracted into hooks.

import { useMemo, useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { AssetSpriteSheet } from '../components/AssetSpriteSheet.jsx';
import { getQualityCaps } from '../data/quality.js';
import { useCanvasViewport, CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { useCanvasLife } from '../hooks/useCanvasLife.js';
import { useSwarmTick } from '../hooks/useSwarmTick.js';
import { useCanvasItems } from '../hooks/useCanvasItems.js';

const ASSET_SIZE = 100;

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
    running: s.running,
  }));
  const {
    layoutParams, seed, enabled, evolveMode, beatPulse, audioBands,
    motionSmoothing, caGrid, quality, running,
  } = state;

  const caps = getQualityCaps(quality || 'balanced');

  const viewport = useCanvasViewport();
  const { zoom, pan } = viewport;

  const [bgMode, setBgMode] = useState('palette');
  const cycleBg = () => setBgMode(m => m === 'palette' ? 'transparent' : m === 'transparent' ? 'white' : 'palette');

  let bgStyle = { background: palette.bg };
  if (bgMode === 'white') bgStyle.background = '#ffffff';
  else if (bgMode === 'transparent') bgStyle.background = 'transparent';

  const activeAssets = useMemo(
    () => assets.filter(a => enabled[a.id]),
    [assets, enabled],
  );

  const maxForMirror = layoutParams.mirror ? caps.maxCountMirrored : caps.maxCount;
  const safeCount = Math.min(Math.max(1, layoutParams.count), maxForMirror);
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

  useEffect(() => {
    if (typeof dispatch === 'function' && renderItems) {
      dispatch({ type: 'SET_NODE_COUNT', payload: renderItems.length });
    }
    // Only the count matters here; the array identity changes every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderItems?.length, dispatch]);

  const half = ASSET_SIZE / 2;

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · ${activeAssets.length} assets`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="chip-btn" onClick={cycleBg} title="Toggle Background">BG: {bgMode.toUpperCase()}</button>
          <button className="chip-btn" onClick={viewport.resetView} title="Reset View">RESET VIEW</button>
          <span className="meter-pill">{CANVAS_W}×{CANVAS_H}</span>
          {safeCount < layoutParams.count && (
            <span className="meter-pill" title="Count clamped by quality preset" style={{ color: '#ffaa00' }}>
              CLAMPED {safeCount}
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
          }}
        >
          <div className="canvas-bg" style={bgStyle} />
          <div className="canvas-rulers" />
          <svg className="canvas-svg" ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} xmlns="http://www.w3.org/2000/svg"
            onWheel={viewport.onWheel}
            onPointerDown={viewport.onPointerDown}
            onPointerMove={viewport.onPointerMoveCombined}
            onPointerUp={viewport.onPointerUpCombined}
            onPointerCancel={viewport.onPointerUpCombined}
            onPointerLeave={viewport.clearAttractor}
          >
            <AssetSpriteSheet assets={assets} />
            <g transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) scale(${zoom}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
              <g
                transform={`translate(${CANVAS_W / 2}, ${CANVAS_H / 2}) rotate(${breathRot}) scale(${breathScale}) translate(${-CANVAS_W / 2}, ${-CANVAS_H / 2})`}
                style={{ transition: 'transform 0.06s linear', isolation: 'isolate' }}
              >
                {renderItems && renderItems.map((item, i) => {
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
                        mixBlendMode: layoutParams.blendMode !== 'normal' ? layoutParams.blendMode : undefined,
                      }}
                    >
                      <use href={`#kc-asset-${item.assetId}`} width={ASSET_SIZE} height={ASSET_SIZE} />
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
          <span className="canvas-corner tl">0,0</span>
          <span className="canvas-corner tr">{layoutParams.mode}</span>
          <span className="canvas-corner bl">{preset.name}</span>
          <span className="canvas-corner br">{CANVAS_W}×{CANVAS_H}</span>
      </div>
    </div>
  );
}
