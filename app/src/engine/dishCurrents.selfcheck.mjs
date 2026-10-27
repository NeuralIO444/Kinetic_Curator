// node src/engine/dishCurrents.selfcheck.mjs
//
// Petri dish C2 (#1414) — the medium II: currents by mass. The law
// in dishCurrents.mjs, pinned.
//
//   (a) the law's units: strength read honestly (junk is no
//       current), the coupling linear in strength, the advection
//       axis closed-formed, the drift sign the seek gain's;
//   (b) one step of wind in the dish, closed form: the curl target
//       replicated through the same noise the engine samples, the
//       velocity after one step exact — and the mass ratio of the
//       response exactly inverse (the same field, the same body,
//       two masses: the lighter closes four times the gap);
//   (c) one step of chemotaxis, closed form: seek drifts at the
//       drift speed toward the well, flee mirrors it, the legacy
//       force still runs outside the gate at its pinned number,
//       and the dead zone (d <= 5) and zero wells are inert;
//   (d) the acceptance line: wind off = pre-C2 trajectories exactly
//       — a dish cast at wind 0 is bit-identical to the same cast
//       with no dish at all, attractor present or not; wind on in
//       the same fixture differs (the identity is not vacuous);
//   (e) outside the gate, nothing here can act: the proof is the
//       manifest's own — particles.selfcheck runs a wind-heavy
//       contactless cast through this engine and the untouched
//       reference engine and requires bit-agreement, and
//       particles.seekFleeSwarm pins the legacy attractor term;
//       both pass on this branch (see the staging report);
//   (f) the acceptance probe: same seed, a STRAW stratum (m = 0.4)
//       visibly migrates with the current while a PEARL stratum
//       (m = 3) holds ground — full casts first (8x the travel,
//       the stratum's centroid carried downstream), then pure
//       single-body casts where the current is the only force:
//       the light body rides at ~4x the heavy body's speed and
//       path (the damping floor compresses the ratio), and the
//       heavy body's whole journey is a few dozen pixels;
//   (g) chemotaxis over a performance horizon: seekers pool at the
//       well, ordered by mass (light pooled, heavy still coming),
//       fleers are driven off, and the wells-off control does not
//       approach;
//   (h) bake parity: the dish bake rides the currents — repeats
//       bit for bit, and is not the contactless legacy trajectory;
//   (i) wiring pins: the call sites exist, the coupling arithmetic
//       stays in the module, and the module carries no clock or
//       dice.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createNoise } from './noise.js';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import {
  clampCurrentStrength,
  dishCurrentsFor,
  NO_CURRENTS,
  advectAxis,
  attractorDriftSign,
  CURRENT_SPEED,
  CURRENT_COUPLING,
  ATTRACTOR_DRIFT_SPEED,
} from './dishCurrents.mjs';
import { resolveBehave } from './organisms/behave.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// (a) — the law's units.
{
  assert.strictEqual(clampCurrentStrength(0), 0);
  assert.strictEqual(clampCurrentStrength(-3), 0, 'a negative wind is no current, never an anti-current');
  assert.strictEqual(clampCurrentStrength(NaN), 0);
  assert.strictEqual(clampCurrentStrength(undefined), 0);
  assert.strictEqual(clampCurrentStrength('gale'), 0);
  assert.strictEqual(clampCurrentStrength(0.22), 0.22);
  assert.strictEqual(clampCurrentStrength(3), 3, 'strength is not capped at 1 — wind 3 is a gale, honestly read');
  assert.deepStrictEqual(dishCurrentsFor(0), { on: false, coupling: 0 }, 'strength 0 resolves off');
  assert.deepStrictEqual(dishCurrentsFor(0), NO_CURRENTS, 'and equals the frozen off resolution');
  assert.strictEqual(dishCurrentsFor(1).on, true);
  assert.strictEqual(dishCurrentsFor(1).coupling, CURRENT_COUPLING, 'unit strength, unit coupling');
  assert.strictEqual(dishCurrentsFor(2).coupling, 2 * CURRENT_COUPLING, 'the coupling is linear in strength');
  assert.strictEqual(dishCurrentsFor(0.5).coupling, CURRENT_COUPLING * 0.5, 'half strength, half coupling');
  // The axis: gap-closing, mass-inverse, braking toward a slower current.
  assert.strictEqual(advectAxis(2, 0.5, 0.02, 0.5), 0.06, '(u − v) × coupling / m, closed');
  assert.strictEqual(advectAxis(2, 0.5, 0.02, 2), 0.015, 'four times the mass, a quarter of the response');
  assert.ok(advectAxis(0, 1, 0.02, 1) < 0, 'a body faster than the current is dragged back — advection, not push');
  assert.strictEqual(advectAxis(1, 1, 0.02, 1), 0, 'a body at the current’s speed feels nothing');
  assert.strictEqual(advectAxis(2, 0.5, 0, 0.5), 0, 'no coupling, no term');
  // The drift sign is the seek gain's sign.
  assert.strictEqual(attractorDriftSign(-1.6), -1, 'a fleeing group’s well is a threat');
  assert.strictEqual(attractorDriftSign(1.6), 1, 'a seeking group’s well is food');
  assert.strictEqual(attractorDriftSign(0), 1, 'zero gain is never read — its strength resolved off first');
}

