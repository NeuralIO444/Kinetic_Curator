// cultureBeast.mjs — CULTURE Phase 5, slice C: the Strandbeest as a citizen (the parent epic 1863 as a CULTURE body).
// Pure: no DOM, no GL, no clock. The world feeds it state; it never reads time.
//
// WHAT WALKS. A strandbeest citizen is an assembled body (engine/cultureBody.mjs, the strandbeest plan): a beam of
// crank hubs and six hips — ordinary discs in the world's table, joined by ordinary links, pushed by the Queen's fields
// and the hand, judged by the soil, like every citizen's parts. Its LEGS are Jansen linkages hung from the hips, posed
// in CLOSED FORM from the crank's phase (engine/beastBuilder.js legPoints → engine/jansenSolver.js solvePose: five
// circle intersections, branch signs pinned — the epic's law 1, no physics runtime, no iterative solver). The bars are
// invisible bones carrying looks (Matt, 2026-11-03). The gait is not animated: it IS the geometry.
//
// THE DISH READING OF THE PROFILE (the epic's open D-B1, "profile assumed", read for a dish seen from above, §2.3: no
// gravity, no floor). The linkage is a side-view mechanism (solver frame: +x forward, +y up, the ground below). Laid
// flat into the dish, each leg's plane is turned onto the dish beside the beam: the solver's +x runs along the
// citizen's heading and its DOWN (toward the ground) runs OUTWARD from the beam, on the leg's own side — bank A (even
// legs) to the left, bank B (odd legs) to the right, beastRig.js's two banks. So the stance stroke, the flat bottom of
// the Jansen ovoid, is the outer edge of each leg's reach: the feet plant at the rim of the footprint and stroke back.
// A coordinator's reading, recorded; the epic's D-B1 stays Matt's to rule.
//
// HOW IT MOVES (engine/beastRoam.js's law, made a citizen's muscle). Locomotion IS the stance stroke: the frame's
// velocity is the stance foot's backward speed — stride (the stance step over its duty, closed form from the genes) ×
// the banks' mean crank rate — and STEERING IS DIFFERENTIAL PHASE between the two banks (the epic's law 4, "one crank;
// steering is differential phase or it is nothing"): the heading turns at stride / track × (rB − rA). The drives are
// the citizens' one registry (engine/cultureMotion.mjs: SENSES → DRIVES): their desire chooses the bank rates, never a
// push. With no desire the crank stops, and a crank that stops is a beast that stands.
//
// STANDING ON THE SOIL. The feet stand on the ground (Life is the soil, spec §5.2): a foot in its stance band reads
// the soil under it, and a planted foot on living ground grips fully, on dead ground it slips (CULTURE_BEAST_DEAD_GRIP):
// the planted feet transmit their mean grip's share of the stance stroke (and of the turn), and the frame's velocity is
// eased toward that by the recipe's tone — so on dead ground a beast walks at a third of its pace, and with no foot down
// nothing holds it and the frame coasts (the swarm's damping) — a limp is a look
// (the epic's law 3). The soil still judges the frame's discs like every body's: a withered hip is a lost leg (its
// bones go and its foot no longer plants), a withered head is a dead beast.
//
// VELOCITY ONLY. The muscle writes velocity on the citizen's own parts (a rigid frame motion: the stance velocity along
// the heading plus the turn about the frame's centroid), never a position; the swarm integrates and the solver joins,
// as for every body. The target is divided by the swarm's damping so a free frame, gripped fully, moves at exactly the
// closed-form speed.
//
// THE RECIPE, READ BY THIS PLAN (the moth's precedent: one recipe shape for every plan, each plan's anatomy reads the
// dials — DAVIS's dials and bounds stay the ones every citizen has). See CULTURE_BEAST_DIAL_READING.
import { cultureSenses, cultureDesire } from './cultureMotion.mjs';
import { cultureSoilSample } from './cultureSoil.mjs';
import { CULTURE_SWARM_PARAMS } from './cultureSwarm.mjs';
import { evaluateGenome } from './jansenSolver.js';
import { legPoints, BEAST_BARS } from './beastBuilder.js';
import { cultureBodyPlan, cultureBodyRestPose } from './cultureBody.mjs';

