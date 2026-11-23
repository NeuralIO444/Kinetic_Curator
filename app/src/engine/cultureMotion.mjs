// cultureMotion.mjs — CULTURE Phase 5, slice A: Motion Core's CULTURE seam (the parent issue
// 2109). Pure: no DOM, no GL, no clock. The world feeds it state; it never reads time.
//
// THE ONE BEHAVIOUR API citizens use. Spec §1: "a behaviour architecture in the spirit of Joshua
// Davis's HYPE framework attaches reusable behaviours and drives to objects; and Disney's 12
// principles of animation supply the feel layer." A citizen moves in exactly one way here:
//
//   SENSES  → what the citizen can read this step: its head (position, velocity, heading), the
//             ground under it and around it out to its sensory range (3 body-lengths, the
//             phasing defaults table), the dish's rim. Read-only, published state only.
//   DRIVES  → reusable behaviours from one frozen registry (CULTURE_DRIVES). Each returns a
//             desire — a vector of length ≤ 1 — and the recipe weighs them. Drives never write.
//   FEEL    → the 12 principles as seasoning: the summed desire becomes a heading turned on an
//             ARC, a thrust paced by TIMING, shaped by SLOW IN / SLOW OUT and wound up by
//             ANTICIPATION, carried through the jointed body by FOLLOW-THROUGH / OVERLAPPING
//             ACTION, and drawn with SQUASH & STRETCH and SECONDARY ACTION, scaled by
//             EXAGGERATION.
//   FORCES  → the only output that touches the world: velocity added to the citizen's own
//             bodies in the world's table (the head's thrust, the limb tips' paddle). Never a
//             position write — the swarm integrates and the solver joins, as for every body.
//
// Drives → forces on the swarm/solver bodies: a citizen is pushed exactly like the Queen's fields
// and the hand push (velocity added, not divided by mass — the fields' weather discipline), so a
// citizen's own muscle, the Queen's fields and the performer's hand compose in one place, in the
// world step's force order (fields, then citizens, then the hand last — the override's place).
//
// THE MOTION CORE CONTRACT. The look side of the feel layer (squash & stretch, the breath, the
// wither fade) is a pose delta from rest — Motion Core's own Pose (engine/motionCore/index.js) —
// and is registered as a motion source, 'culture:feel', so a later gait adapter (slice B, the
// parent issue's rig sources) composes with it through composePose like every other source. It
// obeys the anchor law (motion time 0 = rest: a citizen is born still) and is a pure function of
// (node, t, ctx). Registration is LAZY (ensureCultureFeelSource, called by the cast door): a
// session whose gate never opens has registries exactly main's.
//
// THE RECIPE (spec §2.8, ruled): "A recipe is a named bundle of: creature drives; physics dials;
// 12-principles seasoning. A creature is instilled with a recipe at birth." DAVIS writes them
// (engine/cultureLab.mjs); this module owns their SHAPE and BOUNDS — normalizeCultureRecipe is the
// one reading every path shares, refusing loudly what it cannot honour.
import { registerMotionSource, getMotionSource, POSE_IDENTITY } from './motionCore/index.js';
import { registerCostTier } from './kernel/costRegistry.mjs';
import { hashU01 } from './kernel/rng.js';
import { cultureSoilSample } from './cultureSoil.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H, CULTURE_SWARM_PARAMS } from './cultureSwarm.mjs';

