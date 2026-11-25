// cultureLab.mjs — CULTURE Phase 5, slice A: the Lab's casting path into the dish (rig spawning,
// the parent issue 2168, on the CULTURE foundation). Pure: no DOM, no GL, no clock. It reads the
// soil's published field and a seed; it writes nothing — the world's cast door
// (cultureWorld.mjs castCultureTake) deals what the Lab returns.
//
// THE CASTING (spec §2.8 and §4 Q2, ruled): "CURATOR directs the Lab. KINETIC assembles bodies from
// parts. DAVIS writes the recipes. LOIS is the gate." … "The Lab casts fresh each take. KINETIC
// assembles the bodies, DAVIS writes the recipes, LOIS gates the cast. A take does not inherit a
// standing zoo population." One function per role, each doing only its own verb:
//
//   CURATOR   directs: reads the cast sheet (which plan, how many), and for every slot auditions a
//             fixed number of candidates — where each enters the dish and facing where (STAGING,
//             the principle the Curator owns) — then takes LOIS's best-ranked admitted candidate.
//   KINETIC   assembles the candidate's body from the plan (engine/cultureBody.mjs) at a seeded
//             scale inside his band.
//   DAVIS     writes the candidate's recipe: the plan's native recipe, each dial leaned by a seeded
//             share and held inside the recipe bounds (engine/cultureMotion.mjs); and the stroke's
//             birth phase, so a cast does not swim in lockstep.
//   LOIS      gates and ranks; she never builds. Hard faults refuse a candidate (a malformed body, a
//             recipe the reading refuses, a head on dead ground, a part outside the dish, a head
//             crowding an earlier cast member); an admitted candidate gets her praise, 0..1, and
//             praise under the bar refuses it too. Her praise is the quality bar (§2.8).
//
// Everything is a pure function of (seed, soil field, sheet): the same take casts the same cast,
// on any device. Seeded draws ride registered channels ('culture-cast' placement, 'culture-recipe'
// motion; kernel/rng.js STRING_CHANNEL_GROUPS). Breeding rights from LOIS's praise were NOT ruled
// (§2.8) and are not built; praise is recorded on the citizen for later phases to read.
import { hashU01 } from './kernel/rng.js';
import {
  assembleCultureBody,
  cultureBodyRestPose,
  cultureBodyFaults,
  cultureBodyPlan,
  CULTURE_LOOK_SHAPES,
  CULTURE_PLAN_DISH,
  CULTURE_PLAN_MOTH,
  CULTURE_PLAN_STRANDBEEST,
  CULTURE_BODY_SCALE_MIN,
  CULTURE_BODY_SCALE_MAX,
} from './cultureBody.mjs';
import {
  normalizeCultureRecipe,
  cultureRecipeFaults,
  CULTURE_RECIPE_BOUNDS,
  CULTURE_NATIVE_HUNGER,
} from './cultureMotion.mjs';
import { cultureSoilSample } from './cultureSoil.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { JANSEN_RELATIVE, MEASURE_IDS, MEASURE_RANGES } from './jansenMeasures.js';

/** Candidates CURATOR auditions per cast slot. */
export const CULTURE_CAST_AUDITIONS = 16;
/** Citizens one take may cast at most (the cast door refuses a sheet past it). */
export const CULTURE_CAST_CAP = 64;
/** LOIS's bar: an admitted candidate's praise must reach this. */
export const CULTURE_LOIS_BAR = 0.5;
/** DAVIS's lean: each native dial is leaned by at most this share, either way, then held in bounds. */
export const CULTURE_DAVIS_LEAN = 0.15;
/** CURATOR's staging margin, in body-lengths from the dish's border (the rest pose's tail stays in). */
export const CULTURE_CAST_MARGIN_BODY_LENGTHS = 1.5;
/** CURATOR's spacing: no two cast heads closer than this many body-lengths (nobody is born tangled). */
export const CULTURE_CAST_SPACING_BODY_LENGTHS = 2;
/**
 * KINETIC's measure lean for a linkage body (slice C): each of the thirteen Jansen measure genes is the wild type
 * leaned by at most this share, either way, and held in its legal range (k's ±2 % tripwire clamps it). At 6 % about
 * three seeded sets in ten cannot assemble — stillbirths LOIS refuses (the epic's law 2) — so the gate is exercised and
 * a slot of sixteen auditions still finds a living beast.
 */
export const CULTURE_KINETIC_MEASURE_LEAN = 0.06;

