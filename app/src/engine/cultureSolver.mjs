// cultureSolver.mjs — CULTURE Phase 2: the in-house solver and the collision shapes
// (the parent issue 1598). Pure: no DOM, no GL, no clock. The world
// (engine/cultureWorld.mjs) feeds it steps; it never reads time, files, or globals
// beyond its arguments.
//
// THE SHAPES — the parent issue rules them, verbatim in substance: "The dish is a
// disc engine: every body is a circle, every contact is disc-vs-disc." D4 adds
// exactly one pairing on top: disc vs static AABB. So the world's dynamic shape is
// the disc (the K3 body table's radius column — the shape the K3 detection
// predicate already assumes), and the one static shape is the axis-aligned box:
// scenery with infinite mass, no velocity, no spin, no links. Anything a scene
// wants that cannot be said as "discs bounce off still boxes" is not this solver —
// it is a different engine, and it does not belong in the dish.
//
// THE PASS — one solver step runs on the swarm's cadence, immediately after the
// swarm's integrator, inside the same world step (cultureWorld.mjs): the contacts
// it resolves are the ones the integrator just produced, never a stale or skipped
// snapshot. Three movements, all in canonical order (pair order from the K3
// dealer, then statics by body and box index, then links by index), all plain
// IEEE-exact JS arithmetic — the solver is resolver-class, CPU by the Full WebGL
// program's standing law, and it stamps nothing of its own: the world's law
// composition is unchanged by this phase.
//
//   1. DETECT — broadphase is the K3 contract: cultureContactPairs deals every
//      overlapping disc pair in canonical order (the world's one population has
//      no spatial hash — the counting-sort grid is the legacy strata pass's
//      machinery, and at the 2,048 ceiling the canonical all-pairs dealer IS
//      the broadphase the K3 slice pinned). Static contacts are detected per
//      body against the box table in the same movement.
//   2. IMPULSE — for each pair, the normal impulse, mass-weighted, applied only
//      while the pair approaches. Restitution stands at CULTURE_SOLVER_RESTITUTION
//      = 0: spec §3.5 speaks only to the fixed timestep and names no restitution,
//      and the dish's body law (§2.3) is drift, collide, gather, CLUMP — a
//      perfectly inelastic normal response is the simplest stable scheme that
//      clumps, and it can never add energy. A static is the same law with
//      infinite mass on the far side: the disc's inward normal velocity is
//      cancelled, its tangential velocity untouched — the parent issue's claim
//      that the contact law does not care that one side is a box, kept in the
//      only form this world has (the D1/D2 friction-and-spin machinery the
//      issue cites lives in the legacy strata pass, dishContacts.mjs, which
//      the world does not enrol; tangential response in the world is the swarm
//      core's own damping, and the body table carries no ω column to spend
//      torque on — see the staging report for the full scoping).
//   3. PROJECT — positional correction, iterated CULTURE_SOLVER_ITERATIONS
//      times: each disc pair depenetrated by its current overlap along the
//      detected normal, split by inverse mass; each static contact depenetrated
//      in full onto the disc; each link projected to its rest length, split by
//      inverse mass. Projection never touches velocity, so it cannot add
//      kinetic energy either.
//   4. CLAMP — the swarm core's speed clamp, re-applied as the step's last
//      movement. Sequential pair impulses compound: a body resolved against
//      several neighbours in one pass can leave an impulse a hair faster than
//      either input (measured 8.014 against the core's 8 in the K3 parity
//      population). The clamp is the core's standing law, so the solver
//      restores it before the step ends — no body ever leaves a world step
//      faster than the core allows, whoever moved it last.
//
// THE LINKS — distance constraints between two table discs: the joint of spec
// §2.4 ("its parts are jointed and can swing, drag, lag, and settle"). A
// compound body at this layer IS a set of discs plus links; assembling them
// from WetLab rigs and dealing them into the table is rig spawning (Phase 5,
// the parent issue 2168). Links are solver state here, nothing more.
//
// PARITY — the parent issue's inherited law, restated for the world: the AABB
// machinery must not move the disc law. Over no pairs, no statics, and no
// links the solver is a bit-exact no-op (the swarm alone, unchanged); scenery
// no body reaches changes nothing either, contacts and all; and a world with
// no bodies at all is untouched by the solver's existence. The suite
// (engine/cultureSolver.selfcheck.mjs) pins each.
import { cultureContactPairs, CULTURE_SWARM_PARAMS } from './cultureSwarm.mjs';

