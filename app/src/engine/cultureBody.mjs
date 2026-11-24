// cultureBody.mjs — CULTURE Phase 5, slice A: the assembled body plan (spec §2.4, §2.10).
// Pure: no DOM, no GL, no clock. KINETIC's bench: a body plan says what a creature is made
// of; assembleCultureBody puts one together, frozen, for the Lab to cast into the world.
//
// WHAT A BODY IS. Spec §2.4, ruled: "A creature is assembled, following the WetLab creature
// record: head, limbs, and attach points. Physics moves the assembled creature as one compound
// body. Its parts are jointed and can swing, drag, lag, and settle through the body rather than
// being animated as an unrelated sticker." At this layer a part is one disc in the world's body
// table and a joint is one solver distance link (Phase 2's compound-body shape, cultureSolver.mjs
// THE LINKS): this module declares both, and the world's cast door deals them.
//
// THE DISH PLAN — the first citizen's body, the dish's native, simplest animal. Its proportions
// are the legacy dish creature's (engine/dishCreature.js DISH_CREATURE — loot, §2.2: the head
// 27 px leads, a spine of four discs tapers 22/19/16/13 to the tail, link rests are the overlap
// rule (rA + rB) × 0.82 so the compound reads as one body, not beads), re-expressed on the new
// foundation. Two limbs, three discs each (10 / 7 / 4.5, the legacy limb's root, middle and tip
// classes), hang from the head's two limb sockets, swept back. Chain links only: the solver's
// links have no stiffness column, so the legacy skip-one braces (stiffness 0.85) have no honest
// translation — the swarm's own separation keeps the chain from folding, and the free swing IS
// the follow-through the spec asks for.
//
// SOCKETS (§2.10, ruled: "Attach sockets are limited by the looter's body plan"). Every plan
// DECLARES its sockets — where a limb may hang, on which part, at which angle from the body's
// heading — and a cap. The dish plan declares four: the head's two (born occupied by its own
// limbs) and two on the second spine disc (born free). Looting and attaching are Phase 6; this
// slice only declares, so Phase 6 has a body plan to read and a cap to enforce.
//
// THE LOOK (graphic, not a sticker). §2.4: "an interesting hierarchy of graphic-design
// elements, more layout than literal animal — rather than creatureoid, humanoid, or bugoid
// realism." Each part carries its own look as DATA — a shape from a small graphic vocabulary
// (ring, square, bar, dot) and a tone ROLE (main, ink, accent; never a colour: the palette is the
// stage's) — so the body reads as an assembled layout of distinct marks. §2.10's "a looted limb
// keeps its original look" needs exactly this: the look rides the part, not the creature. No
// label or name string here is ever drawn (unsigned copy stays out of the UI).
//
// THE MOTH PLAN (slice B) — the flagship, the second citizen, and a richer body through the same
// door. Still graphic, still a layout: a small ink dot for a head, a ringed thorax, a squared
// abdomen with an accent tail, two WINGS (three discs each, broad and swept to the side) and two
// ANTENNAE (two small discs each, swept forward) — never a bug drawn, an arrangement of marks
// (§2.4: more layout than literal animal). Its sockets are limited by ITS plan (§2.10): two wing
// sockets on the thorax and two antenna sockets on the head, born occupied, plus ONE free socket on
// the abdomen (ruled by Matt: the flagship can wear a looted limb in Phase 6), cap 5 — the dish plan,
// by contrast, has two free. A plan's limbs come in KINDS (each its own radii, look, how hard it paddles and
// how often it beats per stroke): the dish's single kind is called 'limb' (as before), the moth's
// are 'wing' and 'antenna'. The wingbeat is anatomy (a plan constant), the recipe's paddle dial is
// its amplitude, so DAVIS's dials and bounds are the same ones the dish creature has.

/** A socket that accepts any limb kind its plan declares (the moth's one free socket). */
export const CULTURE_SOCKET_ANY = 'any';

/** The dish plan's id: the dish's native body, the first citizen. */
export const CULTURE_PLAN_DISH = 'dish';
/** The moth plan's id: the flagship, the second citizen. */
export const CULTURE_PLAN_MOTH = 'moth';

/** The graphic vocabulary a part's look may use. Frozen: a new shape is a deliberate addition. */
export const CULTURE_LOOK_SHAPES = Object.freeze(['ring', 'square', 'bar', 'dot']);
/** Tone roles a part may wear (resolved against the stage palette by whoever draws; never a hex here). */
export const CULTURE_LOOK_TONES = Object.freeze(['main', 'ink', 'accent']);
/** The part roles (spec §2.4: head, limbs, attach points; the spine is the body between). */
export const CULTURE_PART_ROLES = Object.freeze(['head', 'spine', 'limb']);

