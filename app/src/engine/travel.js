// travel.js — TRAVEL KINEMES: marks that leave home and come back (#1573 spike → #1574 P1).
//
// The diagnosis this lane answers: every KC-1 motion was an oscillator around a fixed anchor (applyRhythm is capped
// at ±0.8% of the small dimension, the drivers at ±2%), so marks read as trapped in Jell-O. Travel gives a mark an
// OFFSET + VELOCITY of its own, integrated on a locked step, and a LEASH back to its placed position (HOME).
//
// Contract (#1574):
//   - Per-instance sim state { ox, oy, vx, vy, … } lives in a resolver-owned store keyed by scene identity (the
//     stratum id) + seed + canvas, then instance index. It survives placement rebuilds; base placement = HOME.
//   - Integration on a locked step (TRAVEL_STEP), accumulated from loop time (high-water: a rolled-back frame never
//     steps backwards, a frozen one never banks time). Same seed + same step count = same positions, bit for bit.
//   - The leash: no home force inside radius L; outside it a slightly under-damped spring pulls back — the
//     overshoot on return IS the follow-through (the anime timing law, Matt 2026-10-14).
//   - transport 'still' (or leash 0, or flow 0) is a hard gate: the applier returns null and touches nothing, so
//     the SoA is bit-identical to a build without travel.
//
// Pure module (no React, no store, no GL). The store is plain data so a resolver snapshot can carry it (#1367).
// Deterministic: integer hashes only, no Math.random, no wall clock.

import { registerCostTier } from './kernel/costRegistry.mjs';

// #1574 — the cost tier, declared at the registration site (the house pattern). Tier 0 on the GPU ladder: travel
// adds NO pass, shader, target or byte — it moves instance positions the structural item pass already draws. Its
// real cost is CPU, measured and priced where the governor reads it: data/quality.js TRAVEL_BUDGETS (0.885 µs per
// traveller-step, 0.354 ms at the 400-traveller desktop cap) and the governor's own travel rung, which sheds it
// FIRST (hooks/governorCuts.js cut 1.75) — never this registry's tier ladder.
registerCostTier('engine/travel', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0,
  notes: '#1574 travel kinemes: no GPU pass (positions only, inside the structural item pass). CPU: 0.885 us per traveller-step measured (sandbox node, FLOW, 400 travellers: mean 0.354 ms, p95 0.53 ms); capped by TRAVEL_BUDGETS (desktop 400 / iPad-class 250, pending device bench) and shed first by the governor travel rung (1 -> 1/2 -> 1/4 -> home).',
});

/** The locked integration step (spine A's 60 Hz). */
export const TRAVEL_STEP = 1 / 60;
const STEP_TICKS = 1000; // the clock bank's integer unit is 1/60 ms, so one TRAVEL_STEP is exactly 1000 ticks
/** At most this many steps per presented frame (the loop's 50 ms dt clamp ⇒ 3). Never bank a spiral of death. */
export const TRAVEL_MAX_STEPS = 4;

/**
 * The layoutParams transport modes. 'still' is today's behaviour exactly; 'flow' and 'path' are the two transports;
 * 'auto' (#1575, the default for a new scene) lets each mark's FAMILY declare its transport (familyTransport).
 */
export const TRANSPORT_MODES = Object.freeze(['auto', 'still', 'flow', 'path']);
/** #1575 — the PATH families: the anchor as a pure function of (t, seed, params). */
export const PATH_KINDS = Object.freeze(['orbit', 'spiral', 'sweep', 'lissajous']);

// ── family defaults (#1575 Q1, RULED by Matt 2026-10-14) ────────────────────────────────────────────────────────
// Linework and glyphs roam by default; heavy solids anchor. The artist's per-stratum mode overrides (the #1434
// pattern: defaults ship ON, the override tames). Following data/regionDefaults.js's discipline, a family earns a
// default by being NAMED here, not by analogy — everything unnamed is still (silence is a valid state):
//   linework  → FLOW: hairlines drift along the shared field, the medium they read best in
//   glyphs    → PATH: letters and pictograms (tags 'glyph' / 'letter') travel the stratum's path family
//   heavy solids (density 'solid' + weight 'heavy'), and every other family → still
// A heavy solid that is also tagged a glyph anchors: the anchor rule wins, as the ruling words it.
const FAMILY_CACHE = new WeakMap();
/** The transport a mark's asset declares by family: 'flow' | 'path' | 'still'. Pure, cached per asset object. */
export function familyTransport(asset) {
  if (!asset || typeof asset !== 'object') return 'still';
  const hit = FAMILY_CACHE.get(asset);
  if (hit) return hit;
  let mode = 'still';
  const tags = Array.isArray(asset.tags) ? asset.tags : [];
  const heavySolid = asset.density === 'solid' && asset.weight === 'heavy';
  if (!heavySolid) {
    if (asset.category === 'linework') mode = 'flow';
    else if (tags.includes('glyph') || tags.includes('letter')) mode = 'path';
  }
  FAMILY_CACHE.set(asset, mode);
  return mode;
}

// ── FLOW constants (the #1573 spike's v1 numbers — the feel test Matt kept, 2026-10-16) ─────────────────────────
// Distances are fractions of the smaller canvas dimension m; times in seconds.
/** transportFlow 0.5 ⇒ the spike's cruise (0.11·m per second). */
export const FLOW_CRUISE_AT_1 = 0.22;
const STEER_TAU = 0.28; // velocity eases toward the flow target: ease-in ⇒ arcs, never a straight CG line
const HOLD_TAU = 0.07; // a held extreme: velocity dies fast, the mark stays put
const SPRING_HZ = 0.85; // leash spring natural frequency
const ZETA = 0.38; // < 1 ⇒ slight overshoot on arrival (follow-through)
const ANTIC_S = 0.2; // anticipation: a short pull AGAINST the coming direction before departure
const ANTIC_BACK = 0.45; // …at this fraction of cruise
const ANTIC_TAU = 0.09;
const TRAVEL_S = [1.4, 3.0]; // a travel segment's length
const HOLD_S = [0.35, 0.95]; // a held extreme's length
const FLOW_FREQ = 2.5; // noise cycles across the canvas (the rhythm layer's scale)
const FLOW_TIME = 0.12; // noise z advance per second of travel time
const CURL_EPS = 0.5;