/** Sensory range, in body-lengths (the phasing defaults table: 3, per-drive multipliers allowed). */
export const CULTURE_SENSE_BODY_LENGTHS = 3;
/** The rim drive's reach, in body-lengths from the dish's border (a jointed body needs room to turn). */
export const CULTURE_RIM_BODY_LENGTHS = 2;
/** The ground drive's probe ring: directions around the head, distances as shares of the range. */
export const CULTURE_GROUND_PROBE_DIRS = 8;
export const CULTURE_GROUND_PROBE_SHARES = Object.freeze([1 / 3, 2 / 3, 1]);
/** The brace a body's tone holds: a part and its grandparent stay at least this share of their two joints' rests apart. */
export const CULTURE_TONE_BRACE = 0.92;
/** FOLLOW-THROUGH's ripple: the stroke's lag at the deepest part, in strokes, at followThrough 1. */
export const CULTURE_RIPPLE_LAG = 0.35;
/** The share of each stroke ANTICIPATION may take as its wind-up (the recoil before the push). */
export const CULTURE_ANTICIPATION_WINDOW = 0.2;
/** The turn rate (radians per swarm step) at arcs 0 (snappy) and arcs 1 (a long, smooth arc). */
export const CULTURE_TURN_RATE_SNAP = 0.22;
export const CULTURE_TURN_RATE_ARC = 0.02;
/** The breath's period (SECONDARY ACTION), in seconds of the citizen's life. */
export const CULTURE_BREATH_S = 2.4;
/** The squash & stretch birth ease: the look reaches full feel this long after birth (anchor law). */
export const CULTURE_FEEL_EASE_S = 0.5;
/** The wither fade: a part fully withered reads at this much less opacity (the soil's verdict, drawn). */
export const CULTURE_WITHER_FADE = 0.5;

/** The Motion Core source id of the feel layer's look. */
export const CULTURE_FEEL_SOURCE_ID = 'culture:feel';
/** Its cost tier: scalar math per part on the CPU, no GPU pass (measured in the staging report). */
export const CULTURE_FEEL_COST_TIER = 'culture/citizen-feel';

/**
 * The recipe's shape and bounds — every dial a recipe may carry, and the closed interval it must
 * stand in. A recipe missing a dial is refused (DAVIS writes whole recipes); one out of bounds is
 * refused. Drives: the weights of the registry's drives. Physics: the body's feel in the solver.
 * Seasoning: the 12 principles with a runtime meaning.
 */
export const CULTURE_RECIPE_BOUNDS = Object.freeze({
  drives: Object.freeze({
    wander: Object.freeze([0, 1]),
    ground: Object.freeze([0, 2]),
    rim: Object.freeze([0, 3]),
  }),
  physics: Object.freeze({
    /** Velocity added to the head per swarm step at the stroke's peak (the swarm clamp is the ceiling). */
    thrust: Object.freeze([0, 1.2]),
    /**
     * The head's mass, in the swarm core's units (a cloud mote is 1). The core divides its flocking
     * by mass, so a heavy citizen swims by its own muscle and is only nudged by the flock; the
     * Queen's fields and the hand are not mass-divided (the weather discipline) and still move it.
     * In the solve, the heavier head leads and the body follows.
     */
    headMass: Object.freeze([4, 120]),
    /** A body part's base mass, same units (the spine's first disc; FOLLOW-THROUGH lightens the rest). */
    partMass: Object.freeze([2, 60]),
    /** Velocity pushed across the heading at each limb tip, at the paddle's peak. */
    paddle: Object.freeze([0, 0.6]),
    /**
     * Muscle TONE: how hard a part pushes off its grandparent when the body folds tighter than its
     * brace (the solver's links are hard distances with no bending stiffness — the tone is the
     * body holding its line, written as velocity like every muscle).
     */
    tone: Object.freeze([0, 1.5]),
  }),
  seasoning: Object.freeze({
    /** TIMING: swarm steps per stroke (60 steps = 1 s). */
    timing: Object.freeze([20, 240]),
    /** SLOW IN / SLOW OUT: the stroke envelope's easing exponent (1 = a plain sine bump). */
    slowInOut: Object.freeze([1, 4]),
    /** ANTICIPATION: the recoil's depth before each push, as a share of the thrust. */
    anticipation: Object.freeze([0, 0.6]),
    /** ARCS: 0 turns snap, 1 turns ride a long arc. */
    arcs: Object.freeze([0, 1]),
    /** FOLLOW-THROUGH / OVERLAPPING ACTION: tail lightness and the limbs' phase lag. */
    followThrough: Object.freeze([0, 1]),
    /** SQUASH & STRETCH: stretch along the body at full surge. */
    squash: Object.freeze([0, 0.5]),
    /** SECONDARY ACTION: the head's breath amplitude. */
    secondary: Object.freeze([0, 0.15]),
    /** EXAGGERATION: multiplies squash, anticipation and the breath. */
    exaggeration: Object.freeze([0.5, 2]),
  }),
});

/**
 * The 12 principles, all accounted for: which recipe dial carries each one at runtime, or which
 * Lab role owns it where it is not a per-step dial. A principle with no runtime meaning is not
 * faked into a number.
 */
