// cultureCitizens.mjs — CULTURE Phase 5, slice A: the citizens' table — the creatures living in
// the dish. Pure: no DOM, no GL, no clock. The world (engine/cultureWorld.mjs) owns the table,
// feeds it steps, and deals into it only through its cast door.
//
// A CITIZEN is an assembled body (engine/cultureBody.mjs — KINETIC's) instilled at birth with a
// recipe (engine/cultureMotion.mjs's shape — DAVIS's), admitted by LOIS (engine/cultureLab.mjs).
// Its parts are ordinary bodies in the world's one table — contiguous slots, head first — joined by
// ordinary solver links: the swarm moves them, the Queen's fields pull them, the hand's currents
// push them, the solver joins and collides them, the soil judges them. Nothing in those systems
// knows a creature exists (the Motion Core seam's law, the parent issue 2109: "Nothing in the
// resolver, the renderer, or the loop knows a creature exists"). What the citizen adds is its own
// MUSCLE — the recipe's drives and seasoning, written as velocity on its own parts through
// stepCultureCitizenMuscle, on the swarm's cadence, between the Queen's fields and the hand.
//
// LIFE AND DEATH IN THIS SLICE. The head is the citizen: a citizen lives while its head's body
// lives. The only killer in the world today is the soil (Phase 4: sustained dead ground withers a
// body) — so a citizen whose head withers is dead, cause 'soil', recorded at the step the citizen
// layer first sees it (one step behind, the dish's read discipline). A withered non-head part is
// simply gone from every mover (the solver already skips a link to a dead body); the citizen lives
// on without it. A dead citizen's muscle stops; its surviving parts stay in the table as passive
// bodies (§3.2's tier: every mark is a body, only creatures get drives). What a body does after
// death — persisting 30 s, decaying, being looted — is Phase 6, and is not built here.
//
// ONE BODY ACROSS THE SEAM. The swarm's boundary law wraps each disc on its own at the 120 px pad;
// a jointed body whose head and tail straddle the seam would be yanked across the dish by its own
// links. The rim drive keeps citizens off the seam, and rehomeCultureCitizens is the guarantee:
// after the swarm integrates and before the solver joins, every part of a citizen standing more
// than half the wrap span from its anchor (the first living part, head first) is moved back by
// exactly one wrap span — the body crosses the seam whole, with its anchor, or not at all.
// Positions only; velocity and every other column untouched.
//
// THE STRANDBEEST (slice C). A citizen whose body carries a linkage (engine/cultureBody.mjs, the strandbeest plan)
// walks instead of swimming: its muscle is engine/cultureBeast.mjs stepCultureBeastMuscle (the same senses and drives;
// locomotion by the stance stroke, steering by the banks' crank-phase differential). Its crank is life state — each
// bank's phase (pA, pB, turns) and rate (rA, rB, turns a second), born at rest at DAVIS's birth phase — and the hash
// covers it and the measure genes. A citizen without a linkage carries none of it: its table entry and its hash bytes
// are exactly slice B's.
import { stepCultureCitizenMuscle, cultureFeelPose, cultureBodyDepths, cultureBodyBraces } from './cultureMotion.mjs';
import { stepCultureBeastMuscle } from './cultureBeast.mjs';
import { composePose } from './motionCore/index.js';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H, CULTURE_SWARM_WRAP_PAD } from './cultureSwarm.mjs';

/** The causes a citizen may die of in this slice (Phase 6 adds starvation and predation). */
export const CULTURE_CITIZEN_CAUSES = Object.freeze(['', 'soil']);
/** The swarm wrap's span on each axis: a wrapped disc jumps by (almost) exactly this. */
export const CULTURE_WRAP_SPAN_X = CULTURE_SWARM_WORLD_W + 2 * CULTURE_SWARM_WRAP_PAD;
export const CULTURE_WRAP_SPAN_Y = CULTURE_SWARM_WORLD_H + 2 * CULTURE_SWARM_WRAP_PAD;

/** The citizens' table: born empty, uncast. */
export function createCultureCitizens() {
  return {
    /** Citizen-layer steps run: one per swarm step, always (the muscle acts on the swarm's cadence). */
    step: 0,
    /** Whether this world's Lab has cast (once per world: the take casts fresh; no standing zoo). */
    cast: 0,
    /** Citizens dead since birth. */
    died: 0,
    /** The citizens, in cast order. */
    list: [],
  };
}

/**
 * Enrol one cast member whose parts the world has already dealt at slots first..first+n−1.
 * The body and recipe are frozen at birth (instilled — a recipe never changes mid-life); the
 * mutable life is heading, age, alive, diedStep, cause. Returns the citizen's index.
 */
