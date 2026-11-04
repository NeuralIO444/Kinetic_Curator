// app/src/engine/beastRoam.js — #1867 BEAST S4: the travelling home.
//
// The pin stops being a leash and becomes a heading. The body advances the way the real beast does: while a foot is in
// its flat stance phase it is planted against the ground and the body glides forward over it — locomotion IS the stance
// stroke. There is no other motion source: no nudge, no glide assist, no position lerp. The body's speed is the stance
// foot's backward speed (stance stroke ÷ stance time); a crank that stops is a beast that stands.
//
// Steering is DIFFERENTIAL PHASE between the legs' two banks (even / odd legs: the two sides of a real beast). A bank's
// crank phase is the integral of its crank rate; the heading is exactly
//
//     heading = (strideUnits / trackUnits) × (phaseA − phaseB)        (radians; phases in crank turns)
//
// so a turn is nothing but one bank's crank running ahead of the other's. A roam is a sequence of pieces over which both
// banks' rates are constant — pause (both 0), turn (rates 1 ± gain), straight (both 1) — and a piece integrates in closed
// form (a circular arc), so a route is a pure function of (seed, key, measures, params, t): replay byte-stable, no state.
//
// What the home is: the tile's placed position is the CENTRE of its range. A beast that wanders past `edge × radius`
// turns for home. Everything is in the beast's own frame — tile units, +x forward, +y toward its belly side — and the
// contract (creatureRig.expandBeast) lays it onto the canvas.

import { LINKAGE_CRANK_HZ } from './beastRig.js';

const TAU = Math.PI * 2;

/**
 * The tuning, ruled parameters and not buried constants (the feel gate is Matt's). Override any of them with
 * `doc.beastRoam = { turnGain: 0.8 }` or, in the live app, `window.__KC_BEAST_ROAM = { holdMax: 2 }` — see sanitizeRoam.
 */
export const BEAST_ROAM = Object.freeze({
  turnGain: 0.5, // a bank's crank-rate swing at full lock: rates are 1 ± gain (0 = it never turns, 1 = one bank stops)
  holdMin: 1.5, // heading persistence: a heading is held for this many crank turns at least…
  holdMax: 3.5, // …and at most (a turn happens, then the next heading is held)
  pauseChance: 0.25, // the odds that a segment opens with a pause, the crank at rest
  pauseMin: 0.5, // a pause lasts this many crank-turns of time at least…
  pauseMax: 1.5, // …and at most
  wander: 70, // a wander re-heading is within ± this many degrees of the current one
  radius: 150, // the range around home, tile units (~2.3 body lengths for the wild type)
  edge: 0.65, // past this fraction of the radius the beast turns for home
  trackUnits: 24, // the distance between the two banks, tile units: how hard a phase differential turns the body
  advance: 1, // the stance advance: 0 disables it (the beast walks in place — the proof that the gait is the motor)
  drive: 1, // the crank-rate multiplier (the DRIVE gene's reading)
});

const RANGE = Object.freeze({
  turnGain: [0, 1],
  holdMin: [0.25, 20],
  holdMax: [0.25, 40],
  pauseChance: [0, 1],
  pauseMin: [0, 10],
  pauseMax: [0, 20],
  wander: [0, 180],
  radius: [10, 1000],
  edge: [0.1, 1],
  trackUnits: [4, 100],
  advance: [0, 1],
  drive: [0.25, 2],
});

