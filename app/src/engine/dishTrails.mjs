// Petri dish C3 (#1415) — trails: the stigmergy substrate.
//
// The issue, in its own terms: "with ACCUM up, moving bodies deposit a
// fading trail field in the shared grid; other bodies read it as weak
// attraction or avoidance by group." Spec §6 stage C: "organisms lay
// and follow scent/trail fields (stigmergy) — colonies self-organise
// along paths predecessors wore." The visual target is dendritic agar
// (02): paths worn into the ground by traffic, read back by traffic.
//
// WHERE THE FIELD LIVES. On the dish session, beside B3's density
// (dishDensity.mjs) — the session is the one object both drivers (the
// live resolver and the studio bake) already share, and a field stamped
// on it inherits the session's purity: a bake builds a fresh session,
// so a bake's field starts empty by construction, and the resolver
// clears the live session's fields on a seed change (below). Each
// stratum that deposits owns a field (entry.trailOwn); the session
// holds one TOTAL field (session.trailTotal) that receives every
// deposit from every stratum. The total is the ground's MEMORY: a
// stratum's release does NOT subtract its deposits back out —
// stigmergy is precisely that the ground remembers a predecessor after
// it has gone (the acceptance probe releases the predecessor colony
// before the follower enrols, and the follower must still find the
// path). The memory ends only with the state-purity events: a seed
// change (clearDishTrails, called by the resolver beside the #425
// world-noise reseed) or a fresh session. B3's pigment, by contrast,
// belongs to bodies and dies with them; a trail belongs to the ground.
//
// THE GROUP READING. "Attraction or avoidance by group" — group is the
// stratum, the family B2 ratified for coalescence (the deposit pass
// sees one stratum at a time, so a finer family could not be laid
// honestly). A body reads: climb its OWN stratum's gradient, descend
// everyone else's. Everyone else's field is never materialised: with
// T = own + others, ∇own − ∇others = 2·∇own − ∇T, so the read is two
// gradient samples and one subtraction (sampleTrailReadGradient) —
// the algebra lives here, the call site in particles.js adds the one
// force term. A lone stratum reads its own field only (others is the
// zero field), so a single colony still self-organises along its own
// worn paths; a departed stratum's ghost stays in the total and reads
// as "others" to everyone who follows — which is the predecessor case.
//
// DEPOSITS — WHAT "ACCUM UP" GATES. The issue's condition is the
// ACCUMULATION switch: the layoutParams.accumulation boolean the
// resolver already threads (today it gates the GL accumulation pass,
// #970 — the shared accumulation substrate; this stage gives the same
// switch its dish meaning). Enrolment carries it (enrolDishBody's
// `accum`, exactly as C1's `wetness` rides enrolment): an accumulating
// stratum gets a trail field; a non-accumulating one never creates
// one, deposits nothing, and — because the total is only created by
// ensureEntryTrails — a dish where ACCUM was never up holds NO field
// at all, dishTrailsFor resolves NO_TRAILS for every system, the read
// term adds exactly zero, and the cast is bit-identical to the
// pre-C3 engine (the acceptance's off-path). Deposits are additionally
// gated on the entry's enrolled radius > 0 — the C1 gate (in the
// dish) — so a DISH-off or contactless stratum lays no trail even with
// ACCUM up: trails are a dish phenomenon, gated like the medium and
// the currents before them. The READ is not ACCUM-gated: the issue
// gates the deposit ("with ACCUM up, bodies deposit"); reading the
// ground is what bodies in the dish do, and a stratum that lays
// nothing still walks ground others wore. (Its own field is absent, so
// its read is pure avoidance of the total — ∇own is zero.) The read
// DOES resolve through the enrolment radius, exactly like the
// deposit: a stratum the per-Look DISH switch enrols at radius 0
// neither lays nor reads — the dish does not touch it at all.
//
// THE DEPOSIT LAW. A moving body lays trail in proportion to its
// motion: TRAIL_DEPOSIT × clamp01(speed / TRAIL_SPEED_FULL) per tick,
// speed in px/step (the integrator's own unit). A still body lays
// nothing — stillness is first-class, and a parked colony wears no
// path it did not walk. Deposits land on the nearest cell (the #509
// scent idiom) and saturate at TRAIL_MAX (the scent clamp, 4): a worn
// path has a ceiling, so no single corridor can shout down the dish.
//
// THE TICK. Driver-side, once per step, mirroring the #509 shared
// scent protocol exactly: the resolver ticks after every layer has
// updated (gated !slowRender, beside sharedScent.step()); the bake
// driver ticks after each step's updates. Deposits therefore read
// POST-integration positions, and every force pass within a step reads
// one uniform field — no system sees a half-laid trail, live and bake
// run the same arithmetic, and the field is a pure function of (seed,
// params, steps): nothing here reads a clock or rolls dice. Inside a
// tick: fade first, then deposit (the scent step's diffuse-then-decay
// order). A system deposits only if it STEPPED since the last tick
// (its _step counter advanced): a paused live system or a bake layer
// that finished early holds frozen velocities, and depositing for it
// would lay phantom trail for a body that is not moving — the counter
// makes the deposit honest in both drivers with no driver-side flags.
//
// THE FADE. Geometric, per tick: × TRAIL_FADE, with a snap — a cell
// that falls below TRAIL_EPS becomes exactly 0. "Trails fade to zero
// on schedule" is therefore an exact statement, not an asymptote: a
// saturated cell (TRAIL_MAX) reaches exact zero at a computable tick
// (the smallest n with TRAIL_MAX·TRAIL_FADE^n < TRAIL_EPS — the
// selfcheck derives it from these constants and asserts zero there
// and non-zero one tick before). There is NO diffusion: diffusion
// would blur the path the acceptance measures a follower against; the
// scent field diffuses because a smell spreads — a worn path does not.
//
// THE READ TERM (particles.js, beside chemotaxis). a += ∇read ×
// TRAIL_GAIN / m — the same /m shape as chemotaxis, added into the
// same pre-fatigue steering sum, so the bio-drives' vigor damps it
// exactly as it damps the scent sense (a sense, not an impulse; the
// contact impulses in AX are never touched). The gradient is bounded
// by the field's saturation (|∇| ≤ TRAIL_MAX / (2·cell) per axis), so
// the term is bounded by construction: TRAIL_GAIN is tuned so a body
// on the steepest possible trail edge is persuaded, never steered —
// it stays far under the integrator's speed clamp, and the acceptance
// probe asserts organisation by measured drift, not by saturation.
// No reduced-motion split (C2's sentence: physics does not fork on
// the flag — stillness arrives honestly: no motion, no deposit, no
// gradient, no pull). No governor tier and nothing to shed (the
// C1/C2 precedent: this is a force law, and a shed would desync the
// bake from the live dish; the substrate's cost is bounded and
// declared — at most one 64×36 Float64 field per accumulating
// stratum plus the total, one fade+deposit pass per tick).
//
// GEOMETRY. The field is the #509 scent field's grid — 64×36 cells
// over the normalized canvas, bilinear sample, central-difference
// gradient — re-implemented here rather than imported: the scent
// field's step() couples diffusion with decay and its deposit is
// gain-shaped for feeding, a different law for a different sense; the
// two substrates share a geometry and nothing else, and neither may
// drift the other's constants.

