// dishEcology.mjs — petri dish C4 (#1416): ecology. The petri lane's
// final stage. Spec: docs/research/petri-dish-physics-scope-2026-10-12.md
// §5 (population) + open question 3; issue #1416.
//
// #167's breed/die contact modes were per-system toys: each system
// bred up to its own quality cap and died on its own contacts, and no
// system knew the dish existed. C4 makes population a dish regime:
//
//   THE MODE (spec open question 3, the spec's recommendation, built
//   as the issue's terms state it) — ecology is a MODE on the dish:
//   the per-Look `ecology` boolean (default OFF, beside A3's `dish`
//   switch in layout params). While the mode is off, an enrolled
//   stratum's populations are EXACTLY AS DEALT — its breed/die
//   contact events do not fire in the dish at all (acceptance 3).
//   Ecology is a performance decision, not a default behaviour, and
//   OFF is what keeps every pre-C4 document bit-identical: no shipped
//   voice or preset carries contactRadius > 0 (A3's record), so no
//   existing dish ever enrols, and a system updated with no session
//   at all (the #167 lab path, bakeParticles) is untouched either
//   way — the resolution below is null there and the per-system pass
//   runs exactly as #167 shipped it.
//
//   PARTICIPATION — a stratum is governed when it is enrolled in the
//   step's dish session at radius > 0 (the C1 gate: in the dish) and
//   its enrolment carries the mode on. Enrolment carries the mode and
//   the governor's cap (the threaded maxParticles), exactly as it
//   carries WETNESS (C1) and the ACCUMULATION switch (C3): the live
//   resolver and the bake driver enrol through the same helper, so
//   live and bake can never disagree about the regime. A stratum the
//   DISH switch enrols at radius 0 is not in the dish — ecology does
//   not touch it, and its #167 pass runs as dealt (A3's law).
//
//   THE GLOBAL CAP (issue: "Global cap accounting at the governor;
//   per-system caps become shares, not independent ceilings") — the
//   ledger lives on the session (session.ecology), the one object
//   both drivers share. The global cap G is the SUM of the
//   participating strata's dealt caps — the governor's own numbers,
//   pooled; no new magic number is minted. Each stratum's cap becomes
//   its SHARE of the pool: not a ceiling (a stratum may breed past
//   its share by borrowing share other strata are not using), but a
//   guarantee (while it is under its share, the pool always has room
//   for it) — what is enforced, on every birth, is the pool: the
//   dish's living total never exceeds G. The ledger is ACCOUNTING:
//   enrolment refreshes each member's living count from its alive
//   column (enrolment precedes the update in both drivers), and every
//   birth and death inside the pass notes itself the moment it
//   happens, so a later stratum's gate in the same step reads exact
//   books. A released stratum leaves the ledger — its share leaves
//   the pool with it (contrast C3's trails: a trail belongs to the
//   ground and outlives its stratum; a cap share belongs to the
//   living and does not).
//
//   THE BREED GATE (issue: "sparse → breed allowed; crowded →
//   suppressed") — a breed event fires only when the parents' local
//   density reads sparse: dishDensityShare (B3's field, the shared
//   grid's own per-cell count, saturating at DISH_DENSITY_SATURATE)
//   at the parents' midpoint must be under ECOLOGY_BREED_DENSITY_
//   SHARE. The gate reads the field the cross-strata pass stamped
//   this step (update() resolves ecology after runDishContacts, so
//   every stratum reads the same step's field). No field — a session
//   that never armed (fewer than two contact strata) — reads as
//   empty: the density gate opens and only the cap binds. The crowd
//   signal is the shared grid's; a lone stratum has no shared grid
//   (A1's law), so its ecology is cap-only. Growth itself still
//   requires the dealt breed mode: ecology gates births, it does
//   not invent them.
//
//   DIE PRESSURE (issue: "die pressure rises with sustained
//   crowding"; acceptance: "a crowded colony thins") — contact
//   deaths alone cannot thin a packed colony: a resting crowd has
//   no approach events. So each participating body carries an
//   exposure column (sys.ecoCrowd, step-counted state like B2's
//   dwell): a step spent above ECOLOGY_CROWD_SHARE accrues exposure
//   in proportion to the excess (a saturated cell accrues a full
//   unit per step); a step at or below the line sheds ECOLOGY_RELIEF.
//   A body whose exposure reaches ECOLOGY_DIE_EXPOSURE is ripe, and
//   the step kills at most ECOLOGY_DIE_PER_STEP bodies per system —
//   the ripest first, ties by lowest index — through the ordinary
//   death path (alive 0, index on the freelist, ledger noted). The
//   one-per-step budget is what makes it THINNING rather than a
//   cull: deaths lower the density that feeds the accrual, so the
//   pressure relieves itself as the colony thins. Pressure applies
//   to every participating stratum whatever its dealt mode — growth
//   and thinning are the mode's two halves; a breed-dealt colony
//   that could grow but never thin would only ever pack to the cap.
//   The dealt die MODE also still fires under the mode (contact
//   deaths as dealt, ledger noted) — pressure is the sustained-
//   crowding term the contact mode cannot express.
//
//   DETERMINISM & PARITY — the ledger, the gate, and the exposure
//   are pure functions of (seed, params, steps): no clock, no dice,
//   no hash draws. Deaths from pressure are chosen by exposure and
//   index only. The bake enrols and steps through the same helpers
//   as the resolver, so a baked dish breeds, is gated, and thins
//   exactly as the live one (pinned in the selfcheck).
//
//   STILLNESS — under reduced-motion the pressure step holds
//   entirely (B3's precedent: state that produces visible change
//   does not accrue under the stillness; when the dish resolves once
//   and holds, no colony may thin in the dark). The breed gate is
//   contact law, not accrual — like the medium (C1) it has no
//   reduced-motion split.
//
//   GOVERNOR — no cost tier and no shed (the C1/C2/C3 precedent,
//   followed deliberately): a shed that rewrote population law
//   mid-performance would desync the bake from the live dish, since
//   bakes carry no governor state. §7's ladder lists body counts
//   LAST — and that rung is the cap itself: the governor's budget
//   IS this stage's governor surface, enforced as accounting rather
//   than as a fidelity shed. The cost is bounded and declared: one
//   Float64 column per body, one density sample per body per step
//   (participating strata only), one O(total) count per enrolment.
//
// particles.js and dishContacts.mjs take call sites only; the law
// lives here (the B1 one-writer pattern).

