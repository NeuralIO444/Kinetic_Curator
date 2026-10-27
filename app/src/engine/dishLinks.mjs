/**
 * dishLinks.mjs — petri dish D3 (#1597): constraints. Distance /
 * spring links between discs of the SAME system: compound bodies
 * (parts that must hold together) and declared stuck pairs. Until
 * now every disc was a free agent and every encounter ended; a
 * declared link is the first bond that outlives the step that made
 * it, and D4's statics work stands on the same declaration shape.
 *
 * THE SOLVER — XPBD, RULED BY MATT 2026-10-16 ("solver ruled by
 * Matt 2026-10-16: XPBD inside the custom integrator"). The issue
 * left the solver open and the research (§4) compared the
 * candidates; Matt ruled XPBD. Recorded here so the ruling is
 * never mistaken for a builder's pick:
 *   · Jakobsen position relaxation — rejected in the research's
 *     own terms: in a velocity engine it needs a post-integration
 *     projection PLUS a Δv = Δx/dt fold-in — XPBD is that shape
 *     done properly, with the stiffness problem solved instead of
 *     inherited.
 *   · Box2D sequential impulses — velocity-level like the rest of
 *     the dish, but its softness is a spring-damper whose per-step
 *     meaning rides on the iteration count (research pitfall 9,
 *     stiffness amnesia): the same declared stiffness answers
 *     differently at a different count or rate.
 *   · XPBD — stiffness is a MATERIAL property (compliance α), not
 *     an emergent behaviour: α̃ = α/h² absorbs timestep and the
 *     iteration count only buys convergence on coupled systems.
 *     A spring declared in a Look means the same thing at any
 *     frame rate. That is the property this engine's "declared
 *     stiff, same behaviour live and baked" law needs.
 *
 * HOW XPBD RUNS INSIDE THIS INTEGRATOR (particles.js update()):
 *   1. PREDICT — the integrator's own step: forces, the contact
 *      passes, damping/clamp/walls, positions advance. Prediction
 *      changes in no way for links.
 *   2. SOLVE — this leaf, immediately after the integration loop,
 *      before any state step (scent, deform, coalesce, pigment,
 *      ecology) reads positions: Gauss–Seidel over the declared
 *      links in DECLARATION ORDER, LINK_ITERATIONS passes,
 *      positions only. Per link, λ ACCUMULATES across the passes
 *      within the step and resets to 0 at the next step — XPBD's
 *      rule (research §4.4: warm-start state would be checkpoint
 *      state; λ never leaves the step, so replay and checkpoint
 *      determinism are untouched).
 *        C    = dist − rest                        (px)
 *        Δλ   = (−C − α̃·λ) / (wA + wB + α̃)
 *        Δx_a = −wA·Δλ·n̂          Δx_b = +wB·Δλ·n̂
 *   3. VELOCITY UPDATE — XPBD's v = (x − x_prev)/h restricted to
 *      the correction: each moved body gains its total Δx/h,
 *      h = dtFrames. For a rigid link this cancels exactly the
 *      velocity that created the error (a satisfied link is a
 *      true no-op); for a spring it cancels the corrected share
 *      and leaves the rest — the spring stays springy with no
 *      second mechanism and no damping knob of its own (ring-down
 *      rides the engine's damping, like every dish behaviour).
 * One consequence, stated plainly: the solve is position-level,
 * so a link at rest length with separating velocities is
 * untouched BY THE SOLVE — the constraint answers the error
 * integration creates, through the fold. That is XPBD's shape,
 * not an oversight; the suite pins both halves.
 *
 * STIFFNESS: a declaration's stiffness s ∈ (0, 1] maps to
 * compliance α = LINK_COMPLIANCE · (1 − s)/s. s = 1 → α = 0
 * (rigid: one pass corrects a lone link exactly; a chain
 * converges geometrically over LINK_ITERATIONS). Softer s leaves
 * a converged residual stretch C·α̃/(wSum + α̃) under load — a
 * spring's nature — and RELAXES BACK when the load leaves, which
 * is the issue's compound acceptance shape.
 *
 * BOND FORMATION — RULED BY MATT 2026-10-16 ("bonds are
 * formable state: sustained wet grip hardens into a bond").
 * Declared links are half the contract; the other half forms
 * itself. When the per-system contact pass's friction holds a
 * pair — the stick impulse fits its Coulomb budget, no slide —
 * or the pair rests in a wet near touch under the slip ceiling
 * (the friction block's authority ends at contact; resting
 * pairs park exactly at rsum, the #1411 geometry), the pair
 * has GRIPPED, and the pass notes it here (noteBondGrip). Grip
 * is counted in STEPS, the engine's determinism unit: at
 * BOND_FORM_STEPS the pair hardens into a bond whose rest is
 * the distance it holds at formation — formed state is
 * history by definition, which is exactly what the
 * declared-rest purity rule (below) does not govern. The bond
 * solves in this same XPBD pass, rigid (hardened is rigid),
 * beside the declared links. The threshold and break
 * behaviour are the builder's design calls under Matt's
 * ruling, flagged in the staging report:
 *   · THRESHOLD: BOND_FORM_STEPS = 45 grip steps (¾ s at
 *     60 fps), BOND_GRACE_STEPS = 3 missed steps tolerated
 *     before the count restarts (a resting pair can step out
 *     of the overlap branch without ever letting go).
 *   · BREAK: a bond tears when the step's PREDICTED distance
 *     (post-integration, pre-solve — the positions this solve
 *     was handed) strains past BOND_BREAK_STRAIN = 24 px from
 *     rest. Strain, not force: the prediction is the one
 *     honest pre-solve read, and 24 px sits far above contact
 *     shoves (~11 px), cling, and thermal motion — bonds
 *     break on rips, not jostling. A torn bond's state is
 *     deleted; the pair may grip and form again from zero.
 *   · A pair that is also DECLARED solves as declared — the
 *     declaration wins, the formed bond stands down (never
 *     double-solved, state kept). Dead endpoints drop a bond
 *     at solve entry.
 *   · Formation is per-system, like the links: the
 *     cross-strata pass keeps no bond state (a cross-strata
 *     pair has two owner systems and no home for a bond).
 *   · The state lives on the system (sys._dishBonds),
 *     allocated LAZILY by the first wet grip: a dry scene
 *     never allocates, reads, or writes it, and the dry step
 *     stays bit-identical (pinned). The state is a pure
 *     function of the step history — seeded scenes replay it
 *     exactly, live and bake alike.
 *
 * BOUNDARIES (named, not discovered later):
 *   · PER-SYSTEM links only. A compound spanning strata would
 *     solve after ALL systems' contact passes; the session
 *     protocol's one trigger fires mid-update of the first
 *     system, and no frame-end trigger exists yet. Cross-strata
 *     compounds wait for one.
 *   · CENTRE-attached: the constraint acts at the centres
 *     (r = 0), so links exert NO torque — ω/θ are bit-untouched
 *     by a solve (pinned). Offset attachments are a follow-up.
 *   · Links bind INDICES (system slots), not identities: a slot
 *     recycled by _breed inherits its links. Authors declare
 *     links for authored populations; the gate drops dead or
 *     zero-mass endpoints instead of solving ghosts.
 *   · REST LENGTH IS DECLARED DATA (positive finite px), never
 *     latched from live positions — the solve stays a pure
 *     function of the columns + params, live and bake alike.
 *     (Formed bonds are the ruled exception: their rest is
 *     formation history, not declaration — see above.)
 *   · Bond state is session state, like coalescence dwell: a
 *     re-seed (init) clears it, nothing serializes it, and a
 *     reload starts unbonded.
 *   · The fold lands AFTER the integrator's velocity clamp and
 *     wall handling: a violently stretched link can leave a body
 *     one step past the clamp or the margin; the next step's
 *     clamp and walls re-assert — the same one-step lag the
 *     position readers downstream already live with.
 *   · Links are CONTACT LAW: inside the dish gate
 *     (contactRadius > 0), every step, NO cost tier and no shed
 *     (the governor precedent for the medium and friction). In
 *     a DRY scene nothing is declared and no bond can form, so
 *     the call site is skipped whole and the step is
 *     bit-identical to the pre-D3 engine (pinned); a wet scene
 *     with neither declarations nor a formed bond skips it too.
 *
 * Declarations arrive as layoutParams.dishLinks — an array of
 * { a, b, rest, stiffness? } — spread-only through the live
 * resolver and the bake driver exactly like dishSession (both
 * spread layoutParams wholesale), so NO resolver change carries
 * them and live vs bake cannot drift. Nothing here reads the
 * RNG or the clock; coincident endpoints separate along
 * the passes' own golden-angle axis from the index pair.
 */