export const TRAIL_COLS = 64;
export const TRAIL_ROWS = 36;
export const TRAIL_CELLS = TRAIL_COLS * TRAIL_ROWS;

/** Per-tick fade: a cell keeps this fraction of its value each tick. */
export const TRAIL_FADE = 0.99;
/** Snap threshold: below this a faded cell becomes exactly zero, so
 *  the fade schedule reaches true zero at a computable tick. */
export const TRAIL_EPS = 0.001;
/** Cell saturation — a worn path has a ceiling (the #509 clamp). */
export const TRAIL_MAX = 4;
/** Deposit per body per tick at full speed credit. */
export const TRAIL_DEPOSIT = 0.05;
/** Speed (px/step) at which a body earns the full deposit. */
export const TRAIL_SPEED_FULL = 1.5;
/** Read gain: the force per unit gradient, before the /m. Tuned so
 *  trails persuade, never steer (see the header). */
export const TRAIL_GAIN = 0.004;

/** The off resolution: no field, no read, exactly zero contribution. */
export const NO_TRAILS = Object.freeze({ on: false, own: null, total: null });

/** One trail field: a zeroed 64×36 grid over the normalized canvas. */
export function createDishTrailField() {
  return { cells: new Float64Array(TRAIL_CELLS) };
}

/** The shared empty field: the own-field of a stratum that deposits
 *  nothing. Read-only by construction — deposits and fades only ever
 *  touch an entry's own allocated field, never this one. */
