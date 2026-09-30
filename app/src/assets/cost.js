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
  if (Number.isFinite(asset.costScore)) return asset.costScore;
  return assetCostScore(asset.svg || '');
}
