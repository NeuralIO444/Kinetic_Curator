// AssetSpriteSheet — registers every asset once as an SVG <symbol>
// Colors are applied at instance time via CSS variables --ink / --accent
// on the parent <g> that wraps each <use>.

import { memo } from 'react';

/**
 * Renders a <defs> block of <symbol> elements for the given assets.
 * Must live inside the same <svg> that contains the <use> instances
 * so that href="#kc-asset-..." resolves and export serialization includes them.
 */
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
          {/* Assets are authored with var(--ink) / var(--accent) */}
          <g dangerouslySetInnerHTML={{ __html: asset.svg }} />
        </symbol>
      ))}
    </defs>
  );
});
