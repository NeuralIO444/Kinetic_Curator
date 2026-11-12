// kinemes.js — KINEME, the motion library (#781 Build A).
//
// A kineme is the smallest unit of motion (as a phoneme is of speech). Assets
// stay plain static SVG sources: motion never lives on an asset definition. A
// kineme is a named, reusable preset; `assetKineme` (store + project document)
// maps asset ids to kineme ids. The GPU evaluates the motion per instance in
// QUAD_VS, which every render path shares (in-thread loop, worker, stills).
//
// Build A kinds move the WHOLE mark. Motion inside a mark (a needle over a
// still dial face) is Build C: cell kinemes, not this module's kinds.
//
// Browser-safe, pure.

/** Shader kind ids (QUAD_VS switches on these). 0 is reserved for "none". */
export const KINEME_KINDS = Object.freeze({ spin: 1, osc: 2, pulse: 3, blink: 4, bob: 5, scatter: 6 });

/**
 * The library. `period` in seconds; `amp` per kind: osc = ± degrees,
 * pulse = ± scale fraction, blink = duty (fraction of the period visible),
 * bob = ± scene units along the screen's y, scatter = the peak distance a REGION leaves home, as a fraction of its mark's
 * box side (#2116 break-up; docs/design/kineme-breakup-spec.md). spin ignores amp (one turn/period).
 */
export const KINEMES = Object.freeze(
  [
    { id: 'spin', kind: 'spin', period: 4.0, amp: 0 },
    { id: 'rock', kind: 'osc', period: 2.4, amp: 18 },
    { id: 'pulse', kind: 'pulse', period: 1.6, amp: 0.12 },
    { id: 'blink', kind: 'blink', period: 1.0, amp: 0.5 },
    { id: 'bob', kind: 'bob', period: 3.0, amp: 6 },
    // #1435 R4 — the line bend: an osc with a small amp, but the id itself is
    // the signal. On a stroke-shaped REGION (data/regionKinemes.js
    // isStrokeRegion) the pack subdivides the region into slices along its
    // length and steps this kineme's phase slice to slice, so the stroke
    // articulates and the wave travels along it — stroke-aware by
    // construction (only the stroke's own region instances subdivide; the
    // quad-wide shader warp stays parked). Anywhere else — a compact region,
    // a whole mark — it is simply the gentle osc it declares.
    { id: 'bend', kind: 'osc', period: 3.6, amp: 6 },
    // #2116 — scatter: a region slides out from its mark's centre along its own centroid direction and back, in a ripple
    // across regions. Region-only: a whole mark has no centroid direction, so it would sit still (sanitizeAssetKineme drops it).
    { id: 'scatter', kind: 'scatter', period: 3.2, amp: 0.18, regionOnly: true },
  ].map(Object.freeze),
);

/**
 * #2116 — the scatter cycle, shared by the shader (QUAD_VS, literal copies), the CPU reference and the selfchecks.
 * u = fract(t / per - phase * RIPPLE); the piece is out and back for the first WINDOW of the cycle and holds at home for the
 * rest. WINDOW + RIPPLE <= 1, so at t = 0 every phase sits in its hold: rest, exactly (the anchor law).
 */
export const SCATTER_WINDOW = 0.6;
export const SCATTER_RIPPLE = 0.4;

/** #1435 R4 — the kineme id whose region playback subdivides stroke regions. */
export const BEND_KINEME_ID = 'bend';

/**
 * #1127 — ROTATE spin gives every mark its OWN speed and direction, so a field of marks does not turn as one wheel.
 * Eight variants (four speeds, each both ways) around the layer's rev/s; a mark picks one from a hash of its own
 * identity, so the choice is stable per seed and the mix is about half clockwise, half counter. The average speed
 * is the dial's rev/s. A negative `amp` on a spin kineme means "turn the other way" (library spins have amp 0).
 */
export const SPIN_SPEEDS = Object.freeze([0.4, 0.7, 1.0, 1.5]);
export const SPIN_VARIANTS = SPIN_SPEEDS.length * 2;
/** The variant [0, SPIN_VARIANTS) a mark spins with. */
export function spinVariant(seedOffset, key) {
  return Math.min(SPIN_VARIANTS - 1, Math.floor(kinemePhase(seedOffset, key) * SPIN_VARIANTS));
}
/** The spin kineme for one variant of a layer's rev/s: { id, kind, period, amp }. */
export function spinKineme(rev, variant) {
  const speed = SPIN_SPEEDS[variant % SPIN_SPEEDS.length];
  const reverse = variant >= SPIN_SPEEDS.length;
  return { id: `rotate-spin@${rev}@${variant}`, kind: 'spin', period: 1 / (rev * speed), amp: reverse ? -1 : 0 };
}

/** Most kinemes one frame may reference — the QUAD_VS uniform table size. */
export const KINEME_TABLE_MAX = 16;

const BY_ID = new Map(KINEMES.map((k) => [k.id, k]));