export const CULTURE_PRINCIPLES = Object.freeze({
  'squash and stretch': 'seasoning.squash',
  anticipation: 'seasoning.anticipation',
  staging: 'CURATOR — the cast placement (where each citizen enters the dish)',
  'straight ahead and pose to pose': 'the simulation itself — the world is straight-ahead by construction',
  'follow through and overlapping action': 'seasoning.followThrough',
  'slow in and slow out': 'seasoning.slowInOut',
  arcs: 'seasoning.arcs',
  'secondary action': 'seasoning.secondary',
  timing: 'seasoning.timing',
  exaggeration: 'seasoning.exaggeration',
  'solid drawing': 'KINETIC — the assembled body and its per-part look',
  appeal: "LOIS — her praise is the quality bar (the cast's gate)",
});

const GROUPS = Object.freeze(['drives', 'physics', 'seasoning']);

/**
 * The one recipe reading: a recipe { name, drives, physics, seasoning } validated against the
 * bounds and returned frozen, every dial a finite number in its interval. A missing group or
 * dial, an unknown dial, a non-finite or out-of-bounds value, or a nameless recipe is refused —
 * loudly, naming the dial. Recipes are instilled at birth; a refused recipe never reaches a body.
 */
export function normalizeCultureRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') throw new Error('cultureMotion: a recipe must be an object');
  if (typeof recipe.name !== 'string' || !recipe.name) throw new Error('cultureMotion: a recipe needs a name');
  const out = { name: recipe.name };
  for (const g of GROUPS) {
    const src = recipe[g];
    if (!src || typeof src !== 'object') throw new Error(`cultureMotion: recipe "${recipe.name}" has no ${g}`);
    const bounds = CULTURE_RECIPE_BOUNDS[g];
    for (const k of Object.keys(src))
      if (!(k in bounds)) throw new Error(`cultureMotion: recipe "${recipe.name}" has an unknown ${g} dial "${k}"`);
    const grp = {};
    for (const k of Object.keys(bounds)) {
      const v = src[k];
      const [lo, hi] = bounds[k];
      if (!Number.isFinite(v) || v < lo || v > hi)
        throw new Error(`cultureMotion: recipe "${recipe.name}" ${g}.${k} = ${String(v)} outside [${lo}, ${hi}]`);
      grp[k] = v;
    }
    out[g] = Object.freeze(grp);
  }
  return Object.freeze(out);
}

/** Does a recipe pass the reading? (LOIS's read — she never builds; she only asks.) */
export function cultureRecipeFaults(recipe) {
  try {
    normalizeCultureRecipe(recipe);
    return [];
  } catch (e) {
    return [e.message];
  }
}

const TAU = Math.PI * 2;
const wrapAngle = (a) => {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
};
const smooth = (t) => t * t * (3 - 2 * t);

/** The citizen's sensory range in pixels: its body-length × CULTURE_SENSE_BODY_LENGTHS. */
export function cultureSenseRange(body) {
  return body.length * CULTURE_SENSE_BODY_LENGTHS;
}

/**
 * THE DRIVES — the reusable behaviours (HYPE's spirit: attached by name, weighed by the recipe).
 * Each is a pure function (senses, citizen) → { x, y } with length ≤ 1: a desire, not a force.
 *   wander  a seeded drift: the heading bent by a smooth value noise of the citizen's own life
 *           (its seed, never chance) — the dish's native restlessness.
 *   ground  the soil's pull: probes the ground in a ring out to the sensory range and leans
 *           toward the living, fertile side; urgent on dead ground (Life is the soil — the
 *           creature does not want to wither), calm where it already stands fertile.
 *   rim     the dish's edge: within CULTURE_RIM_BODY_LENGTHS of the dish's border, a push back inward,
 *           growing to 1 at the border — the body is one body, it does not cross the swarm's
 *           wrap seam (beyond the grid is dead ground anyway).
 */