export function enrolCultureCitizen(citizens, member, first, bornStep) {
  const limbTips = [];
  const parts = member.body.parts;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].role !== 'limb') continue;
    if (parts.some((q) => q.parent === i)) continue;
    let root = i;
    while (parts[root].socket === null) root = parts[root].parent;
    const sock = member.body.sockets.find((s) => s.id === parts[root].socket);
    const kind = member.body.limbs[parts[i].limb];
    limbTips.push(Object.freeze({ part: i, side: sock.angle >= 0 ? 1 : -1, weight: kind.paddle, beat: kind.beat }));
  }
  const c = {
    plan: member.body.plan,
    body: member.body,
    recipe: member.recipe,
    praise: member.praise,
    seed: member.seed >>> 0,
    phase0: member.phase0,
    first,
    n: parts.length,
    limbTips: Object.freeze(limbTips),
    depth: cultureBodyDepths(member.body),
    brace: cultureBodyBraces(member.body),
    bornStep,
    heading: member.heading,
    age: 0,
    alive: 1,
    diedStep: -1,
    cause: '',
  };
  if (member.body.linkage) {
    // the crank: both banks at DAVIS's birth phase, at rest (the anchor law: a citizen is born still)
    c.linkage = member.body.linkage;
    c.pA = member.phase0;
    c.pB = member.phase0;
    c.rA = 0;
    c.rB = 0;
  }
  citizens.list.push(c);
  return citizens.list.length - 1;
}

/**
 * One citizen-layer step (the swarm's cadence, after the Queen's fields, before the hand): each
 * living citizen, in cast order — dead if its head has gone (cause 'soil', the step recorded),
 * otherwise its muscle acts (senses → drives → feel → velocity on its own parts) and it ages one
 * step. Dead citizens do nothing. Advances citizens.step (the layer ran, over an empty table too).
 */
export function stepCultureCitizens(bodies, citizens, field, worldStep) {
  for (const c of citizens.list) {
    if (!c.alive) continue;
    if (!bodies.alive[c.first]) {
      c.alive = 0;
      c.diedStep = worldStep;
      c.cause = 'soil';
      citizens.died += 1;
      continue;
    }
    c.heading = c.linkage ? stepCultureBeastMuscle(bodies, field, c) : stepCultureCitizenMuscle(bodies, field, c);
    c.age += 1;
  }
  citizens.step += 1;
  return bodies;
}

/** The anchor a citizen's parts are rehomed around: its first living part (head first), or −1. */
function anchorOf(bodies, c) {
  for (let k = 0; k < c.n; k++) if (bodies.alive[c.first + k]) return c.first + k;
  return -1;
}

/**
 * ONE BODY ACROSS THE SEAM (see the header): after the swarm integrates, before the solver joins,
 * each citizen's living parts are brought to the anchor's side of the swarm's wrap seam — a part
 * more than half a wrap span from its anchor on an axis moves back by one span. Every citizen,
 * living or dead (a dead citizen's surviving parts are still one jointed body). Positions only.
 */