/**
 * #2117 — kineme STACKING: a mark plays exactly two kinemes at once (docs/design/kineme-stacking-spec.md). A stack is a
 * library entry with its own id in the same namespace as the singles, so `assetKineme: { mic_arrow: 'rock+bob' }` is still a
 * map of string ids and an old document (single ids only) loads unchanged. A stack of one is just the single id. The two
 * members combine by commutative operations (rotations and offsets add, scales and visibility multiply), so their order is
 * not significant. Members: two distinct, non-regionOnly singles, and not `bend` (its id is a region signal) — a selfcheck
 * holds this, so a bad record cannot ship.
 */
export const KINEME_STACKS = Object.freeze(
  [
    { id: 'rock+bob', stack: ['rock', 'bob'] }, // a buoy: sways while it rides up and down
    { id: 'pulse+spin', stack: ['pulse', 'spin'] }, // a beacon: breathes while it turns
    { id: 'pulse+blink', stack: ['pulse', 'blink'] }, // an indicator: swells and flickers
    { id: 'spin+bob', stack: ['spin', 'bob'] }, // a slow orbiter: turns while it floats
  ].map((s) => Object.freeze({ id: s.id, stack: Object.freeze(s.stack) })),
);
const STACK_BY_ID = new Map(KINEME_STACKS.map((s) => [s.id, s]));

/** The kineme for an id, or undefined. */
export function getKineme(id) {
  return BY_ID.get(id);
}

/**
 * #2117 — what an ASSET (a whole mark) may carry: a single kineme record, or a stack resolved to
 * `{ id, kind: 'stack', stack: [recordA, recordB] }`. `getKineme` stays single-only so the region paths, which refuse stacks
 * in v1, are untouched.
 */
export function getAssetKineme(id) {
  const one = BY_ID.get(id);
  if (one) return one;
  const st = STACK_BY_ID.get(id);
  return st ? { id: st.id, kind: 'stack', stack: [BY_ID.get(st.stack[0]), BY_ID.get(st.stack[1])] } : undefined;
}

/**
 * #705 — micro-HUD ornaments that move out of the box. Per-project; the user
 * can clear any entry (setAssetKineme(id, null)) to return it to the static
 * path. Motion through KINEME, never the asset system (#699 stays reverted).
 */
export const DEFAULT_ASSET_KINEME = Object.freeze({
  mic_dotgrid_5: 'pulse',
  mic_dotgrid_3: 'pulse',
  mic_plus: 'pulse',
  mic_crosshair: 'blink',
  mic_target: 'blink',
  mic_arrow: 'rock',
});

/**
 * Sanitize an asset → kineme map (project document / import trust boundary).
 * Unknown kineme ids and non-string keys are dropped. Returns null when
 * nothing valid remains, so callers can omit the field entirely.
 */
export function sanitizeAssetKineme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [assetId, kid] of Object.entries(raw)) {
    // #2116: a region-only kineme (scatter) has no meaning on a whole mark — refuse it here, not silently inert
    if (
      typeof assetId === 'string' &&
      assetId &&
      typeof kid === 'string' &&
      ((BY_ID.has(kid) && !BY_ID.get(kid).regionOnly) || STACK_BY_ID.has(kid)) // #2117: a stack id is an asset kineme too
    )
      out[assetId] = kid;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * #1128 — assets the artist pinned still: the living-motion floor (breath, drift) leaves their marks where they were
 * placed. { assetId: true }; anything else is dropped. Null when nothing is pinned (a doc without it is unchanged).
 */
export function sanitizeAssetStill(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [assetId, v] of Object.entries(raw)) {
    if (v === true && typeof assetId === 'string' && assetId && assetId.length <= 120 && n < 400) {
      out[assetId] = true;
      n++;
    }
  }
  return n ? out : null;
}

/**
 * Per-instance phase in [0, 1) from instance identity, so copies of one asset
 * never move in lockstep. Deterministic: same (seedOffset, key) → same phase.
 */
export function kinemePhase(seedOffset, key) {
  const s = `${seedOffset ?? ''}:${key ?? ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The motion clock with a performer RATE (0 = frozen, 1 = real time, 4 = 4x).
 * Anchored, not `t * rate`: a rate change re-anchors at the current motion
 * time, so moving the rate never jumps. Rate never changed from 1 → the clock
 * IS the loop time, exactly. Loop time already stops on pause/hold/freeze.
 */
export function createKinemeClock() {
  let anchorLoop = 0;
  let anchorMotion = 0;
  let rate = 1;
  return {
    at(loopSec, nextRate = 1) {
      const t = Number(loopSec) || 0;
      const n = Number(nextRate);
      const r = Number.isFinite(n) ? Math.max(0, n) : 1;
      if (r !== rate) {
        anchorMotion += (t - anchorLoop) * rate;
        anchorLoop = t;
        rate = r;
      }
      return anchorMotion + (t - anchorLoop) * rate;
    },
    // #1367 — the anchors ARE the clock's whole state (the census: a deterministic fold of
    // recorded loop times, carried rather than re-derived). Plain numbers, JSON-safe.
    snapshotState() {
      return { anchorLoop, anchorMotion, rate };
    },
    restoreState(s) {
      if (!s || !Number.isFinite(s.anchorLoop) || !Number.isFinite(s.anchorMotion) || !Number.isFinite(s.rate))
        return false;
      anchorLoop = s.anchorLoop;
      anchorMotion = s.anchorMotion;
      rate = s.rate;
      return true;
    },
  };
}
