// Pure placement + asset + color + mirror pipeline.
// Shared by live preview (useCanvasItems) and renderFinal (#24 / #32).
// Kernel K0: asset + color channels index-stable (#58).
//
// Kernel v2 (#108) step 4: optional staged-eval cache. Pass `cache` (an
// object the CALLER owns and keeps across calls — useCanvasItems holds one
// per Layer in a ref) and stages A/B (geometry + displacement), D (asset
// bind) and E (colour) are skipped whenever their inputs are unchanged,
// leaving only stage C (scale/rotate/alpha arithmetic) and the item build.
//
// This matters because liveLoop ticks lifeT every rAF frame, so
// effectiveScale/effectiveAlpha are fresh arrays on every frame while the
// geometry params sit still — the full pipeline was re-deriving identical
// positions, asset picks and colours 60x a second.
//
// Omit `cache` and nothing is retained: the function computes everything,
// exactly as before. Selfchecks and studio/render.mjs take that path.

import { computeGeometrySoA, applyAttributes, geometrySignature } from './placement.js';
import { assignColor, resolveStrategy } from './kernel/color/index.js';
import { mkRng } from './prng.js';
import { getPreset } from '../data/presets.js';
import { getQualityCaps } from '../data/quality.js';
import {
  pickWeightedIndexStable,
} from './kernel/rng.js';

/** Authored per-asset weight → selection frequency. */
export const SELECTION_WEIGHT = { heavy: 4, medium: 2, light: 1 };

/**
 * Seeded weighted pick from an asset list (sequential stream — tests / legacy).
 * Prefer pickWeightedIndexStable for pipeline.
 */
export function pickWeighted(assets, weights, totalWeight, rng) {
  let r = rng() * totalWeight;
  for (let i = 0; i < assets.length; i++) {
    r -= weights[i];
    if (r <= 0) return assets[i];
  }
  return assets[assets.length - 1];
}

/**
 * Element-wise signature compare. Uses Object.is, so NaN matches NaN and
 * objects (caGrid, activeAssets, palette) compare by identity — which is
 * what we want: the store replaces those references on edit rather than
 * mutating them, and a deep compare per frame would cost more than the
 * recompute it saves.
 *
 * ponytail: identity compare means a caller that mutates activeAssets or
 * palette in place gets a stale cache. Upgrade path is a version counter on
 * those slices, not a deep compare.
 */
