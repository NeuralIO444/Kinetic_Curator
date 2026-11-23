// cultureSwarm.mjs — CULTURE Phase 1, slice K3 (the parent issue 2188): the swarm/contacts
// kernel's JS reference core for the culture world, over the world's body table.
// Pure: no DOM, no GL, no clock. The world (engine/cultureWorld.mjs) feeds it steps; it
// never reads time, files, or globals beyond its arguments.
//
// WHAT THIS IS. The recorded swarm's physics, in the world. On the live stage the swarm
// lives inside ParticleSystem (engine/particles.js) and its GPU twin lives in
// gl/swarmSim.mjs; neither can step the world's flat body table (a ParticleSystem is a
// stage object, and the world is pure engine state). This module is the same physics as
// a pure function over the table — the K1/K2 pattern, where the world steps an existing
// core (dishFluid, dishLife) from its own clock. The maths authority is particles.js's
// cloud core, exactly as transcribed by the GPU kernel: the three boids forces
// (separation / alignment / cohesion), semi-implicit Euler with dt-correct damping, the
// speed clamp, and the cloud boundary law (wrap at a 120 px pad). The parameter values
// are SWARM_CORE_CLOUD's (gl/swarmSim.mjs), restated here because the engine layer does
// not import the GL layer; the parity suite (gl/parity/cultureSwarmSim.selfcheck) holds
// the two transcriptions to each other, so a drift in either is a red suite, not a
// silent fork.
//
// THE STEP'S SHAPE. Two phases, like particles.js: a force pass that reads ONLY the
// pre-step state (the GPU kernel's ping-pong, in JS form), then the integrator. Neighbour
// sums run in canonical index order (ascending j — the kernel's all-pairs order), so the
// JS sums are the kernel's sums in float64. One swarm step is one 60 fps frame
// (dtFrames = 1, fixed): the world steps the swarm at half its 120 Hz clock, the live
// stage's frame tempo, so a step here is the same duration as a step there.
//
// WHAT IS NOT HERE. The rest of the kernel's behaviour set — wind, the point attractor,
// chemotaxis, Lévy flights, Lorenz steering, drives, leak, heading, spines — belongs to
// the stage's fields and citizens (Phase 3's fields, Phase 5's bodies); the world's
// swarm stands at the core, the way K1's medium stands unbiased and K2's soil grows
// without terrain. Contacts RESOLUTION is likewise not here: this module deals the
// detection contract only (cultureContactPairs, below); resolving pairs into motion is
// the Phase 2 solver's work on this same table.
//
// BODY SPACE. Bodies move in stage pixels over a standing dish extent of 1920×1080 —
// exactly 20 px per shared-grid cell on both axes (96×54 cells), the grid the fluid and
// the culture already share. The extent is a module constant in this slice; a later
// phase that renders the world may re-derive it, and the parity law does not care what
// it is, only that both sides use the same one.
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

/** The dish extent bodies move in, in pixels: the shared grid at 20 px per cell. */
export const CULTURE_SWARM_WORLD_W = STAGE_COLS * 20; // 1920
export const CULTURE_SWARM_WORLD_H = STAGE_ROWS * 20; // 1080
/** The cloud boundary law's wrap pad (particles.js / swarmSim WRAP_PAD). */
export const CULTURE_SWARM_WRAP_PAD = 120;

/**
 * The world's standing swarm parameters: the cloud core's values (SWARM_CORE_CLOUD in
 * gl/swarmSim.mjs, from particles.js), over the dish extent. Frozen — a world has no
 * performer dials yet; a later phase hands it some the way K2's coupling stands at the
 * dial's own default.
 */
export const CULTURE_SWARM_PARAMS = Object.freeze({
  sepR: 35,
  aliR: 60,
  cohR: 70,
  sepW: 1.8,
  aliW: 1.0,
  cohW: 1.5,
  damping: 0.95,
  maxSpeed: 8.0,
  w: CULTURE_SWARM_WORLD_W,
  h: CULTURE_SWARM_WORLD_H,
});

// Force scratch, grown on demand and reused across steps (the dishContacts scratch
// discipline: scratch is not state, and a step leaves it holding the last step's sums).
let _fx = null;
let _fy = null;

/**
 * One swarm step over a body table { count, alive, x, y, vx, vy, mass } (the world's
 * table shape; extra columns are ignored). Dead bodies (alive 0) neither exert nor
 * feel forces and integrate nothing — the #167 law from particles.js. Advances
 * bodies.step by one. Deterministic: same table in, same table out, on any device
 * (all arithmetic is IEEE-exact JS in a canonical order).
 */
