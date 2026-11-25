// cultureEcology.mjs — CULTURE Phase 6, slice A: the ecology turns on — life and death.
// Pure: no DOM, no GL, no clock. The world (engine/cultureWorld.mjs) owns the ecology's state, feeds it steps,
// and hands it the tables it owns; nothing here reads time, files, or globals beyond its arguments.
//
// THE LAW THIS BUILDS (spec §2.5, §2.9, §2.10, §3.1, §4 Q1; Matt's rulings):
//   - Creatures EAT BEATS. The Queen's audible beats are the feeding: each beat the room makes audible lands as a
//     MORSEL somewhere in the dish (§3.1). A citizen senses morsels within its sensory range (3 body-lengths), turns
//     toward the nearest when it is not full, and eats one its head touches: +10 fat. RULED (Matt, 2026-11-24): a
//     strandbeest's PLANTED feet (its existing stance band) eat too; the nearest mouth wins (cultureMouthReaching). With no room reading, a silent
//     room, or an uncast dish, nothing lands.
//   - FAT. Every citizen carries fat — born with CULTURE_FAT_BIRTH, never above CULTURE_FAT_MAX — and pays upkeep
//     every world step (120 Hz): 1 fat/s for its body, 0.5 fat/s for every LOOTED limb it carries (§2.10: "every
//     carried limb costs fat upkeep"; the born limbs are the body's own and its 1 fat/s covers them).
//   - DEATH comes by STARVATION and PREDATION only (§4 Q1 — age and upkeep failure stay out). Starvation: fat 0
//     sustained 5 s; any fat restarts the clock. Predation: when a citizen's head touches a living citizen and the
//     toucher is HUNGRY (fat < 30) and at least 1.2× the other's size, the smaller dies. (Life is the soil: the dead
//     ground still withers bodies — the Phase 4 soil law, not a new cause of death; a citizen whose head withers
//     dies of 'soil' exactly as before.)
//   - The dead body DECAYS in the dish (§2.9): it stops moving under its own power (no muscle, no gait), its look
//     fades over CULTURE_CORPSE_S (30 s) in data terms (the layout's decay reading and alpha), and then its last
//     parts are gone from the table. Throughout, its LIMBS ARE LOOTABLE.
//   - A looted limb ATTACHES (§2.10, ruled): a living citizen whose head touches a corpse takes one of its limbs
//     when the looter has a FREE socket of its body PLAN that accepts that limb's kind (the cap and the sockets are
//     the plan's, never the body's own claim). The limb is re-dealt on the looter, joined to the socket's host part,
//     keeping its ORIGINAL look (each part's shape and tone, and its radii); the looter wears it, pays its upkeep,
//     and LOIS reads the worn body — an over-plan body is refused loudly (it would be a law broken upstream).
//     A socket whose occupant has been lost (the soil withers a limb root — the one limb-loss the dish has) is free
//     again and may be re-socketed.
//
// UNITS. Fat is kept in whole TICKS of 1/240 fat (CULTURE_FAT_TICKS), so every law is integer-exact: at the 120 Hz
// clock the body's 1 fat/s is 2 ticks a step and a carried limb's 0.5 fat/s is 1 tick a step; a morsel is 2,400
// ticks. Read fat as ticks / CULTURE_FAT_TICKS.
//
// SIZE (for predation) is plain: the summed disc area (π r²) of a citizen's living parts in the world's table — its
// born parts and any limb it carries. It is what the dish's physics sees of a body. (A strandbeest's legs are
// bones, not discs, so its size is its beam and hips.)
//
// ORDER (the world step). On the swarm's cadence, before the citizens' muscle: each hungry citizen SENSES the
// nearest morsel in range (stepCultureFoodSense — the hunger pull its desire reads). After the solver and the
// gait: the room's beats land as morsels (one per whole beat the gait clock crossed while the room was audible),
// then the CONTACTS — eating, predation, looting — on the settled frame. On EVERY world step, after the swarm-cadence
// block and before the soil (which still judges last): METABOLISM — upkeep, the starvation clock, corpse decay and
// removal, and morsel spoilage.
//
// DORMANT over an uncast world: no lives, no morsels, no steps counted — an uncast world hashes as before.
import { hashU01 } from './kernel/rng.js';
import {
  cultureBodyPlan,
  cultureBodyFaults,
  growCultureBody,
  CULTURE_SOCKET_ANY,
  CULTURE_BODY_REST_OVERLAP,
} from './cultureBody.mjs';
import { cultureSenseRange, cultureBodyBraces, CULTURE_NATIVE_HUNGER } from './cultureMotion.mjs';
import { cultureGrowthStage, cultureGrowthScale } from './cultureBreed.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { CULTURE_WRAP_SPAN_X, CULTURE_WRAP_SPAN_Y } from './cultureCitizens.mjs';
import { cultureBeastFeet } from './cultureBeast.mjs';

/** The ecology's clock: the world's fixed step, 120 Hz (pinned equal to cultureWorld's CULTURE_STEP_HZ). */
export const CULTURE_ECOLOGY_STEP_HZ = 120;
/** Fat's integer unit: one tick is 1/240 fat (so 0.5 fat/s at 120 Hz is exactly 1 tick a step). */
export const CULTURE_FAT_TICKS = 240;

