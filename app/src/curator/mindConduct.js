// mindConduct.js — #1483 trio audio direction, stage 1: what the trio may do to the audio show. Pure, fail-closed.
//
//   Davis conducts: he proposes one edit to the route table (add / remove / retarget / depth), inside the target's clamps
//   and the 16-route cap, and it lands on a phrase boundary (4 bars), at most one per phrase.
//   LOIS judges: a show that stays pinned and flat is a failed show (BURN), and Davis re-rolls to the next preset.
//   The artist is sovereign: a target the artist touched this session is owned, and a proposal against it is dropped.
//   Boldness is tier-gated (the engagement tier, Mind 3): tier 1 makes no route edits.
//
// Nothing here touches the bus, the clock or the store. mindContract validates a reply's `route`; mindRules asks
// davisRoute / flatShow; the live driver (a later PR) applies what passes the gate and records the delta.
import { ROUTE_INPUTS, ROUTE_TARGETS, MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { routeDepthRange } from '../data/audioRoutes.js';

export const PHRASE_BARS = 4;
export const ROUTE_OPS = Object.freeze(['add', 'remove', 'retarget', 'depth']);
/** Which ops each engagement tier may make (Mind 3 tiers: t1 faces only · t2 depth nudges · t3 add/retarget · t4 all). */
export const TIER_OPS = Object.freeze({
  t1: Object.freeze([]),
  t2: Object.freeze(['depth']),
  t3: Object.freeze(['depth', 'add', 'retarget']),
  t4: Object.freeze(['depth', 'add', 'retarget', 'remove']),
});
/** A persona backs off for this many bars once the artist has reverted its edits BACKOFF_REVERTS times. */
export const BACKOFF_REVERTS = 3;
export const BACKOFF_BARS = 32;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasTarget = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, t);
const hasInput = (i) => typeof i === 'string' && ROUTE_INPUTS.includes(i);
// out of range is malformed, not clamped: an untrusted reply that says 90 has told us something is wrong
const depthIn = (target, d) => {
  if (!Number.isFinite(d)) return null;
  const { min, max } = routeDepthRange(target);
  return d >= min && d <= max ? d : null;
};

/**
 * A route edit as a clean object, or null when malformed. `undefined` in -> `undefined` out (nothing said).
 *   { op:'add', input, target, depth } · { op:'remove', input, target } · { op:'retarget', input, from, to } ·
 *   { op:'depth', input, target, depth }
 */
export function validateRouteOp(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null; // an explicit "no edit": the caller treats null as nothing, never as malformed
  if (!isObj(raw) || !ROUTE_OPS.includes(raw.op) || !hasInput(raw.input)) return false;
  if (raw.op === 'retarget') return hasTarget(raw.from) && hasTarget(raw.to) && raw.from !== raw.to ? { op: 'retarget', input: raw.input, from: raw.from, to: raw.to } : false;
  if (!hasTarget(raw.target)) return false;
  if (raw.op === 'remove') return { op: 'remove', input: raw.input, target: raw.target };
  const depth = depthIn(raw.target, Number(raw.depth));
  return depth === null ? false : { op: raw.op, input: raw.input, target: raw.target, depth };
}

/** The targets an edit would touch (for the sovereignty check). */
export function opTargets(op) {
  if (!op) return [];
  return op.op === 'retarget' ? [op.from, op.to] : [op.target];
}

const pairIndex = (table, input, target) => table.findIndex((r) => r && r.input === input && r.target === target);

/**
 * Apply one edit to a table. Pure. Returns { routes, delta } or null when it cannot apply (a missing or duplicate pair, a
 * full table). `delta` is what a take records: { op, before, after } where before/after are the affected route or null.
 */
