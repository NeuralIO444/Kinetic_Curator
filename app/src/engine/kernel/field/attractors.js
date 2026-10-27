// kernel/field/attractors.js — dish-level attractor field + hero marks (#1200).
//
// A standalone, importable module: pure, no React, no store, no globals.
// Imports only the kernel RNG and the field combinator.
//
// This is the CANDIDATE shared implementation for the proposed attractor
// unification (#1197 space-colonization and #1200 heroes/attractors sharing
// one dish-level attractor field). The unification is PROPOSED, not locked —
// #1384 adopts this module as a follow-up, so the API is shaped for that:
//
//   createAttractorField(seed, bounds, count, opts) -> field instance
//   sampleDensity(field, x, y) -> 0..1
//   withAttractorDensity(baseField, attractorField) -> field instance
//
// The field instance follows the kernel field contract (same shape as the
// other fields in kernel/field/): { kind, sample(nx, ny) -> 0..1 } in
// normalized canvas space, so it composes with combineFields and the
// rejection samplers (sampleFieldPoint) unchanged.
//
// Two mechanisms, one issue:
//
// 1. ATTRACTORS — coordinates with radius + falloff that bend placement
//    density toward them. Multiple attractors compose (max of their
//    falloffs); zero attractors is a provable no-op: the field samples
//    exactly 1 everywhere, so combining it with any base field returns the
//    base field's samples bit-for-bit.
//
// 2. HEROES — a per-index flag for a handful of marks that break the field
//    rules: larger scale, rotated against the prevailing direction.
//    Scarcity is the point — the count is hard-capped (never a percentage).
//    Selection and transforms are deterministic per seed, never per-frame.
//
// Terminology: strata, never layers (this module never names a UI concept).
//
// Cost: attractors are init-time CPU (one placement, O(count) hashes, plus
// O(attractors) per field sample). Tier 0 — structural substrate, never shed.

import { hashU01 } from '../rng.js';
import { combineFields } from './index.js';

/** Supported falloff profiles (radius -> weight). */
export const ATTRACTOR_FALLOFFS = Object.freeze(['smooth', 'linear', 'gaussian']);

/** Scarcity cap: heroes are a handful, never a percentage of the count. */
export const MAX_HEROES = 7;

/** Default influence radius in normalized canvas units. */
export const ATTRACTOR_RADIUS_DEFAULT = 0.15;

/** Default falloff profile. */
export const ATTRACTOR_FALLOFF_DEFAULT = 'smooth';

/** Max rejection attempts when spacing attractors apart (minSpacing). */
const SPACING_ATTEMPTS = 8;

/**
 * Resolve a falloff name to a weight function. The function takes the
 * normalized distance d = dist / radius (0 at the centre, 1 at the rim)
 * and returns 0..1, 1 at the centre.
 */
function falloffFn(name) {
  switch (name) {
    case 'linear':
      return (d) => (d >= 1 ? 0 : 1 - d);
    case 'gaussian':
      // exp decay shaped so the rim (d=1) reads ~0.05, not a hard cutoff.
      return (d) => (d >= 1 ? 0 : Math.exp(-3 * d * d));
    case 'smooth':
    default: {
      // smoothstep — flat-ish peak, soft shoulder at the rim.
      return (d) => {
        if (d >= 1) return 0;
        const u = 1 - d;
        return u * u * (3 - 2 * u);
      };
    }
  }
}

/**
 * Create a deterministic attractor field.
 *
 * @param {number} seed master seed
 * @param {{x:number,y:number,w:number,h:number}|null} bounds attractor scatter
 *   region in normalized 0..1 coords; null = the whole canvas {x:0,y:0,w:1,h:1}
 * @param {number} count number of attractors (<= 0 = the provable no-op)
 * @param {object} [opts]
 * @param {number} [opts.radius] influence radius in normalized units
 * @param {'smooth'|'linear'|'gaussian'} [opts.falloff]
 * @param {number} [opts.minSpacing] minimum centre-to-centre distance (unit
 *   space); 0 = no spacing enforcement
 * @param {string} [opts.channel] hash channel; defaults to 'attractor' so the
 *   points ride the spatial sub-seed stream (re-rolling spatial moves the
 *   attractors, re-rolling colour does not)
 * @param {object|null} [opts.seedOffsets] sub-seed offsets (see kernel/rng.js)
 * @returns field instance { kind:'attractor', count, points, radius, falloff,
 *   sample(nx, ny) -> 0..1 }
 */
