// Layer — one composition's worth of rendered shapes. Extracted so the
// canvas can render N of these (one per store layer) without violating the
// Rules of Hooks: each <Layer key={layer.id}> is its own component
// instance, so calling useCanvasItems/useSwarmTick once inside it is legal
// no matter how many layers exist or how often they're added/removed.
import { useEffect } from 'react';
import { shouldRenderGloss } from '../../data/quality.js';
import { useSwarmTick } from '../../hooks/useSwarmTick.js';
import { useCanvasItems } from '../../hooks/useCanvasItems.js';

const ASSET_SIZE = 100;

export function Layer({
  layoutParams, seed, activeAssets, palette, caGrid, caps,
  safeCount, safeParticles, effectiveScale, effectiveAlpha,
  canvasW, canvasH, scaleMul, alphaBoost, motionSmoothing, quality,
  layerBlendMode, layerOpacity, onCount,
}) {
  const { items } = useCanvasItems({
    layoutParams, seed, activeAssets, palette, caGrid, safeCount,
    effectiveScale, effectiveAlpha, canvasW, canvasH, caps,
  });

  const { swarmItems } = useSwarmTick({
    mode: layoutParams.mode,
    safeParticles, activeAssets, palette, seed, layoutParams,
    canvasW, canvasH, scaleMul, alphaBoost, caps,
  });

  const renderItems = layoutParams.mode === 'swarm' ? swarmItems : items;
  const nodeCount = renderItems?.length || 0;
  const showGloss = shouldRenderGloss(quality, layoutParams.shading, nodeCount);
  const half = ASSET_SIZE / 2;

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
  );
}