export function applyRouteOp(table, op) {
  if (!Array.isArray(table) || !op) return null;
  const routes = table.map((r) => ({ input: r.input, target: r.target, depth: r.depth }));
  if (op.op === 'add') {
    if (routes.length >= MAX_ROUTES || pairIndex(routes, op.input, op.target) >= 0) return null;
    const after = { input: op.input, target: op.target, depth: op.depth };
    routes.push(after);
    return { routes, delta: { op: 'add', before: null, after } };
  }
  if (op.op === 'remove') {
    const i = pairIndex(routes, op.input, op.target);
    if (i < 0) return null;
    const [before] = routes.splice(i, 1);
    return { routes, delta: { op: 'remove', before, after: null } };
  }
  if (op.op === 'retarget') {
    const i = pairIndex(routes, op.input, op.from);
    if (i < 0 || pairIndex(routes, op.input, op.to) >= 0) return null;
    const before = { ...routes[i] };
    const { min, max } = routeDepthRange(op.to);
    routes[i] = { input: op.input, target: op.to, depth: Math.min(max, Math.max(min, routes[i].depth)) }; // the new target's own ceiling
    return { routes, delta: { op: 'retarget', before, after: routes[i] } };
  }
  if (op.op === 'depth') {
    const i = pairIndex(routes, op.input, op.target);
    if (i < 0) return null;
    const before = { ...routes[i] };
    routes[i] = { ...routes[i], depth: op.depth };
    return { routes, delta: { op: 'depth', before, after: routes[i] } };
  }
  return null;
}

/** The next bar a proposal made at `bar` may land on: the phrase boundary at or after it. */
export function landingBar(bar) {
  if (!Number.isInteger(bar)) return null;
  const r = ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  return r === 0 ? bar : bar + (PHRASE_BARS - r);
}

export const phraseOf = (bar) => Math.floor(bar / PHRASE_BARS);

// ── Davis's rules-backend presets ────────────────────────────────────────────────────────────────────────────────────
// Today the mids and treble bands drive nothing by default, so wiring them somewhere musical is his opening job. Each
// candidate is a route to ADD; `bpm` (optional) is the tempo range it suits. Depths are inside every target's range
// (the selfcheck proves it). Deterministic: no clock, no random.
export const PRESETS = Object.freeze({
  low: Object.freeze([
    { input: 'band.mids', target: 'render.glow', depth: 0.3 },
    { input: 'band.air', target: 'render.breath', depth: 0.04 },
    { input: 'band.pres', target: 'render.alpha', depth: 6 },
  ]),
  mid: Object.freeze([
    { input: 'band.mids', target: 'render.scale', depth: 0.15 },
    { input: 'band.pres', target: 'render.glow', depth: 0.4 },
    { input: 'band.air', target: 'render.hue', depth: 20 },
    { input: 'band.edge', target: 'render.kineme', depth: 0.6, bpm: [100, 220] },
  ]),
  high: Object.freeze([
    { input: 'band.edge', target: 'render.squash', depth: 0.3 },
    { input: 'band.air', target: 'render.kineme', depth: 1, bpm: [110, 220] },
    { input: 'band.pres', target: 'render.scale', depth: 0.25 },
    { input: 'band.mids', target: 'clock.kinemeRate', depth: 1.5, bpm: [100, 220] },
    { input: 'band.air', target: 'render.glow', depth: 0.5 },
  ]),
});
export const ENERGY_LEVELS = Object.freeze(['low', 'mid', 'high']);

/**
 * Davis's rules-backend conducting. Pure.
 * @param show  the context's `show` block (mindContext): { energy, bpm, silent, routes:[{input,target,depth}], owned:[], flatBars, ... }
 * @param seed  the decision seed (document seed x bar), so the same dish conducts the same way
 * @returns an add op, or null (nothing worth doing: silence, a full table, every candidate already wired or owned)
 */
export function davisRoute(show, seed = 0) {
  if (!show || show.silent) return null;
  const level = ENERGY_LEVELS.includes(show.energy) ? show.energy : 'mid';
  const table = Array.isArray(show.routes) ? show.routes : [];
  if (table.length >= MAX_ROUTES) return null;
  const owned = new Set(Array.isArray(show.owned) ? show.owned : []);
  const bpm = Number.isFinite(show.bpm) ? show.bpm : null;
  const fits = (c) => !c.bpm || bpm === null || (bpm >= c.bpm[0] && bpm <= c.bpm[1]);
  // a flat show re-rolls: every PHRASE_BARS flat bars moves to the next preset level, then wraps
  const rerolls = Math.floor((Number(show.flatBars) || 0) / PHRASE_BARS);
  const order = ENERGY_LEVELS.indexOf(level);
  const pool = [];
  for (let k = 0; k < ENERGY_LEVELS.length; k++) {
    const lvl = ENERGY_LEVELS[(order + rerolls + k) % ENERGY_LEVELS.length];
    for (const c of PRESETS[lvl]) if (fits(c)) pool.push(c);
  }
  const start = pool.length ? (seed >>> 0) % Math.min(pool.length, PRESETS[ENERGY_LEVELS[(order + rerolls) % 3]].length) : 0;
  for (let k = 0; k < pool.length; k++) {
    const c = pool[(start + k) % pool.length];
    if (owned.has(c.target) || pairIndex(table, c.input, c.target) >= 0) continue;
    return { op: 'add', input: c.input, target: c.target, depth: c.depth };
  }
  return null;
}

