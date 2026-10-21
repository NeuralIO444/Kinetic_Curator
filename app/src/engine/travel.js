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

/** The layoutParams transport modes. 'still' is today's behaviour exactly. */
export const TRANSPORT_MODES = Object.freeze(['still', 'flow']);

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
  const leash = Math.max(0, num(lp.transportLeash));
  const flow = clamp01(lp.transportFlow);
  const budget = travelBudget(lp.transportCeiling ?? DEFAULT_CEILING, deviceCap, shed);
  const active = m > 0 && mode !== 'still' && leash > 0 && flow > 0 && budget > 0;
  return { active, mode, m, L: leash * m, cruise: flow * FLOW_CRUISE_AT_1 * m, flow, budget };
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
  return { key, lastMs: null, acc: 0, stepN: 0, stepBase: 0, steps: 0, marks: new Map(), sel: null };
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
  const wn = 2 * Math.PI * SPRING_HZ;
  const k = wn * wn;
  const c = 2 * ZETA * wn;
  let tvx = 0;
  let tvy = 0;
  let tau = STEER_TAU;
  if (s.ph === PH_SETTLE) {
    tau = HOLD_TAU;
  } else {
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
  // semi-implicit: steer toward the target velocity, then the leash spring outside L
  const a = 1 - Math.exp(-TRAVEL_STEP / tau);
  s.vx += (tvx - s.vx) * a;
  s.vy += (tvy - s.vy) * a;
  const r = Math.hypot(s.ox, s.oy);
  if (r > L && r > 0) {
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

// ── the applier (stage C, beside applyRhythm) ───────────────────────────────────────────────────────────────────
const TRAVEL_BASE_XY = new WeakMap();

/**
 * Fold travel into the stage-C SoA. ctx = { layer, seed, W, H, noise, params } (params: travelParams); the frame's
 * steps are the ones advanceTravelClock just granted the layer (layer.steps, from layer.stepBase).
 * still[k] (artist-pinned) keeps its placed position. Returns an UNDO that restores the cached x/y (positions live
 * in the cached geometry SoA, the #1128 lesson), or null when nothing moved — the hard gate.
 */
export function applyTravel(soa, ctx, still = null) {
  if (!soa || !ctx || !ctx.layer) return null;
  const n = soa.n | 0;
  const layer = ctx.layer;
  const p = ctx.params || {};
  const marks = layer.marks;
  if (!n || (!p.active && marks.size === 0)) return null;
  if (!ctx.noise || typeof ctx.noise.curl2 !== 'function') return null;
  const steps = Math.max(0, Math.min(TRAVEL_MAX_STEPS, layer.steps | 0));
  const seed = ctx.seed | 0;
  const W = num(ctx.W);
  const H = num(ctx.H);

  let base = TRAVEL_BASE_XY.get(soa);
  if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; TRAVEL_BASE_XY.set(soa, base); }
  for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }

  const sel = p.active ? selectTravellers(layer, soa, n, seed, p.budget, still) : null;
  let moved = false;
  const seen = new Set();
  for (let k = 0; k < n; k++) {
    const index = soa.index[k];
    const travels = !!(sel && sel[k]);
    let s = marks.get(index);
    if (!s) {
      if (!travels) continue;
      s = freshMark(seed, index);
      marks.set(index, s);
    }
    seen.add(index);
    if (!travels && s.ph !== PH_SETTLE) s.ph = PH_SETTLE;
    else if (travels && s.ph === PH_SETTLE) { s.ph = PH_HOLD; s.t = 0; }
    const hx = base.x[k];
    const hy = base.y[k];
    const L = s.ph === PH_SETTLE ? 0 : p.L;
    for (let i = 0; i < steps; i++) {
      const tSec = (layer.stepBase + i + 1) * TRAVEL_STEP;
      stepFlowMark(s, hx, hy, L, p.cruise, W, H, tSec, ctx.noise, seed, index);
    }
    if (settled(s)) { marks.delete(index); continue; }
    if (s.ox !== 0 || s.oy !== 0) {
      soa.x[k] = hx + s.ox;
      soa.y[k] = hy + s.oy;
      moved = true;
    }
  }
  // a mark whose slot vanished (count down, mode change) has no home to return to: drop it
  if (seen.size !== marks.size) for (const idx of [...marks.keys()]) if (!seen.has(idx)) marks.delete(idx);
  layer.steps = 0; // a second build in the same frame (none today) must not step the marks twice
  if (!moved) return null;
  return () => {
    for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
  };
}

/**
 * Which slots travel this frame: every eligible mark (not artist-pinned) when the budget covers them, otherwise the
 * `budget` eligible marks with the lowest per-instance rank hash — a stable, nested choice, so a tighter budget
 * keeps a SUBSET of the travellers it had (the rest settle home) and a restored one brings the same marks back.
 * Cached on the layer by a signature of (n, budget, eligibility): derived, never snapshotted.
 */
function selectTravellers(layer, soa, n, seed, budget, still) {
  let elig = 0;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    elig++;
    sum = (sum + Math.imul(soa.index[k] + 1, 0x9e3779b1)) | 0;
  }
  const sig = `${n}|${budget}|${elig}|${sum}|${seed}`;
  if (layer.sel && layer.sel.sig === sig) return layer.sel.on;
  const on = new Uint8Array(n);
  if (elig <= budget) {
    for (let k = 0; k < n; k++) if (!(still && still[k])) on[k] = 1;
  } else if (budget > 0) {
    const ranked = [];
    for (let k = 0; k < n; k++) if (!(still && still[k])) ranked.push(k);
    const r = (k) => travelHash(seed, soa.index[k], 5);
    ranked.sort((a, b) => r(a) - r(b) || soa.index[a] - soa.index[b]);
    for (let i = 0; i < budget; i++) on[ranked[i]] = 1;
  }
  layer.sel = { sig, on };
  return on;
}

// ── snapshot (#1367: a take can begin mid-session) ─────────────────────────────────────────────────────────────
const MARK_FIELDS = ['ox', 'oy', 'vx', 'vy', 'ph', 't', 'dx', 'dy', 'len', 'n'];

/** The store as JSON-safe data. Marks are packed as [index, ...MARK_FIELDS] rows, sorted by index. */
export function snapshotTravelStore(store) {
  const layers = [];
  for (const [id, L] of store.layers) {
    const rows = [];
    for (const [idx, s] of L.marks) rows.push([idx, ...MARK_FIELDS.map((f) => s[f])]);
    rows.sort((a, b) => a[0] - b[0]);
    layers.push([id, { key: L.key, lastMs: L.lastMs, acc: L.acc, stepN: L.stepN, marks: rows }]);
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
    for (const row of L.marks) {
      const s = {};
      MARK_FIELDS.forEach((f, i) => { s[f] = row[i + 1]; });
      layer.marks.set(row[0], s);
    }
    store.layers.set(id, layer);
  }
  return true;
}