import { dishDensityShare } from './dishDensity.mjs'; // #1412 — the shared grid's per-cell count, as a share

/** Breed is suppressed when the parents' local density reads at or
 *  above this share of saturation (B3's DISH_DENSITY_SATURATE bodies
 *  per cell). Half saturation — 4 bodies in the parents' cell — is a
 *  crowd, not free space. */
export const ECOLOGY_BREED_DENSITY_SHARE = 0.5;

/** The crowd line for die pressure: exposure accrues only above this
 *  density share — the same half-saturation line the breed gate
 *  reads, so the stage has ONE definition of crowded. */
export const ECOLOGY_CROWD_SHARE = 0.5;

/** Exposure (in full-crowd steps) at which a body is ripe to die:
 *  240 steps of saturated crowding ≈ 4 s at 60 fps. Accrual is
 *  proportional to the excess over the crowd line, so a cell at
 *  three-quarter saturation ripens in ~480 steps. */
export const ECOLOGY_DIE_EXPOSURE = 240;

/** Exposure shed per step spent at or below the crowd line:
 *  pressure is sustained crowding's memory, and it fades at half
 *  the rate full crowding builds it. */
export const ECOLOGY_RELIEF = 0.5;

/** Deaths from pressure per system per step. One is the thinning
 *  rate: each death lowers the density feeding the accrual, so the
 *  colony relieves its own pressure as it thins. */
export const ECOLOGY_DIE_PER_STEP = 1;

/** Living bodies in one system (the alive column is the truth). */
export function countEcologyAlive(sys) {
  if (!sys || !sys.alive) return 0;
  let n = 0;
  for (let i = 0; i < sys.n; i++) if (sys.alive[i]) n += 1;
  return n;
}

/** Recompute the pool from the member records: the global cap is the
 *  sum of the dealt caps, the total is the sum of the living counts,
 *  and each record's share is its own cap re-read as a portion of
 *  the pool (equal in value, different in kind — see the header). */
function recomputeEcologyLedger(session) {
  const L = session.ecology;
  if (!L) return;
  let cap = 0;
  let total = 0;
  for (const rec of L.entries.values()) {
    cap += rec.cap;
    total += rec.alive;
  }
  L.globalCap = cap;
  L.total = total;
  for (const rec of L.entries.values()) rec.share = rec.cap;
}

/**
 * Enrolment's ecology bookkeeping (called from enrolDishBody for
 * EVERY enrolment, so membership always reflects the latest dealt
 * params): an enrolment carrying the mode joins the session ledger
 * (created on first use — its existence is the dish's "ecology was
 * dealt" fact) with the governor's cap it carries, and its living
 * count is refreshed from the alive column — enrolment precedes the
 * update in both drivers, so the refresh reads the exact pre-step
 * population, and the pass's own notes keep it exact within the
 * step. An enrolment without the mode leaves the ledger.
 */
export function ensureEcologyEntry(session, entry) {
  if (!session) return null;
  if (!entry.ecology) {
    const L = session.ecology;
    if (L && L.entries.delete(entry)) recomputeEcologyLedger(session);
    return null;
  }
  if (!session.ecology) session.ecology = { entries: new Map(), globalCap: 0, total: 0 };
  const L = session.ecology;
  let rec = L.entries.get(entry);
  if (!rec) {
    rec = { cap: 0, share: 0, alive: 0 };
    L.entries.set(entry, rec);
  }
  rec.cap = entry.cap;
  rec.alive = countEcologyAlive(entry.sys);
  recomputeEcologyLedger(session);
  return rec;
}