/** Fat per beat morsel (the phasing defaults table: +10). */
export const CULTURE_MORSEL_FAT = 10;
/** Upkeep, fat per second: the body (1) and every looted limb carried (0.5) — the phasing defaults table. */
export const CULTURE_UPKEEP_BODY_FAT_S = 1;
export const CULTURE_UPKEEP_LIMB_FAT_S = 0.5;
/** Starvation: death at fat 0 sustained this long (5 s, the defaults table). */
export const CULTURE_STARVE_S = 5;
/** Decay: a body persists this long after death, limbs lootable throughout (30 s, the defaults table). */
export const CULTURE_CORPSE_S = 30;
/** Predation: a kill on contact only when the attacker's fat is below this (30, the defaults table)… */
export const CULTURE_PREDATION_FAT = 30;
/** …and its size is at least this many times the other's (1.2, the defaults table). */
export const CULTURE_PREDATION_RATIO = 1.2;

/** Fat a citizen is born with (builder's default: between the hungry line 30 and the breeding line 60). */
export const CULTURE_FAT_BIRTH = 50;
/** The most fat a citizen holds (builder's default): a full citizen neither seeks nor eats; the morsel stays. */
export const CULTURE_FAT_MAX = 100;
/** A morsel spoils this long after it lands, uneaten (§3.1: "uneaten morsels decay"; builder's default). */
export const CULTURE_MORSEL_LIFE_S = 10;
/** The most morsels standing at once; a beat landing on a full dish displaces the oldest (builder's default). */
export const CULTURE_MORSEL_CAP = 64;
/** A morsel's reach: a head disc within this many px of the morsel's point eats it (builder's default). */
export const CULTURE_MORSEL_RADIUS = 6;
/**
 * RULED (Matt, 2026-11-24): a strandbeest's PLANTED FEET EAT TOO. A foot in its stance band (engine/cultureBeast.mjs
 * cultureBeastFeet `planted` — the existing band, never a new one) eats a morsel within its hip disc's radius + the
 * morsel's reach; a swinging foot eats nothing. Same +10 as a head.
 */
export const CULTURE_FOOT_EATS = true;
/** Morsels land at least this far inside the dish's border (the rim drive keeps citizens off the edge). */
export const CULTURE_MORSEL_MARGIN = 240;
/**
 * 6A's hunger pull weight at an empty belly, in the drives' units. Phase 6B (RULED): hunger is a DAVIS drive — the
 * recipe's `drives.hunger` gene weighs the pull (engine/cultureMotion.mjs); this is the native gene's value, kept under
 * its 6A name. The ecology no longer weighs the pull: it only senses the food and the belly's emptiness.
 */
export const CULTURE_HUNGER_PULL = CULTURE_NATIVE_HUNGER;

const STEP_TICKS = (fatPerS) => (fatPerS * CULTURE_FAT_TICKS) / CULTURE_ECOLOGY_STEP_HZ;
/** Ticks a world step: the body's upkeep (2) and one looted limb's (1). */
export const CULTURE_UPKEEP_BODY_TICKS = STEP_TICKS(CULTURE_UPKEEP_BODY_FAT_S);
export const CULTURE_UPKEEP_LIMB_TICKS = STEP_TICKS(CULTURE_UPKEEP_LIMB_FAT_S);
/** Ticks a morsel feeds (2,400), a birth carries (12,000), a belly holds (24,000), and the hungry line (7,200). */
export const CULTURE_MORSEL_TICKS = CULTURE_MORSEL_FAT * CULTURE_FAT_TICKS;
export const CULTURE_FAT_BIRTH_TICKS = CULTURE_FAT_BIRTH * CULTURE_FAT_TICKS;
export const CULTURE_FAT_MAX_TICKS = CULTURE_FAT_MAX * CULTURE_FAT_TICKS;
export const CULTURE_PREDATION_FAT_TICKS = CULTURE_PREDATION_FAT * CULTURE_FAT_TICKS;
/** World steps: starvation (600), a corpse's stay (3,600), a morsel's life (1,200). */
export const CULTURE_STARVE_STEPS = CULTURE_STARVE_S * CULTURE_ECOLOGY_STEP_HZ;
export const CULTURE_CORPSE_STEPS = CULTURE_CORPSE_S * CULTURE_ECOLOGY_STEP_HZ;
export const CULTURE_MORSEL_LIFE_STEPS = CULTURE_MORSEL_LIFE_S * CULTURE_ECOLOGY_STEP_HZ;

/** The ecology's state: born dormant — no lives (the cast enrols them), no morsels. */
export function createCultureEcology() {
  return {
    /** Metabolism steps run: one per world step once the dish is cast (dormant, and uncounted, before). */
    step: 0,
    /** Morsels ever landed — the morsel channel's draw index. */
    serial: 0,
    /** The standing morsels, oldest first: { serial, x, y, born } (born = the world step it landed). */
    morsels: [],
    /** Tallies: morsels eaten, spoiled uneaten, displaced by a full dish. */
    eaten: 0,
    spoiled: 0,
    displaced: 0,
    /** Deaths this layer dealt, by cause (the soil's are the citizen layer's, as in Phase 5). */
    starved: 0,
    preyed: 0,
    /** Corpses gone from the dish (their 30 s spent). */
    removed: 0,
    /** Limbs looted and attached; loots the tables had no room for (refused, counted — never silent). */
    loots: 0,
    lootsNoRoom: 0,
    /**
     * Phase 6B — births dealt; births refused by LOIS (the baby's body or recipe), by the population cap, and by a full
     * table (each costs the parents nothing, counted — never silent); growth events.
     */
    births: 0,
    birthsRefused: 0,
    birthsCapped: 0,
    birthsNoRoom: 0,
    grown: 0,
    /** One life per citizen, in cast order (enrolCultureLife). */
    lives: [],
  };
}