// One-body fixture helpers. Columns are set directly (the contacts
// idiom), so the force entering the step is fully known.
const oneBody = (lp, { mass = 1, x = 500, y = 350, vx = 0, vy = 0 } = {}) => {
  const sys = new ParticleSystem();
  sys.init(1, 1000, 700, assets, palette, SEED);
  sys.x[0] = x;
  sys.y[0] = y;
  sys.vx[0] = vx;
  sys.vy[0] = vy;
  sys.mass[0] = mass;
  return sys;
};
const stepOnce = (sys, lp, attractor = null, time = BAKE_TIME_ORIGIN) => {
  // particleCount is forced at the call: normalizeLayoutParams
  // clamps it to >= 10 (the panel's floor), and update() would
  // respawn the difference as phantom neighbours.
  sys.update({ ...lp, particleCount: sys.n, maxParticles: 10 }, assets, palette, SEED, time, attractor);
  return sys;
};

// (b) — one step of wind in the dish, closed form. Hype cruise
// (wind exposure 0.22, orbit 0, no drives at metabolism 0), curl
// pinned explicitly; the target is replicated through the engine's
// own noise, seeded as the engine seeds it.
{
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    behave: 'cruise',
    particleCount: 1,
    contactRadius: 16,
    contactMode: 'none',
    wind: 1,
    windMode: 'curl',
    gravityWells: 0,
    damping: 0.98,
    metabolism: 0,
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
    lifeDrift: 0,
  });
  const windMul = 1 * resolveBehave('cruise').wind; // update()'s own derivation
  const coupling = CURRENT_COUPLING * windMul;
  const dampDt = 0.98; // organism damp = max(0.98, 0.97), dtFrames 1, no contact pass at n = 1
  const run = (mass) => {
    const sys = oneBody(lp, { mass, x: 500, y: 350, vx: 0.3, vy: -0.2 });
    const so = sys.seedOffset[0];
    stepOnce(sys, lp);
    const noise = createNoise(SEED);
    const out = { x: 0, y: 0 };
    const nt = BAKE_TIME_ORIGIN * lp.noiseSpeed * 0.001;
    noise.curl2(500 * lp.noiseFreq, 350 * lp.noiseFreq, nt + so * 0.0001, 0.5, out);
    const ux = out.x * CURRENT_SPEED;
    const uy = out.y * CURRENT_SPEED;
    const ax = ((ux - 0.3) * coupling) / mass;
    const ay = ((uy - -0.2) * coupling) / mass;
    return { sys, wantVx: (0.3 + ax) * dampDt, wantVy: (-0.2 + ay) * dampDt, ax, ay };
  };
  const light = run(0.5);
  assert.ok(
    Math.abs(light.sys.vx[0] - light.wantVx) < EPS,
    `curl step, x: ${light.sys.vx[0]} vs closed form ${light.wantVx}`,
  );
  assert.ok(
    Math.abs(light.sys.vy[0] - light.wantVy) < EPS,
    `curl step, y: ${light.sys.vy[0]} vs closed form ${light.wantVy}`,
  );
  // The same field, the same body, four times the mass: exactly a
  // quarter of the acceleration (the ratio is the law, data-free).
  const heavy = run(2);
  assert.ok(
    Math.abs(heavy.ax - light.ax / 4) < EPS && Math.abs(heavy.ay - light.ay / 4) < EPS,
    'the response is inverse-mass, exactly',
  );
  assert.ok(Math.abs(heavy.sys.vx[0] - heavy.wantVx) < EPS, 'the heavy step also lands on the closed form');
  // Outside the gate the same step is the legacy force, at its own
  // closed form — the gate, not the field, is what changed.
  const lpOut = normalizeLayoutParams({ ...lp, contactRadius: 0 });
  const out2 = oneBody(lpOut, { mass: 0.5, x: 500, y: 350, vx: 0.3, vy: -0.2 });
  const so2 = out2.seedOffset[0];
  stepOnce(out2, lpOut);
  const noise2 = createNoise(SEED);
  const o2 = { x: 0, y: 0 };
  noise2.curl2(
    500 * lp.noiseFreq,
    350 * lp.noiseFreq,
    BAKE_TIME_ORIGIN * lp.noiseSpeed * 0.001 + so2 * 0.0001,
    0.5,
    o2,
  );
  const legacyAx = (o2.x * 0.8 * windMul) / 0.5;
  assert.ok(
    Math.abs(out2.vx[0] - (0.3 + legacyAx) * dampDt) < EPS,
    `outside the dish, the legacy wind force runs: ${out2.vx[0]} vs ${(0.3 + legacyAx) * dampDt}`,
  );
}