/**
 * The native recipes, one per plan — the temperament DAVIS starts each body from. The dish
 * creature's: a restless drifter that leans hard toward living ground and never crosses the rim,
 * swimming in eased strokes of 1.2 s with a small wind-up, a heavy head (3:1 over the spine, the
 * legacy dish creature's ratio, in the heavy-citizen units the bounds explain) and a swinging tail. Every
 * value is a starting constant inside the bounds, tunable in iteration.
 */
export const CULTURE_NATIVE_RECIPES = Object.freeze({
  [CULTURE_PLAN_DISH]: normalizeCultureRecipe({
    name: 'dish/native',
    drives: { wander: 0.6, ground: 1, rim: 2, hunger: CULTURE_NATIVE_HUNGER },
    physics: { thrust: 0.35, headMass: 60, partMass: 20, paddle: 0.1, tone: 0.6 },
    seasoning: {
      timing: 72,
      slowInOut: 2,
      anticipation: 0.3,
      arcs: 0.6,
      followThrough: 0.6,
      squash: 0.18,
      secondary: 0.05,
      exaggeration: 1.2,
    },
  }),
  // Slice B — the flagship. A flitterer: snappier arcs than the dish creature, a short stroke of 0.8 s with
  // a small wind-up, its wings and antennae lagging the stroke (followThrough 0.8), a restless wander and
  // a wide berth from the rim (its wings reach a body-length and more to either side). As heavy as the dish
  // creature (head 60, parts 20): at head 40 the swarm's flocking, which divides by mass, over fourteen
  // discs shoved the head out of the dish in the rim's face (probed: up to 8 px past the border in one
  // seed of five); at 60 / 20, zero overshoot over twenty seeds. The wingbeat (3 a stroke) is the plan's
  // anatomy; `paddle` here is its amplitude.
  [CULTURE_PLAN_MOTH]: normalizeCultureRecipe({
    name: 'moth/native',
    drives: { wander: 0.8, ground: 1, rim: 2.2, hunger: CULTURE_NATIVE_HUNGER },
    physics: { thrust: 0.34, headMass: 60, partMass: 20, paddle: 0.35, tone: 0.5 },
    seasoning: {
      timing: 48,
      slowInOut: 1.5,
      anticipation: 0.2,
      arcs: 0.35,
      followThrough: 0.8,
      squash: 0.22,
      secondary: 0.08,
      exaggeration: 1.4,
    },
  }),
  // Slice C — the strandbeest. The plan reads the dials its own way (engine/cultureBeast.mjs
  // CULTURE_BEAST_DIAL_READING): thrust is the stance stroke's ADVANCE (0.85 of the stroke becomes travel),
  // paddle is the banks' TURN GAIN (0.5, beastRoam's own), tone is the feet's GRIP (0.8), timing is the crank's
  // period (60 steps: one turn a second, ≈ 75 px/s for the wild type), slowInOut the crank's ease, arcs the
  // steering lock. A plodder: it wanders less than the swimmers and keeps a wide berth from the rim (its legs
  // reach a third of a body-length outward). One rigid chassis: every part as heavy as the head (60) and no
  // follow-through lightening — the swarm's flocking divides by mass, and over a light hip and tail its separation
  // pushed the frame's own parts apart unevenly, a net drag backward that stalled the walk (probed). anticipation is not
  // read by this plan (its gait is its geometry); it stands at the dish creature's value so DAVIS leans it as ever.
  [CULTURE_PLAN_STRANDBEEST]: normalizeCultureRecipe({
    name: 'strandbeest/native',
    drives: { wander: 0.5, ground: 1, rim: 2.4, hunger: CULTURE_NATIVE_HUNGER },
    physics: { thrust: 0.85, headMass: 60, partMass: 60, paddle: 0.5, tone: 0.8 },
    seasoning: {
      timing: 60,
      slowInOut: 1.5,
      anticipation: 0.3,
      arcs: 0.4,
      followThrough: 0,
      squash: 0.1,
      secondary: 0.03,
      exaggeration: 1,
    },
  }),
});

/** CURATOR's default cast sheet: three dish creatures — the first citizen, a few of them. */
export const CULTURE_CAST_SHEET = Object.freeze({ plan: CULTURE_PLAN_DISH, count: 3 });