/** The chain of a born limb, root to tip, as local part indices (limbs are chains: one child each). */
function bornChain(parts, root) {
  const out = [root];
  for (;;) {
    const cur = out[out.length - 1];
    const next = parts.findIndex((q, i) => i > cur && q.parent === cur && q.role === 'limb' && q.socket === null);
    if (next < 0) return out;
    out.push(next);
  }
}

/**
 * Enrol one cast citizen's life: fat at birth, no starvation clock, and its sockets in PLAN order — each with its
 * host part (local and absolute slot), angle, the kind it accepts, and its occupant: a born limb's chain as absolute
 * slots with each part's original look and radius, or empty. Phase 6B: `fat` in ticks (a cast citizen's 50 by default;
 * a bred baby's is the breeding law's), `linkFirst` the first of its born joints in the link table, `parents` its two
 * parents' indices (−1 for a cast citizen). Returns the life's index (the citizen's).
 */
export function enrolCultureLife(
  eco,
  c,
  { fat = CULTURE_FAT_BIRTH_TICKS, linkFirst = -1, parents = [-1, -1] } = {},
) {
  const plan = cultureBodyPlan(c.plan);
  const body = c.body;
  const sockets = plan.sockets.map((d, k) => {
    const s = body.sockets[k];
    if (!s || s.id !== d.id) throw new Error(`cultureEcology: body socket ${k} is not the plan's "${d.id}"`);
    const chain = s.occupant >= 0 ? bornChain(body.parts, s.occupant) : [];
    return {
      id: s.id,
      hostLocal: s.part,
      host: c.first + s.part,
      angle: s.angle,
      accepts: d.limb,
      occupant: s.occupant >= 0 ? c.first + s.occupant : -1,
      bornLocal: s.occupant,
      kind: s.occupant >= 0 ? body.parts[s.occupant].limb : '',
      looted: 0,
      from: -1,
      slots: chain.map((i) => c.first + i),
      parts: chain.map((i) => Object.freeze({ radius: body.parts[i].radius, look: body.parts[i].look })),
    };
  });
  eco.lives.push({
    fat,
    starve: 0,
    removed: 0,
    killer: -1,
    loots: 0,
    sockets,
    // Phase 6B — growth and lineage: the stage (1 at birth, cast or bred), the morsels eaten, the first of the
    // citizen's born joints in the link table (growth re-deals their rests), its BORN body (the genotype breeding reads;
    // the citizen's own `body` is the grown one), its parents (−1 for a cast citizen) and how many children it has had.
    stage: 1,
    meals: 0,
    linkFirst,
    bornBody: body,
    parents: Object.freeze([parents[0], parents[1]]),
    children: 0,
  });
  return eco.lives.length - 1;
}

/** Is this socket free — no occupant, or its occupant's root body gone (lost to the soil, or looted away)? */
function socketFree(bodies, s) {
  return !(s.occupant >= 0 && bodies.alive[s.occupant]);
}

/** Does a plan socket accept this limb kind? The plan's own word: its kind, or (ANY) any kind the plan uses. */
export function cultureSocketAccepts(plan, d, kind) {
  if (d.limb === CULTURE_SOCKET_ANY) return Object.prototype.hasOwnProperty.call(plan.limbs, kind);
  return d.limb === kind;
}

/**
 * The looter's free socket for a limb kind: the first socket of its PLAN (in the plan's order, within the plan's cap)
 * that is free and accepts the kind — or −1. The plan is read, never the body's own claim (§2.10).
 */
export function cultureFreeSocketFor(bodies, c, life, kind) {
  const plan = cultureBodyPlan(c.plan);
  const n = Math.min(plan.sockets.length, plan.socketCap);
  for (let k = 0; k < n; k++) {
    const d = plan.sockets[k];
    const s = life.sockets[k];
    if (!socketFree(bodies, s)) continue;
    if (cultureSocketAccepts(plan, d, kind)) return k;
  }
  return -1;
}

const restOf = (ra, rb) => (ra + rb) * CULTURE_BODY_REST_OVERLAP;

/**
 * The WORN body — what the citizen wears now, in the body reading's shape: its born parts and joints, then each
 * looted limb appended (its original looks and radii, joined to its socket's host at the overlap rule), and the
 * sockets as the life holds them (a socket whose occupant is a looted limb names the appended root). LOIS reads this
 * (cultureBodyFaults): the cap and the socket set are the plan's. Pure; a fresh object.
 */