// (c) — one step of chemotaxis, closed form. The well sits due east
// at d = 300, so the direction is exactly (1, 0) and the drift
// target is exactly (±ATTRACTOR_DRIFT_SPEED, 0).
{
  const lpFor = (behave, extra = {}) =>
    normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'hype',
      behave,
      particleCount: 1,
      contactRadius: 16,
      contactMode: 'none',
      wind: 0,
      gravityWells: 1,
      damping: 0.98,
      metabolism: 0,
      kinemeBreath: 0,
      kinemeDrift: 0,
      kinemePaletteBreath: 0,
      lifeDrift: 0,
      ...extra,
    });
  const row = resolveBehave('seek');
  const g = 1 * row.attract * Math.abs(row.seekGain); // wells × attract × |seek|
  const coupling = CURRENT_COUPLING * g;
  const well = { x: 700, y: 350 };
  const seek = oneBody(lpFor('seek'), { mass: 2, x: 400, y: 350 });
  stepOnce(seek, lpFor('seek'), well);
  const wantSeek = (((ATTRACTOR_DRIFT_SPEED - 0) * coupling) / 2) * 0.98;
  assert.ok(Math.abs(seek.vx[0] - wantSeek) < EPS, `seek step: ${seek.vx[0]} vs closed form ${wantSeek}`);
  assert.ok(Object.is(seek.vy[0], 0), 'no lateral drift on an axial approach');
  assert.ok(Math.abs(seek.x[0] - (400 + wantSeek)) < EPS, 'the position integrates the same step');
  const flee = oneBody(lpFor('flee'), { mass: 2, x: 400, y: 350 });
  stepOnce(flee, lpFor('flee'), well);
  assert.ok(Math.abs(flee.vx[0] - -wantSeek) < EPS, `flee mirrors seek: ${flee.vx[0]} vs ${-wantSeek}`);
  // The dead zone and the closed tap are inert, in the dish too.
  const near = oneBody(lpFor('seek'), { mass: 2, x: 697, y: 350 });
  stepOnce(near, lpFor('seek'), well);
  assert.ok(Object.is(near.vx[0], 0), 'inside d = 5 the well exerts nothing (the legacy gate, kept)');
  const closed = oneBody(lpFor('seek', { gravityWells: 0 }), { mass: 2, x: 400, y: 350 });
  stepOnce(closed, lpFor('seek', { gravityWells: 0 }), well);
  assert.ok(Object.is(closed.vx[0], 0), 'gravityWells 0 is no chemotaxis');
  // Outside the gate: the legacy attractor force at its pinned
  // number — forceMag = wells·attract·8·seek / max(20, d·0.05).
  const lpLegacy = lpFor('seek', { contactRadius: 0 });
  const legacy = oneBody(lpLegacy, { mass: 2, x: 400, y: 350 });
  stepOnce(legacy, lpLegacy, well);
  const forceMag = (1 * row.attract * 8 * row.seekGain) / Math.max(20, 300 * 0.05);
  const wantLegacy = (forceMag / 2) * 0.98;
  assert.ok(
    Math.abs(legacy.vx[0] - wantLegacy) < EPS,
    `outside the dish, the legacy attractor runs: ${legacy.vx[0]} vs ${wantLegacy}`,
  );
}

