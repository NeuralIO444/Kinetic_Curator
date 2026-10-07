// elements.js — KINEME motion for the individual elements of a generated pattern (#1137).
//
// A pattern is one texture, so the GPU kineme path (per-instance, in QUAD_VS) cannot reach its tiles. This module is
// the same vocabulary, evaluated on the CPU per element: SPIN, ROCK, PULSE, BLINK, BOB, with the kineme library's
// own periods and amounts (data/kinemes.js), and a per-element phase from a hash of the seed.
//
//   - Only a seeded SHARE of the elements move (`movers`), so the picture reads as a composition with moving accents,
//     not a wallpaper that turns all at once. At least one element moves while the share is above 0.
//   - Motion runs only while DRIFT is above 0 and the amount follows DRIFT (rock, pulse, bob), so DRIFT 0 is the frozen
//     still it always was, and `kin: 'OFF'` is exactly the picture before this existed.
//   - Time is LOOP time in seconds, so a held clock holds the motion.
// Pure: no store, no DOM, no clock, no Math.random. The rasterizers (engine.js) read the transform it returns.
import { getKineme } from '../data/kinemes.js';

/** An element at rest. */
export const REST = Object.freeze({ a: 0, s: 1, vis: true, dy: 0 });

/** Library kinds by pattern name. */
const KIND_ID = Object.freeze({ SPIN: 'spin', ROCK: 'rock', PULSE: 'pulse', BLINK: 'blink', BOB: 'bob' });
const KIND_NAMES = Object.freeze(Object.keys(KIND_ID));
/** Kinds that turn the art: only a motif drawn to be turned (a pinwheel, a medallion, any glyph) may take them. */
export const TURNING = Object.freeze(['SPIN', 'ROCK']);
/** A bob is +/- this many tile heights at full DRIFT (the library's 6 scene units are tiny against a whole tile). */
export const BOB_TILES = 0.1;

const TAU = Math.PI * 2;
const hashU32 = (a, b) => { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; };
const unit = (a, b) => hashU32(a, b) / 4294967296;
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * Which elements move, and how. Deterministic in (seed, kin, movers, the candidate list).
 * @param {number} seed the pattern's seed
 * @param {string} kin a PATTERN_KINS value
 * @param {number} movers 0..1 share of the candidates that move
 * @param {Array<{at:number, turns:boolean}>} candidates every element: its index and whether its art may turn
 * @returns {Map<number,{kind:string, phase:number}>} element index -> its motion (absent = still)
 */
export function pickMovers(seed, kin, movers, candidates) {
  const out = new Map();
  const share = clamp01(movers);
  if (kin === 'OFF' || share === 0 || !candidates.length) return out;
  const fixed = KIND_NAMES.includes(kin) ? kin : null;
  const able = candidates.filter((c) => !fixed || !TURNING.includes(fixed) || c.turns);
  if (!able.length) return out;
  const ranked = able.map((c) => ({ c, r: unit(seed >>> 0, 0x7e10 + c.at) })).sort((x, y) => x.r - y.r || x.c.at - y.c.at);
  const n = Math.min(able.length, Math.max(1, Math.ceil(share * able.length)));
  for (let k = 0; k < n; k++) {
    const { c } = ranked[k];
    const pool = fixed ? [fixed] : (c.turns ? KIND_NAMES : KIND_NAMES.filter((x) => !TURNING.includes(x)));
    out.set(c.at, { kind: pool[Math.floor(unit(seed >>> 0, 0x51b0 + c.at) * pool.length)], phase: unit(seed >>> 0, 0x9a5e + c.at) });
  }
  return out;
}

/**
 * One mover's transform at loop time `t`. `a` radians (rotation about the element's center), `s` scale about it, `vis`
 * visible, `dy` offset in element heights (+ down). REST while DRIFT is 0.
 */
export function elementXform(mv, drift, t) {
  const d = clamp01(drift);
  if (!mv || d === 0) return REST;
  const k = getKineme(KIND_ID[mv.kind]);
  const time = Number.isFinite(Number(t)) ? Number(t) : 0;
  const ph = (((time / k.period + mv.phase) % 1) + 1) % 1;
  const wav = Math.sin(ph * TAU);
  switch (mv.kind) {
    case 'SPIN': return { a: ph * TAU, s: 1, vis: true, dy: 0 };
    case 'ROCK': return { a: ((k.amp * Math.PI) / 180) * d * wav, s: 1, vis: true, dy: 0 };
    case 'PULSE': return { a: 0, s: 1 + k.amp * d * wav, vis: true, dy: 0 };
    case 'BLINK': return { a: 0, s: 1, vis: ph < k.amp, dy: 0 };
    case 'BOB': return { a: 0, s: 1, vis: true, dy: BOB_TILES * d * wav };
    default: return REST;
  }
}

/** True when `x` is exactly REST (so a rasterizer can take its untouched path). */
export const isRest = (x) => x === REST || (x.a === 0 && x.s === 1 && x.vis && x.dy === 0);