export function cultureWornBody(c, life) {
  const body = c.body;
  const parts = body.parts.slice();
  const links = body.links.slice();
  const sockets = life.sockets.map((s) => {
    let occupant = -1;
    if (s.occupant >= 0) {
      if (!s.looted) occupant = s.bornLocal;
      else {
        let up = s.hostLocal;
        s.parts.forEach((p, k) => {
          parts.push({
            id: `looted.${s.id}.${k}`,
            role: 'limb',
            radius: p.radius,
            parent: up,
            socket: k === 0 ? s.id : null,
            limb: s.kind,
            look: p.look,
          });
          const i = parts.length - 1;
          links.push({ a: up, b: i, rest: restOf(parts[up].radius, p.radius) });
          if (k === 0) occupant = i;
          up = i;
        });
      }
    }
    return { id: s.id, part: s.hostLocal, angle: s.angle, accepts: s.accepts, occupant };
  });
  const worn = {
    plan: body.plan,
    scale: body.scale,
    parts,
    links,
    sockets,
    socketCap: body.socketCap,
    limbs: body.limbs,
    length: body.length,
  };
  if (body.linkage) worn.linkage = body.linkage;
  return worn;
}

/** Every living slot a citizen holds: its born parts, then each carried (looted) limb's. */
function livingSlots(bodies, c, life, out = []) {
  for (let k = 0; k < c.n; k++) if (bodies.alive[c.first + k]) out.push(c.first + k);
  for (const s of life.sockets) if (s.looted) for (const i of s.slots) if (bodies.alive[i]) out.push(i);
  return out;
}

/** A citizen's SIZE: the summed disc area (π r²) of its living parts in the table, carried limbs included. */
export function cultureCitizenSize(bodies, c, life) {
  let a = 0;
  for (const i of livingSlots(bodies, c, life)) a += Math.PI * bodies.radius[i] * bodies.radius[i];
  return a;
}

/** The predation law, alone: a hungry attacker (fat ticks below the line) at least 1.2× the prey's size. */
export function culturePredationAllowed(attackerFatTicks, attackerSize, preySize) {
  return (
    attackerFatTicks < CULTURE_PREDATION_FAT_TICKS && preySize > 0 && attackerSize / preySize >= CULTURE_PREDATION_RATIO
  );
}

const touches = (bodies, i, j) => {
  const dx = bodies.x[j] - bodies.x[i];
  const dy = bodies.y[j] - bodies.y[i];
  const rr = bodies.radius[i] + bodies.radius[j];
  return dx * dx + dy * dy < rr * rr;
};

/** Does citizen a's head touch any living part of citizen b (born or carried)? */
export function cultureHeadTouches(bodies, a, b, lifeB) {
  const h = a.first;
  if (!bodies.alive[h]) return false;
  for (const i of livingSlots(bodies, b, lifeB)) if (touches(bodies, h, i)) return true;
  return false;
}

function lifeAt(eco, idx) {
  const life = eco.lives[idx];
  if (!life) throw new Error(`cultureEcology: citizen ${idx} has no life enrolled`);
  return life;
}

/** Is the room audible — a reading heard and not silent? (No reading = no beats: the dish nobody feeds.) */
export function cultureRoomAudible(room) {
  return !!room && room.energy !== null && room.energy !== undefined && !room.silent;
}

/**
 * Land one morsel (a beat): its place drawn from the registered 'culture-morsel' channel at the world seed and the
 * morsel's serial, inside CULTURE_MORSEL_MARGIN of the border; a full dish displaces its oldest. Returns the morsel.
 */
export function landCultureMorsel(eco, seed, step) {
  const k = eco.serial;
  const m = CULTURE_MORSEL_MARGIN;
  const x = m + hashU01(seed, 'culture-morsel', k * 2) * (CULTURE_SWARM_WORLD_W - 2 * m);
  const y = m + hashU01(seed, 'culture-morsel', k * 2 + 1) * (CULTURE_SWARM_WORLD_H - 2 * m);
  eco.serial += 1;
  if (eco.morsels.length >= CULTURE_MORSEL_CAP) {
    eco.morsels.shift();
    eco.displaced += 1;
  }
  const morsel = { serial: k, x, y, born: step };
  eco.morsels.push(morsel);
  return morsel;
}

/**
 * The beats land (after the gait clock stepped): one morsel for every whole beat the clock crossed — from beat b0 to
 * beat b1 — while the room is audible. Returns how many landed.
 */
export function landCultureBeats(eco, seed, room, b0, b1, step) {
  if (!cultureRoomAudible(room)) return 0;
  let n = 0;
  for (let b = Math.floor(b0) + 1; b <= Math.floor(b1); b++) {
    landCultureMorsel(eco, seed, step);
    n++;
  }
  return n;
}

/**
 * SENSES — the hunger pull (before the muscle, on the swarm's cadence): each living citizen that is not full finds the
 * nearest morsel to its head within its sensory range (ties to the earlier morsel) and carries it as `food`
 * { x, y, emptiness } — emptiness = 1 − fat / max. A full citizen, or none in range: no food (null). The HUNGER drive
 * reads it (Phase 6B — engine/cultureMotion.mjs CULTURE_DRIVES.hunger, weighed by the recipe's hunger gene); with no
 * food the desire is exactly the other drives'.
 */