// Settle: a mark that stops travelling (mode off, budget withdrawn, governor shed) glides home on the same spring
// with a zero-radius leash, and is dropped — exactly home — once it is there and at rest.
const SETTLE_HZ = 0.42; // softer than the leash: going home is a glide with a small follow-through, never a snap
const SETTLE_ZETA = 0.62;
const SETTLE_EPS_PX = 0.05;
const SETTLE_EPS_V = 0.5; // px/s

const PH_ANTIC = 0;
const PH_TRAVEL = 1;
const PH_HOLD = 2;
const PH_SETTLE = 3;

// ── integer hashing (sine-free, the house discipline) ───────────────────────────────────────────────────────────
function mix32(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** [0,1) from (seed, index, salt). Pure integer arithmetic. */
export function travelHash(seed, index, salt) {
  return mix32(mix32((seed | 0) ^ 0x9e3779b9) ^ Math.imul((index | 0) + 1, 0x27d4eb2f) ^ Math.imul((salt | 0) + 7, 0x165667b1)) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp01 = (v) => Math.min(1, Math.max(0, num(v)));

// ── the traveller budget (Q2, RULED by Matt 2026-10-20) ─────────────────────────────────────────────────────────
// Governor-selected within a device-class cap: the governor picks the scene's travel amount, bounded by a hard
// per-device-class cap (data/quality.js TRAVEL_BUDGETS — the #1433 pattern); the author sets the CEILING
// (transportCeiling), never the amount. The governor's travel rung steps through these fractions; the last one is
// zero — every velocity dies, every mark settles home, and the output is exactly today's before micro-motion or
// quality is touched (the travel-first shed, #1574).
export const TRAVEL_SHED_FRACTIONS = Object.freeze([1, 0.5, 0.25, 0]);
export const TRAVEL_SHED_MAX = TRAVEL_SHED_FRACTIONS.length - 1;

/**
 * How many marks of this stratum may travel this frame: the author's ceiling, bounded by the device-class cap
 * (absent: no cap — stills, census, exports), scaled by the governor's shed level.
 */
export function travelBudget(ceiling, deviceCap = null, shed = 0) {
  const c = Math.max(0, Math.floor(num(ceiling)));
  const cap = deviceCap === null || deviceCap === undefined || !Number.isFinite(Number(deviceCap)) ? c : Math.max(0, Math.floor(Number(deviceCap)));
  const level = Math.min(TRAVEL_SHED_MAX, Math.max(0, Math.floor(num(shed))));
  return Math.floor(Math.min(c, cap) * TRAVEL_SHED_FRACTIONS[level]);
}

// ── params ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A stratum's travel params from its layoutParams, resolved to real units. `active` is false when the hard gate
 * holds (still mode, no leash, no flow): nothing is computed and nothing is touched.
 */
export function travelParams(layoutParams, W, H, { deviceCap = null, shed = 0 } = {}) {
  const lp = layoutParams || {};
  const m = Math.min(num(W), num(H));
  const mode = TRANSPORT_MODES.includes(lp.transport) ? lp.transport : 'still';
  const pathKind = PATH_KINDS.includes(lp.transportPath) ? lp.transportPath : 'orbit';
  // #1575 Q4 (RULED 2026-10-20): the leash is PER STRATUM — it lives in this stratum's own layoutParams, so the
  // bottom exposure can stay tight while the top roams, or the reverse.
  const leash = Math.max(0, num(lp.transportLeash));
  const flow = clamp01(lp.transportFlow);
  const budget = travelBudget(lp.transportCeiling ?? DEFAULT_CEILING, deviceCap, shed);
  const active = m > 0 && mode !== 'still' && leash > 0 && flow > 0 && budget > 0;
  // #1576 — parallax drift and the surge depth ride the same rung: the travel-first shed's last level (home) and
  // reduced motion (the caller) withdraw them with the transports.
  const home = Math.floor(num(shed)) >= TRAVEL_SHED_MAX;
  const parallax = home || !(m > 0) ? 0 : clamp01(lp.transportParallax);
  const surge = home || !(m > 0) ? 0 : clamp01(lp.transportSurge);
  return {
    active, mode, pathKind, m, L: leash * m, cruise: flow * FLOW_CRUISE_AT_1 * m, flow, budget,
    rate: flow * PATH_RATE_AT_1, // PATH: segments per second
    parallax, surge, zTiers: Math.max(1, Math.floor(num(lp.zTiers, 1))),
  };
}
/** The author's default ceiling: the desktop cap (data/quality.js), so a fresh scene travels at full measure. */
export const DEFAULT_CEILING = 400;

// ── the store ───────────────────────────────────────────────────────────────────────────────────────────────────
/** One store per resolver: stratum id → layer state. */
export function createTravelStore() {
  return { layers: new Map() };
}

function freshLayer(key) {
  // stepN: locked steps taken since the stratum's scene began (travel time = stepN · TRAVEL_STEP).
  // stepBase: stepN before this frame's steps (derived per frame, never snapshotted).
  return { key, lastMs: null, acc: 0, stepN: 0, stepBase: 0, steps: 0, marks: new Map(), sel: null, surge: null };
}

/**
 * The layer state for a stratum, re-created when its identity key (seed + canvas) changes: a reseed is a new
 * scene, and a mark's offset from a home that no longer exists means nothing.
 */
export function travelLayer(store, layerId, seed, W, H) {
  const key = `${seed >>> 0}|${num(W)}x${num(H)}`;
  let L = store.layers.get(layerId);
  if (!L || L.key !== key) { L = freshLayer(key); store.layers.set(layerId, L); }
  return L;
}

/** Drop strata gone from the document (the resolver's prune). */
export function pruneTravelStore(store, aliveIds) {
  for (const k of [...store.layers.keys()]) if (!aliveIds.has(k)) store.layers.delete(k);
}

/**
 * Advance the layer's fixed-step clock to loop time `nowMs` and return how many steps this frame owns (0..MAX).
 * High-water: a backward jump (a rolled-back frame) holds, never rewinds; a frozen frame (slowRender) credits
 * nothing, and its time is not banked for the thaw. The first call only anchors the clock.
 */
export function advanceTravelClock(layer, nowMs, frozen = false) {
  const now = num(nowMs);
  layer.stepBase = layer.stepN;
  layer.steps = 0;
  if (layer.lastMs === null) { layer.lastMs = now; return 0; }
  if (frozen) { layer.lastMs = Math.max(layer.lastMs, now); return 0; }
  const d = now - layer.lastMs;
  // The bank is INTEGER: ticks of 1/60 ms (one step = 1000 ticks), each frame's delta rounded once. Float
  // seconds drift with the pacing (359 vs 358 steps over the same six seconds); integers never do.
  if (d > 0) { layer.acc += Math.round(d * 60); layer.lastMs = now; }
  let steps = 0;
  while (layer.acc >= STEP_TICKS && steps < TRAVEL_MAX_STEPS) { layer.acc -= STEP_TICKS; steps++; }
  if (layer.acc > STEP_TICKS * TRAVEL_MAX_STEPS) layer.acc = 0; // never bank a spiral of death
  layer.stepN += steps;
  layer.steps = steps;
  return steps;
}

function freshMark(seed, index) {
  return {
    ox: 0, oy: 0, vx: 0, vy: 0,
    ph: PH_HOLD,
    t: travelHash(seed, index, 1) * 0.8, // staggered first departure
    dx: 1, dy: 0,
    len: lerp(TRAVEL_S[0], TRAVEL_S[1], travelHash(seed, index, 2)),
    n: 0,
    // #1575 PATH: the engage ramp (0..1), the carry offset it blends from (where the mark was when it joined its
    // path), and which integrator owned the last step (1 physics: FLOW + settle, 2 path).
    e: 0, cx: 0, cy: 0, pm: 1,
    a: 1, // #1575 the sweep's wrap-seam alpha (1 = unfaded)
  };
}

// ── FLOW: one locked step for one mark ─────────────────────────────────────────────────────────────────────────
const _c = { x: 0, y: 0 };
function curlAt(noise, x, y, W, H, tSec) {
  return noise.curl2((x / W) * FLOW_FREQ, (y / H) * FLOW_FREQ, tSec * FLOW_TIME, CURL_EPS, _c);
}

/**
 * Advance one mark one step. hx/hy = home; L = leash radius (0 while settling); cruise = speed (px/s).
 * The phase machine is the timing law: HOLD (a held extreme) → ANTICIPATE (pull against the coming direction)
 * → TRAVEL (velocity steered toward the curl of the shared field, re-sampled where the mark IS, so paths bend).
 */
export function stepFlowMark(s, hx, hy, L, cruise, W, H, tSec, noise, seed, index) {
  const wn = 2 * Math.PI * (s.ph === PH_SETTLE ? SETTLE_HZ : SPRING_HZ);
  const k = wn * wn;
  const c = 2 * (s.ph === PH_SETTLE ? SETTLE_ZETA : ZETA) * wn;
  let tvx = 0;
  let tvy = 0;
  let tau = STEER_TAU;
  if (s.ph !== PH_SETTLE) {
    s.t -= TRAVEL_STEP;
    if (s.t <= 0) {
      if (s.ph === PH_HOLD) {
        curlAt(noise, hx + s.ox, hy + s.oy, W, H, tSec);
        let d = Math.hypot(_c.x, _c.y);
        if (d < 1e-6) { const a = travelHash(seed, index, 11 + s.n) * 2 * Math.PI; _c.x = Math.cos(a); _c.y = Math.sin(a); d = 1; }
        s.dx = _c.x / d; s.dy = _c.y / d;
        s.ph = PH_ANTIC; s.t = ANTIC_S;
      } else if (s.ph === PH_ANTIC) {
        s.ph = PH_TRAVEL; s.n++;
        s.t = s.len;
        s.len = lerp(TRAVEL_S[0], TRAVEL_S[1], travelHash(seed, index, 977 + s.n * 13));
      } else {
        s.ph = PH_HOLD;
        s.t = lerp(HOLD_S[0], HOLD_S[1], travelHash(seed, index, 389 + s.n * 7));
      }
    }
    if (s.ph === PH_ANTIC) {
      tvx = -s.dx * cruise * ANTIC_BACK; tvy = -s.dy * cruise * ANTIC_BACK; tau = ANTIC_TAU;
    } else if (s.ph === PH_TRAVEL) {
      curlAt(noise, hx + s.ox, hy + s.oy, W, H, tSec);
      const mag = Math.hypot(_c.x, _c.y);
      if (mag > 1e-6) {
        const f = Math.min(1, Math.max(0.35, mag)) * cruise;
        tvx = (_c.x / mag) * f; tvy = (_c.y / mag) * f;
      }
    } else {
      tau = HOLD_TAU;
    }
  }
  // semi-implicit: steer toward the target velocity, then the leash spring outside L. Settling, nothing steers:
  // the soft spring and its own damping alone carry the mark home (a held steer would turn it into a crawl).
  const a = s.ph === PH_SETTLE ? 0 : 1 - Math.exp(-TRAVEL_STEP / tau);
  s.vx += (tvx - s.vx) * a;
  s.vy += (tvy - s.vy) * a;
  const r = Math.hypot(s.ox, s.oy);
  if (s.ph === PH_SETTLE) {
    // going home: a plain damped spring toward home (the whole velocity is damped — an orbit about home would
    // never arrive)
    s.vx += (-k * s.ox - c * s.vx) * TRAVEL_STEP;
    s.vy += (-k * s.oy - c * s.vy) * TRAVEL_STEP;
  } else if (r > L && r > 0) {
    const nx = s.ox / r;
    const ny = s.oy / r;
    const pull = k * (r - L);
    const vr = s.vx * nx + s.vy * ny; // damping along the radial velocity only: tangential travel is free
    s.vx += (-pull * nx - c * vr * nx) * TRAVEL_STEP;
    s.vy += (-pull * ny - c * vr * ny) * TRAVEL_STEP;
  }
  s.ox += s.vx * TRAVEL_STEP;
  s.oy += s.vy * TRAVEL_STEP;
}

/** True once a settling mark is home and at rest (the caller then drops its state: exactly home). */
export function settled(s) {
  return s.ph === PH_SETTLE && Math.hypot(s.ox, s.oy) < SETTLE_EPS_PX && Math.hypot(s.vx, s.vy) < SETTLE_EPS_V;
}

// ── PATH (#1575): the anchor as a pure function of (t, seed, params) ───────────────────────────────────────────
// Stateless → replay-exact by construction. Per-instance phase and speed come from the instance seed. The timing
// law shapes the clock itself: progress moves in SEGMENTS, each one a held extreme, an anticipation lean back, an
// eased travel that overshoots, and a follow-through settle — never a linear CG glide.
/** transportFlow 0.5 ⇒ one path segment every 4 s. */
export const PATH_RATE_AT_1 = 0.5;
const ENGAGE_S = 0.8; // joining a path: the blend from where the mark was to the path, with its own anticipation
const SEG_HOLD = 0.16; // held extreme at the start of each segment
const SEG_ANTIC_END = 0.27; // anticipation lean (backward) ends here
const SEG_TRAVEL_END = 0.84; // the travel overshoots to here, then follows through
const SEG_ANTIC = 0.06; // anticipation depth, in segments
const SEG_OVER = 0.05; // overshoot, in segments
const LEASH_FILL = 0.95; // the centred families use this much of the leash (the radial cap)
const SWEEP_SAG = 0.12; // the sweep lane's arc sag, fraction of L
const SWEEP_REACH = 0.97; // the sweep's along-lane cap, fraction of L (capped only along its arc)
const SWEEP_FADE = 0.2; // the wrap seam fades over this fraction of the lane
const LISSAJOUS = [[1, 2], [3, 2], [2, 3], [1, 3]];

const easeInOutCubic = (a) => (a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2);
const easeOutCubic = (a) => 1 - Math.pow(1 - a, 3);
const smooth01 = (a) => { const t = Math.min(1, Math.max(0, a)); return t * t * (3 - 2 * t); };

/** One segment's shape over f ∈ [0,1): hold → anticipation (backward) → eased travel with overshoot → settle. */
export function segmentShape(f) {
  if (f < SEG_HOLD) return 0;
  if (f < SEG_ANTIC_END) { const a = Math.sin(Math.PI * (f - SEG_HOLD) / (SEG_ANTIC_END - SEG_HOLD)); return -SEG_ANTIC * a * a; }
  if (f < SEG_TRAVEL_END) return easeInOutCubic((f - SEG_ANTIC_END) / (SEG_TRAVEL_END - SEG_ANTIC_END)) * (1 + SEG_OVER);
  return 1 + SEG_OVER * (1 - easeOutCubic((f - SEG_TRAVEL_END) / (1 - SEG_TRAVEL_END)));
}
/** Continuous segment count → shaped progress (whole segments advance; within one, the shape). */
export function pathProgress(x) {
  const k = Math.floor(x);
  return k + segmentShape(x - k);
}

/** The engage curve: a small lean back (anticipation), then an ease into the path. 0 → 0, 1 → 1. */
function engageCurve(e) {
  if (e <= 0) return 0;
  if (e >= 1) return 1;
  if (e < 0.18) { const a = Math.sin(Math.PI * e / 0.18); return -0.08 * a * a; }
  return easeInOutCubic((e - 0.18) / 0.82);
}

const _p = { x: 0, y: 0, a: 1 };
/**
 * A PATH family's displacement from home at travel time tSec. Every family starts at 0 (P = 0 is home) and stays
 * inside the leash: the centred families (orbit, spiral, lissajous) by a radial cap, the sweep along its arc only.
 * `a` is the sweep's wrap-seam alpha (1 elsewhere).
 */
export function pathDisplacement(kind, hx, hy, tSec, seed, index, L, rate, W, H, out = _p) {
  out.x = 0; out.y = 0; out.a = 1;
  if (!(L > 0) || !(rate > 0)) return out;
  const sp = 0.8 + 0.4 * travelHash(seed, index, 21); // per-mark speed
  const u = travelHash(seed, index, 22); // per-mark phase, in segments
  const P = pathProgress(tSec * rate * sp + u) - pathProgress(u); // home at t = 0
  if (kind === 'orbit') {
    // around the dish centre: every mark rides the circle through its home, centred on the dish, one way (the
    // stratum's own direction) — the whole stratum swirls. The leash bounds the ARC (the chord is shorter), and
    // the lane wraps like the sweep's, its seam faded, so a mark that reached its leash slips back without a pop.
    const rx = hx - W / 2;
    const ry = hy - H / 2;
    const d = Math.hypot(rx, ry);
    const reach = SWEEP_REACH * L;
    const span = 2 * reach;
    const raw = 0.5 * L * P;
    const sAl = ((((raw + reach) % span) + span) % span) - reach;
    out.a = smooth01((reach - Math.abs(sAl)) / (SWEEP_FADE * reach));
    const dir = travelHash(seed, 0, 24) < 0.5 ? 1 : -1;
    if (d < 1e-6) { // at the very centre the circle degenerates: drift along a seeded heading instead
      const a0 = travelHash(seed, index, 23) * 2 * Math.PI;
      out.x = Math.cos(a0) * sAl; out.y = Math.sin(a0) * sAl;
      return out;
    }
    const phi = dir * Math.max(-Math.PI, Math.min(Math.PI, sAl / d));
    const c = Math.cos(phi); const sn = Math.sin(phi);
    out.x = rx * c - ry * sn - rx;
    out.y = rx * sn + ry * c - ry;
    return out;
  }
  if (kind === 'spiral') {
    // a breathing orbit: the radius swells and draws in over three segments
    const a0 = travelHash(seed, index, 25) * 2 * Math.PI;
    const wx = Math.cos(a0); const wy = Math.sin(a0);
    const r = (LEASH_FILL * L) / 2;
    const dir = travelHash(seed, index, 26) < 0.5 ? 1 : -1;
    const rho = r * (1 - 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * P) / 3)));
    const th = Math.atan2(-wy, -wx) + dir * (Math.PI / 2) * P;
    out.x = wx * r + rho * Math.cos(th);
    out.y = wy * r + rho * Math.sin(th);
    return out;
  }
  if (kind === 'lissajous') {
    const [fa, fb] = LISSAJOUS[Math.floor(travelHash(seed, index, 27) * LISSAJOUS.length)];
    const A = (LEASH_FILL * L) / Math.SQRT2;
    const ph = (Math.PI / 2) * P;
    const lx = A * Math.sin(fa * ph);
    const ly = A * Math.sin(fb * ph);
    const rot = travelHash(seed, index, 28) * 2 * Math.PI;
    const c = Math.cos(rot); const sn = Math.sin(rot);
    out.x = lx * c - ly * sn;
    out.y = lx * sn + ly * c;
    return out;
  }
  // sweep: a lane across the stratum (one shared heading, ±0.3 rad per mark), travelled with wrap; the arc sags
  // toward its ends, and the wrap seam fades so a mark leaving one end and entering the other never pops.
  const base = travelHash(seed, 0, 29) * 2 * Math.PI;
  const ang = base + (travelHash(seed, index, 30) - 0.5) * 0.6;
  const lx = Math.cos(ang); const ly = Math.sin(ang);
  const reach = SWEEP_REACH * L;
  const raw = 0.5 * L * P;
  const span = 2 * reach;
  const sAl = ((((raw + reach) % span) + span) % span) - reach; // home at P = 0
  const sag = SWEEP_SAG * L * (Math.sin((Math.PI * (sAl + reach)) / span) - 1);
  out.x = lx * sAl - ly * sag;
  out.y = ly * sAl + lx * sag;
  out.a = smooth01((reach - Math.abs(sAl)) / (SWEEP_FADE * reach));
  return out;
}

