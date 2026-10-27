// kineticSweep.mjs — #1772 (epic #1766, slice 6): the KINETIC tap as a filter sweeping left to right.
//
//   tap 1 — LOOK pass:    a fresh Look (S4's 64) + a pool coherent with its categories/styles (S1/S3). Structure.
//   tap 2 — VOICE pass:   a fresh voice (S5's 64) over the standing look: motion + palette, and the glow ONLY when
//                         the voice declares accumulation (S2's law, #1768). Costume.
//   tap 3+ — CURATOR:     Davis nudges a few params by a capped amount, or passes when nothing beats the piece as it
//                         stands. Small percentage.
//   hammering — CHAOS:    the full kineticRoll (#942), unchanged — Matt's ruling 2026-10-27: hammering still reaches it.
//
// Each pass owns its axes and leaves the others alone, so a param-diff audit can name what a tap moved
// (kineticSweep.selfcheck). The ceiling over the sweep is the ARMED ROLL SCOPE (#964), per Matt 2026-10-27: an armed
// MODE keeps the standing look (the look pass re-deals its pool only); an armed MOTION pins the motion numbers through
// every pass. lockedParams hold everywhere. START stays launch-only (#946).
//
// Pure: no store, no clock, no Math.random — every pass takes its rng. The store actions (layoutSlice) pass the
// slice's honest die; replay comes from the stored result, like every KIN pass (#710).
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { resolveVoiceState } from '../data/voices.js';
import { getCatalogPalette } from '../data/palettes.js';
import { validateLayoutParams } from '../data/layout-modes.js';
import { RANDOMIZABLE_KEYS } from './paramUtils.js';
import { REFINE_RANGES, mutateKey } from '../curator/refineMutate.js';
import { MOTION_KEYS, pinRollScope } from './rollScope.mjs';
import { dealPoolFor, poolToEnabled } from './rollPool.mjs';

/** The curator pass's cap: at most this many params move, each by at most NUDGE_SPREAD of its dice range. */
export const NUDGE_MAX_KEYS = 3;
export const NUDGE_SPREAD = 0.08;
/** Candidates the curator weighs: the piece as it stands (index 0) + nudged variants. */
export const NUDGE_CANDIDATES = 6;

/** The glow/wake keys — dealt only by a look or voice that declares them (#1768). */
export const ACCUM_KEYS = Object.freeze([
  'accumulation',
  'accumulationFade',
  'accumulationOptics',
  'accumulationTunnel',
  'accumulationPrism',
  'accumulationFlow',
  'accumulationWetness',
]);

const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
const pickOther = (items, currentId, rng) => {
  const pool = items.filter((x) => x.id !== currentId);
  const src = pool.length ? pool : items;
  return src[pickIndex(rng, src.length)];
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The keys whose values differ between two layoutParams objects (the param-diff audit). */
export function paramDiff(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => !same(before?.[k], after?.[k])).sort();
}

/**
 * LOOK pass. Returns { layoutParams, enabledAssets, lookId, coherent }.
 * Moves: composition + the look's structural params (never motion — that is the voice's axis) and the asset pool.
 */
export function lookPass(
  state,
  rng,
  { looks = COMPOSITION_PRESETS, records, pool: poolKind = 'library', sets = [] } = {},
) {
  const lp = state.layoutParams || {};
  const locked = state.lockedParams || {};
  const standing = looks.find((p) => p.id === lp.composition) || null;
  const hold = !!state.armedMode || !!locked.composition; // #964: an armed MODE keeps the look
  const look = hold ? standing : pickOther(looks, lp.composition, rng);
  let merged = { ...lp };
  if (!hold && look) {
    merged.composition = look.id;
    for (const [k, v] of Object.entries(look.params)) {
      if (MOTION_KEYS.includes(k) || locked[k]) continue;
      merged[k] = v;
    }
  }
  merged = pinRollScope(merged, state.armedMode, state.armedMotion);
  // START: OFF deals the pre-#1767 pool — one curated 4-shape set — instead of a library pool (kineticScope.mjs)
  const pool =
    poolKind === 'sets' && sets.length
      ? { ids: [...sets[pickIndex(rng, sets.length)]], coherent: false }
      : dealPoolFor(records, rng, look || {});
  return {
    layoutParams: validateLayoutParams(merged).params, // #1550: rolled values land through the validating door
    enabledAssets: poolToEnabled(pool.ids),
    lookId: look ? look.id : null,
    coherent: pool.coherent,
  };
}

/**
 * VOICE pass. Returns { layoutParams, paletteId, paletteOverrides, voiceId }.
 * Moves: the motion keys + the palette, and the ACCUM keys only when the voice declares accumulation. Composition,
 * structure and the asset pool hold — the look owns them.
 */
