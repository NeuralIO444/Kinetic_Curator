// stimuliAuto.mjs — one tap to a working STIMULI routing (#980).
//
// Pure. The panel listens, folds peaks into a snapshot, and asks this module
// what to route. Dead bands (BAND AIR with no signal) are never picked while
// something else has energy.
//
// Silence is a NO-OP (#980: "if audio is off or the signal is silent, say so
// plainly, change nothing"): nothing above the floor returns `routes: null`,
// and the panel reports it instead of arming anything. Same for RETUNE on an
// empty table.
//
// A retune pass keeps live routes and only rewrites dead inputs or ~0 depths.

import { COARSE_INPUTS, BAND_INPUTS, evaluateRoutes } from './audioRoutes.mjs';

/** Below this, an input is silent for setup and for the retune watch. */
export const ENERGY_FLOOR = 0.04;

/** A route depth this close to 0 cannot move the canvas. */
export const DEPTH_FLOOR = 0.001;

/** Visible targets, in the order a starter assigns them (#980 decision 4:
 * scale, alpha, squash, breath, light, accum — `color.hue`, `clock.kinemeRate`
 * and glow are not starter targets). At most STARTER_MAX routes are built. */
export const STARTER_TARGETS = Object.freeze([
  'render.scale', 'render.alpha', 'render.squash', 'render.breath',
  'light.intensity', 'render.accum',
]);

/** A starter fills at most one slot per fair target (#980 decision 4 lists
 * six, so the cap is six — the draft spec's "≤ 5" was a suggestion, and a cap
 * below the target count would leave one of them unreachable). */
export const STARTER_MAX = 6;

/** Depths in the target's natural units — enough to see, inside the clamp. */
export const STARTER_DEPTH = Object.freeze({
  'render.scale': 0.45,
  'render.alpha': 16,
  'render.squash': 0.4,
  'render.breath': 0.035,
  'light.intensity': 0.35,
  'render.accum': 6,
});

const BAND_KEYS = Object.freeze(['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air']);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** Energy of a route input against a listen snapshot. */
export function inputEnergy(id, snap) {
  if (!snap || !id) return 0;
  if (id.startsWith('band.')) return num(snap.bands?.[id.slice(5)]);
  if (id === 'level') return num(snap.level ?? snap.rms);
  if (id === 'beat') return num(snap.beat ?? snap.beatPulse);
  return num(snap[id]);
}

/**
 * Fold a live read into a peak snapshot. Coarse fields and meter bands are
 * independent: a missing tap must not wipe a peak already heard.
 */
export function absorbPeaks(peaks, snap) {
  const next = peaks ? {
    beat: num(peaks.beat), level: num(peaks.level), bass: num(peaks.bass),
    mid: num(peaks.mid), treble: num(peaks.treble),
    bands: { ...(peaks.bands || {}) },
  } : { beat: 0, level: 0, bass: 0, mid: 0, treble: 0, bands: {} };
  if (!snap) return next;
  next.beat = Math.max(next.beat, num(snap.beat ?? snap.beatPulse));
  next.level = Math.max(next.level, num(snap.level ?? snap.rms));
  next.bass = Math.max(next.bass, num(snap.bass));
  next.mid = Math.max(next.mid, num(snap.mid));
  next.treble = Math.max(next.treble, num(snap.treble));
  for (const k of BAND_KEYS) next.bands[k] = Math.max(num(next.bands[k]), num(snap.bands?.[k]));
  return next;
}

/** Build a snapshot from the store's coarse bands plus the meter tap. */
export function snapshotFromReads({ audioBands, beatPulse, meter } = {}) {
  return absorbPeaks(null, {
    beat: beatPulse,
    level: audioBands?.rms,
    bass: audioBands?.bass,
    mid: audioBands?.mid,
    treble: audioBands?.treble,
    bands: meter || undefined,
  });
}

function rank(snap) {
  const coarse = COARSE_INPUTS.map((id) => ({ id, energy: inputEnergy(id, snap), coarse: true }));
  const bands = BAND_INPUTS.map((id) => ({ id, energy: inputEnergy(id, snap), coarse: false }));
  return [...coarse, ...bands].sort((a, b) => (
    b.energy - a.energy || (a.coarse === b.coarse ? 0 : a.coarse ? -1 : 1)
  ));
}