/** Advance one PATH mark one step: engage toward its path (blending from where it was), velocity by difference. */
export function stepPathMark(s, hx, hy, kind, L, rate, W, H, tSec, seed, index) {
  if (s.pm !== 2) { s.cx = s.ox; s.cy = s.oy; s.e = 0; s.pm = 2; }
  if (s.e < 1) s.e = Math.min(1, s.e + TRAVEL_STEP / ENGAGE_S);
  const d = pathDisplacement(kind, hx, hy, tSec, seed, index, L, rate, W, H);
  const g = engageCurve(s.e);
  const nx = s.cx + (d.x - s.cx) * g;
  const ny = s.cy + (d.y - s.cy) * g;
  s.vx = (nx - s.ox) / TRAVEL_STEP;
  s.vy = (ny - s.oy) / TRAVEL_STEP;
  s.ox = nx;
  s.oy = ny;
  s.a = 1 + (d.a - 1) * Math.min(1, Math.max(0, g));
}

// ── stretch along velocity (#1575) ──────────────────────────────────────────────────────────────────────────────
// Fast travellers elongate along their direction, mass-preserving, through the deform channel (a_def): a squash
// ACROSS the velocity (axis ⊥ v, amount a) stretches the mark along it by 1/(1−a). Capped; never on a mark that
// carries its own deform (the dish's impact squash wins); shed with the dish deform rung by the contract.
export const STRETCH_CAP = 0.22;
const STRETCH_K = 0.6; // amount per (speed / m): the spike cruise (0.11·m/s) reads ≈0.066 — a lean, not a smear