export const CULTURE_DRIVES = Object.freeze({
  wander(senses, c) {
    const period = 2 * c.recipe.seasoning.timing;
    const t = c.age / period;
    const k = Math.floor(t);
    const a = hashU01(c.seed, 'culture-wander', k) * 2 - 1;
    const b = hashU01(c.seed, 'culture-wander', k + 1) * 2 - 1;
    const n = a + (b - a) * smooth(t - k);
    const th = senses.heading + n * (Math.PI / 2);
    return { x: Math.cos(th), y: Math.sin(th) };
  },
  ground(senses) {
    const here = senses.ground;
    const urgency = here.living ? 1 - here.fertility : 1;
    if (!(urgency > 0)) return { x: 0, y: 0 };
    let bx = 0;
    let by = 0;
    for (let d = 0; d < CULTURE_GROUND_PROBE_DIRS; d++) {
      const th = (d / CULTURE_GROUND_PROBE_DIRS) * TAU;
      const ux = Math.cos(th);
      const uy = Math.sin(th);
      let score = 0;
      for (let s = 0; s < CULTURE_GROUND_PROBE_SHARES.length; s++) {
        const r = senses.range * CULTURE_GROUND_PROBE_SHARES[s];
        const g = cultureSoilSample(senses.field, senses.x + ux * r, senses.y + uy * r);
        score += g.fortune / (s + 1);
      }
      bx += ux * score;
      by += uy * score;
    }
    const m = Math.sqrt(bx * bx + by * by);
    if (!(m > 1e-12)) return { x: 0, y: 0 };
    return { x: (bx / m) * urgency, y: (by / m) * urgency };
  },
  rim(senses, c) {
    const margin = CULTURE_RIM_BODY_LENGTHS * c.body.length;
    const push = (d) => (d < margin ? Math.min(1, (margin - d) / margin) : 0);
    const x = push(senses.x) - push(CULTURE_SWARM_WORLD_W - senses.x);
    const y = push(senses.y) - push(CULTURE_SWARM_WORLD_H - senses.y);
    const m = Math.sqrt(x * x + y * y);
    return m > 1 ? { x: x / m, y: y / m } : { x, y };
  },
});

/** The drive names, in the registry's canonical order (the sum is taken in this order). */
export const CULTURE_DRIVE_NAMES = Object.freeze(Object.keys(CULTURE_DRIVES));

/**
 * SENSES — what a citizen reads this step, from published state only: its head's position,
 * velocity and the heading it carries; the soil's published field and the reading under the
 * head; its sensory range. A fresh object; reading changes nothing.
 */
export function cultureSenses(bodies, field, c) {
  const h = c.first;
  const x = bodies.x[h];
  const y = bodies.y[h];
  return {
    x,
    y,
    vx: bodies.vx[h],
    vy: bodies.vy[h],
    heading: c.heading,
    field,
    ground: cultureSoilSample(field, x, y),
    range: cultureSenseRange(c.body),
  };
}

/** The summed, weighted desire of a citizen's drives (canonical drive order), and its strength 0..1. */
export function cultureDesire(senses, c) {
  let x = 0;
  let y = 0;
  for (const name of CULTURE_DRIVE_NAMES) {
    const w = c.recipe.drives[name];
    if (!(w > 0)) continue;
    const d = CULTURE_DRIVES[name](senses, c);
    x += d.x * w;
    y += d.y * w;
  }
  const m = Math.sqrt(x * x + y * y);
  return { x, y, strength: Math.min(1, m) };
}

/** ARCS: the turn rate a recipe's arcs dial gives, radians per swarm step. */
export function cultureTurnRate(seasoning) {
  return CULTURE_TURN_RATE_SNAP + (CULTURE_TURN_RATE_ARC - CULTURE_TURN_RATE_SNAP) * seasoning.arcs;
}

/** The stroke's phase 0..1 at a citizen's age (TIMING), offset by its seeded birth phase. */
export function cultureStrokePhase(c) {
  const T = c.recipe.seasoning.timing;
  const p = (c.age + c.phase0 * T) / T;
  return p - Math.floor(p);
}

/**
 * The stroke envelope at phase p — TIMING, SLOW IN / SLOW OUT and ANTICIPATION in one curve: the
 * first CULTURE_ANTICIPATION_WINDOW of every stroke is the wind-up (a recoil, negative, its depth
 * the anticipation dial × exaggeration; a rest when anticipation is 0), the rest is the push, a
 * sine bump raised to the slowInOut exponent (an eased start and an eased stop). Pure.
 */
