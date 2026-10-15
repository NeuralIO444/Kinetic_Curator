// travelSpike.mjs — #1573 THROWAWAY SPIKE (no PR, no params, no UI).
//
// Question it answers: do marks stop looking trapped when ~20 of them get
// (1) a per-instance offset+velocity stepped on a FIXED-step clock,
// (2) a leash — no home force inside radius L, a slightly-underdamped spring
//     outside it (the overshoot IS the follow-through), and
// (3) velocity steered toward the curl of the shared world noise field.
//
// Everything is hard-coded below. Toggle at runtime:
//   globalThis.__travelSpike = { on: true }      // spike ON
//   globalThis.__travelSpike.on = false          // spike OFF (state is kept, marks glide back via the leash)
// Read results:  globalThis.__travelSpike.stats()
//
// Timing law (anime): arcs (curl steering, never straight lines), anticipation
// (a short pull AGAINST the coming direction before departure), follow-through
// (leash overshoot on arrival), held extremes (a dead stop at the far end).
// Stretch-along-velocity is NOT in this spike (no deform channel on the item
// path; see the report).

const STEP = 1 / 60;          // spine-A fixed step, seconds
const MAX_STEPS = 4;          // per presented frame (matches the dt clamp: 50 ms)
const TARGET_MARKS = 20;

// Distances are fractions of the smaller canvas dimension m.
const LEASH_L = 0.16;         // free-roam radius: no force inside
const SPEED = 0.11;           // cruise speed, m / s
const STEER_TAU = 0.28;       // s — velocity eases toward the flow target (ease-in = arcs)
const HOLD_TAU = 0.07;        // s — velocity dies fast at a held extreme
const SPRING_HZ = 0.85;       // leash spring natural frequency
const ZETA = 0.38;            // < 1 → slight overshoot on arrival
const ANTIC_S = 0.20;         // anticipation duration
const ANTIC_BACK = 0.45;      // fraction of cruise speed pulled AGAINST the coming direction
const TRAVEL_S = [1.4, 3.0];  // travel segment length range
const HOLD_S = [0.35, 0.95];  // held-extreme length range
const FLOW_FREQ = 2.5;        // noise cycles across the canvas (matches the rhythm layer's scale)
const FLOW_TIME = 0.12;       // noise z advance per second

const PH_ANTIC = 0, PH_TRAVEL = 1, PH_HOLD = 2;

function hash01(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function strHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return h;
}
const lerp = (a, b, t) => a + (b - a) * t;

const layers = new Map(); // layerId → { lastMs, acc, marks: Map(key → state), pick: Set|null, pickSig }
const costRing = new Float64Array(240);
let costN = 0;

function stateFor(key, seedIdx) {
  return {
    ox: 0, oy: 0, vx: 0, vy: 0,
    phase: PH_HOLD,
    t: hash01(seedIdx * 31 + 1) * 0.8,  // staggered first departure
    dirx: 1, diry: 0,
    travelLen: lerp(TRAVEL_S[0], TRAVEL_S[1], hash01(seedIdx * 31 + 2)),
    n: 0,
    key,
    seedIdx,
  };
}

function pickMarks(items) {
  const keyed = [];
  for (let i = 0; i < items.length; i++) if (items[i] && items[i].key) keyed.push(items[i].key);
  keyed.sort();
  const pick = new Set();
  if (!keyed.length) return pick;
  const stride = Math.max(1, Math.floor(keyed.length / TARGET_MARKS));
  for (let i = 0; i < keyed.length && pick.size < TARGET_MARKS; i += stride) pick.add(keyed[i]);
  return pick;
}

function stepMark(s, hx, hy, m, W, H, tSec, noise, tmp) {
  const L = LEASH_L * m;
  const speed = SPEED * m;
  const wn = (2 * Math.PI * SPRING_HZ);
  const k = wn * wn;
  const c = 2 * ZETA * wn;

  s.t -= STEP;
  // ── phase machine: HOLD → ANTIC → TRAVEL → HOLD …
  if (s.t <= 0) {
    if (s.phase === PH_HOLD) {
      // pick the flow direction at the current position; anticipation pulls the other way
      noise.curl2(((hx + s.ox) / W) * FLOW_FREQ, ((hy + s.oy) / H) * FLOW_FREQ, tSec * FLOW_TIME, 0.5, tmp);
      let d = Math.hypot(tmp.x, tmp.y);
      if (d < 1e-6) { tmp.x = Math.cos(s.n); tmp.y = Math.sin(s.n); d = 1; }
      s.dirx = tmp.x / d; s.diry = tmp.y / d;
      s.phase = PH_ANTIC; s.t = ANTIC_S;
    } else if (s.phase === PH_ANTIC) {
      s.phase = PH_TRAVEL;
      s.n++;
      s.t = s.travelLen;
      s.travelLen = lerp(TRAVEL_S[0], TRAVEL_S[1], hash01(s.seedIdx * 977 + s.n * 13));
    } else {
      s.phase = PH_HOLD;
      s.t = lerp(HOLD_S[0], HOLD_S[1], hash01(s.seedIdx * 389 + s.n * 7));
    }
  }

  // ── target velocity
  let tvx = 0, tvy = 0, tau = STEER_TAU;
  if (s.phase === PH_ANTIC) {
    tvx = -s.dirx * speed * ANTIC_BACK; tvy = -s.diry * speed * ANTIC_BACK; tau = 0.09;
  } else if (s.phase === PH_TRAVEL) {
    // ARC: re-sample the curl at the CURRENT position every step, so the path bends with the field
    noise.curl2(((hx + s.ox) / W) * FLOW_FREQ, ((hy + s.oy) / H) * FLOW_FREQ, tSec * FLOW_TIME, 0.5, tmp);
    const mag = Math.hypot(tmp.x, tmp.y);
    if (mag > 1e-6) {
      const f = Math.min(1, Math.max(0.35, mag)) * speed;
      tvx = (tmp.x / mag) * f; tvy = (tmp.y / mag) * f;
    }
  } else {
    tau = HOLD_TAU; // held extreme: velocity dies, mark stays put
  }

  // ── integrate (semi-implicit): steer toward target velocity, leash spring outside L
  const a = 1 - Math.exp(-STEP / tau);
  s.vx += (tvx - s.vx) * a;
  s.vy += (tvy - s.vy) * a;
  const r = Math.hypot(s.ox, s.oy);
  if (r > L) {
    const nx = s.ox / r, ny = s.oy / r;
    const pull = k * (r - L);
    // spring toward the leash circle + damping along the radial velocity only
    const vr = s.vx * nx + s.vy * ny;
    s.vx += (-pull * nx - c * vr * nx) * STEP;
    s.vy += (-pull * ny - c * vr * ny) * STEP;
  }
  s.ox += s.vx * STEP;
  s.oy += s.vy * STEP;
}