// ── the Jell-O metric (#1575): per stratum, how many marks travel and how far from home, over a window ──────────
// Reported, steering nothing. Derived per frame, never snapshotted.
export const JELLO_WINDOW = 120; // frames
const JELLO_EPS_PX = 0.5;

function jelloPush(layer, travelling, sumDist, n) {
  let j = layer.jello;
  if (!j) {
    j = { t: new Float64Array(JELLO_WINDOW), d: new Float64Array(JELLO_WINDOW), c: new Float64Array(JELLO_WINDOW), i: 0, filled: 0 };
    layer.jello = j;
  }
  j.t[j.i] = travelling; j.d[j.i] = sumDist; j.c[j.i] = n;
  j.i = (j.i + 1) % JELLO_WINDOW;
  j.filled = Math.min(JELLO_WINDOW, j.filled + 1);
}

/**
 * The Jell-O readout for a stratum: { frames, travelling (mean count over the window), marks, meanDistance (px,
 * mean over the travelling marks), meanDistanceFrac (of the small dimension) } — or null before any frame.
 */
export function jelloReadout(layer, m = 0) {
  const j = layer && layer.jello;
  if (!j || !j.filled) return null;
  let t = 0; let d = 0; let c = 0;
  for (let i = 0; i < j.filled; i++) { t += j.t[i]; d += j.d[i]; c += j.c[i]; }
  const meanDistance = t > 0 ? d / t : 0;
  return {
    frames: j.filled,
    travelling: t / j.filled,
    marks: c / j.filled,
    meanDistance,
    meanDistanceFrac: m > 0 ? meanDistance / m : 0,
  };
}