// Gauss–Seidel passes per step. A constant of the instrument:
// with λ accumulation the passes converge the COUPLED system
// (chains, compounds); a lone link converges in one. Stiffness
// meaning does NOT ride on this number (α̃ sees to that) — the
// count buys chain rigidity only.
export const LINK_ITERATIONS = 4;
// Compliance scale: α = LINK_COMPLIANCE · (1 − s)/s, in engine
// units (frame-based). 1 puts stiffness 0.5 at α = 1 — against a
// unit-mass pair (wSum 2) a converged residual of one third of
// the stretch under steady load. One line; Matt's tune, like
// FRIC_MAX before it.
export const LINK_COMPLIANCE = 1;

// stiffness (0, 1] → compliance α. 1 is rigid (α = 0); softer
// declarations grow α hyperbolically, so the bottom of the
// range is very soft without ever reaching "no constraint" (a
// stiffness of exactly 0 is rejected by the gate instead).
export function linkCompliance(stiffness) {
  return (LINK_COMPLIANCE * (1 - stiffness)) / stiffness;
}

// — Bond formation (ruled by Matt 2026-10-16; the threshold
// and break numbers are the builder's design calls under that
// ruling, flagged in the staging report).
// Grip steps of sustained wet grip that harden into a bond:
// 45 steps = ¾ s at the canonical 60 fps step.
export const BOND_FORM_STEPS = 45;
// Missed grip steps tolerated before a pair's count restarts:
// a resting pair can step out of the overlap branch (parked
// at rsum) without ever letting go.
export const BOND_GRACE_STEPS = 3;
// The near-touch band for resting grip, × the pair's disc
// sum — the same factor coalescence reads a touch at
// (COALESCE_TOUCH): one instrument, one notion of touching.
export const BOND_TOUCH = 1.06;
// Slip ceiling for near-touch grip (px/step at the contact
// point): a pair sliding faster than this is passing, not
// resting — it accrues nothing.
export const BOND_GRIP_VT = 0.1;
// Predicted strain (px from rest, read on the positions the
// solve was handed) that tears a formed bond.
export const BOND_BREAK_STRAIN = 24;