/** The defaults with `raw`'s numeric overrides laid over them, each clamped to its range; junk is ignored. */
export function sanitizeRoam(raw) {
  const out = { ...BEAST_ROAM };
  if (raw && typeof raw === 'object') {
    for (const [k, [lo, hi]] of Object.entries(RANGE)) {
      if (Number.isFinite(raw[k])) out[k] = Math.min(hi, Math.max(lo, raw[k]));
    }
  }
  if (out.holdMax < out.holdMin) out.holdMax = out.holdMin;
  if (out.pauseMax < out.pauseMin) out.pauseMax = out.pauseMin;
  return out;
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const u01 = (str) => hash32(str) / 4294967296;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Where a piece ends: closed-form integration of a constant speed along a constantly turning heading (an arc). */
function advance(s, v, w, tau) {
  const th = s.th + w * tau;
  if (Math.abs(w) < 1e-9) return { x: s.x + v * Math.cos(s.th) * tau, y: s.y + v * Math.sin(s.th) * tau, th };
  return { x: s.x + (v / w) * (Math.sin(th) - Math.sin(s.th)), y: s.y - (v / w) * (Math.cos(th) - Math.cos(s.th)), th };
}

const ROUTES = new Map(); // route key -> { pieces, spec } — derived, never snapshotted
const ROUTE_CAP = 48;
const PIECE_CAP = 40000;

/**
 * The route for a beast: its pieces so far, extended lazily as time asks for more.
 * spec = { seedKey, stride, params } — stride is the body's advance per crank turn, tile units (stance stroke ÷ duty).
 */
function routeOf(spec) {
  const p = spec.params;
  const key = `${spec.seedKey}|${spec.stride.toFixed(5)}|${JSON.stringify(p)}`;
  let r = ROUTES.get(key);
  if (!r) {
    if (ROUTES.size >= ROUTE_CAP) ROUTES.delete(ROUTES.keys().next().value);
    r = { pieces: [], segment: 0, end: { t: 0, x: 0, y: 0, th: 0, pA: 0, pB: 0 }, key };
    ROUTES.set(key, r);
  }
  return r;
}

function pushPiece(r, spec, dt, rA, rB) {
  const S = spec.stride * spec.params.advance;
  const e = r.end;
  const v = S * ((rA + rB) / 2);
  const w = (S / spec.params.trackUnits) * (rA - rB);
  const piece = { t0: e.t, dt, rA, rB, x0: e.x, y0: e.y, th0: e.th, pA0: e.pA, pB0: e.pB, v, w };
  const n = advance(e, v, w, dt);
  r.pieces.push(piece);
  r.end = { t: e.t + dt, x: n.x, y: n.y, th: n.th, pA: e.pA + rA * dt, pB: e.pB + rB * dt };
}

/** Generate the next segment: an optional pause, a turn toward the next heading, a straight hold. */
function extend(r, spec) {
  const p = spec.params;
  const hz = LINKAGE_CRANK_HZ * p.drive;
  const j = r.segment++;
  const u = (tag) => u01(`roam|${spec.seedKey}|${j}|${tag}`);
  if (j > 0 && u('pause') < p.pauseChance) {
    pushPiece(r, spec, (p.pauseMin + u('pausedur') * (p.pauseMax - p.pauseMin)) / hz, 0, 0);
    return;
  }
  const e = r.end;
  const S = spec.stride * p.advance;
  const away = Math.hypot(e.x, e.y) > p.edge * p.radius;
  const target = away
    ? Math.atan2(-e.y, -e.x) + (u('jit') - 0.5) * 0.6
    : e.th + (u('turn') * 2 - 1) * ((p.wander * Math.PI) / 180);
  const delta = wrap(target - e.th);
  const wFull = (S / p.trackUnits) * 2 * p.turnGain * hz; // rad/s at full lock
  if (Math.abs(delta) > 0.02 && wFull > 1e-9) {
    const s = Math.sign(delta);
    pushPiece(r, spec, Math.abs(delta) / wFull, hz * (1 + p.turnGain * s), hz * (1 - p.turnGain * s));
  }
  // the hold never carries the beast past the edge of its range: it is cut where the straight line meets the circle
  // (a beast at the edge then turns for home at the next segment — the dish bounds it, the gait still does the walking)
  let dt = (p.holdMin + u('hold') * (p.holdMax - p.holdMin)) / hz;
  const c = r.end;
  const v = S;
  if (v > 1e-9) {
    const dx = Math.cos(c.th);
    const dy = Math.sin(c.th);
    const b = c.x * dx + c.y * dy;
    const k = c.x * c.x + c.y * c.y - p.radius * p.radius; // > 0 once outside the range
    const reach = k > 0 ? 0 : -b + Math.sqrt(b * b - k); // the straight-line distance to the circle
    dt = Math.min(dt, reach / (v * hz));
  }
  if (dt > 1e-6) pushPiece(r, spec, dt, hz, hz);
  else pushPiece(r, spec, 1 / hz, 0, 0); // at the edge, facing out: stand a beat, then turn for home
}

/**
 * The beast's state at time t (seconds, ≥ 0): its place and heading in its home frame (tile units, radians), and each
 * bank's accumulated crank phase (turns). Pure in (spec, t).
 * @returns {{x:number, y:number, heading:number, phaseA:number, phaseB:number, moving:boolean}}
 */
export function roamAt(spec, t) {
  const tt = Math.max(0, Number(t) || 0);
  const r = routeOf(spec);
  while (r.end.t <= tt && r.pieces.length < PIECE_CAP) extend(r, spec);
  let lo = 0;
  let hi = r.pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.pieces[mid].t0 <= tt) lo = mid;
    else hi = mid - 1;
  }
  const pc = r.pieces[lo];
  const tau = Math.min(tt - pc.t0, pc.dt);
  const n = advance({ x: pc.x0, y: pc.y0, th: pc.th0 }, pc.v, pc.w, tau);
  return {
    x: n.x,
    y: n.y,
    heading: n.th,
    phaseA: pc.pA0 + pc.rA * tau,
    phaseB: pc.pB0 + pc.rB * tau,
    moving: pc.rA + pc.rB > 0,
  };
}
