// parallaxDrift.js — travel kinemes P3 (#1576): parallax drift, surge's
// quiet sibling. A slow CONSTANT anchor drift proportional to zTier —
// foreground strata travel faster than ground — so calm scenes still
// feel like they're moving through space.
//
// This is NOT the #796 diorama parallax (gl/parallax.mjs): that one is
// a render-camera sway on contract instances, oscillating around home
// on the loop clock, behind layoutParams.parallax. This one is an
// ANCHOR drift in placement space, behind layoutParams
// .transportParallax, stepped on the locked spine-A clock like every
// travel driver — so it replays bit-for-bit, is censused through
// buildPlacements, and sheds with travel. The two compose; neither
// knows the other exists.
//
// The drift is a pure function of the scene's banked step count (the
// PATH precedent — no per-mark state): offset = RATE × amount × t ×
// zTier, along +x. Ground (zTier 0) never moves; each higher tier
// moves exactly one RATE faster. No wrap: at the full rate the top
// tier crosses a 1000 px canvas in ~2 minutes, and where a drifting
// mark wraps (if it ever should) is an edge-behaviour call this stage
// does not invent — the drift is linear and the suite pins it exactly.
//
// Shed law (P1's cut 1.6, shared): under the governor's travel shed
// the drift presents HOME and its clock FREEZES (the PATH shed's law),
// so a shed drift resumes where it left instead of jumping to where
// its clock would have been.
//
// Replay law: the store is resolver-owned (one per resolver, keyed by
// scene + seed, the travel store's pattern); steps bank from the frame
// time the resolver hands in at the locked step. Same seed + same
// inputs = same frames, bit for bit. Amount 0 never reaches this code
// (buildPlacements gates on it), so an off scene's store is never
// touched and its frame is bit-identical to the pre-#1576 pipeline.
import { TRAVEL_STEP_SEC, TRAVEL_MAX_STEPS } from './kineme.js';
import { registerCostTier } from './kernel/costRegistry.mjs';

/** Drift speed at amount 1, per zTier unit: 2.5 px per sim second. */
export const PARALLAX_DRIFT_PX_SEC = 2.5;

/** The drift offset in px for one mark. Pure; 0 at amount 0, t 0, or tier 0. */
export function parallaxDriftOffset(zTier, amount, tSec) {
  const tier = Number(zTier) || 0;
  const amt = Number(amount) || 0;
  const t = Number(tSec) || 0;
  if (!(tier > 0) || !(amt > 0) || !(t > 0)) return 0;
  return PARALLAX_DRIFT_PX_SEC * amt * t * tier;
}

/**
 * The parallax store: one per resolver (the caller owns it).
 * scenes: sceneId → { seed, acc, steps } — the step count IS the clock;
 * the drift is a pure function of it, so no per-mark state exists.
 */
export function createParallaxStore() {
  return { scenes: new Map() };
}

// Resolver mid-session snapshot (#1367, #1715): the store is accumulative, so a take beginning mid-session must carry
// it. Each scene is a flat record of finite numbers (seed, acc, steps); emitted in insertion order, exact.
const PARALLAX_FIELDS = ['seed', 'acc', 'steps'];
export function snapshotParallaxStore(store) {
  const scenes = [];
  if (store && store.scenes instanceof Map)
    for (const [id, sc] of store.scenes) scenes.push([id, PARALLAX_FIELDS.map((f) => sc[f])]);
  return { v: 1, scenes };
}
export function checkParallaxStoreSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || snap.v !== 1 || !Array.isArray(snap.scenes)) return false;
  for (const e of snap.scenes) {
    if (
      !Array.isArray(e) ||
      e.length !== 2 ||
      typeof e[0] !== 'string' ||
      !Array.isArray(e[1]) ||
      e[1].length !== PARALLAX_FIELDS.length
    )
      return false;
    if (!e[1].every((v) => Number.isFinite(v))) return false;
  }
  return true;
}
export function restoreParallaxStore(store, snap) {
  if (!store || !(store.scenes instanceof Map) || !checkParallaxStoreSnapshot(snap)) return false;
  store.scenes.clear();
  for (const [id, vals] of snap.scenes) {
    const sc = {};
    PARALLAX_FIELDS.forEach((f, i) => {
      sc[f] = vals[i];
    });
    store.scenes.set(id, sc);
  }
  return true;
}

