// AssetSpriteSheet — registers every asset once as an SVG <symbol>
import { memo } from 'react';
import { DEMO_LADDER_ID, DEMO_LADDER_STEPS } from '../data/bodies/demoLadder.js';

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
      {DEMO_LADDER_STEPS.map((svg, i) => (
        <symbol
          key={`${DEMO_LADDER_ID}-${i}`}
          id={`kc-blend-${DEMO_LADDER_ID}-${i}`}
          viewBox="0 0 100 100"
          overflow="visible"
        >
          <g dangerouslySetInnerHTML={{ __html: svg }} />
        </symbol>
      ))}
    </defs>
  );
});