/**
 * CURATOR's take sheet — what the gate's shell casts (slice B): the dish creatures first, exactly as
 * the default sheet casts them (slots 0..2 draw the same candidates), then the flagship, two moths.
 * A sheet may be one plan and a count ({ plan, count }, the slice A shape) or a roster of them
 * ({ roster: [{ plan, count }, …] }), cast in order; slots count on through the roster.
 */
export const CULTURE_TAKE_SHEET = Object.freeze({
  roster: Object.freeze([
    Object.freeze({ plan: CULTURE_PLAN_DISH, count: 3 }),
    Object.freeze({ plan: CULTURE_PLAN_MOTH, count: 2 }),
    // slice C: two strandbeests walk in after the swimmers (their slots come last, so every earlier slot draws as before)
    Object.freeze({ plan: CULTURE_PLAN_STRANDBEEST, count: 2 }),
  ]),
});

/** The sheet's reading: a known plan and a whole count in [0, CULTURE_CAST_CAP], or a loud refusal. */
export function normalizeCultureCastSheet(sheet = CULTURE_CAST_SHEET) {
  const plan = sheet && sheet.plan;
  cultureBodyPlan(plan);
  if (!CULTURE_NATIVE_RECIPES[plan]) throw new Error(`cultureLab: no native recipe for plan "${plan}"`);
  const count = sheet.count;
  if (!Number.isInteger(count) || count < 0 || count > CULTURE_CAST_CAP)
    throw new Error(`cultureLab: cast count "${String(count)}" — a whole number in [0, ${CULTURE_CAST_CAP}]`);
  return Object.freeze({ plan, count });
}

/**
 * A sheet read as a roster: the slice A shape ({ plan, count }) is a roster of one; a roster is a
 * non-empty list of { plan, count }, each read by normalizeCultureCastSheet, the total within
 * CULTURE_CAST_CAP. Returns the frozen list of entries. A loud refusal otherwise.
 */
export function normalizeCultureCastRoster(sheet = CULTURE_CAST_SHEET) {
  const list = sheet && Array.isArray(sheet.roster) ? sheet.roster : null;
  if (!list) return Object.freeze([normalizeCultureCastSheet(sheet)]);
  if (!list.length) throw new Error('cultureLab: a roster needs at least one entry');
  const entries = list.map((e) => normalizeCultureCastSheet(e));
  const total = entries.reduce((n, e) => n + e.count, 0);
  if (total > CULTURE_CAST_CAP) throw new Error(`cultureLab: the roster casts ${total} — at most ${CULTURE_CAST_CAP}`);
  return Object.freeze(entries);
}

/**
 * KINETIC's measure genes for a linkage body: the wild type, each gene leaned by a seeded share of at most
 * ±CULTURE_KINETIC_MEASURE_LEAN and held in its legal range. Pure in (seed, candidate). A set that cannot assemble is
 * dealt as it falls — the stillbirth is LOIS's to refuse, never KINETIC's to hide.
 */
export function kineticMeasures(seed, candidate) {
  const out = {};
  MEASURE_IDS.forEach((id, d) => {
    const u = hashU01(seed, 'culture-linkage', candidate * 16 + d) * 2 - 1;
    const r = MEASURE_RANGES[id];
    out[id] = Math.min(r.max, Math.max(r.min, JANSEN_RELATIVE[id] * (1 + CULTURE_KINETIC_MEASURE_LEAN * u)));
  });
  return out;
}

/** KINETIC: the candidate's body, the plan at a seeded scale in his band (and a linkage plan's measure genes). */
export function kineticAssemble(plan, seed, candidate) {
  const u = hashU01(seed, 'culture-cast', candidate * 4 + 3);
  const scale = CULTURE_BODY_SCALE_MIN + u * (CULTURE_BODY_SCALE_MAX - CULTURE_BODY_SCALE_MIN);
  if (!cultureBodyPlan(plan).linkage) return assembleCultureBody(plan, { scale });
  return assembleCultureBody(plan, { scale, measures: kineticMeasures(seed, candidate) });
}

/**
 * The TEMPERAMENT dials in canonical order: [group, key] pairs over the bounds table, every dial but the hunger gene.
 * DAVIS leans these at cast with draw index = position (exactly the 5A–6A draws — the hunger gene, added in 6B, takes a
 * draw index of its own after them, so no earlier dial's draw moves), and LOIS's temperament reads exactly these.
 */