// ── PARALLAX DRIFT (#1576, surge's quiet sibling) ──────────────────────────────────────────────────────────────
// A slow CONSTANT anchor drift proportional to zTier — foreground tiers travel faster than ground — so a calm scene
// still feels like it is moving through space. Stateless in travel time (the stratum's locked-step clock), one
// heading per scene, wrapped across the canvas plus a margin; a mark fades only while it is OUTSIDE the canvas near
// the wrap seam, so the wrap never pops. Every mark drifts (travellers too: their own travel rides on top).
/** transportParallax 1 ⇒ the front tier drifts this fraction of the small dimension per second (the ground ¼ of it). */
export const PARALLAX_FRONT = 0.02;
const PARALLAX_GROUND = 0.25; // the back tier's share of the front's speed
const PARALLAX_MARGIN = 0.1; // the wrap domain extends this fraction of the small dimension past each canvas edge

/** One mark's drift at travel time tSec: { x, y, a } (a = the off-canvas seam fade). */
export function parallaxDrift(hx, hy, zTier, tiers, amount, tSec, seed, W, H, out = _p) {
  out.x = 0; out.y = 0; out.a = 1;
  const amt = clamp01(amount);
  if (!(amt > 0) || !(tSec > 0)) return out;
  const m = Math.min(W, H);
  const nT = Math.max(1, Math.floor(num(tiers, 1)));
  const f = nT <= 1 ? 0.5 : Math.min(1, Math.max(0, num(zTier) / (nT - 1)));
  const speed = amt * PARALLAX_FRONT * m * (PARALLAX_GROUND + (1 - PARALLAX_GROUND) * f);
  const head = travelHash(seed, 0, 31) * 2 * Math.PI;
  const M = PARALLAX_MARGIN * m;
  const wrap = (v, lo, span) => ((((v - lo) % span) + span) % span) + lo;
  const nx = wrap(hx + Math.cos(head) * speed * tSec, -M, W + 2 * M);
  const ny = wrap(hy + Math.sin(head) * speed * tSec, -M, H + 2 * M);
  out.x = nx - hx;
  out.y = ny - hy;
  const edge = Math.min(nx + M, W + M - nx, ny + M, H + M - ny); // distance to the wrap seam
  out.a = smooth01(edge / M);
  return out;
}