/** Pixels per solver unit (relative a = 1) at body scale 1: the wild-type leg reaches ~33 px out and strokes ~16 px. */
export const CULTURE_BEAST_PX = 14;
/** The stance band: a foot within this share of its height range above its lowest point is planted (Wang's 15 %). */
export const CULTURE_BEAST_STANCE_BAND = 0.15;
/** A planted foot on dead ground slips: it grips at this share of a foot on living ground. */
export const CULTURE_BEAST_DEAD_GRIP = 0.35;
/** ARCS read as the steering lock: the heading error at which a bank runs at full differential, snap .. arc. */
export const CULTURE_BEAST_LOCK_SNAP = Math.PI / 12;
export const CULTURE_BEAST_LOCK_ARC = Math.PI / 2;
/** SLOW IN / SLOW OUT read as the crank's ease: a bank's rate closes 1 / (this × slowInOut) of its gap per step. */
export const CULTURE_BEAST_CRANK_EASE_STEPS = 6;
/**
 * The chassis HOLD: each step every frame part is pushed this share of the way back to its place in the frame's rest
 * shape (at the new heading, centred on the living parts), × min(1, tone). A Strandbeest's chassis is rigid — the solver's links
 * are distances with no bending stiffness, so without the hold the beam folds and the hips swing round their hubs
 * (probed: a 90° fold in 8 s). Velocity only, like every muscle.
 */
export const CULTURE_BEAST_FRAME_HOLD = 0.25;
/** The swarm step, in seconds (one 60 fps frame): crank rates are turns per second. */
export const CULTURE_BEAST_STEP_S = 1 / 60;

/**
 * How the strandbeest reads the one recipe shape (cultureMotion CULTURE_RECIPE_BOUNDS). Every dial is accounted for;
 * a dial the plan does not read is said so, never faked into a number.
 */
export const CULTURE_BEAST_DIAL_READING = Object.freeze({
  'drives.wander': 'the desire (shared registry)',
  'drives.ground': 'the desire (shared registry)',
  'drives.rim': 'the desire (shared registry)',
  'physics.thrust': 'ADVANCE — the share of the stance stroke that becomes travel, min(1, thrust) (0 walks in place)',
  'physics.headMass': 'the front hub’s mass',
  'physics.partMass':
    'the frame’s base mass (followThrough would lighten the hips and tail, as for every plan; the native recipe sets followThrough 0, so the chassis is uniformly heavy)',
  'physics.paddle':
    'TURN GAIN — steering brakes the INNER bank by 2·gain·|s| of the base rate (never below 0) while the outer bank holds the base rate (cultureBeastBankTargets; not beastRoam’s 1 ± turnGain)',
  'physics.tone': 'GRIP — how hard planted feet hold the frame to the stance stroke, min(1, tone) of the gap a step',
  'seasoning.timing': 'TIMING — swarm steps per crank turn (60 = one turn a second)',
  'seasoning.slowInOut': 'SLOW IN / SLOW OUT — the crank’s ease toward a new rate',
  'seasoning.anticipation': 'not read: the beast’s gait is its geometry, it has no wind-up',
  'seasoning.arcs': 'ARCS — the steering lock: a long arc needs a large heading error for full differential',
  'seasoning.followThrough': 'the part masses (cultureRecipeMasses)',
  'seasoning.squash': 'the look (culture:feel), as for every plan',
  'seasoning.secondary': 'the look (culture:feel), as for every plan',
  'seasoning.exaggeration': 'the look (culture:feel), as for every plan',
});

const TAU = Math.PI * 2;
const wrapAngle = (a) => {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
};

const _gait = new WeakMap();
/**
 * A linkage's walking numbers, from the 360-step sweep (engine/jansenSolver.js evaluateGenome), memoised on the frozen
 * linkage: { feasible, minY, maxY, stanceY (the planted band's top), stride (solver units per crank turn: the stance
 * step over its duty — beastRig.js linkageInfo's stride) }. A stillbirth reads { feasible: false, stride: 0 }.
 */
export function cultureBeastGaitNumbers(linkage) {
  let g = _gait.get(linkage);
  if (!g) {
    const ev = evaluateGenome(linkage.measures, linkage.measures.scale);
    g = ev.feasible
      ? Object.freeze({
          feasible: true,
          minY: ev.minY,
          maxY: ev.maxY,
          stanceY: ev.minY + CULTURE_BEAST_STANCE_BAND * (ev.maxY - ev.minY),
          stanceMean: ev.stanceMean,
          stride: ev.duty > 0 ? ev.step / ev.duty : 0,
        })
      : Object.freeze({ feasible: false, minY: 0, maxY: 0, stanceY: 0, stanceMean: 0, stride: 0 });
    _gait.set(linkage, g);
  }
  return g;
}