const DIALS = Object.freeze(
  Object.keys(CULTURE_RECIPE_BOUNDS)
    .flatMap((g) => Object.keys(CULTURE_RECIPE_BOUNDS[g]).map((k) => [g, k]))
    .filter(([g, k]) => !(g === 'drives' && k === 'hunger')),
);
/** The hunger gene's own draw index on the 'culture-recipe' channel (after the 16 temperament dials; 31 is the phase). */
const HUNGER_DRAW = DIALS.length;
/**
 * DAVIS's lean on the HUNGER gene at cast: ±15 % (RULED by Matt, 2026-11-25 — the follow-up to Phase 6B's lean 0).
 * Each cast citizen's gene is native (2) × (1 + u · 0.15), u uniform in [−1, 1] from the gene's own draw index
 * (HUNGER_DRAW — no temperament dial's draw moves), held inside the gene bounds [0, 4]. Breeding blends it
 * (engine/cultureBreed.mjs); LOIS reads only the temperament dials, never this gene. Lean 0 reproduces 6A's hunger
 * (the native 2) bit for bit — the cultureBreed proof runs at lean 0 through `davisWrite`'s `hungerLean` argument.
 */
export const CULTURE_DAVIS_HUNGER_LEAN = 0.15;

/**
 * DAVIS: the candidate's recipe — the plan's native recipe, each dial leaned by a seeded share of
 * at most ±CULTURE_DAVIS_LEAN and held inside its bounds (TIMING rounds to whole steps; the hunger gene by
 * CULTURE_DAVIS_HUNGER_LEAN, ±15 %, its own draw) — plus the stroke's birth phase 0..1. The recipe passes the one reading before it leaves his desk.
 */
export function davisWrite(plan, seed, candidate, hungerLean = CULTURE_DAVIS_HUNGER_LEAN) {
  const native = CULTURE_NATIVE_RECIPES[plan];
  const out = { name: native.name, drives: {}, physics: {}, seasoning: {} };
  DIALS.forEach(([g, k], d) => {
    const u = hashU01(seed, 'culture-recipe', candidate * 32 + d) * 2 - 1;
    const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
    let v = Math.min(hi, Math.max(lo, native[g][k] * (1 + CULTURE_DAVIS_LEAN * u)));
    if (k === 'timing') v = Math.min(hi, Math.max(lo, Math.round(v)));
    out[g][k] = v;
  });
  {
    const u = hashU01(seed, 'culture-recipe', candidate * 32 + HUNGER_DRAW) * 2 - 1;
    const [lo, hi] = CULTURE_RECIPE_BOUNDS.drives.hunger;
    out.drives.hunger = Math.min(hi, Math.max(lo, native.drives.hunger * (1 + hungerLean * u)));
  }
  return { recipe: normalizeCultureRecipe(out), phase0: hashU01(seed, 'culture-recipe', candidate * 32 + 31) };
}

/**
 * How far a recipe stands from its plan's native, 0 (the native itself) .. 1 (every dial at a bound's far side) — over
 * the temperament dials (the hunger gene is appetite, not temperament: LOIS never reads it, so the gene cannot move her praise or the cast).
 */
function recipeDistance(plan, recipe) {
  const native = CULTURE_NATIVE_RECIPES[plan];
  let sum = 0;
  for (const [g, k] of DIALS) {
    const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
    sum += Math.abs(recipe[g][k] - native[g][k]) / (hi - lo);
  }
  return sum / DIALS.length;
}

/** LOIS's praise of a body and recipe standing on a ground reading (the formula loisGate ranks by; she only reads). */
function loisPraiseOn(body, recipe, ground) {
  const graphic = new Set(body.parts.map((p) => p.look.shape)).size / CULTURE_LOOK_SHAPES.length;
  const temperament = 1 - recipeDistance(body.plan, recipe);
  return 0.5 * ground.fertility + 0.25 * graphic + 0.25 * temperament;
}

/**
 * LOIS's praise, 0..1, of a body and recipe at a point of the soil — the same formula her gate ranks a cast by (half the
 * ground's fertility, a quarter the graphic range, a quarter the temperament). Phase 6B records it on a bred baby (born
 * where its parents met); it gates nothing there (the birth's gate is the body's and the recipe's faults). Pure.
 */
export function loisPraise(body, recipe, field, x, y) {
  return loisPraiseOn(body, recipe, cultureSoilSample(field, x, y));
}