/**
 * The normal restitution of a contact: 0, perfectly inelastic (see the header —
 * §3.5 names no value; the dish clumps, §2.3). A starting constant, tunable in
 * iteration like every Phase 2 dial.
 */
export const CULTURE_SOLVER_RESTITUTION = 0;
/** Positional projection iterations per solver step (contacts, statics, links per pass). */
export const CULTURE_SOLVER_ITERATIONS = 3;
/** Static AABB capacity: scenery is sparse by design; the ceiling is a stated constant. */
export const CULTURE_STATICS_CAP = 256;
/** Link capacity: two per body at the 2,048 ceiling — a fully jointed population fits. */
export const CULTURE_LINKS_CAP = 4096;

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;

/** The static scenery table: axis-aligned boxes in body space (pixels), all still. */
export function createCultureStatics() {
  return {
    capacity: CULTURE_STATICS_CAP,
    count: 0,
    minX: new Float32Array(CULTURE_STATICS_CAP),
    minY: new Float32Array(CULTURE_STATICS_CAP),
    maxX: new Float32Array(CULTURE_STATICS_CAP),
    maxY: new Float32Array(CULTURE_STATICS_CAP),
  };
}

/** The link table: distance constraints between body indices, by index order. */
export function createCultureLinks() {
  return {
    capacity: CULTURE_LINKS_CAP,
    count: 0,
    a: new Int32Array(CULTURE_LINKS_CAP),
    b: new Int32Array(CULTURE_LINKS_CAP),
    rest: new Float32Array(CULTURE_LINKS_CAP),
  };
}

/**
 * The disc-vs-AABB contact for body i against box s, or null: the closest point
 * on the box to the disc centre, the outward normal, and the penetration depth.
 * A centre inside the box exits through its nearest face (ties resolve in
 * minX, maxX, minY, maxY order — canonical, never random). Pure geometry; the
 * same answer every call for the same inputs.
 */
function discStaticContact(bodies, i, statics, s) {
  const x = bodies.x[i];
  const y = bodies.y[i];
  const r = bodies.radius[i];
  const minX = statics.minX[s];
  const minY = statics.minY[s];
  const maxX = statics.maxX[s];
  const maxY = statics.maxY[s];
  const cx = x < minX ? minX : x > maxX ? maxX : x;
  const cy = y < minY ? minY : y > maxY ? maxY : y;
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 1e-18) {
    const dist = Math.sqrt(d2);
    if (dist >= r) return null;
    return { nx: dx / dist, ny: dy / dist, overlap: r - dist };
  }
  // The centre is inside (or exactly on) the box: exit through the nearest face.
  const pl = x - minX;
  const pr = maxX - x;
  const pt = y - minY;
  const pb = maxY - y;
  let m = pl;
  let nx = -1;
  let ny = 0;
  if (pr < m) {
    m = pr;
    nx = 1;
    ny = 0;
  }
  if (pt < m) {
    m = pt;
    nx = 0;
    ny = -1;
  }
  if (pb < m) {
    m = pb;
    nx = 0;
    ny = 1;
  }
  return { nx, ny, overlap: r + m };
}

/**
 * One solver step over a body table and its scenery and links (the world's
 * shapes; extra columns are ignored). Detection reads the table exactly as the
 * swarm's integrator left it. Dead bodies and radius-0 bodies take no part
 * (the dish law, the K3 predicate's own). Deterministic: same tables in, same
 * tables out, on any device.
 */