export function createAttractorField(seed, bounds, count, opts = {}) {
  const n = Math.max(0, Math.floor(count) || 0);
  const {
    radius = ATTRACTOR_RADIUS_DEFAULT,
    falloff = ATTRACTOR_FALLOFF_DEFAULT,
    minSpacing = 0,
    channel = 'attractor',
    seedOffsets = null,
  } = opts;
  const b = bounds && Number.isFinite(bounds.w) && Number.isFinite(bounds.h) ? bounds : { x: 0, y: 0, w: 1, h: 1 };
  const w = falloffFn(ATTRACTOR_FALLOFFS.includes(falloff) ? falloff : ATTRACTOR_FALLOFF_DEFAULT);

  // x,y pairs in normalized 0..1 canvas space.
  const points = new Float64Array(n * 2);
  let placed = 0;
  let k = 0;
  while (placed < n) {
    let ax = 0;
    let ay = 0;
    let ok = false;
    // Deterministic per (seed, k): the spacing rejection only ever *skips*
    // a candidate, it never re-hashes, so the k-th attractor is a pure
    // function of the seed regardless of how many attractors were requested
    // before or after it.
    for (let attempt = 0; attempt < SPACING_ATTEMPTS && !ok; attempt++) {
      ax = b.x + hashU01(seed, channel, k * 2 + attempt * 7919, seedOffsets) * b.w;
      ay = b.y + hashU01(seed, channel, k * 2 + 1 + attempt * 7919, seedOffsets) * b.h;
      ok = true;
      if (minSpacing > 0) {
        const ms2 = minSpacing * minSpacing;
        for (let j = 0; j < placed; j++) {
          const dx = ax - points[j * 2];
          const dy = ay - points[j * 2 + 1];
          if (dx * dx + dy * dy < ms2) {
            ok = false;
            break;
          }
        }
      }
    }
    points[placed * 2] = ax;
    points[placed * 2 + 1] = ay;
    placed++;
    k++;
  }

  const r = Math.max(1e-6, radius);
  const r2 = r * r;
  return {
    kind: 'attractor',
    count: n,
    points,
    radius: r,
    falloff,
    bounds: { ...b },
    /**
     * Density weight at normalized (nx, ny). Max of the attractors' falloff
     * weights; exactly 1 everywhere when there are no attractors — the
     * no-op case that makes density pooling a no-op when unused.
     */
    sample(nx, ny) {
      let v = 0;
      for (let j = 0; j < n; j++) {
        const dx = nx - points[j * 2];
        const dy = ny - points[j * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const weight = w(Math.sqrt(d2) / r);
        if (weight > v) v = weight;
        if (v >= 1) break;
      }
      // No attractors -> the loop never runs -> 1, not 0. That is the
      // whole provable-no-op contract: combining with a 1-field is the
      // identity, so an empty attractor field can never change placement.
      return n === 0 ? 1 : v;
    },
  };
}

/**
 * Sample the density of a field at normalized (x, y). Thin named alias over
 * field.sample — the cross-issue API surface (#1197 adopts this call shape).
 */
export function sampleDensity(field, x, y) {
  return field.sample(x, y);
}

/**
 * Density pooling: bend a base density field toward the attractor points.
 * Combines by multiplication (the kernel's standard field composition), so
 * with an empty attractor field the result samples bit-identically to the
 * base field — the off state is provably current behavior.
 */
export function withAttractorDensity(baseField, attractorField) {
  return combineFields(baseField, attractorField);
}

/**
 * Deterministically pick the hero indices for a placement of `count` marks.
 * A handful, capped at MAX_HEROES — scarcity is what makes heroes read as
 * emphasis. Deterministic per (seed, count, heroCount); sorted ascending so
 * application order is stable.
 *
 * @returns {number[]} sorted unique source indices into [0, count)
 */
export function selectHeroIndices(seed, count, heroCount, seedOffsets = null) {
  const cap = Math.max(0, Math.floor(count) || 0);
  const want = Math.min(Math.max(0, Math.floor(heroCount) || 0), cap, MAX_HEROES);
  const out = [];
  const seen = new Set();
  for (let k = 0; k < want; k++) {
    let idx = Math.floor(hashU01(seed, 'hero', k, seedOffsets) * cap) % cap;
    // Linear probe on collision — still deterministic per seed.
    let guard = 0;
    while (seen.has(idx) && guard < cap) {
      idx = (idx + 1) % cap;
      guard++;
    }
    seen.add(idx);
    out.push(idx);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * The rule-breaking transform for one hero mark. Larger scale and a
 * direction against the field: rotation is the half-turn (PI) plus a small
 * deterministic jitter, so the hero visibly refuses the prevailing flow.
 *
 * @returns {{ scaleMult: number, rotationOffset: number }} scaleMult in
 *   [3, 6); rotationOffset in radians, always within PI ± 0.35.
 */
export function heroTransform(seed, index, seedOffsets = null) {
  const u0 = hashU01(seed, 'hero', index * 2 + 100003, seedOffsets);
  const u1 = hashU01(seed, 'hero', index * 2 + 1 + 100003, seedOffsets);
  return {
    scaleMult: 3 + 3 * u0,
    rotationOffset: Math.PI + (u1 - 0.5) * 0.7,
  };
}

/**
 * Convenience for stage C (applyAttributes): build the hero descriptor for a
 * placement, or null when heroes are off (the no-op).
 *
 * @returns {{ seed:number, set:Set<number>, seedOffsets:object|null }|null}
 */
export function makeHeroInfo(seed, count, heroCount, seedOffsets = null) {
  const indices = selectHeroIndices(seed, count, heroCount, seedOffsets);
  if (indices.length === 0) return null;
  return { seed, set: new Set(indices), seedOffsets };
}

/**
 * Apply the hero transforms to stage-C SoA lanes in place. Pure arithmetic
 * over the placed rows — no hashing, no sampling. `heroes` is null when
 * heroes are off (the provable no-op: lanes untouched).
 *
 * @param {object} soa placement SoA (reads soa.n, soa.index; writes
 *   soa.scale, soa.scaleY, soa.rotation)
 * @param {{ seed:number, set:Set<number>, seedOffsets?:object|null }|null} heroes
 */
export function applyHeroes(soa, heroes) {
  if (!heroes || !heroes.set || heroes.set.size === 0) return soa;
  const { seed, set, seedOffsets = null } = heroes;
  const { n, index, scale, scaleY, rotation } = soa;
  for (let k = 0; k < n; k++) {
    const src = index[k];
    if (!set.has(src)) continue;
    const t = heroTransform(seed, src, seedOffsets);
    scale[k] *= t.scaleMult;
    scaleY[k] *= t.scaleMult;
    rotation[k] += t.rotationOffset;
  }
  return soa;
}
