// cultureBreed.mjs — CULTURE Phase 6, slice B: breeding and growth — the laws, pure.
// Pure: no DOM, no GL, no clock, no chance. The world (engine/cultureWorld.mjs stepCultureBreeding) deals what these
// decide; the ecology (engine/cultureEcology.mjs) counts the meals growth reads. Nothing here writes anything.
//
// THE LAW THIS BUILDS (spec §2.8, §3.3, §3.4; Matt's rulings, 2026-11-24):
//   - BREEDING. Two ELIGIBLE citizens of the SAME PLAN touch (contact as 6A defines it: one's head disc overlapping any
//     living part of the other) → a baby is born. Eligible = fat ≥ 60 and growth stage ≥ 2 (the phasing defaults table).
//     Each parent pays 25 fat; the baby is born with 50.
//   - THE BODY MIX. Per part, a coin flip picks the parent that part's look and size come from (whole, never averaged;
//     engine/cultureBody.mjs mixCultureBodies). Only the parents' BORN bodies are read: looted limbs are worn, never
//     inherited. A strandbeest's linkage (one crank, one measure set for every leg) is one more part with one flip.
//   - THE RECIPE BLEND (§2.8, ruled: "Bred creatures inherit a blend of their parents' recipes"): every dial the mean of
//     the two parents' (TIMING rounded to whole steps, DAVIS's own rule) — the hunger gene included (RULED: hunger is a
//     DAVIS drive, blended by breeding).
//   - LOIS GATES THE BABY: its body (cultureBodyFaults — the plan's cap and sockets) and its recipe (the one reading). A
//     refusal means no birth (and, the builder's call, no fat paid: the cost is the birth's, and there was none).
//   - GROWTH (§3.4): stage 1 at birth (cast or bred); +1 stage every 5 morsels eaten; at most stage 3. Each stage scales
//     the body by CULTURE_GROWTH_STAGE_SCALE (every part's radius, the joints, the length — and so the size predation
//     reads, the summed disc area).
//
// THE BABY PREVIEW (T3, the parent issue 2344 — engine only): cultureBabyPreview is the one function a birth and a
// preview share. Given two creatures ({ body, recipe } — a citizen's BORN body, or a Lab candidate's) and a key (seed,
// serial), it returns the child the dish would deal for that key: the flips, the body, the blended recipe, the birth
// phase and heading, and LOIS's verdict. Deterministic, and it mutates nothing — the world's birth calls it with the
// world seed and the birth serial, so a preview with the same key IS the baby that would be born.
import { hashU01 } from './kernel/rng.js';
import { mixCultureBodies, cultureBodyFaults } from './cultureBody.mjs';
import { normalizeCultureRecipe, cultureRecipeFaults, CULTURE_RECIPE_BOUNDS } from './cultureMotion.mjs';

/** Breeding eligibility: fat at least this (60, the defaults table)… */
export const CULTURE_BREED_FAT = 60;
/** …and growth stage at least this (2, the defaults table). */
export const CULTURE_BREED_STAGE = 2;
/** What each parent pays for a birth, in fat (RULED: 25). */
export const CULTURE_BIRTH_COST_FAT = 25;
/** The fat a bred baby is born with (RULED: 50). */
export const CULTURE_BABY_FAT = 50;
/** Growth: one stage every this many morsels eaten (RULED: 5)… */
export const CULTURE_GROWTH_MEALS = 5;
/** …from stage 1 at birth, at most this stage (RULED: 3). */
export const CULTURE_GROWTH_STAGE_MAX = 3;
/**
 * Each stage past the first scales the body by this (builder's default, RULED "a modest per-stage scale"): radius ×1.08,
 * so disc area ×1.1664 a stage — one stage alone stays under predation's 1.2 ratio, two stages (×1.36) cross it.
 */
export const CULTURE_GROWTH_STAGE_SCALE = 1.08;
/**
 * The most LIVING citizens a dish holds (builder's default): a birth that would pass it is refused, counted, and costs
 * nothing. 32 — four and a half times the take sheet's seven, half the Lab's cast cap — bounds the contact and
 * predation passes (quadratic in the living) so a rich room cannot explode the step's cost.
 */
export const CULTURE_POPULATION_CAP = 32;
/** Draws one birth may take on the 'culture-breed' channel (part flips, then the linkage flip, the phase, the heading). */
export const CULTURE_BREED_DRAWS = 64;
const DRAW_LINKAGE = 60;
const DRAW_PHASE = 61;
const DRAW_HEADING = 62;