function sameSignature(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * #269 — absolute placement ceiling, defense-in-depth. clampCount trusted the
 * caller's count via caps alone, so a hostile/erroneous count of 1e7
 * allocated until the V8 heap died — uncatchable. The richest tier (FINAL)
 * tops out at maxCount 800 and mirror doubles items to ~1600, so 4096 leaves
 * real headroom while no raw caller can OOM the process. Clamp, don't throw;
 * valid inputs are unaffected.
 */
export const MAX_ABSOLUTE_COUNT = 4096;

export function clampCount(count, mirror, caps) {
  const maxForMirror = mirror
    ? (caps.maxCountMirrored ?? caps.maxCount ?? 420)
    : (caps.maxCount ?? 420);
  return Math.min(MAX_ABSOLUTE_COUNT, Math.max(1, Number(count) || 1), maxForMirror);
}

/**
 * Build fully attributed items for the canvas (or offline render).
 */
export function buildPlacements({
  layoutParams,
  seed,
  seedOffsets = null,
  activeAssets,
  palette,
  caGrid = null,
  caps: capsIn,
  canvasW,
  canvasH,
  scale: scaleOverride,
  alpha: alphaOverride,
  cache,
}) {
  const caps = capsIn || getQualityCaps('balanced');
  const preset = getPreset(layoutParams.composition);

  if (!activeAssets || activeAssets.length === 0) {
    return { preset, items: [], safeCount: 0 };
  }

  const mirror = !!layoutParams.mirror;
  const safeCount = clampCount(layoutParams.count, mirror, caps);
  const countInt = Math.ceil(safeCount);
  const countFrac = safeCount - Math.floor(safeCount);
  const scale = scaleOverride ?? layoutParams.scale;
  const alpha = alphaOverride ?? layoutParams.alpha;

  const geoParams = {
    mode: layoutParams.mode,
    count: countInt,
    seed,
    seedOffsets,
    jitter: layoutParams.jitter,
    density: layoutParams.density,
    zTiers: layoutParams.zTiers,
    bleed: layoutParams.bleed,
    canvasW,
    canvasH,
    caGrid: layoutParams.mode === 'ca' ? caGrid : null,
    lsysDepth: layoutParams.lsysDepth,
    lsysAngle: layoutParams.lsysAngle,
    displacement: layoutParams.displacement,
    noiseFreq: layoutParams.noiseFreq,
    noiseSpeed: layoutParams.noiseSpeed,
  };

  const strategy = resolveStrategy(layoutParams, preset);

  // ── Stage A+B: geometry. Reused whenever nothing it reads has changed.
  const geoSig = geometrySignature(geoParams);
  const geoHit = cache && sameSignature(cache.geoSig, geoSig);
  // Reuse the buffers even on a miss — same shape, one fewer allocation.
  const soa = geoHit ? cache.soa : computeGeometrySoA(geoParams, cache?.soa);

  // ── Stage C: attributes. Always runs; this is what the audio/life
  // modulation actually moves, and it is pure arithmetic over cached units.
  applyAttributes(soa, { scale, rotate: layoutParams.rotate, alpha });
  // Spine E: float count fades the spawning/dying point's alpha
  if (countFrac > 0.001 && soa.n > 0) {
    soa.alpha[soa.n - 1] *= countFrac;
  }

  // ── Stage D+E: asset bind + colour. Both are functions of (seed, index)
  // plus the asset pool / palette / strategy — never of the ranges — so they
  // ride on the geometry cache plus their own inputs.
  // geoHit is required: the bind arrays are indexed by slot, and a geometry
  // change can alter both n and which source index sits in each slot.
  // The sub-seed offsets ride as scalars (#305): a mutate changes a number,
  // never object identity, so Object.is comparison stays sound.
  const so = seedOffsets || {};
  const bindSig = [activeAssets, palette, strategy, seed,
    so.spatial || 0, so.color || 0, so.asset || 0, so.noise || 0];
  const bindHit = cache && geoHit && sameSignature(cache.bindSig, bindSig);

  let assetIds;
  let colors;
  let accents;
  let keys;
  if (bindHit) {
    ({ assetIds, colors, accents, keys } = cache);
  } else {
    const weights = activeAssets.map((a) => SELECTION_WEIGHT[a.weight] || 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    assetIds = new Array(soa.n);
    colors = new Array(soa.n);
    accents = new Array(soa.n);
    keys = new Array(soa.n);
    for (let k = 0; k < soa.n; k++) {
      const index = soa.index[k];
      const asset = pickWeightedIndexStable(
        activeAssets, weights, totalWeight, seed, index, seedOffsets,
      );
      // K5 (#64): colour comes from the kernel's colour channel only.
      const { color, accent } = assignColor(
        { seed, index, t: soa.t[k], seedOffsets }, palette, strategy,
      );
      assetIds[k] = asset.id;
      colors[k] = color;
      accents[k] = accent;
      keys[k] = `p${index}-${asset.id}`;
    }
  }

  if (cache) {
    cache.geoSig = geoSig;
    cache.soa = soa;
    cache.bindSig = bindSig;
    cache.assetIds = assetIds;
    cache.colors = colors;
    cache.accents = accents;
    cache.keys = keys;
  }

  // Items: rebuilt fresh on any geometry/bind miss, or when overlap is off
  // (below sorts the array, see the pool guard for why that must stay
  // unpooled). On a full hit with overlap on, x/y/index/t/zTier/assetId/
  // color/accent/key are all still valid from the geo+bind cache — only
  // scale/rotation/alpha (stage C) can have moved — so the pooled objects
  // from last call are mutated in place instead of reallocated. That does
  // alias last frame's returned items (the old caution below no longer
  // fully holds for this path), but nothing downstream holds a reference
  // across frames — useCanvasItems' useMemo hands out a fresh result each
  // call and Layer only ever reads the latest one.
  const poolHit = cache && geoHit && bindHit && layoutParams.overlap
    && cache.itemPool && cache.itemPool.length === soa.n;

  let mapped;
  if (poolHit) {
    mapped = cache.itemPool;
    for (let k = 0; k < soa.n; k++) {
      const item = mapped[k];
      item.x = soa.x[k];
      item.y = soa.y[k];
      item.scale = soa.scale[k];
      item.rotation = soa.rotation[k];
      item.alpha = soa.alpha[k];
    }
  } else {
    mapped = new Array(soa.n);
    for (let k = 0; k < soa.n; k++) {
      mapped[k] = {
        x: soa.x[k],
        y: soa.y[k],
        scale: soa.scale[k],
        rotation: soa.rotation[k],
        alpha: soa.alpha[k],
        index: soa.index[k],
        t: soa.t[k],
        zTier: soa.zTier[k],
        assetId: assetIds[k],
        color: colors[k],
        accent: accents[k],
        key: keys[k],
      };
    }
  }

  if (!layoutParams.overlap) {
    // `mapped` is already a fresh array we own — no defensive copy needed.
    // Never stash a sorted array into cache.itemPool: the pool is indexed by
    // soa slot (item[k] <-> soa.x[k]/scale[k]/...), and sorting breaks that
    // correspondence — a later pool-hit would mutate the wrong item's
    // scale/rotation/alpha. That aliasing bug was caught in review; the
    // overlap-only guard above is what prevents it.
    mapped.sort((a, b) => a.scale - b.scale);
  } else if (cache) {
    cache.itemPool = mapped;
  }

  if (mirror && caps.allowMirror) {
    const mirrored = mapped.map((item) => ({
      ...item,
      x: canvasW - item.x,
      _mirrored: true,
      key: `${item.key}-m`,
    }));
    mapped = [...mapped, ...mirrored];
  }

  return { preset, items: mapped, safeCount };
}

// Re-export for tests that still use sequential streams
export { mkRng };