const PAIR_KEY_STRIDE = 1048576;
function pairKey(a, b) {
  return a < b ? a * PAIR_KEY_STRIDE + b : b * PAIR_KEY_STRIDE + a;
}

// The bond state: { dwell: Map<key, {count, last}>, formed:
// Map<key, {a, b, rest}> } on the system, allocated lazily by
// the first grip note — a dry scene never creates it.
function bondState(sys) {
  if (!sys._dishBonds) sys._dishBonds = { dwell: new Map(), formed: new Map() };
  return sys._dishBonds;
}

// Note one step of GRIP for the pair (a, b): the contact pass
// calls this only when the pair held (see the call sites —
// friction's stick verdict in contact, the slip ceiling at a
// near touch). Accrues the pair's dwell in step units; at
// BOND_FORM_STEPS the pair hardens into a formed bond with
// its rest latched at the distance it holds now. Returns true
// when the pair is bonded (already, or as of this note).
export function noteBondGrip(sys, a, b) {
  const st = bondState(sys);
  const key = pairKey(a, b);
  if (st.formed.has(key)) return true;
  const step = sys._step | 0;
  const prev = st.dwell.get(key);
  const count = prev && step - prev.last <= BOND_GRACE_STEPS ? prev.count + 1 : 1;
  if (count >= BOND_FORM_STEPS) {
    st.dwell.delete(key);
    const rest = Math.hypot(sys.x[b] - sys.x[a], sys.y[b] - sys.y[a]);
    if (rest > 0) {
      st.formed.set(key, { a: a < b ? a : b, b: a < b ? b : a, rest });
      return true;
    }
    return false;
  }
  st.dwell.set(key, { count, last: step });
  // Idle dwell entries are litter: if the map grows past a
  // thousand pairs, drop the ones that have not gripped in
  // 600 steps. A pure function of the state — deterministic.
  if (st.dwell.size > 1024) {
    for (const [k, d] of st.dwell) {
      if (step - d.last > 600) st.dwell.delete(k);
    }
  }
  return false;
}