/** The growth stage a count of morsels eaten earns: 1 + one per CULTURE_GROWTH_MEALS, at most the cap. */
export function cultureGrowthStage(meals) {
  return Math.min(CULTURE_GROWTH_STAGE_MAX, 1 + Math.floor(meals / CULTURE_GROWTH_MEALS));
}

/** The size factor a growth stage carries: CULTURE_GROWTH_STAGE_SCALE per stage past the first (stage 1 is 1). */
export function cultureGrowthScale(stage) {
  let f = 1;
  for (let s = 1; s < stage; s++) f *= CULTURE_GROWTH_STAGE_SCALE;
  return f;
}

/**
 * The breeding law, alone: two creatures may breed when they are of the SAME PLAN and BOTH eligible — fat (in ticks, of
 * `fatTicks` per fat) at least CULTURE_BREED_FAT and growth stage at least CULTURE_BREED_STAGE.
 */
export function cultureBreedAllowed(planA, a, planB, b, fatTicks) {
  const eligible = (l) => l.fat >= CULTURE_BREED_FAT * fatTicks && l.stage >= CULTURE_BREED_STAGE;
  return planA === planB && eligible(a) && eligible(b);
}

/**
 * THE RECIPE BLEND: every dial of the bounds table the mean of the parents' (TIMING rounded to whole steps), named
 * '<plan>/bred'. Returns the raw blend (unread): LOIS's reading is the preview's. Pure.
 */
export function cultureBlendRecipe(ra, rb, plan) {
  const out = { name: `${plan}/bred` };
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS)) {
    out[g] = {};
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const va = ra && ra[g] ? ra[g][k] : undefined;
      const vb = rb && rb[g] ? rb[g][k] : undefined;
      let v = (va + vb) / 2;
      if (k === 'timing') v = Math.round(v);
      out[g][k] = v;
    }
  }
  return out;
}

/**
 * THE BABY PREVIEW (T3) — and the one deal every birth uses. `parentA` / `parentB`: { body, recipe } (a citizen's BORN
 * body — never its worn one — or a Lab candidate's). `key`: { seed, serial } — the birth's draws on 'culture-breed'.
 * Returns, frozen: { plan, admitted, faults, body, recipe, fromB, linkageFromB, phase0, heading, stage: 1, fat } —
 * `fromB` the per-part flips (0 = parent A, 1 = parent B), `linkageFromB` the linkage's flip (−1 for a plan without
 * one), `recipe` the blend as read (null when the reading refuses it), `faults` LOIS's (the body's, then the recipe's).
 * Refused loudly: parents of different plans or structures (the dish breeds within a plan). Deterministic; mutates
 * nothing. Pure.
 */
export function cultureBabyPreview(parentA, parentB, { seed = 0, serial = 0 } = {}) {
  const a = parentA && parentA.body;
  const b = parentB && parentB.body;
  if (!a || !b) throw new Error('cultureBreed: a preview needs two creatures, each { body, recipe }');
  if (!Number.isInteger(serial) || serial < 0) throw new Error(`cultureBreed: birth serial "${String(serial)}"`);
  if (a.parts.length > DRAW_LINKAGE)
    throw new Error(`cultureBreed: ${a.parts.length} parts — at most ${DRAW_LINKAGE} draws a birth`);
  const s = seed >>> 0;
  const key = serial * CULTURE_BREED_DRAWS;
  const fromB = Object.freeze(a.parts.map((_, k) => (hashU01(s, 'culture-breed', key + k) < 0.5 ? 1 : 0)));
  const linked = !!(a.linkage || b.linkage);
  const linkageFromB = linked ? (hashU01(s, 'culture-breed', key + DRAW_LINKAGE) < 0.5 ? 1 : 0) : -1;
  const body = mixCultureBodies(a, b, fromB, linked ? linkageFromB : 0);
  const raw = cultureBlendRecipe(parentA.recipe, parentB.recipe, a.plan);
  const recipeFaults = cultureRecipeFaults(raw);
  const faults = Object.freeze([...cultureBodyFaults(body), ...recipeFaults]);
  return Object.freeze({
    plan: a.plan,
    admitted: faults.length === 0,
    faults,
    body,
    recipe: recipeFaults.length ? null : normalizeCultureRecipe(raw),
    fromB,
    linkageFromB,
    phase0: hashU01(s, 'culture-breed', key + DRAW_PHASE),
    heading: hashU01(s, 'culture-breed', key + DRAW_HEADING) * Math.PI * 2 - Math.PI,
    stage: 1,
    fat: CULTURE_BABY_FAT,
  });
}