/** Drop scenes the document no longer has (liveResolve's prune law). */
export function pruneParallaxStore(store, keepSceneIds) {
  if (!store || !(store.scenes instanceof Map)) return;
  for (const k of [...store.scenes.keys()]) if (!keepSceneIds.has(k)) store.scenes.delete(k);
}

/** A scene's drift record for tests/debug, or null when it never drifted. */
export function parallaxSceneSnapshot(store, sceneId) {
  const sc = store && store.scenes instanceof Map ? store.scenes.get(sceneId) : null;
  if (!sc) return null;
  return { seed: sc.seed, steps: sc.steps, tSec: sc.steps * TRAVEL_STEP_SEC };
}

const PARALLAX_BASE_X = new WeakMap();

/**
 * Stage-C applier for parallax drift: bank the frame's steps, then
 * fold each mark's zTier-proportional drift into x. Called in
 * buildPlacements after the transport pass, before surge.
 *
 * ctx: { seed, drift: {
 *   amount,   // 0..1 — recipe data (layoutParams.transportParallax)
 *   store,    // createParallaxStore() — caller-owned, required
 *   sceneId, frameMs, shed  // as applyTransport's travel input
 * } }
 *
 * Returns an undo restoring the cached x positions, or null when
 * nothing drifted (t = 0, shed, or every mark is ground/pinned).
 * still[k] marks (the artist's per-asset pin) never drift.
 */
export function applyParallaxDrift(soa, ctx, still = null) {
  if (!soa || !ctx) return null;
  const dr = ctx.drift;
  if (!dr || !dr.store || !(dr.store.scenes instanceof Map)) return null;
  const amount = Number(dr.amount);
  if (!(amount > 0)) return null;
  const seed = ctx.seed | 0;
  const sceneId = String(dr.sceneId ?? '');
  let sc = dr.store.scenes.get(sceneId);
  if (!sc) {
    sc = { seed, acc: 0, steps: 0 };
    dr.store.scenes.set(sceneId, sc);
  } else if (sc.seed !== seed) {
    sc.seed = seed;
    sc.acc = 0;
    sc.steps = 0;
  }

  // Shed: present home, clock frozen (no banking) — the PATH law.
  if (dr.shed) return null;

  const frameMs = Number(dr.frameMs);
  if (Number.isFinite(frameMs) && frameMs > 0) sc.acc += frameMs * 0.001;
  let stepsDue = Math.floor(sc.acc / TRAVEL_STEP_SEC);
  if (stepsDue > TRAVEL_MAX_STEPS) stepsDue = TRAVEL_MAX_STEPS;
  if (stepsDue > 0) {
    sc.acc -= stepsDue * TRAVEL_STEP_SEC;
    if (sc.acc > TRAVEL_STEP_SEC) sc.acc = 0;
    sc.steps += stepsDue;
  }

  const tSec = sc.steps * TRAVEL_STEP_SEC;
  if (!(tSec > 0)) return null;
  const n = soa.n | 0;
  let any = false;
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    if (parallaxDriftOffset(soa.zTier ? soa.zTier[k] : 0, amount, tSec) !== 0) {
      any = true;
      break;
    }
  }
  if (!any) return null;
  let base = PARALLAX_BASE_X.get(soa);
  if (!base || base.x.length < n) {
    base = { x: new Float64Array(n) };
    PARALLAX_BASE_X.set(soa, base);
  }
  for (let k = 0; k < n; k++) base.x[k] = soa.x[k];
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    soa.x[k] += parallaxDriftOffset(soa.zTier ? soa.zTier[k] : 0, amount, tSec);
  }
  return () => {
    for (let k = 0; k < n; k++) soa.x[k] = base.x[k];
  };
}

// The drift pass's declared cost, same doctrine as travel/flow and
// travel/path: tier 0 (structural — no GPU pass; marks ride the
// structural item pass), sheds by the governor's travel rung (cut
// 1.6). timeMs is the MEASURED resolver-CPU figure (drift present at
// the 800-mark cap, sandbox node 2026-10-20;
// engine/parallaxDrift.selfcheck.mjs re-measures it on every run).
registerCostTier('travel/parallax', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.006,
  notes:
    '#1576 P3 — parallax drift: zTier-proportional anchor drift as a pure function of the banked step count, resolver CPU; no GPU pass (marks ride the structural item pass). timeMs MEASURED sandbox CPU at the 800-mark cap (see block comment); sheds by the governor travel cut (1.6), never the effect ladder.',
});
