import { memo } from 'react';

/** Pigments only. Lives next to AssetSpriteSheet inside the stage <svg>. */
export const MaterialSheet = memo(function MaterialSheet() {
  return (
    <defs>
      <radialGradient id="kc-mat-plate" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
        <stop offset="55%" stopColor="var(--ink)" stopOpacity="0.85" />
        <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.2" />
      </radialGradient>
      <linearGradient id="kc-mat-wash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--accent)" />
        <stop offset="100%" stopColor="var(--ink)" />
      </linearGradient>
      <pattern id="kc-mat-stipple" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.8" fill="var(--ink)" />
        <circle cx="4.5" cy="4.2" r="0.6" fill="var(--accent)" />
      </pattern>
    </defs>
  );
});
