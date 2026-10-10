// #721 slice 2 — quadtree interestingness: audio term (spectral geography),
// field term (noise ridges), blend with zero-guard, ~1.5s audio release.
//
// This is the ONLY module that touches the Stimuli bus, and it does so
// through one read: readMeterBandLevels() — never a private analyser.
// The tree (quadtree.js) stays pure; this module builds the signal the
// tree subdivides on.
//
// Spectral geography (the constraint the issue left implicit): the bus is
// GLOBAL, not spatial — seven band levels for the whole mix. A cell's audio
// hotness is the band energy at the cell's position on a vertical spectral
// geography: sub at the bottom, air at the top, smoothed across neighboring
// bands so there are no hard seams.

import { makeNoiseField } from '../field/index.js';
import { readMeterBandLevels } from '../../../hooks/audioMeterTap.js';

/** Meter band order, low → high (matches BAND_KEYS). */
export const QUAD_BAND_ORDER = Object.freeze(['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air']);

/** Below this a band reads as silence (hiss guard). */
const BAND_FLOOR = 0.02;

/** Attack/release for the band smoother (seconds). Release is the spec's ~1.5s. */
export const QUAD_ATTACK_SEC = 0.15;
export const QUAD_RELEASE_SEC = 1.5;

function bandLevel(bands, key) {
  const v = bands ? bands[key] : undefined;
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Audio term for a normalized cell position: the band energy at the cell's
 * spectral address, linearly interpolated between adjacent bands.
 * y=0 (top) → air; y=1 (bottom) → sub. Null bands → 0 (field-only).
 */
export function audioTermAt(bands, nx, ny) {
  if (!bands) return 0;
  return bandAtPos(bands, (1 - Math.min(1, Math.max(0, ny))) * (QUAD_BAND_ORDER.length - 1));
}

/** Band level at a fractional spectral position (0=sub … 6=air). */
function bandAtPos(bands, pos) {
  const i0 = Math.floor(pos);
  const i1 = Math.min(QUAD_BAND_ORDER.length - 1, i0 + 1);
  const f = pos - i0;
  const v = bandLevel(bands, QUAD_BAND_ORDER[i0]) * (1 - f)
          + bandLevel(bands, QUAD_BAND_ORDER[i1]) * f;
  return v < BAND_FLOOR ? 0 : v;
}

/**
 * Audio term over a whole cell: the max band energy anywhere in the cell's
 * vertical span. A cell CONTAINING a hot band splits even if its center is
 * cool — otherwise a smooth signal (hot floor, cool middle) would never
 * subdivide past a lukewarm root.
 */
export function audioTermCell(bands, y0, y1) {
  if (!bands) return 0;
  const lo = Math.min(1, Math.max(0, y0));
  const hi = Math.min(1, Math.max(0, y1));
  const p0 = (1 - hi) * (QUAD_BAND_ORDER.length - 1);
  const p1 = (1 - lo) * (QUAD_BAND_ORDER.length - 1);
  let best = Math.max(bandAtPos(bands, p0), bandAtPos(bands, p1));
  // Interior band boundaries: the piecewise-linear peak may sit inside.
  for (let b = Math.ceil(p0); b <= Math.floor(p1); b++) {
    const v = bandAtPos(bands, b);
    if (v > best) best = v;
  }
  return best;
}

/**
 * Field term: ridge measure of the noise field — the local range over a
 * stencil scaled to the cell size. High where the field varies steeply
 * across the cell (the ridges the eye follows); low in the flats.
 * Scale-aware: "should this cell split?" is answered by variation at the
 * cell's own scale, so the term naturally quiets at fine depths.
 * Bounded [0,1] by construction (field samples are 0..1).
 */
export function fieldTermAt(field, nx, ny, cellW = 1) {
  const e = Math.min(0.4, cellW * 0.3);
  const c = field.sample(nx, ny);
  const x0 = field.sample(Math.max(0, nx - e), ny);
  const x1 = field.sample(Math.min(1, nx + e), ny);
  const y0 = field.sample(nx, Math.max(0, ny - e));
  const y1 = field.sample(nx, Math.min(1, ny + e));
  return Math.max(c, x0, x1, y0, y1) - Math.min(c, x0, x1, y0, y1);
}

/** Make the drifting noise field for one tree build (z = the slow-tick bucket). */
export function makeQuadtreeField(seed, seedOffsets, z) {
  return makeNoiseField(seed >>> 0, { freq: 2.5, octaves: 3, z });
}

/**
 * The blend. Straight weighted mix, normalized — with the zero-guard:
 * both knobs at 0 falls back to field-only, because a zero signal would
 * subdivide nothing and the piece must never go flat.
 */
export function blendInteresting(audio, field, quadAudio = 0.5, quadField = 0.5) {
  const wa = Math.max(0, Number(quadAudio) || 0);
  const wf = Math.max(0, Number(quadField) || 0);
  if (wa + wf <= 0) return Math.min(1, Math.max(0, field));
  return (wa * audio + wf * field) / (wa + wf);
}

/**
 * Per-band ballistics: fast attack, ~1.5s release. Null bands (audio off)
 * release toward zero rather than snapping — the tree's audio-driven
 * subdivisions ease out over a few rebuild ticks. Monotonic decay, no pops.
 */
export function createBandSmoother({ attackSec = QUAD_ATTACK_SEC, releaseSec = QUAD_RELEASE_SEC } = {}) {
  let sm = null;
  let lastMs = -1;
  const fresh = () => ({ sub: 0, bass: 0, mud: 0, mids: 0, edge: 0, pres: 0, air: 0 });
  return {
    update(bands, nowMs) {
      const dt = lastMs < 0 ? 0 : Math.max(0, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      if (!sm) sm = fresh();
      for (const key of QUAD_BAND_ORDER) {
        const target = bandLevel(bands, key);
        const tau = target > sm[key] ? attackSec : releaseSec;
        // dt=0 → k=0: a no-op, so per-item updates within one placement are free.
        const k = dt <= 0 ? 0 : 1 - Math.exp(-dt / tau);
        sm[key] += (target - sm[key]) * k;
      }
      return sm;
    },
    peek() {
      return sm ? { ...sm } : null;
    },
    reset() {
      sm = null;
      lastMs = -1;
    },
  };
}

/**
 * Compose the interestingness callback slice 1's buildQuadtree consumes.
 * Pure given its inputs — `bands` is a snapshot object (smoothed or raw).
 */
export function makeQuadtreeInterestingness({ seed, seedOffsets = null, quadAudio = 0.5, quadField = 0.5, fieldZ = 0, bands = null }) {
  const field = makeQuadtreeField(seed, seedOffsets, fieldZ);
  // Relax contract: when the bus is silent the audio weight eases to zero,
  // so the tree becomes field-only at FULL strength — not half-diluted by a
  // dead term. (Spec §Dropout: "at zero audio term, interesting = fieldTerm".)
  const audioActive = !!bands && QUAD_BAND_ORDER.some((k) => bandLevel(bands, k) >= BAND_FLOOR);
  const wa = audioActive ? quadAudio : 0;
  return (nx, ny, w, h /* , depth */) => blendInteresting(
    audioTermCell(bands, ny - h / 2, ny + h / 2),
    fieldTermAt(field, nx, ny, w),
    wa,
    quadField,
  );
}

/**
 * The single live touch point: read the meter bus and smooth it.
 * Throttled to ~10Hz — the tree rebuilds on a ~4Hz tick, so per-item reads
 * would just re-sample the same ballistics. Module singleton: one bus.
 */
const _liveSmoother = createBandSmoother();
let _liveLastMs = -1;
let _liveCached = null;

export function readSmoothedBands(nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  if (_liveCached && nowMs - _liveLastMs < 100) return _liveCached;
  _liveLastMs = nowMs;
  _liveCached = _liveSmoother.update(readMeterBandLevels(), nowMs);
  return _liveCached;
}

/** Quantize a band snapshot for the tree cache key (coarse: no rebuilds on noise). */
export function quantizeBands(bands) {
  if (!bands) return 'off';
  return QUAD_BAND_ORDER.map((k) => Math.round(bandLevel(bands, k) * 50)).join('.');
}

// NOTE (#1253): resetQuadtreeSignal was removed. The band smoother + 100ms
// cache are intentional live state of the GLOBAL audio bus — not per-project
// state (the bus is global, not spatial; the research note exempts this
// module from the seed law). Every plausible session boundary legitimately
// carries the tail across:
//   - project load: the audio keeps playing, so the tail still describes the
//     live mix. Resetting would dip the audio term to ~0 for the 0.15s
//     attack on every load — a visible stutter for no benefit.
//   - audio-off: the ~1.5s release toward zero IS the spec'd dropout
//     behavior ("release toward zero rather than snapping", above). A reset
//     would snap subdivisions to field-only — a pop the ballistics exist to
//     prevent.
//   - audio-source change: the 0.15s fast attack absorbs the new geography;
//     a reset would be visually indistinguishable.
// If a future session-scoped consumer ever needs a hard reset, re-add it
// then. Per-instance reset stays available via createBandSmoother().reset().