export function voicePass(state, rng, { deck = VOICE_DECK } = {}) {
  const lp = state.layoutParams || {};
  const locked = state.lockedParams || {};
  // a voice whose sky is the one already up would read as no costume change: deal from the others when there are any
  const fresh = deck.filter((v) => !(state.paletteOverrides == null && v.def.paletteId === state.paletteId));
  const voice = pickOther(fresh.length ? fresh : deck, state.kineticVoiceId, rng);
  const st = resolveVoiceState(voice.def); // validated costume (glow clamped to the slider's own cap)
  const merged = { ...lp };
  for (const k of MOTION_KEYS) if (st.params[k] !== undefined && !locked[k]) merged[k] = st.params[k];
  if (voice.accumulation) {
    for (const k of ACCUM_KEYS) if (voice.def.params[k] !== undefined && !locked[k]) merged[k] = st.params[k];
  }
  const pinned = pinRollScope(merged, null, state.armedMotion); // the armed MOTION wins over the voice's motion
  const catalog = voice.def.paletteId && getCatalogPalette(voice.def.paletteId);
  return {
    layoutParams: validateLayoutParams(pinned).params,
    paletteId: catalog ? voice.def.paletteId : state.paletteId,
    paletteOverrides: catalog ? null : { bg: st.palette.bg, ink: st.palette.ink, swatches: [...st.palette.swatches] },
    voiceId: voice.id,
  };
}

const step = (spec) => (spec.int ? 1 : spec.dec != null ? 10 ** -spec.dec : 0);
const ranges = (spec) => (spec.pair ? spec.pair : [[spec.lo, spec.hi]]);
/**
 * A key whose smallest possible move (one integer / one rounding step) is already bigger than the cap can never be
 * nudged by a small percentage — zTiers (1 step = 11% of its range) and damping (12.5%) sit out the curator pass.
 */
export function nudgeFits(key) {
  const spec = REFINE_RANGES[key];
  return !!spec && ranges(spec).every(([lo, hi]) => step(spec) <= NUDGE_SPREAD * (hi - lo));
}

/** The cap, exactly: each element moved ≤ NUDGE_SPREAD of its dice range, plus half the key's rounding step. */
export function nudgeWithinCap(key, from, to) {
  const spec = REFINE_RANGES[key];
  if (!spec) return false;
  const a = spec.pair ? from : [from];
  const b = spec.pair ? to : [to];
  return ranges(spec).every(([lo, hi], i) => Math.abs(b[i] - a[i]) <= NUDGE_SPREAD * (hi - lo) + step(spec) / 2 + 1e-9);
}

/** The keys the curator may nudge right now: dice-rollable, fine-grained enough, unlocked, not armed, usable. */
export function nudgeableKeys(state) {
  const lp = state.layoutParams || {};
  const locked = state.lockedParams || {};
  return RANDOMIZABLE_KEYS.filter((k) => {
    if (locked[k] || !nudgeFits(k)) return false;
    if (state.armedMotion && MOTION_KEYS.includes(k)) return false;
    const v = lp[k];
    return Number.isFinite(v) || (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite));
  });
}

/**
 * CURATOR pass. `pick` is curate.js's pickCurated (injected so the pure module stays engine-free).
 * Returns { layoutParams, moves: [{ key, from, to }], index } — or { layoutParams: null, moves: [], index } when the
 * curator keeps the piece as it stands (index 0) or nothing is nudgeable: the pass can pass.
 */
export function curatorPass(state, curator, rng, pick) {
  const lp = state.layoutParams || {};
  const keys = nudgeableKeys(state);
  if (!keys.length) return { layoutParams: null, moves: [], index: 0 };
  const candidates = [{ ...lp }];
  for (let n = 1; n < NUDGE_CANDIDATES; n++) {
    const rp = { ...lp };
    const left = [...keys];
    const m = 1 + pickIndex(rng, Math.min(NUDGE_MAX_KEYS, left.length));
    for (let i = 0; i < m; i++) {
      const k = left.splice(pickIndex(rng, left.length), 1)[0];
      rp[k] = mutateKey(k, lp[k], rng, NUDGE_SPREAD);
    }
    candidates.push(rp);
  }
  const { index } = pick(candidates, curator, rng, { refine: true });
  if (!(index > 0)) return { layoutParams: null, moves: [], index: Math.max(0, index | 0) };
  const landed = validateLayoutParams(candidates[index]).params;
  const moves = paramDiff(lp, landed).map((key) => ({ key, from: lp[key], to: landed[key] }));
  return moves.length ? { layoutParams: landed, moves, index } : { layoutParams: null, moves: [], index };
}