export function stepCultureFoodSense(bodies, citizens, eco) {
  citizens.list.forEach((c, idx) => {
    if (!c.alive) {
      c.food = null;
      return;
    }
    const life = lifeAt(eco, idx);
    if (life.fat >= CULTURE_FAT_MAX_TICKS || !eco.morsels.length) {
      c.food = null;
      return;
    }
    const hx = bodies.x[c.first];
    const hy = bodies.y[c.first];
    const range = cultureSenseRange(c.body);
    let best = null;
    let bd = range * range;
    for (const m of eco.morsels) {
      const d2 = (m.x - hx) ** 2 + (m.y - hy) ** 2;
      if (d2 <= bd && (!best || d2 < bd)) {
        best = m;
        bd = d2;
      }
    }
    c.food = best ? { x: best.x, y: best.y, emptiness: 1 - life.fat / CULTURE_FAT_MAX_TICKS } : null;
  });
}

function die(world, idx, cause, killer = -1) {
  const c = world.citizens.list[idx];
  c.alive = 0;
  c.diedStep = world.step;
  c.cause = cause;
  c.food = null;
  world.citizens.died += 1;
  const life = world.ecology.lives[idx];
  life.killer = killer;
  if (cause === 'starvation') world.ecology.starved += 1;
  else if (cause === 'predation') world.ecology.preyed += 1;
}

/** Gone from the table: a slot's body dead and its soil clock cleared (Phase 4: a dead body carries no clock). */
function retireSlot(world, i) {
  world.bodies.alive[i] = 0;
  world.soil.wither[i] = 0;
}

/**
 * The mouths that can eat this step, in canonical order: per living citizen (cast order; a full one is passed over per
 * morsel by cultureMouthReaching) its
 * head disc, then — a strandbeest's, RULED — each PLANTED foot (leg order), reaching its hip disc's radius + the
 * morsel's. Each { idx, x, y, reach, rank } (rank 0 a head, 1 a foot).
 */
export function cultureMouths(bodies, citizens, eco) {
  const out = [];
  citizens.list.forEach((c, idx) => {
    if (!c.alive || !bodies.alive[c.first]) return;
    lifeAt(eco, idx); // every mouth has a life (fullness is judged per morsel, cultureMouthReaching)
    const h = c.first;
    out.push({ idx, x: bodies.x[h], y: bodies.y[h], reach: bodies.radius[h] + CULTURE_MORSEL_RADIUS, rank: 0 });
    if (!c.linkage || !CULTURE_FOOT_EATS) return;
    // the feet in leg (socket) order; leg i's foot hangs from the hip born in socket i
    for (const f of cultureBeastFeet(bodies, c)) {
      if (!f.alive || !f.planted) continue;
      const hip = c.body.sockets[f.leg].occupant;
      out.push({ idx, x: f.x, y: f.y, reach: bodies.radius[c.first + hip] + CULTURE_MORSEL_RADIUS, rank: 1 });
    }
  });
  return out;
}

/**
 * Which citizen eats morsel m: the mouth (of `mouths`, cultureMouths' canonical order) that reaches it nearest; on an
 * exact tie the first in that order — the earlier citizen, a citizen's head before its feet, an earlier leg before a
 * later. A citizen already full (filled by an earlier morsel this step) does not eat. −1 when no mouth reaches it.
 */
export function cultureMouthReaching(mouths, eco, m) {
  let who = -1;
  let bd = Infinity;
  for (const mo of mouths) {
    if (eco.lives[mo.idx].fat >= CULTURE_FAT_MAX_TICKS) continue; // full (or filled by an earlier morsel this step)
    const d2 = (m.x - mo.x) ** 2 + (m.y - mo.y) ** 2;
    if (d2 < mo.reach * mo.reach && d2 < bd) {
      who = mo.idx;
      bd = d2;
    }
  }
  return who;
}

/**
 * GROWTH (Phase 6B): the citizen's body becomes its BORN body at its stage's size (cultureGrowthScale — every part's
 * radius, the joints re-dealt at the overlap rule, the length, the scale), and the tables follow: each born part's disc
 * radius and each born joint's rest in place (masses kept); its braces re-read from the grown body; and each born limb
 * still on its socket records its grown radii (a looter takes the limb at the size it had). Carried (looted) limbs keep
 * their original size — they are worn, not grown. Refused loudly for a life with no joints on record.
 */
export function growCultureCitizen(world, idx) {
  const { bodies, links, citizens, ecology: eco } = world;
  const c = citizens.list[idx];
  const life = lifeAt(eco, idx);
  if (!(life.linkFirst >= 0)) throw new Error(`cultureEcology: citizen ${idx} has no joints on record to grow`);
  const grown = growCultureBody(life.bornBody, cultureGrowthScale(life.stage));
  c.body = grown;
  c.brace = cultureBodyBraces(grown);
  for (let k = 0; k < c.n; k++) bodies.radius[c.first + k] = grown.parts[k].radius;
  grown.links.forEach((l, j) => {
    links.rest[life.linkFirst + j] = l.rest;
  });
  life.sockets = life.sockets.map((s) =>
    s.looted || s.bornLocal < 0 || !s.slots.length
      ? s
      : {
          ...s,
          parts: s.slots.map((i, k) =>
            Object.freeze({ radius: grown.parts[i - c.first].radius, look: s.parts[k].look }),
          ),
        },
  );
  eco.grown += 1;
}