// ── SURGE (#1576): a z-approach driver ──────────────────────────────────────────────────────────────────────────
// On its envelope a mark's z rises 0 → 1 → 0; the contract (gl/sceneContract toInstance) reads z as scale-up + a
// slight rise + alpha sharpening, then releases it home. z is a DRIVER channel: placements, materials and the
// governor are untouched (only the registered cost tier and the travel-first shed apply). ANTICIPATION IS
// MANDATORY — a small settle AWAY (z < 0: the mark draws back and sinks) before the approach; a surge that starts at
// full speed is a bug (the envelope leaves 0 with zero velocity, then goes negative first).
// Trigger (Q3, RULED 2026-10-20): the Queen — a taste call stamped on the resolver input (`surgeTrigger`), recorded
// with the take; the resolver never decides one. The decision stays invisible: the surge is the motion.
export const SURGE_S = 2.4; // one mark's envelope
const SURGE_STAGGER = 0.6; // the cascade: marks start within this window of the trigger
const SURGE_ANTIC_END = 0.14; // anticipation: settle away …
const SURGE_ANTIC = 0.14; // … this deep (z = −0.14 at its extreme)
const SURGE_RISE_END = 0.45; // the approach, eased, overshooting
const SURGE_OVER = 0.05;
const SURGE_HOLD_END = 0.6; // the held extreme
const SURGE_UNDER = 0.04; // the release follows through below 0 before it settles
/** The envelope z(u), u = time / SURGE_S. Starts and ends at exactly 0 with zero slope. */
export function surgeEnvelope(u) {
  if (!(u > 0) || u >= 1) return 0;
  if (u < SURGE_ANTIC_END) { const a = Math.sin(Math.PI * u / SURGE_ANTIC_END); return -SURGE_ANTIC * a * a; }
  if (u < SURGE_RISE_END) {
    const a = (u - SURGE_ANTIC_END) / (SURGE_RISE_END - SURGE_ANTIC_END);
    return easeInOutCubic(a) * (1 + SURGE_OVER); // the eased approach, overshooting the extreme
  }
  if (u < SURGE_HOLD_END) {
    const a = (u - SURGE_RISE_END) / (SURGE_HOLD_END - SURGE_RISE_END);
    return 1 + SURGE_OVER * (1 - easeOutCubic(a)); // overshoot settles onto the held extreme
  }
  const a = (u - SURGE_HOLD_END) / (1 - SURGE_HOLD_END);
  if (a < 0.8) return 1 - easeInOutCubic(a / 0.8) * (1 + SURGE_UNDER); // release, past home …
  const b = Math.sin((Math.PI / 2) * ((a - 0.8) / 0.2));
  return -SURGE_UNDER * (1 - b * b); // … and follow through back to 0
}
/** How the contract reads z (gl/sceneContract toInstance): scale-up, a slight rise (scene px), alpha sharpening. */
export const SURGE_SCALE = 0.5;
export const SURGE_RISE = 10;
export const SURGE_SHARP = 0.5;
/** The instance transform for a mark at z (z = 0 never reaches here: the contract skips it, bit for bit). */
export function surgeInstance(z, scaleX, scaleY, y, opacity) {
  const k = 1 + SURGE_SCALE * z;
  return { scaleX: scaleX * k, scaleY: scaleY * k, y: y - SURGE_RISE * z, opacity: z > 0 ? opacity + (1 - opacity) * SURGE_SHARP * Math.min(1, z) : opacity };
}
/** The share of a stratum's marks one surge carries, from its intensity (0..1). */
export const surgeShare = (intensity) => 0.15 + 0.35 * clamp01(intensity);

/** One mark's z at travel time tSec, given the stratum's surge record { step, amount } (or null). */
export function surgeZ(rec, seed, index, tSec) {
  if (!rec || !(rec.amount > 0)) return 0;
  if (travelHash(seed, index, 41 + (rec.id | 0) * 7) >= surgeShare(rec.amount)) return 0;
  const t0 = rec.step * TRAVEL_STEP + travelHash(seed, index, 42 + (rec.id | 0) * 7) * SURGE_STAGGER;
  return rec.amount * surgeEnvelope((tSec - t0) / SURGE_S);
}

/**
 * Note a surge trigger stamped on the input ({ id, amount, atMs }: atMs = the loop time it was stamped at). A new
 * trigger (a new id) records the stratum's step it landed on; the same trigger again is a no-op. A trigger first
 * seen long after it was stamped (a stratum added later, a reseeded scene) is noted SPENT, so the store's standing
 * last trigger never replays itself. Pure over the layer and the input; the record is snapshotted.
 */
export const SURGE_WINDOW_MS = (SURGE_S + SURGE_STAGGER) * 1000;
export function noteSurge(layer, trigger, depth, nowMs = null) {
  if (!trigger || typeof trigger !== 'object' || !Number.isInteger(trigger.id)) return;
  if (layer.surge && layer.surge.id === trigger.id) return;
  const stale = Number.isFinite(trigger.atMs) && Number.isFinite(nowMs) && nowMs - trigger.atMs > SURGE_WINDOW_MS;
  const amount = stale ? 0 : clamp01(trigger.amount) * clamp01(depth);
  layer.surge = { id: trigger.id, step: layer.stepN, amount };
}

/**
 * The z-and-drift pass (#1576) for one stratum's SoA, after the transport pass. ctx carries params
 * { parallax, surge, zTiers } (travelParams) and the stratum's layer. Writes the per-slot z (ctx.frame.z) and the
 * seam fade into alpha; moves x/y by the drift. Returns an undo (positions are cached), or null when neither is on.
 */