export function rehomeCultureCitizens(bodies, citizens) {
  const { x, y, alive } = bodies;
  const hx = CULTURE_WRAP_SPAN_X / 2;
  const hy = CULTURE_WRAP_SPAN_Y / 2;
  for (const c of citizens.list) {
    const a = anchorOf(bodies, c);
    if (a < 0) continue;
    for (let k = 0; k < c.n; k++) {
      const i = c.first + k;
      if (i === a || !alive[i]) continue;
      const dx = x[i] - x[a];
      const dy = y[i] - y[a];
      if (dx > hx) x[i] -= CULTURE_WRAP_SPAN_X;
      else if (dx < -hx) x[i] += CULTURE_WRAP_SPAN_X;
      if (dy > hy) y[i] -= CULTURE_WRAP_SPAN_Y;
      else if (dy < -hy) y[i] += CULTURE_WRAP_SPAN_Y;
    }
  }
  return bodies;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the citizens' standing state: the step, the cast flag, the death count, and
 * per citizen its plan, scale, slots, birth, recipe (every dial, canonical order), praise, seed,
 * birth phase, and its life (heading bit-exact, age, alive, died step, cause). The parts' motion is
 * the body table's (the swarm hash); the joints are the solver's (its hash). FNV-1a, the
 * cultureSoilHash discipline — the world hash folds this in whole.
 */
export function cultureCitizensHash(citizens) {
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
  mixU32(citizens.step);
  mixU32(citizens.cast);
  mixU32(citizens.died);
  mixU32(citizens.list.length);
  for (const c of citizens.list) {
    mixStr(c.plan);
    mixFloat(c.body.scale);
    mixU32(c.first);
    mixU32(c.n);
    mixU32(c.bornStep);
    mixStr(c.recipe.name);
    for (const g of ['drives', 'physics', 'seasoning'])
      for (const k of Object.keys(c.recipe[g]).sort()) mixFloat(c.recipe[g][k]);
    mixFloat(c.praise);
    mixU32(c.seed);
    mixFloat(c.phase0);
    mixFloat(c.heading);
    mixU32(c.age);
    mix(c.alive);
    mixU32(c.diedStep | 0);
    mixStr(c.cause);
    if (c.linkage) {
      // slice C: a strandbeest's genes and crank (absent for every other plan — their bytes are slice B's)
      const m = c.linkage.measures;
      for (const k of Object.keys(m).sort()) mixFloat(m[k]);
      mixFloat(c.linkage.phase);
      mixFloat(c.pA);
      mixFloat(c.pB);
      mixFloat(c.rA);
      mixFloat(c.rB);
    }
  }
  return h >>> 0;
}

/**
 * THE LAYOUT (graphic, not a sticker) — one citizen as the assembled layout a renderer would draw:
 * per part its id, role, look (shape + tone role), the body-space centre, radius, rotation (degrees:
 * the head along the citizen's heading, every other part along its joint, facing its parent), whether it still lives, and the feel layer's pose delta (Motion
 * Core's Pose: squash & stretch along the heading, the head's breath, the wither fade). `wither`
 * is a per-slot 0..1 reader (the world passes its soil clock). A fresh object; reading changes
 * nothing. There is no render path in the world yet: this is the data one would draw, and the
 * debug preview below is the only drawing of it.
 */
export function cultureCitizenLayout(bodies, c, wither = () => 0, gaitPose = () => null) {
  const t = c.age / 60; // swarm steps → seconds of life (one swarm step is one 60 fps frame)
  const parts = c.body.parts.map((p, k) => {
    const i = c.first + k;
    // A part faces along its own segment: the head along the citizen's heading, every other part
    // away from its parent (the layout reads as a chain of marks, each set along its joint).
    let ang = c.heading;
    if (k > 0) {
      const j = c.first + p.parent;
      const dx = bodies.x[i] - bodies.x[j];
      const dy = bodies.y[i] - bodies.y[j];
      if (dx * dx + dy * dy > 1e-18) ang = Math.atan2(-dy, -dx);
    }
    const feel = cultureFeelPose({ key: `${c.first}:${k}`, seedOffset: 0, phase01: 0 }, t, {
      along: bodies.vx[i] * Math.cos(ang) + bodies.vy[i] * Math.sin(ang),
      role: p.role,
      squash: c.recipe.seasoning.squash,
      secondary: c.recipe.seasoning.secondary,
      exaggeration: c.recipe.seasoning.exaggeration,
      wither: wither(i),
    });
    // the gait layers over the creature's own pose (Motion Core composePose); no gait standing = the feel, untouched
    const gp = gaitPose(k);
    const pose = gp ? composePose(feel, gp) : feel;
    return {
      id: p.id,
      role: p.role,
      parent: p.parent,
      look: p.look,
      alive: bodies.alive[i] === 1,
      x: bodies.x[i],
      y: bodies.y[i],
      radius: bodies.radius[i],
      rot: (ang * 180) / Math.PI,
      pose: { ...pose },
      gait: gp ? { ...gp } : null,
    };
  });
  return { plan: c.plan, alive: c.alive === 1, heading: c.heading, age: c.age, parts };
}

const TONE_GREY = Object.freeze({ main: '#333', ink: '#111', accent: '#888' });

/**
 * DEBUG ONLY — never imported by the app, never on the stage: an SVG of citizen layouts, for the
 * staging report and QA's eyes (does it read as an assembled layout of parts?). Tones are fixed
 * greys standing in for the palette's roles; no text is drawn. Pure string.
 */
export function cultureCitizensDebugSvg(layouts, { w = CULTURE_SWARM_WORLD_W, h = CULTURE_SWARM_WORLD_H } = {}) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w / 2}" height="${h / 2}">`];
  out.push(`<rect width="${w}" height="${h}" fill="#f4f1ea"/>`);
  const f = (v) => v.toFixed(1);
  for (const L of layouts) {
    for (const p of L.parts) {
      if (!p.alive) continue;
      const fill = TONE_GREY[p.look.tone];
      const a = Math.max(0, 1 + p.pose.dAlpha);
      const rx = p.radius * p.pose.sx;
      const ry = p.radius * p.pose.sy;
      const tr = `translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})`;
      if (p.look.shape === 'ring')
        out.push(
          `<ellipse transform="${tr}" rx="${f(rx * 0.82)}" ry="${f(ry * 0.82)}" fill="none" stroke="${fill}" stroke-width="${f(p.radius * 0.36)}" opacity="${a}"/>`,
        );
      else if (p.look.shape === 'square')
        out.push(
          `<rect transform="${tr}" x="${f(-rx * 0.8)}" y="${f(-ry * 0.8)}" width="${f(rx * 1.6)}" height="${f(ry * 1.6)}" fill="${fill}" opacity="${a}"/>`,
        );
      else if (p.look.shape === 'dot')
        out.push(`<ellipse transform="${tr}" rx="${f(rx * 0.7)}" ry="${f(ry * 0.7)}" fill="${fill}" opacity="${a}"/>`);
      else if (p.look.shape === 'bar' && p.parent >= 0) {
        const q = L.parts[p.parent];
        out.push(
          `<line x1="${f(q.x)}" y1="${f(q.y)}" x2="${f(p.x)}" y2="${f(p.y)}" stroke="${fill}" stroke-width="${f(p.radius * 0.9)}" stroke-linecap="square" opacity="${a}"/>`,
        );
      }
    }
  }
  out.push('</svg>');
  return out.join('');
}