export function stepCultureSwarm(bodies, params = CULTURE_SWARM_PARAMS) {
  const { count, alive, x, y, vx, vy, mass } = bodies;
  const sepR2 = params.sepR * params.sepR;
  const aliR2 = params.aliR * params.aliR;
  const cohR2 = params.cohR * params.cohR;
  const maxR2 = Math.max(sepR2, aliR2, cohR2);
  if (!_fx || _fx.length < count) {
    _fx = new Float64Array(count);
    _fy = new Float64Array(count);
  }
  // Phase 1 — forces, from the pre-step state only.
  for (let i = 0; i < count; i++) {
    if (!alive[i]) {
      _fx[i] = 0;
      _fy[i] = 0;
      continue;
    }
    const px = x[i];
    const py = y[i];
    let sepX = 0;
    let sepY = 0;
    let sepN = 0;
    let aliX = 0;
    let aliY = 0;
    let aliN = 0;
    let cohX = 0;
    let cohY = 0;
    let cohN = 0;
    for (let j = 0; j < count; j++) {
      if (j === i || !alive[j]) continue;
      const dx = x[j] - px;
      const dy = y[j] - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= maxR2 || d2 <= 0) continue;
      if (d2 < sepR2) {
        const dist = Math.sqrt(d2);
        sepX -= dx / dist;
        sepY -= dy / dist;
        sepN++;
      }
      if (d2 < aliR2) {
        aliX += vx[j];
        aliY += vy[j];
        aliN++;
      }
      if (d2 < cohR2) {
        cohX += x[j];
        cohY += y[j];
        cohN++;
      }
    }
    const m = mass[i];
    let fx = 0;
    let fy = 0;
    if (sepN > 0) {
      const mag = Math.sqrt(sepX * sepX + sepY * sepY) || 1;
      fx += ((sepX / sepN / mag) * params.sepW * sepN) / m;
      fy += ((sepY / sepN / mag) * params.sepW * sepN) / m;
    }
    if (aliN > 0 && params.aliW) {
      const mag = Math.sqrt(aliX * aliX + aliY * aliY) || 1;
      fx += ((aliX / aliN / mag) * params.aliW * aliN) / m;
      fy += ((aliY / aliN / mag) * params.aliW * aliN) / m;
    }
    if (cohN > 0 && params.cohW) {
      const steerX = cohX / cohN - px;
      const steerY = cohY / cohN - py;
      const mag = Math.sqrt(steerX * steerX + steerY * steerY) || 1;
      fx += ((steerX / mag) * params.cohW) / m;
      fy += ((steerY / mag) * params.cohW) / m;
    }
    _fx[i] = fx;
    _fy[i] = fy;
  }
  // Phase 2 — the integrator: v = (v + f·dt)·damp^dt at dt = 1, the speed clamp,
  // the position step, then the cloud wrap (particles.js's else-branch, pad 120).
  const dampDt = Math.pow(params.damping, 1);
  const pad = CULTURE_SWARM_WRAP_PAD;
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;
    let nvx = (vx[i] + _fx[i]) * dampDt;
    let nvy = (vy[i] + _fy[i]) * dampDt;
    const speed = Math.sqrt(nvx * nvx + nvy * nvy);
    if (speed > params.maxSpeed) {
      nvx = (nvx / speed) * params.maxSpeed;
      nvy = (nvy / speed) * params.maxSpeed;
    }
    let nx = x[i] + nvx;
    let ny = y[i] + nvy;
    if (nx < -pad) nx = params.w + pad;
    else if (nx > params.w + pad) nx = -pad;
    if (ny < -pad) ny = params.h + pad;
    else if (ny > params.h + pad) ny = -pad;
    x[i] = nx;
    y[i] = ny;
    vx[i] = nvx;
    vy[i] = nvy;
  }
  bodies.step += 1;
  return bodies;
}

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;

/**
 * The contact DETECTION contract over the world's table: every unordered pair of
 * living bodies whose discs overlap, in canonical order (a ascending, then b), each
 * as { a, b, nx, ny, overlap } — the pair list shape the shipped detector
 * (gl/dishContactsGpu.mjs, referenceContacts) defined for the stage. The predicate is
 * that module's, verbatim in shape: both discs positive (a body with radius 0 has no
 * disc and never pairs — the dish law), d² < (ra+rb)², and exactly coincident discs
 * take the deterministic golden-angle normal from the pair identity, never NaN,
 * never random. The one deliberate difference: the stage predicate skips same-stratum
 * pairs because each system's own pass owns them; the world is ONE population with
 * no per-system pass, so its predicate keeps every pair — the parity suite proves
 * the shared geometry against the shipped oracle over a two-stratum split of the
 * same table. Detection only: nothing here moves a body. Pure.
 */
export function cultureContactPairs(bodies) {
  const { count, alive, x, y, radius } = bodies;
  const out = [];
  for (let a = 0; a < count; a++) {
    if (!alive[a]) continue;
    const ra = radius[a];
    if (!(ra > 0)) continue;
    for (let b = a + 1; b < count; b++) {
      if (!alive[b]) continue;
      const rb = radius[b];
      if (!(rb > 0)) continue;
      const rr = ra + rb;
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let dist = Math.sqrt(d2);
      let nx;
      let ny;
      if (dist > 1e-9) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        // The oracle's pair identity is (stratum·131 + index); the world's one
        // population is stratum 0 throughout, so the identity is the index pair.
        const ang = (a * GOLDEN + b * 1.2) % TAU;
        nx = Math.cos(ang);
        ny = Math.sin(ang);
        dist = 0;
      }
      out.push({ a, b, nx, ny, overlap: rr - dist });
    }
  }
  return out;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the body table's swarm state: step count, then the dealt
 * prefix's alive / position / velocity / mass / radius, floats bit-exact. Same
 * table => same hash, on any device. FNV-1a, the cultureWorldHash discipline —
 * the world hash folds this in whole.
 */
export function cultureSwarmHash(bodies) {
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
  mixU32(bodies.step);
  mixU32(bodies.count);
  const n = Math.min(bodies.count, bodies.capacity);
  for (let i = 0; i < n; i++) {
    mix(bodies.alive[i]);
    mixFloat(bodies.x[i]);
    mixFloat(bodies.y[i]);
    mixFloat(bodies.vx[i]);
    mixFloat(bodies.vy[i]);
    mixFloat(bodies.mass[i]);
    mixFloat(bodies.radius[i]);
  }
  return h >>> 0;
}