/**
 * EATING (the settled frame, the swarm's cadence): each morsel, oldest first, goes to the mouth that reaches it —
 * a hungry living citizen's head disc, or (RULED) a strandbeest's planted foot — the NEAREST mouth winning; on an
 * exact tie the earlier citizen, a citizen's head before its feet, the earlier leg (cultureMouthReaching).
 * +10 fat to the mouth's citizen, capped at the max; the meal counts toward its growth (Phase 6B — a stage earned grows it
 * at once, cultureGrowCitizen). Returns how many were eaten.
 */
export function stepCultureEating(world) {
  const { bodies, citizens, ecology: eco } = world;
  let eaten = 0;
  if (!eco.morsels.length) return 0;
  const mouths = cultureMouths(bodies, citizens, eco);
  eco.morsels = eco.morsels.filter((m) => {
    const who = cultureMouthReaching(mouths, eco, m);
    if (who < 0) return true;
    const life = eco.lives[who];
    life.fat = Math.min(CULTURE_FAT_MAX_TICKS, life.fat + CULTURE_MORSEL_TICKS);
    eco.eaten += 1;
    // Phase 6B — GROWTH: every morsel counts; each CULTURE_GROWTH_MEALS-th earns a stage, to the cap
    life.meals += 1;
    const stage = cultureGrowthStage(life.meals);
    if (stage > life.stage) {
      life.stage = stage;
      growCultureCitizen(world, who);
    }
    eaten++;
    return false;
  });
  return eaten;
}

/**
 * PREDATION (the settled frame, the swarm's cadence): each living citizen in cast order, if hungry, whose head touches
 * a living citizen it outsizes by the ratio, kills it — cause 'predation', one kill an attacker a step. The kill
 * feeds no fat (the food web is beats, ruled); the prey's body is a corpse, its limbs lootable. Returns the kills.
 */
export function stepCulturePredation(world) {
  const { bodies, citizens, ecology: eco } = world;
  const list = citizens.list;
  let kills = 0;
  for (let a = 0; a < list.length; a++) {
    const A = list[a];
    if (!A.alive) continue;
    const lifeA = lifeAt(eco, a);
    const sizeA = cultureCitizenSize(bodies, A, lifeA);
    for (let b = 0; b < list.length; b++) {
      if (b === a || !list[b].alive) continue;
      const lifeB = lifeAt(eco, b);
      if (!cultureHeadTouches(bodies, A, list[b], lifeB)) continue;
      if (!culturePredationAllowed(lifeA.fat, sizeA, cultureCitizenSize(bodies, list[b], lifeB))) continue;
      die(world, b, 'predation', a);
      kills++;
      break;
    }
  }
  return kills;
}

/**
 * Attach one limb: the corpse's socket `src` (a living limb) moves onto the looter's free socket `k`. The limb's
 * living chain (root first, to its first gone part) is re-dealt as fresh slots on the looter — each part its original
 * radius, look and mass, laid out from the socket's host along the socket's angle at the overlap rule, moving with the
 * host — joined to the host and down the chain by fresh links; the corpse's slots are gone. LOIS reads the worn body
 * first: a fault there is a law broken upstream, refused loudly. A table with no room refuses the loot (counted).
 * Returns true when the limb attached.
 */
export function cultureAttachLimb(world, looterIdx, k, corpseIdx, src) {
  const { bodies, links, citizens, ecology: eco } = world;
  const L = citizens.list[looterIdx];
  const lifeL = lifeAt(eco, looterIdx);
  const lifeC = lifeAt(eco, corpseIdx);
  const from = lifeC.sockets[src];
  const take = [];
  for (let j = 0; j < from.slots.length && bodies.alive[from.slots[j]]; j++) take.push(j);
  if (!take.length) return false;
  if (bodies.count + take.length > bodies.capacity || links.count + take.length > links.capacity) {
    eco.lootsNoRoom += 1;
    return false;
  }
  const sock = lifeL.sockets[k];
  const parts = take.map((j) => from.parts[j]);
  const next = { ...sock, occupant: bodies.count, kind: from.kind, looted: 1, from: corpseIdx, slots: [], parts };
  const trial = { ...lifeL, sockets: lifeL.sockets.map((s, q) => (q === k ? next : s)) };
  const faults = cultureBodyFaults(cultureWornBody(L, trial));
  if (faults.length)
    throw new Error(`cultureEcology: LOIS refuses citizen ${looterIdx}'s worn body: ${faults.join('; ')}`);
  // deal the limb on the looter: its parts laid out from the host along the socket's angle at the citizen's heading
  const host = sock.host;
  const dir = L.heading + sock.angle;
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  let px = bodies.x[host];
  let py = bodies.y[host];
  let pr = L.body.parts[sock.hostLocal].radius;
  let up = host;
  take.forEach((j, q) => {
    const old = from.slots[j];
    const i = bodies.count;
    const r = parts[q].radius;
    const rest = restOf(pr, r);
    px += ux * rest;
    py += uy * rest;
    bodies.alive[i] = 1;
    bodies.x[i] = px;
    bodies.y[i] = py;
    bodies.vx[i] = bodies.vx[host];
    bodies.vy[i] = bodies.vy[host];
    bodies.mass[i] = bodies.mass[old];
    bodies.radius[i] = r;
    bodies.count += 1;
    const l = links.count;
    links.a[l] = up;
    links.b[l] = i;
    links.rest[l] = rest;
    links.count += 1;
    next.slots.push(i);
    up = i;
    pr = r;
  });
  for (const j of take) retireSlot(world, from.slots[j]);
  // the corpse's socket is empty now (its limb is worn elsewhere)
  lifeC.sockets[src] = { ...from, occupant: -1, kind: '', looted: 0, from: -1, slots: [], parts: [] };
  lifeL.sockets[k] = next;
  lifeL.loots += 1;
  eco.loots += 1;
  return true;
}