/** The legacy overlap rule (dishCreature DISH_CREATURE.restOverlap): link rest = (rA + rB) × this. */
export const CULTURE_BODY_REST_OVERLAP = 0.82;
/** KINETIC's scale latitude: a cast body is the plan at a seeded scale in this band. */
export const CULTURE_BODY_SCALE_MIN = 0.9;
export const CULTURE_BODY_SCALE_MAX = 1.1;

const DEG = Math.PI / 180;

const lookOf = (shape, tone) => Object.freeze({ shape, tone });
const limbKind = (radii, look, tipLook, paddle, beat) =>
  Object.freeze({ radii: Object.freeze(radii), look, tipLook, paddle, beat });

/**
 * The dish plan, declared. Angles are radians from the body's heading (0 = forward, positive =
 * the heading's left in body space, y down — the screen's counter-clockwise reading is not
 * assumed anywhere; only the sign convention of the rest pose below matters).
 */
const DISH_PLAN = Object.freeze({
  id: CULTURE_PLAN_DISH,
  head: Object.freeze({ radius: 27, look: lookOf('ring', 'main') }),
  spine: Object.freeze([22, 19, 16, 13]),
  spineLook: lookOf('square', 'ink'),
  tailLook: lookOf('dot', 'accent'),
  limbs: Object.freeze({
    limb: limbKind([10, 7, 4.5], lookOf('bar', 'main'), lookOf('dot', 'accent'), 1, 1),
  }),
  sockets: Object.freeze([
    Object.freeze({ id: 'head.l', part: 'head', angle: 115 * DEG, limb: 'limb', born: 'l' }),
    Object.freeze({ id: 'head.r', part: 'head', angle: -115 * DEG, limb: 'limb', born: 'r' }),
    Object.freeze({ id: 'spine.1.l', part: 'spine.1', angle: 90 * DEG, limb: 'limb', born: null }),
    Object.freeze({ id: 'spine.1.r', part: 'spine.1', angle: -90 * DEG, limb: 'limb', born: null }),
  ]),
  socketCap: 4,
});

/**
 * The moth plan, declared (slice B). Proportions: a small head, a thorax that carries the wings, a
 * short abdomen, broad wings (22 / 18 / 12) and fine antennae (4 / 3): a wingspan a little over two
 * body-lengths and a body-length of about 90 px. The wings leave the thorax a touch behind square
 * (±100°) and the antennae leave the head forward (±40°). Five sockets, cap 5: four born occupied, one free (accepts any kind the plan uses).
 */
const MOTH_PLAN = Object.freeze({
  id: CULTURE_PLAN_MOTH,
  head: Object.freeze({ radius: 12, look: lookOf('dot', 'ink') }),
  spine: Object.freeze([18, 14, 9]),
  spineLooks: Object.freeze([lookOf('ring', 'main'), lookOf('square', 'ink'), lookOf('dot', 'accent')]),
  limbs: Object.freeze({
    wing: limbKind([22, 18, 12], lookOf('bar', 'main'), lookOf('ring', 'accent'), 1, 3),
    antenna: limbKind([4, 3], lookOf('bar', 'ink'), lookOf('dot', 'accent'), 0.3, 5),
  }),
  sockets: Object.freeze([
    Object.freeze({ id: 'head.l', part: 'head', angle: 40 * DEG, limb: 'antenna', born: 'l' }),
    Object.freeze({ id: 'head.r', part: 'head', angle: -40 * DEG, limb: 'antenna', born: 'r' }),
    Object.freeze({ id: 'spine.0.l', part: 'spine.0', angle: 100 * DEG, limb: 'wing', born: 'l' }),
    Object.freeze({ id: 'spine.0.r', part: 'spine.0', angle: -100 * DEG, limb: 'wing', born: 'r' }),
    // RULED (Matt, 2026-11-23): the flagship keeps ONE free socket, so it can wear a looted limb in Phase 6.
    // It accepts any limb kind the plan uses (the coordinator's default); it is born empty, so no part is drawn.
    Object.freeze({ id: 'spine.1.free', part: 'spine.1', angle: Math.PI, limb: CULTURE_SOCKET_ANY, born: null }),
  ]),
  socketCap: 5,
});