const EMPTY_TRAIL_FIELD = Object.freeze({ cells: new Float64Array(TRAIL_CELLS) });

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Deposit `amount` at normalized (u, v) — nearest cell, saturated at
 * TRAIL_MAX. Junk coordinates or amounts deposit nothing (an honest
 * boundary, like clampWetness before it).
 */
export function depositTrailAt(field, u, v, amount) {
  if (!field || !(amount > 0) || !Number.isFinite(u) || !Number.isFinite(v)) return;
  const cx = Math.min(TRAIL_COLS - 1, Math.max(0, Math.floor(u * TRAIL_COLS)));
  const cy = Math.min(TRAIL_ROWS - 1, Math.max(0, Math.floor(v * TRAIL_ROWS)));
  const k = cy * TRAIL_COLS + cx;
  const next = field.cells[k] + amount;
  field.cells[k] = next > TRAIL_MAX ? TRAIL_MAX : next;
}

/** Bilinear sample of the field at normalized (u, v). */
export function sampleTrail(field, u, v) {
  const cells = field.cells;
  const x = clamp01(u) * (TRAIL_COLS - 1);
  const y = clamp01(v) * (TRAIL_ROWS - 1);
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const x1 = Math.min(TRAIL_COLS - 1, x0 + 1);
  const y1 = Math.min(TRAIL_ROWS - 1, y0 + 1);
  const fx = x - x0; const fy = y - y0;
  const a = cells[y0 * TRAIL_COLS + x0]; const b = cells[y0 * TRAIL_COLS + x1];
  const c = cells[y1 * TRAIL_COLS + x0]; const d = cells[y1 * TRAIL_COLS + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

const _grad = { gx: 0, gy: 0 };

/** Central-difference gradient of one field at normalized (u, v). */
export function sampleTrailGradient(field, u, v, out = _grad) {
  const du = 1 / TRAIL_COLS;
  const dv = 1 / TRAIL_ROWS;
  out.gx = (sampleTrail(field, u + du, v) - sampleTrail(field, u - du, v)) / (2 * du);
  out.gy = (sampleTrail(field, u, v + dv) - sampleTrail(field, u, v - dv)) / (2 * dv);
  return out;
}

const _own = { gx: 0, gy: 0 };
const _total = { gx: 0, gy: 0 };

/**
 * The group reading at (u, v): climb the own stratum's gradient,
 * descend everyone else's — computed as 2·∇own − ∇total so the
 * others-field is never materialised (see the header). `res` must be
 * an on resolution from dishTrailsFor; anything else reads zero.
 */
export function sampleTrailReadGradient(res, u, v, out = _grad) {
  if (!res || !res.on) { out.gx = 0; out.gy = 0; return out; }
  sampleTrailGradient(res.own, u, v, _own);
  sampleTrailGradient(res.total, u, v, _total);
  out.gx = 2 * _own.gx - _total.gx;
  out.gy = 2 * _own.gy - _total.gy;
  return out;
}

/**
 * Give an enrolment its trail substrate: the session's total field
 * (created on first use — its existence is the dish's "ACCUM was up"
 * fact) and the entry's own field. The entry's step marker starts at
 * the system's current step, so only steps taken AFTER enrolment lay
 * trail. Called from enrolDishBody when the enrolment carries accum.
 */
export function ensureEntryTrails(session, entry) {
  if (!session.trailTotal) session.trailTotal = createDishTrailField();
  if (!entry.trailOwn) {
    entry.trailOwn = createDishTrailField();
    entry._trailStep = entry.sys ? entry.sys._step : 0;
  }
  return entry.trailOwn;
}

/**
 * Resolve the trail reading for one system-step: the system's own
 * field and the session total, or NO_TRAILS when the session holds no
 * substrate (ACCUM never up), the system is not enrolled in the dish,
 * or its enrolment carries radius 0 — the per-Look DISH switch off, or
 * no contacts: the dish does not touch that stratum at all, for
 * reading exactly as for depositing (the tick's radius gate). A
 * stratum that deposits nothing but IS in the dish reads through the
 * shared EMPTY field as its own term, so its read is pure avoidance
 * of the ground others wore — the issue gates the deposit on ACCUM,
 * not the reading (see the header).
 */
export function dishTrailsFor(session, sys) {
  if (!session || !session.trailTotal || !session._bySys) return NO_TRAILS;
  const e = session._bySys.get(sys);
  if (!e || !(e.radius > 0)) return NO_TRAILS;
  return { on: true, own: e.trailOwn || EMPTY_TRAIL_FIELD, total: session.trailTotal };
}

function fadeField(cells) {
  for (let k = 0; k < TRAIL_CELLS; k++) {
    const v = cells[k] * TRAIL_FADE;
    cells[k] = v < TRAIL_EPS ? 0 : v;
  }
}

/**
 * One dish step of the substrate: fade every field (the total and each
 * enrolment's own — a released stratum's field is gone with its entry,
 * its deposits live on in the total and fade there), then take
 * deposits from every enrolled stratum that STEPPED since the last
 * tick. No-ops entirely when the session holds no substrate.
 */
export function tickDishTrails(session) {
  if (!session || !session.trailTotal) return;
  fadeField(session.trailTotal.cells);
  for (const e of session.entries) {
    if (e.trailOwn) fadeField(e.trailOwn.cells);
  }
  for (const e of session.entries) {
    if (!e.trailOwn || !(e.radius > 0)) continue;
    const sys = e.sys;
    if (!sys || sys.n === 0) continue;
    if (sys._step === e._trailStep) continue; // did not step: no motion, no deposit
    e._trailStep = sys._step;
    const W = sys.canvasW || 1;
    const H = sys.canvasH || 1;
    for (let i = 0; i < sys.n; i++) {
      if (sys.alive && !sys.alive[i]) continue;
      const vx = sys.vx[i];
      const vy = sys.vy[i];
      const sp = Math.sqrt(vx * vx + vy * vy);
      if (!(sp > 0)) continue;
      const amount = TRAIL_DEPOSIT * Math.min(1, sp / TRAIL_SPEED_FULL);
      if (!(amount > 0)) continue;
      depositTrailAt(e.trailOwn, sys.x[i] / W, sys.y[i] / H, amount);
      depositTrailAt(session.trailTotal, sys.x[i] / W, sys.y[i] / H, amount);
    }
  }
}

/**
 * Wipe the substrate (state purity): every field back to exactly
 * zero, allocations kept. The resolver calls this on a seed change —
 * a fresh seed starts with an empty field; a bake never needs it (its
 * session is born empty).
 */
export function clearDishTrails(session) {
  if (!session) return;
  if (session.trailTotal) session.trailTotal.cells.fill(0);
  for (const e of session.entries || []) {
    if (e.trailOwn) e.trailOwn.cells.fill(0);
  }
}