/**
 * LOIS: the gate and the rank. Returns { admitted, praise, faults }. Hard faults (any refuses):
 * the body's own (cultureBodyFaults — including "a sticker"), the recipe's (the reading), the
 * head on dead ground, a rest-pose part outside the dish, a head within the spacing of an earlier
 * cast head. Praise, 0..1, when there is no hard fault: half the ground's fertility under the head
 * (a citizen cast where it can live), a quarter the body's graphic range (distinct shapes over the
 * vocabulary — more layout, less sticker), a quarter the recipe's temperament (closeness to the
 * native). Praise under CULTURE_LOIS_BAR refuses. She reads; she never builds or edits.
 */
export function loisGate(candidate, field, earlier = []) {
  const { body, recipe, x, y, heading } = candidate;
  const faults = [...cultureBodyFaults(body), ...cultureRecipeFaults(recipe)];
  const ground = cultureSoilSample(field, x, y);
  if (!ground.living) faults.push('head on dead ground');
  const pose = cultureBodyRestPose(body, x, y, heading);
  if (pose.some((p) => !(p.x >= 0 && p.x < CULTURE_SWARM_WORLD_W && p.y >= 0 && p.y < CULTURE_SWARM_WORLD_H)))
    faults.push('a part outside the dish');
  const spacing = CULTURE_CAST_SPACING_BODY_LENGTHS * body.length;
  for (const e of earlier) if (Math.hypot(e.x - x, e.y - y) < spacing) faults.push('crowding an earlier cast member');
  if (faults.length) return Object.freeze({ admitted: false, praise: 0, faults: Object.freeze(faults) });
  const praise = loisPraiseOn(body, recipe, ground);
  if (!(praise >= CULTURE_LOIS_BAR))
    return Object.freeze({ admitted: false, praise, faults: Object.freeze(['under the bar']) });
  return Object.freeze({ admitted: true, praise, faults: Object.freeze([]) });
}

/**
 * CURATOR's audition: one candidate for one slot — where it enters the dish (a seeded spot inside
 * the staging margin) and facing where (a seeded heading), KINETIC's body, DAVIS's recipe and birth
 * phase. Pure: the same (plan, seed, slot, audition) is the same candidate.
 */
export function curatorAudition(plan, seed, slot, audition) {
  const cand = slot * CULTURE_CAST_AUDITIONS + audition;
  const body = kineticAssemble(plan, seed, cand);
  const m = CULTURE_CAST_MARGIN_BODY_LENGTHS * body.length;
  const x = m + hashU01(seed, 'culture-cast', cand * 4) * (CULTURE_SWARM_WORLD_W - 2 * m);
  const y = m + hashU01(seed, 'culture-cast', cand * 4 + 1) * (CULTURE_SWARM_WORLD_H - 2 * m);
  const heading = hashU01(seed, 'culture-cast', cand * 4 + 2) * Math.PI * 2 - Math.PI;
  const { recipe, phase0 } = davisWrite(plan, seed, cand);
  return { slot, audition, body, recipe, phase0, x, y, heading };
}

/**
 * CURATOR directs one cast: for each slot of the sheet, CULTURE_CAST_AUDITIONS candidates — each
 * placed (a seeded spot inside the staging margin, a seeded heading), assembled by KINETIC, given
 * a recipe by DAVIS, and gated by LOIS against the cast so far — and the slot goes to LOIS's
 * best-praised admitted candidate (ties to the earlier audition). A slot with no admitted
 * candidate is refused and recorded with its last audition's faults; the cast goes on without it.
 * Returns { members, refused }, frozen. Pure.
 */
export function curatorCast(seed, field, sheet = CULTURE_CAST_SHEET) {
  const roster = normalizeCultureCastRoster(sheet);
  const members = [];
  const refused = [];
  let slot = 0;
  for (const entry of roster) {
    for (let n = 0; n < entry.count; n++, slot++) {
      let best = null;
      let lastFaults = [];
      for (let a = 0; a < CULTURE_CAST_AUDITIONS; a++) {
        const candidate = curatorAudition(entry.plan, seed, slot, a);
        const verdict = loisGate(candidate, field, members);
        if (!verdict.admitted) {
          lastFaults = verdict.faults;
          continue;
        }
        if (!best || verdict.praise > best.praise) best = Object.freeze({ ...candidate, praise: verdict.praise });
      }
      if (best) members.push(best);
      else refused.push(Object.freeze({ slot, faults: lastFaults }));
    }
  }
  return Object.freeze({ members: Object.freeze(members), refused: Object.freeze(refused) });
}
