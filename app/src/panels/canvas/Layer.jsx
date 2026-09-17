// Layer — one composition's worth of rendered shapes.
import { useEffect } from 'react';
import { shouldRenderGloss } from '../../data/quality.js';
import { isLiveSwarmMode } from '../../data/layout-modes.js';
import { useSwarmTick } from '../../hooks/useSwarmTick.js';
import { useCanvasItems } from '../../hooks/useCanvasItems.js';
import { DEMO_LADDER_ID, ladderFrame, ladderSymbolId } from '../../data/bodies/demoLadder.js';
import { MOTH_U_GRADIENT_ID } from '../../components/AssetSpriteSheet.jsx';
import { materialHref } from '../../engine/materials.js';

const ASSET_SIZE = 100;

export function Layer({
  layoutParams, seed, activeAssets, palette, caGrid, caps,
  safeCount, safeParticles, effectiveScale, effectiveAlpha,
  canvasW, canvasH, scaleMul, alphaBoost, motionSmoothing, quality,
  layerBlendMode, layerOpacity, onCount, attractorRef, perfTier1,
}) {
  const { items } = useCanvasItems({
    layoutParams, seed, activeAssets, palette, caGrid, safeCount,
    effectiveScale, effectiveAlpha, canvasW, canvasH, caps,
  });

  const { swarmItems } = useSwarmTick({
    mode: layoutParams.mode,
    safeParticles, activeAssets, palette, seed, layoutParams,
    canvasW, canvasH, scaleMul, alphaBoost, caps, attractorRef,
  });

  const renderItems = isLiveSwarmMode(layoutParams.mode) ? swarmItems : items;
  const nodeCount = renderItems?.length || 0;
  const showGloss = shouldRenderGloss(quality, layoutParams.shading, nodeCount) && !perfTier1;
  const half = ASSET_SIZE / 2;
  const mat = materialHref(layoutParams.material);

  useEffect(() => { onCount?.(nodeCount); }, [nodeCount, onCount]);

  return (
    <g
      style={{
        mixBlendMode: layerBlendMode !== 'normal' ? layerBlendMode : undefined,
        opacity: layerOpacity,
        isolation: 'isolate',
        filter: layoutParams.hueRotate ? `hue-rotate(${layoutParams.hueRotate}deg)` : undefined,
      }}
    >
      {renderItems && renderItems.map((item, i) => {
        if (!item.assetId && item.role !== 'wing') return null;
        const sx = item._mirrored ? -item.scale : item.scale;
        const reactKey = item.key || `${item.assetId}-${i}${item._mirrored ? '-m' : ''}`;
        const isWing = item.role === 'wing';
        const ladderId = isWing ? (item.ladderId || DEMO_LADDER_ID) : null;
        const href = isWing
          ? `#${ladderSymbolId(ladderId, ladderFrame(item.u, ladderId))}`
          : `#kc-asset-${item.assetId}`;
        const ink = isWing && mat ? `url(${mat})` : item.color;
        // #109B — the SAME scalar u that picks the geometry frame also drives
        // the paint: a second <use> of the identical baked frame, tinted with
        // the demo sheet's u-gradient, at opacity = u. Mix of --ink/--accent
        // follows u; compounds never interpolate live.
        const u = Number.isFinite(item.u) ? Math.min(1, Math.max(0, item.u)) : 0;
        return (
          <g
            key={reactKey}
            transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation}) scale(${sx}, ${item.scale}) translate(${-half}, ${-half})`}
            opacity={item.alpha / 100}
            style={{
              ['--ink']: ink,
              ['--accent']: item.accent || item.color,
              transition: motionSmoothing && !isLiveSwarmMode(layoutParams.mode)
                ? 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease'
                : 'none',
              transformOrigin: '0 0',
              mixBlendMode: layoutParams.blendMode !== 'normal' ? layoutParams.blendMode : undefined,
            }}
          >
            <use href={href} width={ASSET_SIZE} height={ASSET_SIZE} />
            {isWing && (
              <use
                href={href}
                width={ASSET_SIZE}
                height={ASSET_SIZE}
                opacity={u}
                style={{ ['--ink']: `url(#${MOTH_U_GRADIENT_ID})` }}
                pointerEvents="none"
              />
            )}
            {showGloss && (
              <use
                href={href}
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
  );
}