export function applyDriftAndSurge(soa, ctx) {
  if (!soa || !ctx || !ctx.layer) return null;
  const p = ctx.params || {};
  const n = soa.n | 0;
  const layer = ctx.layer;
  const tSec = layer.stepN * TRAVEL_STEP;
  const drift = p.parallax > 0;
  const rec = p.surge > 0 && layer.surge && layer.surge.amount > 0 ? layer.surge : null;
  const surgeLive = rec && tSec < rec.step * TRAVEL_STEP + SURGE_STAGGER + SURGE_S;
  if (!n || (!drift && !surgeLive)) { if (ctx.frame) ctx.frame.anyZ = false; return null; }
  const seed = ctx.seed | 0;
  const W = num(ctx.W);
  const H = num(ctx.H);
  const frame = ctx.frame || (ctx.frame = framesFor(n));
  if (!frame.z || frame.z.length < frame.amt.length) frame.z = new Float32Array(frame.amt.length);
  frame.anyZ = false;
  let base = null;
  if (drift) {
    base = DRIFT_BASE_XY.get(soa);
    if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; DRIFT_BASE_XY.set(soa, base); }
    for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }
  }
  for (let k = 0; k < n; k++) {
    frame.z[k] = 0;
    if (drift) {
      const d = parallaxDrift(soa.x[k], soa.y[k], soa.zTier[k], p.zTiers, p.parallax, tSec, seed, W, H);
      soa.x[k] += d.x;
      soa.y[k] += d.y;
      if (d.a < 1) soa.alpha[k] *= d.a;
    }
    if (surgeLive) {
      const z = surgeZ(rec, seed, soa.index[k], tSec);
      if (z !== 0) { frame.z[k] = z; frame.anyZ = true; }
    }
  }
  if (!drift) return null;
  return () => { for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; } };
}
const DRIFT_BASE_XY = new WeakMap();

// ── the applier (stage C, beside applyRhythm) ───────────────────────────────────────────────────────────────────
const TRAVEL_BASE_XY = new WeakMap();

/**
 * Fold travel into the stage-C SoA. ctx = { layer, seed, W, H, noise, params } (params: travelParams); the frame's
 * steps are the ones advanceTravelClock just granted the layer (layer.steps, from layer.stepBase).
 * still[k] (artist-pinned) keeps its placed position. Returns an UNDO that restores the cached x/y (positions live
 * in the cached geometry SoA, the #1128 lesson), or null when nothing moved — the hard gate.
 */
export function applyTravel(soa, ctx, still = null, assetIds = null, activeAssets = null) {
  if (!soa || !ctx || !ctx.layer) return null;
  const n = soa.n | 0;
  const layer = ctx.layer;
  const p = ctx.params || {};
  const marks = layer.marks;
  ctx.frame = null;
  if (!n || (!p.active && marks.size === 0)) { layer.steps = 0; return null; }
  if (!ctx.noise || typeof ctx.noise.curl2 !== 'function') return null;
  const steps = Math.max(0, Math.min(TRAVEL_MAX_STEPS, layer.steps | 0));
  const seed = ctx.seed | 0;
  const W = num(ctx.W);
  const H = num(ctx.H);
  const m = Math.min(W, H);

  let base = TRAVEL_BASE_XY.get(soa);
  if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; TRAVEL_BASE_XY.set(soa, base); }
  for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }

  const modes = p.active ? slotModes(layer, n, p.mode, assetIds, activeAssets) : null;
  const sel = p.active ? selectTravellers(layer, soa, n, seed, p.budget, still, modes) : null;
  const frame = framesFor(n);
  let moved = false;
  let travelling = 0;
  let sumDist = 0;
  const seen = new Set();
  for (let k = 0; k < n; k++) {
    frame.amt[k] = 0;
    frame.alpha[k] = 1;
    const index = soa.index[k];
    const travels = !!(sel && sel[k]);
    let s = marks.get(index);
    if (!s) {
      if (!travels) continue;
      s = freshMark(seed, index);
      marks.set(index, s);
    }
    seen.add(index);
    const mode = travels ? modes[k] : 0; // 1 flow, 2 path, 0 settle home
    if (mode === 0) {
      // leaving travel: physics takes over from wherever the mark is, at whatever speed it had (a PATH mark's
      // velocity is its last finite difference), on a zero-radius leash — the follow-through brings it home.
      if (s.pm === 2) s.pm = 1;
      s.ph = PH_SETTLE;
    } else if (mode === 1) {
      if (s.pm === 2 || s.ph === PH_SETTLE) { s.pm = 1; s.ph = PH_HOLD; s.t = 0; }
    } else if (s.ph === PH_SETTLE) {
      s.ph = PH_HOLD; // a path re-engages from where the mark is (stepPathMark takes the carry)
    }
    const hx = base.x[k];
    const hy = base.y[k];
    for (let i = 0; i < steps; i++) {
      const tSec = (layer.stepBase + i + 1) * TRAVEL_STEP;
      if (mode === 2) stepPathMark(s, hx, hy, p.pathKind, p.L, p.rate, W, H, tSec, seed, index);
      else stepFlowMark(s, hx, hy, mode === 1 ? p.L : 0, p.cruise, W, H, tSec, ctx.noise, seed, index);
    }
    if (settled(s) && s.a >= 1) { marks.delete(index); continue; }
    if (s.ox !== 0 || s.oy !== 0) {
      soa.x[k] = hx + s.ox;
      soa.y[k] = hy + s.oy;
      moved = true;
      const dist = Math.hypot(s.ox, s.oy);
      if (dist > JELLO_EPS_PX) { travelling++; sumDist += dist; }
      const speed = Math.hypot(s.vx, s.vy);
      if (m > 0 && speed > 0) {
        const amt = Math.min(STRETCH_CAP, (STRETCH_K * speed) / m);
        if (amt >= 0.001) { frame.amt[k] = amt; frame.ax[k] = -s.vy / speed; frame.ay[k] = s.vx / speed; frame.any = true; }
      }
    }
    if (s.pm !== 2 && s.a < 1) s.a = Math.min(1, s.a + steps * TRAVEL_STEP * 4); // a faded sweep seam unfades as it leaves
    if (s.a < 1) { frame.alpha[k] = s.a; frame.anyAlpha = true; }
  }
  // a mark whose slot vanished (count down, mode change) has no home to return to: drop it
  if (seen.size !== marks.size) for (const idx of [...marks.keys()]) if (!seen.has(idx)) marks.delete(idx);
  if (steps > 0) jelloPush(layer, travelling, sumDist, n);
  layer.steps = 0; // a second build in the same frame (none today) must not step the marks twice
  if (!moved) return null;
  if (frame.anyAlpha) for (let k = 0; k < n; k++) if (frame.alpha[k] < 1) soa.alpha[k] *= frame.alpha[k];
  ctx.frame = frame;
  return () => {
    for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
  };
}