export function cultureStrokeEnvelope(p, seasoning) {
  const w = CULTURE_ANTICIPATION_WINDOW;
  if (p < w) return -seasoning.anticipation * seasoning.exaggeration * Math.sin((Math.PI * p) / w);
  return Math.pow(Math.sin((Math.PI * (p - w)) / (1 - w)), seasoning.slowInOut);
}

/**
 * The part masses a recipe instills (physics dials + FOLLOW-THROUGH): the head at headMass; each
 * non-head part at partMass, lightened along its depth from the head by the followThrough dial —
 * a lighter tail is shoved further by the solver's split, so it lags and swings (overlap is the
 * lag between parts). Part order matches the body; the floor keeps every mass positive.
 */
export function cultureRecipeMasses(body, recipe) {
  const depth = cultureBodyDepths(body);
  const { headMass, partMass } = recipe.physics;
  const ft = recipe.seasoning.followThrough;
  return body.parts.map((p, i) => (i === 0 ? headMass : partMass * (1 - 0.5 * ft * depth[i])));
}

/**
 * ONE CITIZEN'S MUSCLE for one swarm step — the seam's write. Reads the senses, sums the drives,
 * turns the heading toward the desire on an ARC (at most the recipe's turn rate), then swims the
 * whole body on the stroke (TIMING, SLOW IN / SLOW OUT, ANTICIPATION): the head is pushed along the
 * new heading, and every other living part is pushed toward its parent — follow the leader, so the
 * body traces the head's path instead of sliding sideways — its stroke lagged by its depth from
 * the head (FOLLOW-THROUGH / OVERLAPPING ACTION: the stroke ripples down the body). Each limb tip is
 * also paddled across the heading on its own lagged stroke, left and right mirrored. Every push is
 * scaled by the desire's strength: a citizen with no desire drifts. Velocity only — the swarm
 * integrates and the solver joins. Returns the citizen's new heading.
 */
export function stepCultureCitizenMuscle(bodies, field, c) {
  const senses = cultureSenses(bodies, field, c);
  const desire = cultureDesire(senses, c);
  let heading = c.heading;
  if (desire.strength > 1e-12) {
    const turn = wrapAngle(Math.atan2(desire.y, desire.x) - heading);
    const rate = cultureTurnRate(c.recipe.seasoning);
    heading = wrapAngle(heading + Math.max(-rate, Math.min(rate, turn)));
  }
  const se = c.recipe.seasoning;
  const p = cultureStrokePhase(c);
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const { x, y, vx, vy, alive } = bodies;
  const thrust = c.recipe.physics.thrust * desire.strength;
  const lag = CULTURE_RIPPLE_LAG * se.followThrough;
  const parts = c.body.parts;
  const tone = c.recipe.physics.tone;
  const h = c.first;
  const env0 = cultureStrokeEnvelope(p, se);
  vx[h] += ux * thrust * env0;
  vy[h] += uy * thrust * env0;
  for (let k = 1; k < parts.length; k++) {
    const i = h + k;
    const j = h + parts[k].parent;
    if (!alive[i] || !alive[j]) continue;
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!(d > 1e-9)) continue;
    const pk = p - lag * c.depth[k];
    const a = thrust * cultureStrokeEnvelope(pk - Math.floor(pk), se);
    vx[i] += (dx / d) * a;
    vy[i] += (dy / d) * a;
    // TONE: a body folding tighter than its brace pushes the part off its grandparent.
    const g = parts[k].parent > 0 ? h + parts[parts[k].parent].parent : -1;
    if (tone > 0 && g >= 0 && alive[g]) {
      const brace = c.brace[k];
      const gx = x[i] - x[g];
      const gy = y[i] - y[g];
      const gd = Math.sqrt(gx * gx + gy * gy);
      if (gd < brace && gd > 1e-9) {
        const b = tone * (1 - gd / brace);
        vx[i] += (gx / gd) * b;
        vy[i] += (gy / gd) * b;
      }
    }
  }
  const paddle = c.recipe.physics.paddle * desire.strength;
  if (paddle > 0) {
    for (const tip of c.limbTips) {
      const i = h + tip.part;
      if (!alive[i]) continue;
      const a = paddle * Math.sin(TAU * (p - lag * c.depth[tip.part])) * tip.side;
      vx[i] += -uy * a;
      vy[i] += ux * a;
    }
  }
  return heading;
}