const _frame = new WeakMap();
/**
 * The beast's frame, read from its body (memoised on the frozen body): per leg (socket order) its hip part index,
 * side (+1 left / bank A, −1 right / bank B) and bank (0 = A, 1 = B); the frame's pixel scale (CULTURE_BEAST_PX ×
 * the body's scale); the stride in pixels per crank turn; and the TRACK — the distance between the two banks' planted
 * feet at rest (the hips' span plus each stance foot's reach outward), the lever a phase differential turns on.
 */
export function cultureBeastFrame(body) {
  let f = _frame.get(body);
  if (f) return f;
  const plan = cultureBodyPlan(body.plan);
  if (!plan.linkage || !body.linkage) throw new Error(`cultureBeast: plan "${body.plan}" has no linkage`);
  const legs = body.sockets.map((s) => ({
    hip: s.occupant,
    side: s.angle >= 0 ? 1 : -1,
    bank: s.angle >= 0 ? 0 : 1,
  }));
  if (legs.length !== plan.linkage.legs || legs.some((l) => l.hip < 0))
    throw new Error('cultureBeast: every leg socket must hold its hip');
  const px = CULTURE_BEAST_PX * body.scale;
  const g = cultureBeastGaitNumbers(body.linkage);
  const restTo = new Map(body.links.map((l) => [l.b, l.rest]));
  const hipOut = restTo.get(legs[0].hip); // every hip hangs at its overlap rest from its hub, ±90°
  const track = 2 * hipOut + 2 * Math.abs(g.stanceMean) * px;
  f = Object.freeze({ legs: Object.freeze(legs.map(Object.freeze)), px, stride: g.stride * px, track, gait: g });
  _frame.set(body, f);
  return f;
}

/** The crank angle (radians, the solver's) of leg `li` at its bank's phase (turns): beastRig.js poseLinkage's own. */
export function cultureBeastTheta(linkage, li, bankTurns) {
  const n = linkage.measures.legCount;
  return TAU * (linkage.phase + li / n - bankTurns);
}

/** A bank's accumulated crank phase (turns): bank A = c.pA, bank B = c.pB. */
const bankTurns = (c, bank) => (bank === 0 ? c.pA : c.pB);

/** Lay one leg-frame point (solver units) into the dish at hip (hx, hy), heading h, side s, scale px. */
function lay(p, hx, hy, ux, uy, side, px) {
  // forward along the heading; the solver's DOWN runs outward on the leg's own side (left = heading + 90°)
  const ox = -uy * side;
  const oy = ux * side;
  return { x: hx + ux * p.x * px - ox * p.y * px, y: hy + uy * p.x * px - oy * p.y * px };
}

/**
 * The beast's FEET right now: per leg { leg, x, y, planted, alive } in dish space — the foot laid flat from its hip at
 * the citizen's heading and its bank's crank phase; `planted` when the foot stands in its stance band. A leg whose hip
 * has withered has no foot (alive false). Pure read.
 */
export function cultureBeastFeet(bodies, c) {
  const fr = cultureBeastFrame(c.body);
  const ux = Math.cos(c.heading);
  const uy = Math.sin(c.heading);
  return fr.legs.map((L, li) => {
    const i = c.first + L.hip;
    if (!bodies.alive[i]) return { leg: li, x: bodies.x[i], y: bodies.y[i], planted: false, alive: false };
    const pts = legPoints(c.linkage.measures, cultureBeastTheta(c.linkage, li, bankTurns(c, L.bank)), 1);
    if (!pts) return { leg: li, x: bodies.x[i], y: bodies.y[i], planted: false, alive: true };
    const F = lay(pts.F, bodies.x[i], bodies.y[i], ux, uy, L.side, fr.px);
    return { leg: li, x: F.x, y: F.y, planted: pts.F.y <= fr.gait.stanceY, alive: true };
  });
}

/**
 * The beast's BONES right now, in the beast gait adapter's node order (engine/cultureGait.mjs cultureTreeOf('beast'),
 * from beastRig.js poseLinkage): the beam first — from the rearmost living hub to the head — then each leg's twelve
 * bars in BEAST_BARS order. Each bone { id, leg, name, x, y, tx, ty, len, rot (degrees), look, alive }. A leg whose hip
 * has withered keeps its bones, collapsed at the hip and not alive (the node count is the tree's, always); a crank
 * angle the solver cannot close (the sweep passed; a sample between its steps failed) collapses the leg the same way,
 * alive. Pure read.
 */