// (d) — wind off = pre-C2 trajectories, exactly. A spaced hype cast
// (grid 150px, discs sum < 52, travel < 25px: no contact ever
// engages) at wind 0: dish or no dish, attractor or none — one
// trajectory, bit for bit. Wind on in the same fixture differs.
{
  const grid = (lp, attractor = null) => {
    const sys = new ParticleSystem();
    sys.init(12, 1000, 700, assets, palette, SEED);
    for (let i = 0; i < 12; i++) {
      sys.x[i] = 200 + (i % 4) * 150;
      sys.y[i] = 200 + Math.floor(i / 4) * 150;
      sys.vx[i] = 0.1 * (i % 3);
      sys.vy[i] = 0;
    }
    const full = { ...lp, maxParticles: 40 };
    for (let s = 0; s < 240; s++) sys.update(full, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, attractor);
    return sys;
  };
  const base = {
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    behave: 'cruise',
    particleCount: 12,
    contactMode: 'none',
    wind: 0,
    gravityWells: 0,
    metabolism: 0,
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
    lifeDrift: 0,
  };
  const dishOff = grid(normalizeLayoutParams({ ...base, contactRadius: 0 }));
  const dishOn = grid(normalizeLayoutParams({ ...base, contactRadius: 16 }));
  const dishWell = grid(normalizeLayoutParams({ ...base, contactRadius: 16 }), { x: 500, y: 350 });
  const assertSame = (a, b, label) => {
    for (const fld of ['x', 'y', 'vx', 'vy']) {
      for (let i = 0; i < 12; i++) assert.ok(Object.is(a[fld][i], b[fld][i]), `${label}: ${fld}[${i}]`);
    }
  };
  assertSame(dishOn, dishOff, 'wind 0: dish == no dish');
  assertSame(dishWell, dishOff, 'wind 0, wells 0: an attractor’s presence alone moves nothing');
  const windy = grid(normalizeLayoutParams({ ...base, contactRadius: 16, wind: 1 }));
  let differs = false;
  for (let i = 0; i < 12; i++) {
    if (!Object.is(windy.x[i], dishOff.x[i]) || !Object.is(windy.vx[i], dishOff.vx[i])) differs = true;
  }
  assert.ok(differs, 'wind on in the dish actually advects (the identity above is not vacuous)');
}

// Full-cast helpers for (f).
const runCast = (lp, massPin, steps) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, SEED);
  if (massPin !== null) for (let i = 0; i < sys.n; i++) sys.mass[i] = massPin;
  const x0 = Float64Array.from(sys.x);
  const y0 = Float64Array.from(sys.y);
  let cx0 = 0;
  let cy0 = 0;
  for (let i = 0; i < sys.n; i++) {
    cx0 += sys.x[i];
    cy0 += sys.y[i];
  }
  const full = { ...lp, maxParticles: 200 };
  for (let s = 0; s < steps; s++) sys.update(full, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  let cx = 0;
  let cy = 0;
  let disp = 0;
  for (let i = 0; i < sys.n; i++) {
    cx += sys.x[i];
    cy += sys.y[i];
    disp += Math.hypot(sys.x[i] - x0[i], sys.y[i] - y0[i]);
  }
  return {
    sys,
    meanDisp: disp / sys.n,
    centroidShift: Math.hypot(cx / sys.n - cx0 / sys.n, cy / sys.n - cy0 / sys.n),
  };
};