/**
 * Apply the spike to one layer's items. Returns the (possibly new) array.
 * `nowMs` is the loop clock (rolls back on pause/reject → we never step backwards).
 */
export function applyTravelSpike(items, { layerId, W, H, nowMs, noise, slowRender }) {
  const g = globalThis.__travelSpike;
  if (g) { g._calls = (g._calls || 0) + 1; g._nowAll = nowMs; } // counted even when OFF, so an A/B harness can pace both runs by sim time
  if (!g || !g.on || !items || !items.length || !noise) return items;
  const t0 = performance.now();
  const m = Math.min(W, H);

  let L = layers.get(layerId);
  if (!L) { L = { lastMs: nowMs, acc: 0, marks: new Map(), pick: null, pickSig: '' }; layers.set(layerId, L); }
  const sig = items.length + ':' + (items[0] && items[0].key) + ':' + (items[items.length - 1] && items[items.length - 1].key);
  if (!L.pick || L.pickSig !== sig) { L.pick = pickMarks(items); L.pickSig = sig; }

  // fixed-step accumulator on the loop clock; high-water so a rolled-back frame never steps backwards
  if (!slowRender) {
    const dMs = nowMs - L.lastMs;
    if (dMs > 0) { L.acc += dMs * 0.001; L.lastMs = nowMs; }
    else if (dMs < 0) { /* rollback: hold, don't rewind */ }
  } else {
    L.lastMs = Math.max(L.lastMs, nowMs); // frozen: nothing credits on thaw
  }
  let steps = 0;
  const tSec = nowMs * 0.001;
  const tmp = { x: 0, y: 0 };
  while (L.acc >= STEP && steps < MAX_STEPS) { L.acc -= STEP; steps++; }
  if (L.acc > STEP * MAX_STEPS) L.acc = 0; // never bank a spiral of death

  const out = new Array(items.length);
  const dists = [];
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !L.pick.has(it.key)) { out[i] = it; continue; }
    let s = L.marks.get(it.key);
    if (!s) { s = stateFor(it.key, (strHash(it.key) >>> 0) % 100003); L.marks.set(it.key, s); g._newStates = (g._newStates || 0) + 1; }
    for (let n = 0; n < steps; n++) stepMark(s, it.x, it.y, m, W, H, tSec, noise, tmp);
    out[i] = { ...it, x: it.x + s.ox, y: it.y + s.oy };
    dists.push(Math.hypot(s.ox, s.oy));
    if (g._trail) (g._trail[it.key] || (g._trail[it.key] = [])).push([it.x, it.y, it.x + s.ox, it.y + s.oy, s.phase]);
    idx++;
  }
  g._last = { dists, m, leash: LEASH_L * m, steps };
  g._steps = (g._steps || 0) + steps; g._frames = (g._frames || 0) + 1; g._lastNow = nowMs; g._slow = !!slowRender;
  if (g._rec) g._rec.push(dists.slice());

  costRing[costN++ % costRing.length] = performance.now() - t0;
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

// Install the runtime handle (off by default — the spike is inert until a page sets .on).
if (typeof globalThis !== 'undefined' && !globalThis.__travelSpike) {
  globalThis.__travelSpike = { on: false };
}
if (typeof globalThis !== 'undefined') {
  const g = globalThis.__travelSpike;
  /** distance-from-home distribution over everything recorded since startRec(), plus apply() CPU cost */
  g.startRec = () => { g._rec = []; g._trail = {}; };
  g.reset = () => { layers.clear(); costN = 0; costRing.fill(0); g._rec = null; };
  g.stats = () => {
    const flat = [];
    for (const f of g._rec || []) for (const d of f) flat.push(d);
    flat.sort((a, b) => a - b);
    const m = g._last ? g._last.m : 0;
    const leash = g._last ? g._last.leash : 0;
    const costs = Array.from(costRing.subarray(0, Math.min(costN, costRing.length))).sort((a, b) => a - b);
    return {
      dbg: { newStates: g._newStates, steps: g._steps, frames: g._frames, lastNow: g._lastNow, slow: g._slow },
      samples: flat.length,
      canvasMin: m,
      leashPx: leash,
      distPx: {
        p10: percentile(flat, 0.1), p50: percentile(flat, 0.5), p90: percentile(flat, 0.9),
        p99: percentile(flat, 0.99), max: flat.length ? flat[flat.length - 1] : 0,
      },
      fracBeyondLeash: flat.length ? flat.filter((d) => d > leash).length / flat.length : 0,
      applyMs: { n: costs.length, mean: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0, p95: percentile(costs, 0.95), max: costs.length ? costs[costs.length - 1] : 0 },
    };
  };
}
