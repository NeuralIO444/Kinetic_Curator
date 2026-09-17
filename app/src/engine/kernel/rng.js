// Kernel K0 — channel RNG + index-stable unit floats (#58)
// Pure; no React. Channels isolate geometry / attributes / assets / color.

import { mkRng } from '../prng.js';

/** Channel ids (mix into hash). */
export const CH = Object.freeze({
  dens: 1,
  geo: 2,
  attr: 3,
  asset: 4,
  color: 5,
  noise: 6,
  dyn: 7,
});

/**
 * Avalanche mix → uint32.
 * String channels are hashed to a stable uint32 first: the old
 * `channel | 0` coerced every string to 0, so the documented 'field' and
 * 'ca' sampling channels produced *identical* point streams and the
 * channel isolation this module promises was silently defeated.
 * Numeric channels (CH.*) are untouched — their streams are bit-identical.
 * @param {number} seed
 * @param {number|string} channel
 * @param {number} [index=0]
 */
export function hashU32(seed, channel, index = 0) {
  const ch = typeof channel === 'number' ? channel | 0 : hashChannel(String(channel));
  let h = (seed | 0) ^ Math.imul(ch, 0x9e3779b9) ^ Math.imul(index | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h || 1;
}

/** FNV-1a → uint32: stable string→channel mix. */
function hashChannel(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Uniform [0, 1). */
export function hashU01(seed, channel, index = 0) {
  return hashU32(seed, channel, index) / 0x100000000;
}

/**
 * Sequential PRNG dedicated to one (seed, channel, index) — for mode fns
 * that call rng() several times per placement without leaking across indices.
 */
export function rngForIndex(seed, channel, index) {
  return mkRng(hashU32(seed, channel, index));
}

/** Sequential stream for a whole channel (no index) — rare; prefer index-stable. */
export function rngForChannel(seed, channel) {
  return mkRng(hashU32(seed, channel, 0));
}

/**
 * Index-stable weighted pick (does not advance a shared stream).
 * @param {Array} assets
 * @param {number[]} weights
 * @param {number} totalWeight
 * @param {number} seed
 * @param {number} index
 */
export function pickWeightedIndexStable(assets, weights, totalWeight, seed, index) {
  if (!assets.length) return null;
  let r = hashU01(seed, CH.asset, index) * totalWeight;
  for (let i = 0; i < assets.length; i++) {
    r -= weights[i];
    if (r <= 0) return assets[i];
  }
  return assets[assets.length - 1];
}

/**
 * Index-stable unit stream for color strategies that need multiple draws.
 * draw 0,1,2… via hashU01(seed, CH.color, index * 8 + k)
 */
export function colorRngForIndex(seed, index) {
  let k = 0;
  return () => hashU01(seed, CH.color, index * 8 + (k++));
}