// (f) — the acceptance probe (the issue's first line). Same seed:
// the STRAW stratum migrates, the PEARL stratum holds ground.
{
  const lp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: 40,
    contactRadius: 16,
    contactMode: 'none',
    windMode: 'curl',
    swarmCohesion: 0,
    gravityWells: 0,
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
    lifeDrift: 0,
  });
  const straw = runCast(lp, 0.4, 480);
  const pearl = runCast(lp, 3.0, 480);
  assert.ok(pearl.meanDisp < 100, `PEARL holds ground: mean displacement ${pearl.meanDisp.toFixed(1)}px in 480 steps`);
  assert.ok(pearl.centroidShift < 30, `PEARL’s centroid barely moves: ${pearl.centroidShift.toFixed(1)}px`);
  assert.ok(straw.meanDisp > 300, `STRAW migrates: mean displacement ${straw.meanDisp.toFixed(1)}px`);
  assert.ok(straw.centroidShift > 60, `STRAW’s centroid travels with the current: ${straw.centroidShift.toFixed(1)}px`);
  assert.ok(
    pearl.meanDisp < straw.meanDisp / 4,
    `the discrimination is by kind, not degree: pearl ${pearl.meanDisp.toFixed(1)} vs straw ${straw.meanDisp.toFixed(1)}`,
  );
  const again = runCast(lp, 0.4, 480);
  for (let i = 0; i < 4; i++) {
    assert.ok(
      Object.is(again.sys.x[i], straw.sys.x[i]) && Object.is(again.sys.vx[i], straw.sys.vx[i]),
      'the probe is deterministic (bake = live arithmetic)',
    );
  }

  // Pure casts: one body per seed, the current the only force.
  // A curl field is rotational — a rider orbits its cell — so the
  // honest measures are speed and path, with net displacement
  // asserted where the field carries (curl) rather than turns.
  const pure = (windMode, mass) => {
    const lp1 = normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'swarm',
      particleCount: 1,
      contactRadius: 16,
      contactMode: 'none',
      windMode,
      swarmCohesion: 0,
      gravityWells: 0,
      kinemeBreath: 0,
      kinemeDrift: 0,
      kinemePaletteBreath: 0,
      lifeDrift: 0,
    });
    let disp = 0;
    let spd = 0;
    let path = 0;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const sys = new ParticleSystem();
      const seed = SEED + k * 131;
      sys.init(1, 1000, 700, assets, palette, seed);
      sys.mass[0] = mass;
      const x0 = sys.x[0];
      const y0 = sys.y[0];
      let px = x0;
      let py = y0;
      const full = { ...lp1, particleCount: 1, maxParticles: 10 };
      let sum = 0;
      let pl = 0;
      for (let s = 0; s < 480; s++) {
        sys.update(full, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
        sum += Math.hypot(sys.vx[0], sys.vy[0]);
        pl += Math.hypot(sys.x[0] - px, sys.y[0] - py);
        px = sys.x[0];
        py = sys.y[0];
      }
      disp += Math.hypot(sys.x[0] - x0, sys.y[0] - y0);
      spd += sum / 480;
      path += pl;
    }
    return { meanDisp: disp / N, meanSpeed: spd / N, meanPath: path / N };
  };
  for (const wm of ['curl', 'point']) {
    const light = pure(wm, 0.4);
    const heavy = pure(wm, 3.0);
    assert.ok(
      heavy.meanDisp < 40 && heavy.meanPath < 60,
      `${wm}: a lone PEARL's whole journey is ${heavy.meanPath.toFixed(1)}px of path, ${heavy.meanDisp.toFixed(1)}px net — ground held`,
    );
    assert.ok(light.meanPath > 80, `${wm}: a lone STRAW rides ${light.meanPath.toFixed(1)}px of path in 480 steps`);
    assert.ok(
      light.meanSpeed > 3 * heavy.meanSpeed && light.meanPath > 3 * heavy.meanPath,
      `${wm}: riding is a speed, not a nudge — light ${light.meanSpeed.toFixed(3)} vs heavy ${heavy.meanSpeed.toFixed(3)} px/step`,
    );
    assert.ok(heavy.meanSpeed < 0.15, `${wm}: the heavy body never entrains (${heavy.meanSpeed.toFixed(3)} px/step)`);
  }
  assert.ok(pure('curl', 0.4).meanDisp > 40, 'curl: the light body’s net travel is downstream, not just motion');
}