export function cultureBeastBones(bodies, c) {
  const fr = cultureBeastFrame(c.body);
  const looks = cultureBodyPlan(c.plan).linkage.boneLooks;
  const ux = Math.cos(c.heading);
  const uy = Math.sin(c.heading);
  const { x, y, alive } = bodies;
  const h = c.first;
  // the beam: head to the rearmost living hub (spine parts carrying hips; the tail is not a hub)
  let rear = 0;
  const hubs = new Set(fr.legs.map((L) => c.body.parts[L.hip].parent));
  for (const k of hubs) if (alive[h + k] && k > rear) rear = k;
  const bone = (id, leg, name, a, b, look, isAlive) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
      id,
      leg,
      name,
      x: a.x,
      y: a.y,
      tx: b.x,
      ty: b.y,
      len: Math.sqrt(dx * dx + dy * dy),
      rot: (Math.atan2(dy, dx) * 180) / Math.PI,
      look,
      alive: isAlive,
    };
  };
  const out = [
    bone('beam', -1, 'beam', { x: x[h + rear], y: y[h + rear] }, { x: x[h], y: y[h] }, looks.beam, alive[h] === 1),
  ];
  fr.legs.forEach((L, li) => {
    const i = h + L.hip;
    const hip = { x: x[i], y: y[i] };
    const live = alive[i] === 1;
    const pts = live ? legPoints(c.linkage.measures, cultureBeastTheta(c.linkage, li, bankTurns(c, L.bank)), 1) : null;
    for (const [name, from, to] of BEAST_BARS) {
      const look = name === 'crank' ? looks.crank : name === 'frame' ? looks.frame : looks.bar;
      if (!pts) out.push(bone(`${li}:${name}`, li, name, hip, hip, look, live));
      else
        out.push(
          bone(
            `${li}:${name}`,
            li,
            name,
            lay(pts[from], hip.x, hip.y, ux, uy, L.side, fr.px),
            lay(pts[to], hip.x, hip.y, ux, uy, L.side, fr.px),
            look,
            true,
          ),
        );
    }
  });
  return out;
}

/**
 * The steering command for a heading error: −1..1, full lock at the recipe's ARCS lock angle. Pure.
 */
export function cultureBeastSteer(delta, seasoning) {
  const lock = CULTURE_BEAST_LOCK_SNAP + (CULTURE_BEAST_LOCK_ARC - CULTURE_BEAST_LOCK_SNAP) * seasoning.arcs;
  return Math.max(-1, Math.min(1, delta / lock));
}

/**
 * The banks' target crank rates (turns per second) for a steering command s and a desire strength. The base rate is one
 * turn per TIMING steps, scaled by the desire (no desire, no crank — the beast stands). Steering is differential phase
 * by BRAKING THE INNER BANK: the outer bank holds the base rate, the inner one slows by 2·g·|s| of it (g, the recipe's
 * paddle — the turn gain), and never runs backwards. To turn toward +angle (the beast's left, bank A's side) bank A is
 * the inner one. So a hard turn is a slow, tight one (radius track / 2 at g = ½, full lock) — a plodder that turns in
 * place rather than sweeping wide (engine/beastRoam.js runs its banks at 1 ± g; a citizen in a bounded dish needs the
 * tighter turn — probed: at 1 ± g, five beasts in thirty-four walked off the dish in a minute). Pure.
 */
export function cultureBeastBankTargets(recipe, s, strength) {
  const r = (1 / (recipe.seasoning.timing * CULTURE_BEAST_STEP_S)) * strength;
  const g = recipe.physics.paddle;
  return {
    rA: r * Math.max(0, 1 - 2 * g * Math.max(0, s)),
    rB: r * Math.max(0, 1 - 2 * g * Math.max(0, -s)),
  };
}

/**
 * The closed-form motion the banks command (no grip, no outside force): { v, w } — v the frame's speed along its
 * heading (px per second) = stride × advance × the banks' mean rate; w its turn rate (radians per second) =
 * stride × advance / track × (rB − rA). engine/beastRoam.js's pushPiece, in the dish's units and banks. Pure.
 */
export function cultureBeastMotion(fr, recipe, rA, rB) {
  const S = fr.stride * Math.min(1, recipe.physics.thrust);
  return { v: (S * (rA + rB)) / 2, w: (S / fr.track) * (rB - rA) };
}