/** A released stratum leaves the ledger (releaseDishBody's hook):
 *  its share leaves the pool with it. */
export function removeEcologyEntry(session, entry) {
  if (!session || !session.ecology) return;
  if (session.ecology.entries.delete(entry)) recomputeEcologyLedger(session);
}

/**
 * Resolve the ecology for one system-step:
 *   null          — the system is not in the dish (no session, not
 *                   enrolled, or enrolled at radius 0): ecology does
 *                   not apply and the per-system pass runs exactly
 *                   as #167 shipped it;
 *   { on: false } — enrolled in the dish, mode off: the stratum's
 *                   breed/die contact events are suppressed, its
 *                   populations exactly as dealt;
 *   { on: true, field, ledger, entry, record } — a participating
 *                   stratum: gated breed, ledger accounting, and
 *                   the pressure step. `field` is the session's
 *                   density field as stamped by the most recent
 *                   cross-strata pass (null until one runs).
 */
export function dishEcologyFor(session, sys) {
  if (!session || !session._bySys) return null;
  const e = session._bySys.get(sys);
  if (!e || !(e.radius > 0)) return null;
  const L = session.ecology || null;
  const rec = L ? L.entries.get(e) : undefined;
  if (!rec) return { on: false };
  return { on: true, field: session.density || null, ledger: L, entry: e, record: rec };
}

/**
 * The breed gate for one event, read at the parents' midpoint:
 * the local density must read sparse (under the breed share of the
 * B3 field — an absent field reads empty), the pool must have room
 * (the living total under the global cap), and this stratum must
 * have headroom: its own unused share plus every share the other
 * strata are not using. (At today's cap-weighted shares the
 * headroom condition is implied by the pool condition — the pool
 * has room exactly when someone is under share — but the gate is
 * stated in share terms because shares are the accounting unit:
 * were the weights ever to change, the arbitration already reads
 * correctly.)
 */
export function ecologyBreedAllowed(eco, x, y) {
  if (!eco || !eco.on) return false;
  if (dishDensityShare(eco.field, x, y) >= ECOLOGY_BREED_DENSITY_SHARE) return false;
  const L = eco.ledger;
  const rec = eco.record;
  if (!(L.total < L.globalCap)) return false;
  let headroom = rec.share - rec.alive;
  for (const other of L.entries.values()) {
    if (other === rec) continue;
    const unused = other.share - other.alive;
    if (unused > 0) headroom += unused;
  }
  return headroom > 0;
}

/** A birth inside the pass, noted the moment it happens. */
export function ecologyNoteBirth(eco) {
  eco.record.alive += 1;
  eco.ledger.total += 1;
}

/** A death inside the pass or the pressure step, noted likewise. */
export function ecologyNoteDeath(eco) {
  eco.record.alive -= 1;
  eco.ledger.total -= 1;
}

/**
 * The pressure step (end of update, participating strata only):
 * accrue each living body's exposure from its cell's density share,
 * relieve it under the crowd line, and kill the ripest — at most
 * ECOLOGY_DIE_PER_STEP, exposure descending, ties by lowest index —
 * through the ordinary death path. Holds entirely under
 * reduced-motion (see the header). Returns the deaths this step.
 */
export function stepDishEcology(sys, eco, { reducedMotion = false } = {}) {
  if (!eco || !eco.on || reducedMotion) return 0;
  const E = sys.ecoCrowd;
  if (!E) return 0;
  const ALIVE = sys.alive;
  const X = sys.x;
  const Y = sys.y;
  const field = eco.field;
  // Accrue (or relieve) the whole cast first — the step's deaths are
  // chosen from the completed step's pressure, never mid-accrual.
  const ripe = [];
  for (let i = 0; i < sys.n; i++) {
    if (!ALIVE[i]) continue;
    const share = dishDensityShare(field, X[i], Y[i]);
    if (share > ECOLOGY_CROWD_SHARE) {
      E[i] += (share - ECOLOGY_CROWD_SHARE) / (1 - ECOLOGY_CROWD_SHARE);
    } else if (E[i] > 0) {
      E[i] = Math.max(0, E[i] - ECOLOGY_RELIEF);
    }
    if (E[i] >= ECOLOGY_DIE_EXPOSURE) ripe.push(i);
  }
  if (ripe.length === 0) return 0;
  // The ripest die first; ties break by lowest index, so the choice
  // is a pure function of the state. The per-step budget is what
  // makes this thinning rather than a cull.
  ripe.sort((a, b) => (E[b] - E[a]) || (a - b));
  const deaths = Math.min(ECOLOGY_DIE_PER_STEP, ripe.length);
  for (let k = 0; k < deaths; k++) {
    const victim = ripe[k];
    ALIVE[victim] = 0;
    sys._dead.push(victim);
    E[victim] = 0;
    ecologyNoteDeath(eco);
  }
  return deaths;
}