// (g) — chemotaxis over a performance horizon (single-body hype
// casts, well east of centre; the control has the tap closed).
{
  const probe = (behave, wells, mass) => {
    const lp = normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'hype',
      behave,
      particleCount: 1,
      contactRadius: 16,
      contactMode: 'none',
      wind: 0,
      gravityWells: wells,
      metabolism: 0,
      kinemeBreath: 0,
      kinemeDrift: 0,
      kinemePaletteBreath: 0,
      lifeDrift: 0,
    });
    const well = { x: 700, y: 350 };
    let d0 = 0;
    let d1 = 0;
    const N = 16;
    for (let k = 0; k < N; k++) {
      const seed = SEED + k * 131;
      const sys = new ParticleSystem();
      sys.init(1, 1000, 700, assets, palette, seed);
      sys.mass[0] = mass;
      d0 += Math.hypot(sys.x[0] - well.x, sys.y[0] - well.y);
      const full = { ...lp, particleCount: 1, maxParticles: 10 };
      for (let s = 0; s < 480; s++) sys.update(full, assets, palette, seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, well);
      d1 += Math.hypot(sys.x[0] - well.x, sys.y[0] - well.y);
    }
    return { d0: d0 / N, d1: d1 / N };
  };
  const seekLight = probe('seek', 1, 0.4);
  const seekHeavy = probe('seek', 1, 3.0);
  const fleeLight = probe('flee', 1, 0.4);
  const control = probe('seek', 0, 0.4);
  assert.ok(
    seekLight.d1 < 0.45 * seekLight.d0,
    `light seekers pool at the well: ${seekLight.d0.toFixed(0)} -> ${seekLight.d1.toFixed(0)}px`,
  );
  assert.ok(
    seekHeavy.d1 > 1.8 * seekLight.d1 && seekHeavy.d1 < seekHeavy.d0,
    `heavy seekers drift but lag: ${seekHeavy.d0.toFixed(0)} -> ${seekHeavy.d1.toFixed(0)}px (light pooled at ${seekLight.d1.toFixed(0)})`,
  );
  assert.ok(
    fleeLight.d1 > 1.25 * fleeLight.d0,
    `fleers are driven from the same well: ${fleeLight.d0.toFixed(0)} -> ${fleeLight.d1.toFixed(0)}px`,
  );
  assert.ok(
    control.d1 > 0.85 * control.d0,
    `wells closed, no approach: ${control.d0.toFixed(0)} -> ${control.d1.toFixed(0)}px`,
  );
}

// (h) — bake parity: the studio bake steps the same update(), so a
// baked dish rides the currents — it repeats bit for bit, and it is
// not the trajectory the contactless (legacy-force) bake draws.
{
  const lpFor = (radius) =>
    normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'swarm',
      particleCount: 40,
      contactRadius: radius,
      contactRestitution: 0.7,
      contactMode: 'bounce',
      windMode: 'curl',
    });
  const bake = (radius) =>
    bakeDishParticles({
      layers: [
        {
          key: 'pearl',
          seed: SEED,
          count: 40,
          layoutParams: lpFor(radius),
          activeAssets: assets,
          palette,
          maxParticles: 200,
        },
        {
          key: 'eaves',
          seed: SEED + 7,
          count: 35,
          layoutParams: lpFor(radius),
          activeAssets: assets,
          palette,
          maxParticles: 200,
        },
      ],
      canvasW: 1000,
      canvasH: 700,
      steps: 45,
    });
  const flat = (m) => JSON.stringify([...m.entries()].map(([k, items]) => [k, items.map((it) => [it.x, it.y])]));
  const a = bake(16);
  const b = bake(16);
  assert.strictEqual(flat(a), flat(b), 'the currents bake is a pure function of its inputs');
  assert.notStrictEqual(flat(a), flat(bake(0)), 'the bake rides the currents, not the legacy wind force');
}

// (i) — wiring pins: call sites exist, the law stays in the module,
// the module itself is clock- and dice-free.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishCurrents.mjs', import.meta.url), 'utf8');
  assert.ok(particles.includes('dishCurrentsFor(windMul)'), 'update() resolves the wind currents at the force pass');
  assert.ok(
    particles.includes('dishCurrentsFor(gravityWells * attractMul * Math.abs(seekMul))'),
    'update() resolves the attractor currents from its knobs and the row’s seek gain',
  );
  assert.ok(particles.includes('advectAxis(this._curlOut.x * CURRENT_SPEED'), 'the curl branch advects');
  assert.ok(particles.includes('attractorDriftSign(seekMul)'), 'the attractor branch reads the group’s sign');
  assert.ok(!particles.includes('CURRENT_COUPLING'), 'no coupling arithmetic leaks into the integrator');
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the currents law is deterministic by construction');
}

console.log(
  'dishCurrents.selfcheck: OK (#1414 — law units, one-step wind + chemotaxis closed forms, wind-off bit-identity, STRAW/PEARL acceptance probe, chemotaxis horizon, bake parity, wiring)',
);
