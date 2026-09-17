// AssetSpriteSheet — registers every asset once as an SVG <symbol>
import { memo } from 'react';
import { MOTH_LADDERS } from '../data/bodies/demoLadder.js';

// #109B — one gradient in the demo sheet. Its --ink/--accent mix follows the
// same per-moth scalar u as the geometry ladder: Layer.jsx stacks a second
// <use> of the baked frame painted with this gradient at opacity = u.
// (Gradient stops resolve in the defs context, so the mix rides on the
// overlay's opacity rather than on stop-color vars — no live path lerp.)
export const MOTH_U_GRADIENT_ID = 'kc-moth-u-grad';

export const AssetSpriteSheet = memo(function AssetSpriteSheet({ assets }) {
  if (!assets || assets.length === 0) return null;

  return (
    <defs>
      {assets.map((asset) => (
        <symbol
          key={asset.id}
          id={`kc-asset-${asset.id}`}
          viewBox="0 0 100 100"
          overflow="visible"
        >
          <g dangerouslySetInnerHTML={{ __html: asset.svg }} />
        </symbol>
      ))}
      {MOTH_LADDERS.map((ladder) =>
        ladder.steps.map((svg, i) => (
          <symbol
            key={`${ladder.id}-${i}`}
            id={`kc-blend-${ladder.id}-${i}`}
            viewBox="0 0 100 100"
            overflow="visible"
          >
            <g dangerouslySetInnerHTML={{ __html: svg }} />
          </symbol>
        )),
      )}
      <linearGradient id={MOTH_U_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--ink)" />
        <stop offset="100%" stopColor="var(--accent)" />
      </linearGradient>
    </defs>
  );
});