/**
 * LOOTING (the settled frame, the swarm's cadence): each living citizen in cast order whose head touches a corpse
 * (dead, not yet gone) takes ONE limb a step — the corpse's first living limb, in its socket order, that one of the
 * looter's free plan sockets accepts (cultureFreeSocketFor). Returns the loots.
 */
export function stepCultureLooting(world) {
  const { bodies, citizens, ecology: eco } = world;
  const list = citizens.list;
  let n = 0;
  for (let a = 0; a < list.length; a++) {
    const A = list[a];
    if (!A.alive) continue;
    const lifeA = lifeAt(eco, a);
    let done = false;
    for (let b = 0; b < list.length && !done; b++) {
      if (b === a || list[b].alive || eco.lives[b].removed) continue;
      const lifeB = lifeAt(eco, b);
      if (!cultureHeadTouches(bodies, A, list[b], lifeB)) continue;
      for (let s = 0; s < lifeB.sockets.length && !done; s++) {
        const src = lifeB.sockets[s];
        if (socketFree(bodies, src)) continue;
        const k = cultureFreeSocketFor(bodies, A, lifeA, src.kind);
        if (k < 0) continue;
        if (cultureAttachLimb(world, a, k, b, s)) n++;
        done = true;
      }
    }
  }
  return n;
}

/**
 * METABOLISM — every world step: each living citizen pays its upkeep (2 ticks for the body, 1 for each living looted
 * limb), never below 0; at fat 0 its starvation clock counts, and any fat restarts it; at CULTURE_STARVE_STEPS
 * sustained it dies, cause 'starvation'. Each corpse decays: CULTURE_CORPSE_STEPS after its death its last parts
 * (born and carried) are gone. Morsels older than their life spoil. Advances eco.step — over a cast world only.
 */
export function stepCultureMetabolism(world) {
  const { bodies, citizens, ecology: eco } = world;
  // dormant over an uncast world (the gait layer's precedent): nothing counts, so an uncast world steps and hashes
  // exactly as it did before this slice
  if (!citizens.list.length) return;
  citizens.list.forEach((c, idx) => {
    const life = lifeAt(eco, idx);
    if (c.alive) {
      let cost = CULTURE_UPKEEP_BODY_TICKS;
      for (const s of life.sockets)
        if (s.looted && s.occupant >= 0 && bodies.alive[s.occupant]) cost += CULTURE_UPKEEP_LIMB_TICKS;
      life.fat = Math.max(0, life.fat - cost);
      if (life.fat === 0) life.starve += 1;
      else life.starve = 0;
      if (life.starve >= CULTURE_STARVE_STEPS) die(world, idx, 'starvation');
      return;
    }
    if (life.removed) return;
    if (world.step - c.diedStep >= CULTURE_CORPSE_STEPS) {
      for (const i of livingSlots(bodies, c, life)) retireSlot(world, i);
      life.removed = 1;
      eco.removed += 1;
    }
  });
  const before = eco.morsels.length;
  eco.morsels = eco.morsels.filter((m) => world.step - m.born < CULTURE_MORSEL_LIFE_STEPS);
  eco.spoiled += before - eco.morsels.length;
  eco.step += 1;
}

/**
 * One body across the seam, for the limbs a citizen carries (the citizens' rehome covers its born parts): each living
 * carried slot more than half a wrap span from the citizen's anchor (its first living born part) moves back one span.
 */
export function rehomeCultureCarried(bodies, citizens, eco) {
  const hx = CULTURE_WRAP_SPAN_X / 2;
  const hy = CULTURE_WRAP_SPAN_Y / 2;
  citizens.list.forEach((c, idx) => {
    const life = eco.lives[idx];
    if (!life) return;
    let a = -1;
    for (let k = 0; k < c.n && a < 0; k++) if (bodies.alive[c.first + k]) a = c.first + k;
    if (a < 0) return;
    for (const s of life.sockets) {
      if (!s.looted) continue;
      for (const i of s.slots) {
        if (!bodies.alive[i]) continue;
        const dx = bodies.x[i] - bodies.x[a];
        const dy = bodies.y[i] - bodies.y[a];
        if (dx > hx) bodies.x[i] -= CULTURE_WRAP_SPAN_X;
        else if (dx < -hx) bodies.x[i] += CULTURE_WRAP_SPAN_X;
        if (dy > hy) bodies.y[i] -= CULTURE_WRAP_SPAN_Y;
        else if (dy < -hy) bodies.y[i] += CULTURE_WRAP_SPAN_Y;
      }
    }
  });
}