export function stepCultureSolver(bodies, statics, links) {
  const { count, alive, x, y, vx, vy, mass, radius } = bodies;
  const e = CULTURE_SOLVER_RESTITUTION;

  // 1 — detect: the K3 pair dealer over the living discs.
  const pairs = cultureContactPairs(bodies);

  // 2 — impulse: mass-weighted normal response, approaching pairs only.
  for (let p = 0; p < pairs.length; p++) {
    const { a, b, nx, ny } = pairs[p];
    const vn = (vx[b] - vx[a]) * nx + (vy[b] - vy[a]) * ny;
    if (vn >= 0) continue;
    const invA = 1 / mass[a];
    const invB = 1 / mass[b];
    const jimp = (-(1 + e) * vn) / (invA + invB);
    vx[a] -= jimp * invA * nx;
    vy[a] -= jimp * invA * ny;
    vx[b] += jimp * invB * nx;
    vy[b] += jimp * invB * ny;
  }
  // Statics: the same law against infinite mass — cancel the inward normal part.
  for (let i = 0; i < count; i++) {
    if (!alive[i] || !(radius[i] > 0)) continue;
    for (let s = 0; s < statics.count; s++) {
      const c = discStaticContact(bodies, i, statics, s);
      if (!c) continue;
      const vn = vx[i] * c.nx + vy[i] * c.ny;
      if (vn >= 0) continue;
      vx[i] -= (1 + e) * vn * c.nx;
      vy[i] -= (1 + e) * vn * c.ny;
    }
  }

  // 3 — project: positional correction, iterated. Velocities are never touched
  // here, so this movement cannot add kinetic energy.
  for (let iter = 0; iter < CULTURE_SOLVER_ITERATIONS; iter++) {
    // Disc pairs: the current overlap along the detected normal, split by inverse mass.
    for (let p = 0; p < pairs.length; p++) {
      const { a, b, nx, ny } = pairs[p];
      const overlap = radius[a] + radius[b] - ((x[b] - x[a]) * nx + (y[b] - y[a]) * ny);
      if (overlap <= 0) continue;
      const invA = 1 / mass[a];
      const invB = 1 / mass[b];
      const sum = invA + invB;
      const ca = overlap * (invA / sum);
      const cb = overlap * (invB / sum);
      x[a] -= nx * ca;
      y[a] -= ny * ca;
      x[b] += nx * cb;
      y[b] += ny * cb;
    }
    // Statics: geometry recomputed per iteration; the disc takes the full move.
    for (let i = 0; i < count; i++) {
      if (!alive[i] || !(radius[i] > 0)) continue;
      for (let s = 0; s < statics.count; s++) {
        const c = discStaticContact(bodies, i, statics, s);
        if (!c) continue;
        x[i] += c.nx * c.overlap;
        y[i] += c.ny * c.overlap;
      }
    }
    // Links: project the pair's distance onto its rest length, split by inverse mass.
    for (let l = 0; l < links.count; l++) {
      const a = links.a[l];
      const b = links.b[l];
      if (!alive[a] || !alive[b]) continue;
      const rest = links.rest[l];
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.sqrt(dx * dx + dy * dy);
      const invA = 1 / mass[a];
      const invB = 1 / mass[b];
      const sum = invA + invB;
      if (d > 1e-9) {
        const diff = (d - rest) / d;
        const ca = diff * (invA / sum);
        const cb = diff * (invB / sum);
        x[a] += dx * ca;
        y[a] += dy * ca;
        x[b] -= dx * cb;
        y[b] -= dy * cb;
      } else if (rest > 0) {
        // Coincident endpoints: separate along the pair-identity golden normal,
        // the K3 detector's own deterministic answer to a directionless pair.
        const ang = (a * GOLDEN + b * 1.2) % TAU;
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);
        const ca = rest * (invA / sum);
        const cb = rest * (invB / sum);
        x[a] -= nx * ca;
        y[a] -= ny * ca;
        x[b] += nx * cb;
        y[b] += ny * cb;
      }
    }
  }

  // 4 — clamp: the core's speed ceiling, restored as the step's last movement.
  const maxSpeed = CULTURE_SWARM_PARAMS.maxSpeed;
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;
    const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
    if (sp > maxSpeed) {
      const s = maxSpeed / sp;
      vx[i] *= s;
      vy[i] *= s;
    }
  }
  return bodies;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the solver's standing scenery and joints: the statics
 * (count, then each box's corners, floats bit-exact) and the links (count, then
 * endpoints and rest lengths). Same tables => same hash, on any device.
 * FNV-1a, the cultureSwarmHash discipline — the world hash folds this in whole.
 */
export function cultureSolverHash(statics, links) {
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
  mixU32(statics.count);
  for (let s = 0; s < statics.count; s++) {
    mixFloat(statics.minX[s]);
    mixFloat(statics.minY[s]);
    mixFloat(statics.maxX[s]);
    mixFloat(statics.maxY[s]);
  }
  mixU32(links.count);
  for (let l = 0; l < links.count; l++) {
    mixU32(links.a[l]);
    mixU32(links.b[l]);
    mixFloat(links.rest[l]);
  }
  return h >>> 0;
}