// ── LOIS: is the show flat? ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * The show is flat when the sound is on, and either every band has stopped moving over a phrase (a held tone, a pinned
 * signal) or the bands are all pinned near the top. Silence is not a failed show. Pure state machine fed one sample a bar.
 */
export function createFlatness({ windowBars = PHRASE_BARS, eps = 0.03, minLevel = 0.05, pinned = 0.92 } = {}) {
  const rows = [];
  let flatBars = 0;
  const unit = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const reading = () => {
    if (rows.length === 0) return { level: 0, spread: 0, full: false };
    const n = rows[0].length;
    let level = 0; let spread = 0;
    for (let b = 0; b < n; b++) {
      let mean = 0;
      for (const r of rows) mean += r[b];
      mean /= rows.length;
      let v = 0;
      for (const r of rows) v += (r[b] - mean) * (r[b] - mean);
      level += mean; spread += Math.sqrt(v / rows.length);
    }
    return { level: level / n, spread: spread / n, full: rows.length >= windowBars };
  };
  return {
    /** One sample per bar: an array of band levels (any length), or null for no audio (clears the run). */
    push(bands) {
      if (!Array.isArray(bands) || bands.length === 0) { rows.length = 0; flatBars = 0; return false; }
      rows.push(bands.map(unit));
      if (rows.length > windowBars) rows.shift();
      const r = reading();
      const flat = r.full && r.level >= minLevel && (r.spread < eps || r.level > pinned);
      flatBars = flat ? flatBars + 1 : 0;
      return flat;
    },
    flatBars: () => flatBars,
    reading,
    reset() { rows.length = 0; flatBars = 0; },
  };
}

// ── sovereignty, the rate limit and the backoff ──────────────────────────────────────────────────────────────────────
/**
 * The conductor's ledger. Pure state, no clock: every call is told the bar.
 *   touch(targets)          the artist acted on these targets: they are owned for the session
 *   consider(op, {bar,tier}) -> { ok: true, landBar } | { ok: false, reason: 'tier'|'owned'|'rate'|'cooldown'|'malformed' }
 *   commit(landBar)          an edit landed in that phrase
 *   revert(bar)              the artist undid / reverted a persona edit: BACKOFF_REVERTS of them start a cool-down
 */
export function createConductor() {
  const owned = new Set();
  const phrases = new Set();
  let reverts = 0;
  let coolUntil = -Infinity;
  return {
    touch(targets) { for (const t of Array.isArray(targets) ? targets : [targets]) if (hasTarget(t)) owned.add(t); },
    owned: () => [...owned].sort(),
    isOwned: (t) => owned.has(t),
    consider(op, { bar, tier } = {}) {
      if (!op || !ROUTE_OPS.includes(op.op) || !Number.isInteger(bar)) return { ok: false, reason: 'malformed' };
      if (!(TIER_OPS[tier] || []).includes(op.op)) return { ok: false, reason: 'tier' };
      if (bar < coolUntil) return { ok: false, reason: 'cooldown' };
      if (opTargets(op).some((t) => owned.has(t))) return { ok: false, reason: 'owned' };
      const landBar = landingBar(bar);
      if (phrases.has(phraseOf(landBar))) return { ok: false, reason: 'rate' };
      return { ok: true, landBar };
    },
    commit(landBar) { if (Number.isInteger(landBar)) phrases.add(phraseOf(landBar)); },
    revert(bar) {
      reverts++;
      if (reverts >= BACKOFF_REVERTS && Number.isInteger(bar)) { coolUntil = bar + BACKOFF_BARS; reverts = 0; }
    },
    cooling: (bar) => bar < coolUntil,
    reset() { owned.clear(); phrases.clear(); reverts = 0; coolUntil = -Infinity; },
  };
}
