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
 * Sub-seed offset groups (#305). Each channel belongs to exactly one stream
 * a performer can re-roll independently of the master seed:
 *   spatial — dens/geo/attr placement channels, the dyn (swarm motion)
 *             channel, and the named density-field channels ('field', 'ca')
 *   color   — the colour channel
 *   asset   — the asset-pick channel
 *   noise   — the fBm displacement noise channel
 */
export const SEED_OFFSET_GROUPS = Object.freeze(['spatial', 'color', 'asset', 'noise']);

/** The identity offsets: every stream locked to the master seed. */
export function defaultSeedOffsets() {
  return { spatial: 0, color: 0, asset: 0, noise: 0 };
}

/**
 * Normalize a raw offsets object (saved state / project document). Unknown
 * keys are dropped; missing or non-numeric values become 0; values are
 * coerced to uint32 so the hash mix stays well-defined. The store keeps
 * these under the key `seedOffsets` exactly (#307 reads
 * `state.seedOffsets ?? {}`).
 */
export function normalizeSeedOffsets(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const g of SEED_OFFSET_GROUPS) {
    const v = Number(o[g]);
    out[g] = Number.isFinite(v) ? v >>> 0 : 0;
  }
  return out;
}

/**
 * #305 — the scalar seed a stream's scalar consumers initialize from (the
 * flow-field noise behind swarms and fBm displacement). A zero/missing noise
 * offset returns exactly the old `seed || 444` expression — bit-identical to
 * every existing seed; a non-zero offset derives deterministically from the
 * noise channel hash, so mutating the noise stream re-rolls the field while
 * the other streams stay locked.
 */
export function noiseSeedFor(seed, seedOffsets) {
  const offs = normalizeSeedOffsets(seedOffsets);
  if (!offs.noise) return seed || 444;
  return hashU32(seed >>> 0, CH.noise, 0, offs);
}

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
 * @param {{spatial:number,color:number,asset:number,noise:number}|null} [offsets=null]
 *   Per-stream seed offsets (#305). Mixed into the pre-avalanche hash; a
 *   zero/missing offset is the identity, so existing seeds are bit-identical.
 */
export function hashU32(seed, channel, index = 0, offsets = null) {
  const ch = typeof channel === 'number' ? channel | 0 : hashChannel(String(channel));
  const off = offsetForChannel(ch, offsets);
  let h = (seed | 0) ^ Math.imul(ch, 0x9e3779b9) ^ Math.imul(index | 0, 0x85ebca6b)
    ^ Math.imul(off, 0x27d4eb2d);
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

/**
 * Channel → sub-seed stream (#305). Channels not listed here stay locked to
 * the master seed (offset 0). The named density-sampling channels ('field',
 * 'ca') place points, so they ride the spatial stream.
 */
/** Named (string) sampling channels → seed-offset group.
 *  Add new density/sampler channels here so they pick up the spatial stream
 *  (or another group) instead of silently locking to offset 0. */
export const STRING_CHANNEL_GROUPS = Object.freeze({
  field: 'spatial',
  ca: 'spatial',
});

const OFFSET_GROUP_OF = new Map([
  [CH.dens, 'spatial'],
  [CH.geo, 'spatial'],
  [CH.attr, 'spatial'],
  [CH.dyn, 'spatial'],
  [CH.asset, 'asset'],
  [CH.color, 'color'],
  [CH.noise, 'noise'],
  ...Object.entries(STRING_CHANNEL_GROUPS).map(([name, group]) => [hashChannel(name), group]),
]);

/**
 * The numeric offset mixed into one channel's hash. Takes the already
 * hash-resolved channel id. Returns 0 (the identity) when offsets are
 * missing, the channel has no group, or the group's offset is 0/missing.
 */
function offsetForChannel(ch, offsets) {
  if (!offsets) return 0;
  const group = OFFSET_GROUP_OF.get(ch);
  if (!group) return 0;
  const v = Number(offsets[group]);
  return Number.isFinite(v) ? (v >>> 0) : 0;
}

/**
 * Public form of offsetForChannel: takes the (number|string) channel.
 * @returns {number} the uint32 offset (0 = identity)
 */
export function channelSeedOffset(channel, offsets) {
  const ch = typeof channel === 'number' ? channel | 0 : hashChannel(String(channel));
  return offsetForChannel(ch, offsets);
}

/** Uniform [0, 1). */
export function hashU01(seed, channel, index = 0, offsets = null) {
  return hashU32(seed, channel, index, offsets) / 0x100000000;
}

/**
 * Sequential PRNG dedicated to one (seed, channel, index) — for mode fns
 * that call rng() several times per placement without leaking across indices.
 */
export function rngForIndex(seed, channel, index, offsets = null) {
  return mkRng(hashU32(seed, channel, index, offsets));
}

/** Sequential stream for a whole channel (no index) — rare; prefer index-stable. */
export function rngForChannel(seed, channel, offsets = null) {
  return mkRng(hashU32(seed, channel, 0, offsets));
}

/**
 * Index-stable weighted pick (does not advance a shared stream).
 * @param {Array} assets
 * @param {number[]} weights
 * @param {number} totalWeight
 * @param {number} seed
 * @param {number} index
 * @param {{spatial:number,color:number,asset:number,noise:number}|null} [offsets=null]
 */
export function pickWeightedIndexStable(assets, weights, totalWeight, seed, index, offsets = null) {
  if (!assets.length) return null;
  let r = hashU01(seed, CH.asset, index, offsets) * totalWeight;
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
export function colorRngForIndex(seed, index, offsets = null) {
  let k = 0;
  return () => hashU01(seed, CH.color, index * 8 + (k++), offsets);
}