const PLANS = Object.freeze({ [CULTURE_PLAN_DISH]: DISH_PLAN, [CULTURE_PLAN_MOTH]: MOTH_PLAN });

/** The plans KINETIC can assemble: the dish creature (slice A) and the moth (slice B). */
export const CULTURE_BODY_PLANS = Object.freeze(Object.keys(PLANS));

/** A plan's declaration, or a loud refusal for a plan that does not exist. */
export function cultureBodyPlan(planId) {
  const p = Object.prototype.hasOwnProperty.call(PLANS, planId) ? PLANS[planId] : null;
  if (!p) throw new Error(`cultureBody: unknown body plan "${String(planId)}" (${CULTURE_BODY_PLANS.join(' | ')})`);
  return p;
}

const restOf = (ra, rb) => (ra + rb) * CULTURE_BODY_REST_OVERLAP;

/**
 * KINETIC assembles a body from a plan at a scale: the parts (head first, then the spine head to
 * tail, then each born limb root to tip), the joints between them (declared rests, computed from
 * the radii — never latched from live positions, the dishLinks purity rule), the declared sockets
 * with their occupants, and the body's length (head rim to tail rim along the spine at rest — the
 * unit the sensory range is counted in). Frozen all the way down. A plan that does not exist, or a
 * scale outside KINETIC's band, is refused loudly.
 */
export function assembleCultureBody(planId, { scale = 1 } = {}) {
  const plan = cultureBodyPlan(planId);
  if (!Number.isFinite(scale) || scale < CULTURE_BODY_SCALE_MIN || scale > CULTURE_BODY_SCALE_MAX)
    throw new Error(
      `cultureBody: scale "${String(scale)}" outside KINETIC's band [${CULTURE_BODY_SCALE_MIN}, ${CULTURE_BODY_SCALE_MAX}]`,
    );
  const parts = [];
  const links = [];
  const add = (part) => {
    parts.push(Object.freeze(part));
    return parts.length - 1;
  };
  const head = add({
    id: 'head',
    role: 'head',
    radius: plan.head.radius * scale,
    parent: -1,
    socket: null,
    limb: null,
    look: plan.head.look,
  });
  let prev = head;
  plan.spine.forEach((r, k) => {
    const i = add({
      id: `spine.${k}`,
      role: 'spine',
      radius: r * scale,
      parent: prev,
      socket: null,
      limb: null,
      look: plan.spineLooks ? plan.spineLooks[k] : k === plan.spine.length - 1 ? plan.tailLook : plan.spineLook,
    });
    links.push(Object.freeze({ a: prev, b: i, rest: restOf(parts[prev].radius, parts[i].radius) }));
    prev = i;
  });
  const sockets = [];
  for (const s of plan.sockets) {
    const host = parts.findIndex((p) => p.id === s.part);
    let occupant = -1;
    if (s.born) {
      const kind = plan.limbs[s.limb];
      let up = host;
      kind.radii.forEach((r, k) => {
        const i = add({
          id: `${s.limb}.${s.born}.${k}`,
          role: 'limb',
          radius: r * scale,
          parent: up,
          socket: k === 0 ? s.id : null,
          limb: s.limb,
          look: k === kind.radii.length - 1 ? kind.tipLook : kind.look,
        });
        links.push(Object.freeze({ a: up, b: i, rest: restOf(parts[up].radius, parts[i].radius) }));
        if (k === 0) occupant = i;
        up = i;
      });
    }
    sockets.push(Object.freeze({ id: s.id, part: host, angle: s.angle, accepts: s.limb, occupant }));
  }
  let length = parts[head].radius + parts[prev].radius;
  for (const l of links) if (parts[l.b].role === 'spine') length += l.rest;
  const limbs = {};
  for (const k of Object.keys(plan.limbs))
    limbs[k] = Object.freeze({ paddle: plan.limbs[k].paddle, beat: plan.limbs[k].beat });
  return Object.freeze({
    plan: plan.id,
    scale,
    parts: Object.freeze(parts),
    links: Object.freeze(links),
    sockets: Object.freeze(sockets),
    socketCap: plan.socketCap,
    limbs: Object.freeze(limbs),
    length,
  });
}

/**
 * The body's rest pose at a place and heading: one { x, y } per part, in part order. The spine
 * trails straight behind the head at its link rests; each born limb leaves its socket's host along
 * the socket's angle and continues straight out at its rests. Pure; the cast door deals exactly
 * these positions, so every link starts at its declared rest.
 */