// The per-frame stretch / alpha scratch, grown to the largest set seen and reused (the #1250 scratch discipline);
// fully rewritten for k < n on every call before anything reads it.
let _frame = null;
function framesFor(n) {
  if (!_frame || _frame.amt.length < n) {
    _frame = { amt: new Float32Array(n), ax: new Float32Array(n), ay: new Float32Array(n), alpha: new Float32Array(n), any: false, anyAlpha: false };
  }
  _frame.any = false;
  _frame.anyAlpha = false;
  _frame.anyZ = false;
  return _frame;
}

/**
 * The per-slot transport (0 still, 1 flow, 2 path) for the stratum's mode. 'auto' asks each mark's family
 * (familyTransport); an explicit mode applies to every mark. Cached on the layer by (mode, bound asset ids,
 * asset pool) identity — the bind cache hands out the same arrays while nothing changed.
 */
const MODE_CODE = { still: 0, flow: 1, path: 2 };
function slotModes(layer, n, mode, assetIds, activeAssets) {
  const c = layer.modes;
  if (c && c.mode === mode && c.ids === assetIds && c.pool === activeAssets && c.on.length === n) return c.on;
  const on = new Uint8Array(n);
  if (mode === 'auto') {
    const byId = new Map();
    for (const a of activeAssets || []) if (a && typeof a.id === 'string') byId.set(a.id, a);
    for (let k = 0; k < n; k++) on[k] = MODE_CODE[familyTransport(assetIds ? byId.get(assetIds[k]) : null)] || 0;
  } else {
    on.fill(MODE_CODE[mode] || 0);
  }
  layer.modes = { mode, ids: assetIds, pool: activeAssets, on };
  return on;
}

/**
 * Which slots travel this frame: every eligible mark (not artist-pinned) when the budget covers them, otherwise the
 * `budget` eligible marks with the lowest per-instance rank hash — a stable, nested choice, so a tighter budget
 * keeps a SUBSET of the travellers it had (the rest settle home) and a restored one brings the same marks back.
 * Cached on the layer by a signature of (n, budget, eligibility): derived, never snapshotted.
 */
function selectTravellers(layer, soa, n, seed, budget, still, modes) {
  const eligible = (k) => !(still && still[k]) && !(modes && !modes[k]);
  let elig = 0;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    if (!eligible(k)) continue;
    elig++;
    sum = (sum + Math.imul(soa.index[k] + 1, 0x9e3779b1) + (modes ? modes[k] : 0)) | 0;
  }
  const sig = `${n}|${budget}|${elig}|${sum}|${seed}`;
  if (layer.sel && layer.sel.sig === sig) return layer.sel.on;
  const on = new Uint8Array(n);
  if (elig <= budget) {
    for (let k = 0; k < n; k++) if (eligible(k)) on[k] = 1;
  } else if (budget > 0) {
    const ranked = [];
    for (let k = 0; k < n; k++) if (eligible(k)) ranked.push(k);
    const r = (k) => travelHash(seed, soa.index[k], 5);
    ranked.sort((a, b) => r(a) - r(b) || soa.index[a] - soa.index[b]);
    for (let i = 0; i < budget; i++) on[ranked[i]] = 1;
  }
  layer.sel = { sig, on };
  return on;
}

// ── snapshot (#1367: a take can begin mid-session) ─────────────────────────────────────────────────────────────
const MARK_FIELDS = ['ox', 'oy', 'vx', 'vy', 'ph', 't', 'dx', 'dy', 'len', 'n', 'e', 'cx', 'cy', 'pm', 'a'];

/** The store as JSON-safe data. Marks are packed as [index, ...MARK_FIELDS] rows, sorted by index. */
export function snapshotTravelStore(store) {
  const layers = [];
  for (const [id, L] of store.layers) {
    const rows = [];
    for (const [idx, s] of L.marks) rows.push([idx, ...MARK_FIELDS.map((f) => s[f])]);
    rows.sort((a, b) => a[0] - b[0]);
    layers.push([id, { key: L.key, lastMs: L.lastMs, acc: L.acc, stepN: L.stepN, marks: rows, ...(L.surge ? { surge: { ...L.surge } } : {}) }]);
  }
  return { v: 1, layers };
}

/** Structural validation of a travel snapshot (fail-closed). */
export function checkTravelSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || snap.v !== 1 || !Array.isArray(snap.layers)) return false;
  for (const entry of snap.layers) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') return false;
    const L = entry[1];
    if (!L || typeof L !== 'object' || typeof L.key !== 'string') return false;
    if (!(L.lastMs === null || Number.isFinite(L.lastMs))) return false;
    if (!Number.isInteger(L.acc) || L.acc < 0 || !Number.isInteger(L.stepN) || L.stepN < 0) return false;
    if (!Array.isArray(L.marks)) return false;
    if (L.surge !== undefined) {
      const sg = L.surge;
      if (!sg || typeof sg !== 'object' || !Number.isInteger(sg.id) || !Number.isInteger(sg.step) || sg.step < 0 || !Number.isFinite(sg.amount)) return false;
    }
    for (const row of L.marks) {
      if (!Array.isArray(row) || row.length !== MARK_FIELDS.length + 1) return false;
      if (!Number.isInteger(row[0])) return false;
      for (let i = 1; i < row.length; i++) if (!Number.isFinite(row[i])) return false;
    }
  }
  return true;
}

/** Replace the store's contents with a snapshot. Returns false (store untouched) on a malformed snapshot. */
export function restoreTravelStore(store, snap) {
  if (!checkTravelSnapshot(snap)) return false;
  store.layers.clear();
  for (const [id, L] of snap.layers) {
    const layer = freshLayer(L.key);
    layer.lastMs = L.lastMs;
    layer.acc = L.acc;
    layer.stepN = L.stepN;
    layer.stepBase = L.stepN;
    if (L.surge) layer.surge = { ...L.surge };
    for (const row of L.marks) {
      const s = {};
      MARK_FIELDS.forEach((f, i) => { s[f] = row[i + 1]; });
      layer.marks.set(row[0], s);
    }
    store.layers.set(id, layer);
  }
  return true;
}