/**
 * The brace each part's TONE holds against its grandparent: CULTURE_TONE_BRACE of the sum of its own
 * joint's rest and its parent's joint's rest (0 where a part has no grandparent). Declared from the
 * body, never latched from live positions.
 */
export function cultureBodyBraces(body) {
  const restTo = new Map(body.links.map((l) => [l.b, l.rest]));
  return Object.freeze(
    body.parts.map((p, i) => {
      if (i === 0 || p.parent <= 0) return 0;
      return CULTURE_TONE_BRACE * (restTo.get(i) + restTo.get(p.parent));
    }),
  );
}

/** A body's part depths from the head (head 0), normalized by the deepest part: 0..1. */
export function cultureBodyDepths(body) {
  const depth = new Array(body.parts.length).fill(0);
  let max = 1;
  for (let i = 1; i < body.parts.length; i++) {
    depth[i] = depth[body.parts[i].parent] + 1;
    if (depth[i] > max) max = depth[i];
  }
  return Object.freeze(depth.map((d) => d / max));
}

/**
 * The feel layer's LOOK as a Motion Core pose delta (the 'culture:feel' source's evaluate):
 * t is the citizen's life in seconds; ctx carries { along, speedMax?, role, squash, secondary,
 * exaggeration, wither } — `along` the part's velocity along the body's heading. SQUASH &
 * STRETCH: sx = 1 + squash × exaggeration × along/maxSpeed, sy = 1/sx (volume kept) — a surge
 * stretches, the anticipation recoil squashes. SECONDARY ACTION: the head breathes. The wither
 * fades a part (dAlpha). Everything eases in over CULTURE_FEEL_EASE_S from birth, so at t = 0 the
 * pose is exactly rest — the anchor law. Pure.
 */
export function cultureFeelPose(node, t, ctx = {}) {
  if (!(t > 0)) return POSE_IDENTITY;
  const ease = Math.min(1, t / CULTURE_FEEL_EASE_S);
  const ex = Number.isFinite(ctx.exaggeration) ? ctx.exaggeration : 1;
  const vmax = Number.isFinite(ctx.speedMax) && ctx.speedMax > 0 ? ctx.speedMax : CULTURE_SWARM_PARAMS.maxSpeed;
  const along = Number.isFinite(ctx.along) ? Math.max(-vmax, Math.min(vmax, ctx.along)) : 0;
  const squash = Number.isFinite(ctx.squash) ? ctx.squash : 0;
  let sx = 1 + squash * ex * (along / vmax) * ease;
  let sy = 1 / sx;
  if (ctx.role === 'head' && Number.isFinite(ctx.secondary) && ctx.secondary > 0) {
    const b = 1 + ctx.secondary * ex * Math.sin((TAU * t) / CULTURE_BREATH_S) * ease;
    sx *= b;
    sy *= b;
  }
  const wither = Number.isFinite(ctx.wither) ? Math.max(0, Math.min(1, ctx.wither)) : 0;
  return { dx: 0, dy: 0, dRot: 0, sx, sy, dAlpha: -CULTURE_WITHER_FADE * wither * ease };
}

/**
 * Register the feel layer with Motion Core, once — the lazy door the cast calls. Idempotent: a
 * second call (or a second cast in another world) finds the source standing and returns it.
 */
export function ensureCultureFeelSource() {
  const have = getMotionSource(CULTURE_FEEL_SOURCE_ID);
  if (have) return have;
  registerCostTier(CULTURE_FEEL_COST_TIER, {
    tier: 0,
    memoryBytes: 0,
    timeMs: 0.009,
    notes:
      'CULTURE Phase 5A — the citizens’ muscle (senses, drives, feel) and the look pose, scalar math per citizen on the CPU behind the cultureDish gate; no GPU pass. Measured sandbox median per swarm step (one 60 fps frame) at the default cast of three (STAGING-REPORT-CULTURE-P5A.md).',
  });
  return registerMotionSource({
    id: CULTURE_FEEL_SOURCE_ID,
    family: 'driver',
    timeBase: 'seconds',
    costTier: CULTURE_FEEL_COST_TIER,
    evaluate: cultureFeelPose,
  });
}