/**
 * ONE STRANDBEEST'S MUSCLE for one swarm step — the seam's write for a linkage plan (the dish and the moth swim through
 * cultureMotion.mjs stepCultureCitizenMuscle; the beast walks here). The HEADING is the crank's, in closed form — it
 * turns only by the banks' differential through planted feet (never by an outside twist; the chassis hold brings the
 * body back to it: probed, the chassis axis stands within 0.6° of it on average, 5° at worst, over 10 seeds × 60 s).
 * Sums the drives (the shared registry), turns the heading error into a steering command, eases each bank's crank rate
 * toward its target, advances the banks' phases, reads the feet (planted ones grip by the soil under them), and eases
 * every living part's velocity toward the rigid frame motion the banks command — by grip. Velocity only. Mutates the
 * citizen's crank state (pA, pB, rA, rB) and returns its new heading.
 */
export function stepCultureBeastMuscle(bodies, field, c) {
  const fr = cultureBeastFrame(c.body);
  const h0 = c.heading;
  const senses = cultureSenses(bodies, field, { ...c, heading: h0 });
  const desire = cultureDesire(senses, c);
  const s =
    desire.strength > 1e-12 ? cultureBeastSteer(wrapAngle(Math.atan2(desire.y, desire.x) - h0), c.recipe.seasoning) : 0;
  const tgt = cultureBeastBankTargets(c.recipe, s, desire.strength);
  const ease = 1 / (CULTURE_BEAST_CRANK_EASE_STEPS * c.recipe.seasoning.slowInOut);
  c.rA += (tgt.rA - c.rA) * ease;
  c.rB += (tgt.rB - c.rB) * ease;
  c.pA += c.rA * CULTURE_BEAST_STEP_S;
  c.pB += c.rB * CULTURE_BEAST_STEP_S;
  // the feet, at the new phases, laid at the heading: the planted ones grip by the ground under them
  const feet = cultureBeastFeet(bodies, c);
  let planted = 0;
  let grip = 0;
  for (const f of feet) {
    if (!f.alive || !f.planted) continue;
    planted++;
    grip += cultureSoilSample(field, f.x, f.y).living ? 1 : CULTURE_BEAST_DEAD_GRIP;
  }
  // the share of the stroke the planted feet transmit (1 on living ground, the slip share on dead), and how hard the
  // frame is held to it this step (the recipe's tone) — with no foot down, nothing holds it: it coasts
  const share = planted ? grip / planted : 0;
  const g = planted ? Math.min(1, c.recipe.physics.tone) : 0;
  const { v, w } = cultureBeastMotion(fr, c.recipe, c.rA, c.rB);
  const turn = w * CULTURE_BEAST_STEP_S * share;
  const h1 = wrapAngle(h0 + turn);
  if (g > 0) {
    const { x, y, vx, vy, alive } = bodies;
    const h = c.first;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let k = 0; k < c.n; k++) {
      if (!alive[h + k]) continue;
      cx += x[h + k];
      cy += y[h + k];
      n++;
    }
    cx /= n;
    cy /= n;
    const along = v * CULTURE_BEAST_STEP_S * share;
    const ux = Math.cos(h1);
    const uy = Math.sin(h1);
    const damp = CULTURE_SWARM_PARAMS.damping;
    for (let k = 0; k < c.n; k++) {
      const i = h + k;
      if (!alive[i]) continue;
      // the rigid frame motion: the stance velocity along the heading plus the turn about the frame's centroid
      const tx = (ux * along - turn * (y[i] - cy)) / damp;
      const ty = (uy * along + turn * (x[i] - cx)) / damp;
      vx[i] += (tx - vx[i]) * g;
      vy[i] += (ty - vy[i]) * g;
    }
  }
  // the chassis holds its shape: every living part pulled toward its place in the frame's rest shape at the new
  // heading, the shape centred on the living parts' own centroid — so the hold only reshapes, it never drives (its
  // pushes sum to zero: the walking stays the stance stroke's alone)
  const { x, y, vx, vy, alive } = bodies;
  const h = c.first;
  const rest = cultureBodyRestPose(c.body, 0, 0, h1);
  let ax = 0;
  let ay = 0;
  let rx = 0;
  let ry = 0;
  let m = 0;
  for (let k = 0; k < c.n; k++) {
    if (!alive[h + k]) continue;
    ax += x[h + k];
    ay += y[h + k];
    rx += rest[k].x;
    ry += rest[k].y;
    m++;
  }
  if (m > 1) {
    const ox = (ax - rx) / m;
    const oy = (ay - ry) / m;
    const hold = CULTURE_BEAST_FRAME_HOLD * Math.min(1, c.recipe.physics.tone);
    for (let k = 0; k < c.n; k++) {
      const i = h + k;
      if (!alive[i]) continue;
      vx[i] += (rest[k].x + ox - x[i]) * hold;
      vy[i] += (rest[k].y + oy - y[i]) * hold;
    }
  }
  return h1;
}