// The formed bonds as solve entries for this step, against
// the positions the solve was handed: dead endpoints drop
// their bond (state deleted), a predicted strain past
// BOND_BREAK_STRAIN tears it (state deleted), and a pair that
// is also declared stands down (the declaration wins; the
// state is kept). Formed bonds are rigid: hardened is rigid.
function formedBondLinks(sys, declared) {
  const st = sys._dishBonds;
  if (!st || st.formed.size === 0) return [];
  const X = sys.x,
    Y = sys.y,
    ALIVE = sys.alive;
  const declaredPairs = new Set();
  for (const d of declared) declaredPairs.add(pairKey(d.a, d.b));
  const out = [];
  for (const [key, bond] of st.formed) {
    const { a, b, rest } = bond;
    if (!ALIVE[a] || !ALIVE[b]) {
      st.formed.delete(key);
      continue;
    }
    if (declaredPairs.has(key)) continue;
    const d0 = Math.hypot(X[b] - X[a], Y[b] - Y[a]);
    if (Math.abs(d0 - rest) > BOND_BREAK_STRAIN) {
      st.formed.delete(key);
      continue;
    }
    out.push({ a, b, rest, stiffness: 1 });
  }
  return out;
}

// One link's Δλ for this pass: the XPBD update. C is the current
// distance error (px, + stretched), lambda the step's accumulated
// multiplier for this link, wSum = wA + wB, alphaTilde = α/h².
export function linkDeltaLambda(C, lambda, wSum, alphaTilde) {
  return (-C - alphaTilde * lambda) / (wSum + alphaTilde);
}

// The declaration gate: the ONLY read of raw declaration data.
// Keeps entries whose endpoints are distinct in-range integers,
// both alive with mass > 0, with a positive finite rest;
// stiffness defaults to 1 (rigid) and is otherwise clamped into
// (0, 1] — a non-positive or non-finite stiffness drops the
// entry (a zero-stiffness "link" is a declaration error, not a
// soft link). Junk is skipped in declaration order; the
// survivors solve in declaration order. Pure; exported for the
// suite.
export function resolveDishLinks(sys, raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const { alive, mass } = sys;
  const n = sys.n;
  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const d = raw[k];
    if (!d || typeof d !== 'object') continue;
    const a = d.a,
      b = d.b;
    if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) continue;
    if (!alive[a] || !alive[b]) continue;
    if (!(mass[a] > 0) || !(mass[b] > 0)) continue;
    const rest = d.rest;
    if (!Number.isFinite(rest) || !(rest > 0)) continue;
    let stiffness = d.stiffness;
    if (stiffness === undefined || stiffness === null) stiffness = 1;
    if (!Number.isFinite(stiffness) || stiffness <= 0) continue;
    if (stiffness > 1) stiffness = 1;
    out.push({ a, b, rest, stiffness });
  }
  return out;
}

