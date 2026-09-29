/**
 * Showrunner asset cost (§6): a cheap static proxy for rasterization cost.
 *
 * Ingested assets carry a precomputed `costScore` (see ingest.js). Canon
 * assets shipped in data/assets.js were never scored, so this helper
 * computes lazily on first use. Either way the score is static per asset —
 * never recomputed per frame.
 */

import { assetCostScore } from './ingest.js';

export function getAssetCost(asset) {
  if (!asset) return 0;
  const base = Number.isFinite(asset.costScore) ? asset.costScore : assetCostScore(asset.svg || '');
  // Sub-animated assets bake one atlas cell per frame (see subAnim.mjs),
  // so their rasterization cost scales with the frame count.
  const frames = asset?.sub?.frames;
  if (Number.isFinite(frames) && frames > 1) return base * Math.round(frames);
  return base;
}