export function cultureBodyRestPose(body, x, y, heading) {
  const out = new Array(body.parts.length);
  out[0] = { x, y };
  const restTo = new Map(body.links.map((l) => [l.b, l.rest]));
  const socketAngle = new Map();
  for (const s of body.sockets) if (s.occupant >= 0) socketAngle.set(s.occupant, s.angle);
  const dirOf = new Array(body.parts.length);
  dirOf[0] = heading + Math.PI; // the spine trails behind
  for (let i = 1; i < body.parts.length; i++) {
    const p = body.parts[i];
    const dir = socketAngle.has(i) ? heading + socketAngle.get(i) : dirOf[p.parent];
    dirOf[i] = dir;
    const from = out[p.parent];
    const rest = restTo.get(i);
    out[i] = { x: from.x + Math.cos(dir) * rest, y: from.y + Math.sin(dir) * rest };
  }
  return out;
}

/**
 * The quality reading LOIS gates a body on (she never builds — this only reads): every fault the
 * body carries, as strings; an empty list is a well-formed body. Checks: one head and it is part
 * 0; every part's role, positive finite radius, and look are from the declared vocabularies; the
 * parts form ONE tree (every non-head part's parent precedes it, and every part is joined to its
 * parent by exactly the link that names it); every link rest is the overlap rule of its radii;
 * sockets stand within the plan's cap, each on a real part and accepting a limb kind the body has, each
 * occupant a limb root of that kind naming that socket; and the body is graphic, not a sticker — at least three distinct shapes in its layout.
 */
export function cultureBodyFaults(body) {
  const faults = [];
  const parts = (body && body.parts) || [];
  if (!parts.length) return ['no parts'];
  if (parts[0].role !== 'head' || parts.filter((p) => p.role === 'head').length !== 1) faults.push('one head, first');
  parts.forEach((p, i) => {
    if (!CULTURE_PART_ROLES.includes(p.role)) faults.push(`part ${i}: role "${p.role}"`);
    if (!(Number.isFinite(p.radius) && p.radius > 0)) faults.push(`part ${i}: radius`);
    if (!p.look || !CULTURE_LOOK_SHAPES.includes(p.look.shape) || !CULTURE_LOOK_TONES.includes(p.look.tone))
      faults.push(`part ${i}: look`);
    if (i > 0) {
      if (!(Number.isInteger(p.parent) && p.parent >= 0 && p.parent < i)) faults.push(`part ${i}: parent`);
      const joins = body.links.filter((l) => l.b === i);
      if (joins.length !== 1 || joins[0].a !== p.parent) faults.push(`part ${i}: joint`);
      else if (Math.abs(joins[0].rest - restOf(parts[p.parent].radius, p.radius)) > 1e-9)
        faults.push(`part ${i}: rest`);
    }
  });
  if (body.links.length !== parts.length - 1) faults.push('not one tree');
  const sockets = body.sockets || [];
  // the cap and the socket set are the PLAN's, never the body's own claim (§2.10: sockets limited by the body plan)
  let plan = null;
  try {
    plan = cultureBodyPlan(body.plan);
  } catch {
    faults.push('unknown plan');
  }
  if (plan) {
    if (sockets.length > plan.socketCap) faults.push('sockets over the plan cap');
    if (body.socketCap !== plan.socketCap) faults.push("socket cap is not the plan's");
    const declared = new Set(plan.sockets.map((d) => d.id));
    for (const s of sockets) if (!declared.has(s.id)) faults.push(`socket ${s.id}: not in the plan`);
  }
  const kinds = body.limbs || {};
  for (const s of sockets) {
    if (!(s.part >= 0 && s.part < parts.length)) faults.push(`socket ${s.id}: host`);
    if (s.accepts !== CULTURE_SOCKET_ANY && !Object.prototype.hasOwnProperty.call(kinds, s.accepts))
      faults.push(`socket ${s.id}: accepts`);
    if (s.occupant >= 0) {
      const o = parts[s.occupant];
      if (
        !o ||
        o.role !== 'limb' ||
        o.socket !== s.id ||
        o.parent !== s.part ||
        (s.accepts === CULTURE_SOCKET_ANY ? !Object.prototype.hasOwnProperty.call(kinds, o.limb) : o.limb !== s.accepts)
      )
        faults.push(`socket ${s.id}: occupant`);
    }
  }
  if (new Set(parts.map((p) => p.look && p.look.shape)).size < 3) faults.push('a sticker: fewer than three shapes');
  return faults;
}