// Solve one step's links. sys is the particle system (the
// particles.js columns); raw is the unvalidated declaration
// array; dtFrames is the step length in frames (h). Projects
// positions Gauss–Seidel, then folds the total correction into
// velocity (Δx/h) — XPBD's velocity update. Returns the number
// of links solved. Writes NOTHING when no declaration survives
// the gate.
export function solveDishLinks(sys, raw, dtFrames) {
  const declared = resolveDishLinks(sys, raw);
  const formed = formedBondLinks(sys, declared);
  const decls = formed.length ? declared.concat(formed) : declared;
  if (decls.length === 0) return 0;
  const X = sys.x,
    Y = sys.y,
    VX = sys.vx,
    VY = sys.vy;
  const MASS = sys.mass,
    SPINE = sys.spine;
  const h = dtFrames > 0 ? dtFrames : 1;
  const h2 = h * h;

  // Per-link step state: α̃ from the declared stiffness, λ from
  // 0. Both die with the step — nothing here is checkpoint state.
  const m = decls.length;
  const alphaTilde = new Float64Array(m);
  const lambda = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    alphaTilde[k] = linkCompliance(decls[k].stiffness) / h2;
  }

  // Snapshot the endpoints' predicted positions: the velocity
  // fold is (solved − predicted)/h; the passes telescope, so the
  // endpoints' totals are all the fold needs.
  const x0 = new Map(),
    y0 = new Map();
  for (let k = 0; k < m; k++) {
    const d = decls[k];
    if (!x0.has(d.a)) {
      x0.set(d.a, X[d.a]);
      y0.set(d.a, Y[d.a]);
    }
    if (!x0.has(d.b)) {
      x0.set(d.b, X[d.b]);
      y0.set(d.b, Y[d.b]);
    }
  }

  for (let iter = 0; iter < LINK_ITERATIONS; iter++) {
    for (let k = 0; k < m; k++) {
      const d = decls[k];
      const a = d.a,
        b = d.b;
      const wA = 1 / MASS[a],
        wB = 1 / MASS[b];
      const dx = X[b] - X[a],
        dy = Y[b] - Y[a];
      let dist = Math.sqrt(dx * dx + dy * dy);
      let nx, ny;
      if (dist > 1e-9) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        // Coincident: the passes' golden-angle convention, keyed
        // on the index pair — deterministic, no RNG, same axis
        // D1/D2 separate along.
        const ang = (a * 2.399963229728653 + b * 1.2) % (Math.PI * 2);
        nx = Math.cos(ang);
        ny = Math.sin(ang);
        dist = 0;
      }
      const C = dist - d.rest;
      const dl = linkDeltaLambda(C, lambda[k], wA + wB, alphaTilde[k]);
      if (dl === 0) continue;
      lambda[k] += dl;
      // Δx_i = w_i · ∇C_i · Δλ, with ∇C_a = −n̂ and ∇C_b = +n̂.
      X[a] -= wA * dl * nx;
      Y[a] -= wA * dl * ny;
      X[b] += wB * dl * nx;
      Y[b] += wB * dl * ny;
    }
  }

  // Velocity update + spine hygiene: an organism's spine
  // segment 0 is pinned to its head (the contact passes re-pin
  // it after they move heads; a projection is a move, so the
  // same hygiene here).
  for (const [i, px] of x0) {
    const ddx = X[i] - px,
      ddy = Y[i] - y0.get(i);
    if (ddx !== 0 || ddy !== 0) {
      VX[i] += ddx / h;
      VY[i] += ddy / h;
      const sp = SPINE ? SPINE[i] : null;
      if (sp && sp.length) {
        sp[0].x = X[i];
        sp[0].y = Y[i];
      }
    }
  }
  return m;
}