function route(input, target) {
  return { input, target, depth: STARTER_DEPTH[target] };
}

/**
 * Starter table from a listen snapshot. Silence is a no-op: nothing above the
 * floor returns `routes: null`, so the panel says so and changes nothing.
 * @returns {{ routes: Array|null, heard: boolean, picked: string[] }}
 */
export function autoSetupRoutes(snap) {
  const hot = rank(snap).filter((r) => r.energy >= ENERGY_FLOOR);
  if (hot.length === 0) return { routes: null, heard: false, picked: [] };
  const inputs = hot.map((r) => r.id).slice(0, STARTER_MAX);
  const routes = [];
  if (inputs.length === 1) {
    // One hot input on three axes, all of them fair game per decision 4.
    for (const target of ['render.scale', 'render.alpha', 'render.squash']) routes.push(route(inputs[0], target));
  } else {
    inputs.forEach((input, i) => routes.push(route(input, STARTER_TARGETS[i])));
  }
  return { routes, heard: true, picked: inputs.slice(0, routes.length) };
}

/** Indexes whose input is silent, or whose depth cannot move anything. */
export function deadRouteIndexes(routes, snap) {
  if (!Array.isArray(routes)) return [];
  return routes.reduce((out, r, i) => {
    if (!r) return out;
    const silent = inputEnergy(r.input, snap) < ENERGY_FLOOR;
    const mute = Math.abs(num(r.depth)) < DEPTH_FLOOR;
    if (silent || mute) out.push(i);
    return out;
  }, []);
}

/**
 * Keep routes that are already moving. Silent inputs take the hottest unused
 * input; a ~0 depth on a live input is raised to the starter depth.
 * @returns {{ routes: Array, changed: boolean, fixed: number, note: string }}
 */
export function retuneRoutes(routes, snap) {
  const table = Array.isArray(routes) ? routes.map((r) => ({ ...r })) : [];
  if (!table.length) {
    const built = autoSetupRoutes(snap);
    // No signal: RETUNE changes nothing either (#980 — say so, don't arm).
    if (!built.heard) return { routes: null, changed: false, fixed: 0, note: 'no signal — turn the mic on and play something' };
    return { routes: built.routes, changed: true, fixed: built.routes.length, note: 'armed from the live input' };
  }
  const used = new Set(table.map((r) => r.input));
  const spare = rank(snap).filter((r) => r.energy >= ENERGY_FLOOR && !used.has(r.id));
  let fixed = 0;
  const next = table.map((r) => {
    const silent = inputEnergy(r.input, snap) < ENERGY_FLOOR;
    const mute = Math.abs(num(r.depth)) < DEPTH_FLOOR;
    if (!silent && !mute) return r;
    if (silent) {
      const donor = spare.shift();
      if (!donor) return r;
      used.delete(r.input);
      used.add(donor.id);
      fixed += 1;
      const depth = mute ? (STARTER_DEPTH[r.target] ?? r.depth) : r.depth;
      return { ...r, input: donor.id, depth };
    }
    fixed += 1;
    return { ...r, depth: STARTER_DEPTH[r.target] ?? 0.2 };
  });
  const note = fixed
    ? `retuned ${fixed} dead ${fixed === 1 ? 'route' : 'routes'}`
    : 'routes already moving';
  return { routes: next, changed: fixed > 0, fixed, note };
}

/** True when the starter actually moves scale under a typical master depth. */
export function starterMovesScale(routes, snap, master = { depth: 0.65, scaleMod: 0.45, alphaMod: 0.25 }) {
  const out = evaluateRoutes({
    beatPulse: inputEnergy('beat', snap),
    rms: inputEnergy('level', snap),
    bass: inputEnergy('bass', snap),
    mid: inputEnergy('mid', snap),
    treble: inputEnergy('treble', snap),
  }, master, routes, snap?.bands || null);
  // The starter's own targets (#980 decision 4): scale, alpha, squash, breath,
  // light, accum. glow and hue are not starter targets, so they are not read.
  return out.scaleMul > 1.02 || out.alphaBoost > 0.5
    || (out.squash ?? 0) > 0.05 || (out.accum ?? 0) > 0.5 || (out.sun ?? 0) > 0.05;
}