/**
 * A citizen's life as data (the read door's): fat (in fat units), how far it has starved (0..1), its corpse decay
 * (0 while alive, rising to 1 at removal), whether it is gone, its killer, its loots, and its sockets — each with its
 * kind, whether looted, where from, and how many parts it carries. A fresh object.
 */
export function cultureLifeReading(world, idx) {
  const c = world.citizens.list[idx];
  const life = lifeAt(world.ecology, idx);
  const decay = c.alive ? 0 : life.removed ? 1 : Math.min(1, (world.step - c.diedStep) / CULTURE_CORPSE_STEPS);
  return {
    fat: life.fat / CULTURE_FAT_TICKS,
    starving: life.starve / CULTURE_STARVE_STEPS,
    decay,
    removed: life.removed === 1,
    cause: c.cause,
    killer: life.killer,
    loots: life.loots,
    stage: life.stage,
    meals: life.meals,
    parents: [life.parents[0], life.parents[1]],
    children: life.children,
    sockets: life.sockets.map((s) => ({
      id: s.id,
      accepts: s.accepts,
      kind: s.kind,
      free: socketFree(world.bodies, s),
      looted: s.looted === 1,
      from: s.from,
      parts: s.slots.length,
    })),
  };
}

/** The carried limbs' parts as layout entries (appended after the born parts): original looks, provenance. */
export function cultureCarriedLayout(bodies, c, life, baseCount) {
  const out = [];
  for (const s of life.sockets) {
    if (!s.looted) continue;
    let parent = s.hostLocal;
    s.slots.forEach((i, k) => {
      const q = s.parts[k];
      const px = k === 0 ? bodies.x[c.first + s.hostLocal] : bodies.x[s.slots[k - 1]];
      const py = k === 0 ? bodies.y[c.first + s.hostLocal] : bodies.y[s.slots[k - 1]];
      const dx = bodies.x[i] - px;
      const dy = bodies.y[i] - py;
      const ang = dx * dx + dy * dy > 1e-18 ? Math.atan2(-dy, -dx) : c.heading;
      out.push({
        id: `looted.${s.id}.${k}`,
        role: 'limb',
        parent,
        look: q.look,
        alive: bodies.alive[i] === 1,
        x: bodies.x[i],
        y: bodies.y[i],
        radius: bodies.radius[i],
        rot: (ang * 180) / Math.PI,
        looted: { socket: s.id, kind: s.kind, from: s.from },
      });
      parent = baseCount + out.length - 1;
    });
  }
  return out;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the ecology: its step, the morsel serial and tallies, every standing morsel (serial, place,
 * birth), and per life its fat, starvation clock, removal, killer, loots, and each socket (occupant, kind, looted,
 * provenance, slots, each carried part's radius and look). FNV-1a, the cultureSoilHash discipline — the world hash
 * folds this in whole.
 */
export function cultureEcologyHash(eco) {
  let h = 0x811c9dc5;
  const mix = (byte) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const mixU32 = (v) => {
    mix(v & 255);
    mix((v >>> 8) & 255);
    mix((v >>> 16) & 255);
    mix((v >>> 24) & 255);
  };
  const mixFloat = (v) => {
    _f64.setFloat64(0, v);
    for (let i = 0; i < 8; i++) mix(_f64.getUint8(i));
  };
  const mixStr = (s) => {
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i) & 255);
    mix(0);
  };
  mixU32(eco.step);
  mixU32(eco.serial);
  for (const k of [
    'eaten',
    'spoiled',
    'displaced',
    'starved',
    'preyed',
    'removed',
    'loots',
    'lootsNoRoom',
    'births',
    'birthsRefused',
    'birthsCapped',
    'birthsNoRoom',
    'grown',
  ])
    mixU32(eco[k]);
  mixU32(eco.morsels.length);
  for (const m of eco.morsels) {
    mixU32(m.serial);
    mixFloat(m.x);
    mixFloat(m.y);
    mixU32(m.born);
  }
  mixU32(eco.lives.length);
  for (const life of eco.lives) {
    mixU32(life.fat);
    mixU32(life.starve);
    mix(life.removed);
    mixU32(life.killer | 0);
    mixU32(life.loots);
    // Phase 6B: growth, lineage, and the born body (the genotype — each part's radius and look)
    mixU32(life.stage);
    mixU32(life.meals);
    mixU32(life.linkFirst | 0);
    mixU32(life.parents[0] | 0);
    mixU32(life.parents[1] | 0);
    mixU32(life.children);
    mixFloat(life.bornBody.scale);
    mixU32(life.bornBody.parts.length);
    for (const p of life.bornBody.parts) {
      mixFloat(p.radius);
      mixStr(p.look.shape);
      mixStr(p.look.tone);
    }
    mixU32(life.sockets.length);
    for (const s of life.sockets) {
      mixStr(s.id);
      mixU32(s.occupant | 0);
      mixStr(s.kind);
      mix(s.looted);
      mixU32(s.from | 0);
      mixU32(s.slots.length);
      for (const i of s.slots) mixU32(i);
      for (const p of s.parts) {
        mixFloat(p.radius);
        mixStr(p.look.shape);
        mixStr(p.look.tone);
      }
    }
  }
  return h >>> 0;
}
