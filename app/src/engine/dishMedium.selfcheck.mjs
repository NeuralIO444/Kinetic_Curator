// node src/engine/dishMedium.selfcheck.mjs
//
// Petri dish C1 (#1413) — the medium: WETNESS as viscosity and cling.
// The law in dishMedium.mjs, pinned.
//
//   (a) the three curves, unit-pinned at five points of the knob, with
//       the clamps (junk reads dry) and monotonicity the spec's
//       wet→dry sentence requires;
//   (b) per-system closed forms through the contact pass: the wet
//       bounce lands as stick at full wet; cling captures a slow
//       separation whole, taxes a fast one by exactly the tension
//       budget, never reverses, and recaptures a wet bounce on its
//       way out (impulse first, tension on the result);
//   (c) composition — the medium biases, the mode decides: at full
//       wet, swap still swaps, die still dies, breed still breeds,
//       and stick and bounce agree (both fully inelastic);
//   (d) the acceptance line: WETNESS = 0 (and WETNESS absent) is the
//       pre-C1 engine bit for bit through full updates, in bounce
//       and in breed;
//   (e) the damping curve in the integrator: one step of a wet run
//       keeps exactly retention × the dry run's velocity (the force
//       entering the step is identical — same positions — so the
//       ratio is the closed form, not a fit);
//   (f) the acceptance probe: same seed, three wetness levels,
//       residual kinetic energy after 240 steps of the same bake
//       engine (update() is what the studio bake steps) — strictly
//       ordered, measurably different, nothing frozen;
//   (g) across the seam: the dish pass averages the pair's wetness
//       like its restitution — both-wet kills a cross-strata bounce,
//       half-wet halves it, cling holds a cross-strata separation,
//       and an enrolment that never heard of wetness is dry;
//   (h) bake parity: bakeDishParticles settles a wet dish
//       differently from a dry one and repeats itself bit for bit;
//   (i) wiring pins: the call sites exist, the law stays in the
//       module, and the module carries no clock or dice.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';
import {
  clampWetness, mediumRestitutionK, mediumClingK, mediumDampRetention,
  mediumClingCapture, mediumFricK, mediumFrictionBudget, mediumFrictionImpulse,
  dishMediumFor, DRY_MEDIUM,
  MEDIUM_CLING_TENSION, MEDIUM_DAMP_DRAG, FRIC_MAX,
} from './dishMedium.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// (a) — the curves, unit-pinned.
{
  assert.deepStrictEqual(DRY_MEDIUM, { wet: 0, restK: 1, clingK: 0, fricK: 0, dampRetention: 1 },
    'the dry medium is the identity on all four curves');
  assert.deepStrictEqual(dishMediumFor(1), { wet: 1, restK: 0, clingK: 1, fricK: 1, dampRetention: 1 - MEDIUM_DAMP_DRAG },
    'full wet: no restitution, full cling, full friction, full drag');
  const pins = [
    // w, restK, clingK (smoothstep), dampRetention
    [0, 1, 0, 1],
    [0.25, 0.75, 0.15625, 1 - MEDIUM_DAMP_DRAG * 0.25],
    [0.5, 0.5, 0.5, 1 - MEDIUM_DAMP_DRAG * 0.5],
    [0.75, 0.25, 0.84375, 1 - MEDIUM_DAMP_DRAG * 0.75],
    [1, 0, 1, 1 - MEDIUM_DAMP_DRAG],
  ];
  for (const [w, rk, ck, dr] of pins) {
    assert.ok(Object.is(mediumRestitutionK(w), rk), `restK(${w}) = ${rk}`);
    assert.ok(Object.is(mediumClingK(w), ck), `clingK(${w}) = ${ck} (smoothstep)`);
    assert.ok(Object.is(mediumFricK(w), ck), `fricK(${w}) = ${ck} (the cling curve's sibling)`);
    assert.ok(Math.abs(mediumDampRetention(w) - dr) < EPS, `dampRetention(${w}) = ${dr}`);
    const m = dishMediumFor(w);
    assert.ok(Object.is(m.restK, rk) && Object.is(m.clingK, ck) && Object.is(m.fricK, ck), `dishMediumFor(${w}) agrees with the curves`);
  }
  // The knob read honestly: out-of-range clamps, junk is dry.
  assert.strictEqual(clampWetness(-2), 0); assert.strictEqual(clampWetness(7), 1);
  assert.strictEqual(clampWetness(NaN), 0); assert.strictEqual(clampWetness(undefined), 0);
  assert.strictEqual(clampWetness('wet'), 0); assert.strictEqual(clampWetness(0.3), 0.3);
  assert.deepStrictEqual(dishMediumFor(7), dishMediumFor(1), 'over-wet is full wet');
  assert.deepStrictEqual(dishMediumFor(NaN), DRY_MEDIUM, 'junk wetness is the dry path');
  // Monotone: wetter never bounces more, clings less, or glides freer.
  let prev = dishMediumFor(0);
  for (let k = 1; k <= 20; k++) {
    const m = dishMediumFor(k / 20);
    assert.ok(m.restK < prev.restK && m.clingK > prev.clingK && m.fricK > prev.fricK && m.dampRetention < prev.dampRetention,
      `monotone at w=${k / 20}`);
    prev = m;
  }
  // The capture law: budget-capped, never a reversal.
  assert.strictEqual(mediumClingCapture(1, 0.4), 0.4, 'a slow separation is captured whole');
  assert.strictEqual(mediumClingCapture(1, 4), MEDIUM_CLING_TENSION, 'a fast one pays only the budget');
  assert.strictEqual(mediumClingCapture(0.5, 4), MEDIUM_CLING_TENSION * 0.5, 'the budget scales with cling');
  assert.strictEqual(mediumClingCapture(0, 4), 0, 'no cling, no capture');
  assert.strictEqual(mediumClingCapture(1, -2), 0, 'an approach is never captured');
  assert.strictEqual(mediumClingCapture(1, 0), 0, 'rest is rest');
  // The friction law (D1, #1595): the budget is μ × the normal
  // impulse actually exchanged; the impulse is the stick impulse
  // Coulomb-clamped to it. One μ, both regimes.
  assert.strictEqual(FRIC_MAX, 0.5, 'FRIC_MAX is the shipped tune');
  assert.strictEqual(mediumFrictionBudget(0.5, 2), 1, 'budget = μ × jn');
  assert.strictEqual(mediumFrictionBudget(0.5, -2), 1, 'the budget reads the magnitude');
  assert.strictEqual(mediumFrictionBudget(0, 5), 0, 'no μ, no budget');
  assert.strictEqual(mediumFrictionBudget(0.5, 0), 0, 'no normal exchange, no budget — no grip from nothing');
  assert.strictEqual(mediumFrictionImpulse(0.5, 1, -0.4, 2), 0.2, 'inside the budget the pair grips: jt zeroes the slide');
  assert.strictEqual(mediumFrictionImpulse(0.5, 1, -4, 2), 0.5, 'outside, it slides: jt pays exactly the budget');
  assert.strictEqual(mediumFrictionImpulse(0.5, 1, 4, 2), -0.5, 'the clamp is symmetric');
  assert.strictEqual(mediumFrictionImpulse(0.5, 1, 0, 2), 0, 'no slide, no impulse');
  assert.strictEqual(mediumFrictionImpulse(0.5, 0, -4, 2), 0, 'an unfunded contact transmits nothing');
  assert.strictEqual(mediumFrictionImpulse(0, 1, -4, 2), 0, 'dry transmits nothing');
}

// Direct-pass fixtures (the contacts.selfcheck idiom): discs r=20,
// centres 30 apart (overlap 10), scale pinned to 1.
const CTX = {
  radius: 20, restitution: 1, repel: 0, mode: 'bounce', umask: 0xffffffff,
  breedCap: 10, seed: SEED, organism: false,
  minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
};
const pair = (vx0, vx1) => {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
  sys.vx[0] = vx0; sys.vy[0] = 0; sys.vx[1] = vx1; sys.vy[1] = 0;
  sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
  return sys;
};

// (b) — per-system closed forms.
{
  // Full wet: an elastic head-on bounce meets exactly as stick would.
  const wet = pair(2, -2);
  wet._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(Object.is(wet.vx[0], 0) && Object.is(wet.vx[1], 0),
    `full wet kills the bounce: ${wet.vx[0]}, ${wet.vx[1]}`);
  const stick = pair(2, -2);
  stick._contactPass({ ...CTX, mode: 'stick', medium: dishMediumFor(1) });
  assert.ok(Object.is(stick.vx[0], wet.vx[0]) && Object.is(stick.vx[1], wet.vx[1]),
    'at full wet, bounce and stick agree');

  // Half wet, composed: restitution halves the bounce (vn −4 → +2),
  // then the tension (clingK 0.5, budget 0.45) taxes the way out.
  const half = pair(2, -2);
  half._contactPass({ ...CTX, medium: dishMediumFor(0.5) });
  assert.ok(Math.abs(half.vx[0] - -0.775) < EPS && Math.abs(half.vx[1] - 0.775) < EPS,
    `half-wet bounce, recaptured: ${half.vx[0]}, ${half.vx[1]} (impulse −1, tension +0.225)`);

  // Cling captures a slow separation whole — even in mode 'none':
  // the medium biases, the mode decides (none decided no impulse;
  // it did not decide the weather).
  const slow = pair(-0.2, 0.2);
  slow._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(1) });
  assert.ok(Object.is(slow.vx[0], 0) && Object.is(slow.vx[1], 0),
    `slow separation held: ${slow.vx[0]}, ${slow.vx[1]}`);
  assert.ok(Object.is(slow.x[0], 395) && Object.is(slow.x[1], 435),
    'depenetration still parks the pair at the disc sum');

  // A fast separation tears free, paying exactly the budget.
  const fast = pair(-2, 2);
  fast._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(1) });
  assert.ok(Math.abs(fast.vx[0] - -1.55) < EPS && Math.abs(fast.vx[1] - 1.55) < EPS,
    `fast separation taxed by the budget: ${fast.vx[0]}, ${fast.vx[1]}`);

  // Half cling on a mid separation: budget 0.45 of vn 0.8 captured.
  const mid = pair(-0.4, 0.4);
  mid._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(0.5) });
  assert.ok(Math.abs(mid.vx[0] - -0.175) < EPS && Math.abs(mid.vx[1] - 0.175) < EPS,
    `mid separation partially held: ${mid.vx[0]}, ${mid.vx[1]}`);

  // Capture never reverses: a barely-separating pair stops, not sticks back.
  const bare = pair(-0.025, 0.025);
  bare._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(1) });
  assert.ok(Object.is(bare.vx[0], 0) && Object.is(bare.vx[1], 0), 'capture floors at rest');

  // Dry is untouched, two ways: no medium key, and the dry medium itself.
  for (const ctx of [{ ...CTX, mode: 'none' }, { ...CTX, mode: 'none', medium: dishMediumFor(0) }]) {
    const dry = pair(-0.2, 0.2);
    dry._contactPass(ctx);
    assert.ok(Object.is(dry.vx[0], -0.2) && Object.is(dry.vx[1], 0.2), 'dry separation untouched');
    const elastic = pair(2, -2);
    elastic._contactPass({ ...ctx, mode: 'bounce' });
    assert.ok(Object.is(elastic.vx[0], -2) && Object.is(elastic.vx[1], 2), 'dry bounce is scenario 1');
  }
}

// (c) — composition at full wet: the events still fire on approach.
{
  const swap = pair(2, -2);
  swap._contactPass({ ...CTX, mode: 'swap', medium: dishMediumFor(1) });
  assert.strictEqual(swap.assetIndex[0], 1); assert.strictEqual(swap.assetIndex[1], 0);
  assert.ok(Object.is(swap.vx[0], 2) && Object.is(swap.vx[1], -2), 'swap carries no velocity response, wet or dry');

  const die = pair(2, -2);
  die._contactPass({ ...CTX, mode: 'die', medium: dishMediumFor(1) });
  assert.strictEqual(die.alive[1], 0, 'die still dies at full wet');

  const breed = pair(2, -2);
  breed._contactPass({ ...CTX, mode: 'breed', medium: dishMediumFor(1) });
  assert.strictEqual(breed.n, 3, 'breed still breeds at full wet');
  assert.strictEqual(breed.alive[2], 1, 'the child lives');
}

// Full-update harness for (d), (e), (f).
const runSys = (lp, steps) => {
  const sys = new ParticleSystem();
  sys.init(lp.particleCount, 1000, 700, assets, palette, SEED, null, { graze: lp.graze || 0 });
  for (let s = 0; s < steps; s++) {
    sys.update({ ...lp, maxParticles: 200 }, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  return sys;
};
const assertSamePhysics = (a, b, label) => {
  assert.strictEqual(a.n, b.n, `${label}: population`);
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[fld][i], b[fld][i]), `${label}: ${fld}[${i}] ${a[fld][i]} vs ${b[fld][i]}`);
    }
  }
};

// (d) — WETNESS = 0 is the pre-C1 engine, bit for bit (the issue's
// first acceptance line). Absent and explicit-0 both, bounce and breed.
{
  for (const mode of ['bounce', 'breed']) {
    const base = {
      ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 60,
      contactRadius: 16, contactMode: mode, contactRestitution: 0.8, contactRepel: 1,
      kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
    };
    const absent = runSys(normalizeLayoutParams(base), 60);
    const zero = runSys(normalizeLayoutParams({ ...base, accumulationWetness: 0 }), 60);
    assertSamePhysics(absent, zero, `wetness 0 == absent (${mode})`);
    const wet = runSys(normalizeLayoutParams({ ...base, accumulationWetness: 1 }), 60);
    let differs = false;
    for (let i = 0; i < absent.n; i++) {
      if (!Object.is(absent.x[i], wet.x[i]) || !Object.is(absent.vx[i], wet.vx[i])) differs = true;
    }
    assert.ok(differs, `wetness 1 actually moves the ${mode} run (the identity comparison is not vacuous)`);
  }
}

// (e) — the drag, closed form over one step: two far-apart bodies,
// no contact in range; the force entering the step is identical in
// both runs (same positions, same velocities), so the wet velocity
// is the dry velocity × the retention, to float precision.
{
  const lpFor = (wet) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 2,
    contactRadius: 20, contactMode: 'none', damping: 0.98,
    kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
    ...(wet === null ? {} : { accumulationWetness: wet }),
  });
  const one = (wet) => {
    const sys = new ParticleSystem();
    sys.init(2, 1000, 700, assets, palette, SEED);
    sys.x[0] = 250; sys.y[0] = 350; sys.vx[0] = 3; sys.vy[0] = 0.5;
    sys.x[1] = 750; sys.y[1] = 350; sys.vx[1] = -3; sys.vy[1] = -0.5;
    sys.mass[0] = 1; sys.mass[1] = 1;
    sys.update({ ...lpFor(wet), maxParticles: 10 }, assets, palette, SEED, BAKE_TIME_ORIGIN, null);
    return sys;
  };
  const dry = one(null);
  assertSamePhysics(dry, one(0), 'one step: wetness 0 == absent');
  const wet1 = one(1);
  assert.ok(Math.abs(wet1.vx[0] - dry.vx[0] * (1 - MEDIUM_DAMP_DRAG)) < EPS,
    `full-wet drag: ${wet1.vx[0]} vs dry × retention ${dry.vx[0] * (1 - MEDIUM_DAMP_DRAG)}`);
  assert.ok(Math.abs(wet1.vy[0] - dry.vy[0] * (1 - MEDIUM_DAMP_DRAG)) < EPS, 'the drag is isotropic');
  const wet5 = one(0.5);
  assert.ok(Math.abs(wet5.vx[0] - dry.vx[0] * (1 - MEDIUM_DAMP_DRAG * 0.5)) < EPS,
    'half wet, half drag — the curve, not a switch');
  // Contacts off: WETNESS alone (the watercolor knob) moves nothing —
  // the medium exists only where the dish does.
  const noDish = (wet) => {
    const lp = normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 30,
      contactRadius: 0, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
      ...(wet === null ? {} : { accumulationWetness: wet }),
    });
    return runSys(lp, 30);
  };
  assertSamePhysics(noDish(null), noDish(1), 'contacts off: wetness is not physics');
}

// (f) — the settle probe (the issue's second acceptance line): a
// seeded clump, forces minimized, three wetness levels, residual
// kinetic energy after 240 steps of the bake engine.
{
  const lpFor = (wet) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 24,
    contactRadius: 22, contactMode: 'bounce', contactRestitution: 0.85, contactRepel: 0,
    wind: 0, swarmCohesion: 0, gravityWells: 0, noiseSpeed: 0, damping: 0.995,
    kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
    accumulationWetness: wet,
  });
  const settle = (wet) => {
    const sys = new ParticleSystem();
    sys.init(24, 1000, 700, assets, palette, SEED);
    for (let i = 0; i < 24; i++) {
      sys.x[i] = 340 + (i % 6) * 48; sys.y[i] = 230 + Math.floor(i / 6) * 48;
      sys.vx[i] = (i % 3 - 1) * 1.7; sys.vy[i] = ((i * 7) % 3 - 1) * 1.3;
      sys.mass[i] = 1; sys.scale[i] = 1;
    }
    const lp = { ...lpFor(wet), maxParticles: 40 };
    for (let s = 0; s < 240; s++) sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    let e = 0;
    for (let i = 0; i < sys.n; i++) if (sys.alive[i]) e += 0.5 * sys.mass[i] * (sys.vx[i] ** 2 + sys.vy[i] ** 2);
    return e;
  };
  const ke0 = settle(0); const ke5 = settle(0.5); const ke1 = settle(1);
  assert.ok(Number.isFinite(ke0) && ke0 > 0, 'the dry dish is still alive at 240 steps');
  assert.ok(ke5 < ke0 && ke1 < ke5, `settle orders by wetness: dry ${ke0} > mid ${ke5} > wet ${ke1}`);
  assert.ok(ke5 < 0.9 * ke0, `mid wetness measurably settles: ${ke5} vs dry ${ke0}`);
  assert.ok(ke1 < 0.75 * ke0, `full wet settles hardest: ${ke1} vs dry ${ke0}`);
  assert.ok(ke1 > 0, 'the wet dish settles — it does not freeze');
  assert.ok(Object.is(settle(1), ke1), 'the probe is deterministic (bake = live arithmetic)');
}

// (g) — across the seam (scenario 17's fixture, extended by wetness).
{
  const dishPair = (wetA, wetB, modeA = 'bounce', modeB = 'bounce', vxA = 2, vxB = -2) => {
    const mk = (x, vx, mass) => {
      const s = new ParticleSystem();
      s.init(1, 1000, 700, assets, palette, SEED);
      s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass;
      s.scale[0] = 1;
      return s;
    };
    const pearl = mk(400, vxA, 1);
    const eaves = mk(430, vxB, 3);
    const ses = createDishSession();
    const enrol = { radius: 20, restitution: 1, umask: 0xffffffff, organism: false };
    const ea = enrolDishBody(ses, { key: 'pearl', sys: pearl, contactMode: modeA, ...(wetA === null ? {} : { wetness: wetA }), ...enrol });
    const eb = enrolDishBody(ses, { key: 'eaves', sys: eaves, contactMode: modeB, ...(wetB === null ? {} : { wetness: wetB }), ...enrol });
    armDish(ses, ['pearl', 'eaves']);
    return { pearl, eaves, ses, ea, eb };
  };
  // Enrolment clamps at the boundary; absence is dry.
  const probe = dishPair(null, null);
  assert.strictEqual(probe.ea.wetness, 0, 'an enrolment without wetness is dry');
  assert.strictEqual(enrolDishBody(probe.ses, { key: 'pearl', sys: probe.pearl, radius: 20, wetness: 7 }).wetness, 1,
    'over-wet enrols as full wet');
  assert.strictEqual(enrolDishBody(probe.ses, { key: 'pearl', sys: probe.pearl, radius: 20, wetness: 'soup' }).wetness, 0,
    'junk wetness enrols dry');

  // No wetness anywhere: scenario 17(a)'s numbers, bit for bit.
  {
    const { pearl, eaves, ses } = dishPair(null, null);
    runDishContacts(ses, pearl);
    assert.ok(Object.is(pearl.vx[0], -4) && Object.is(eaves.vx[0], 0), 'dry seam: the A1 elastic exchange');
  }
  // Both strata fully wet: the averaged medium kills the bounce —
  // both bodies leave at the momentum mean (−1).
  {
    const { pearl, eaves, ses } = dishPair(1, 1);
    runDishContacts(ses, pearl);
    assert.ok(Math.abs(pearl.vx[0] - -1) < EPS && Math.abs(eaves.vx[0] - -1) < EPS,
      `wet seam is inelastic: ${pearl.vx[0]}, ${eaves.vx[0]}`);
  }
  // One wet, one dry: the pair's medium is the average (0.5), so the
  // restitution is halved — the e = 0.5 bounce alone would leave
  // pearl −2.5, eaves −0.5 (scenario 17(a) arithmetic) — and then
  // the half-wet tension (budget 0.45 of the +2 separation) taxes
  // the way out, exactly as the per-system law composes in (b):
  // pearl −2.5 + 0.3375, eaves −0.5 − 0.1125 (inverse-mass split).
  {
    const { pearl, eaves, ses } = dishPair(1, 0);
    runDishContacts(ses, pearl);
    assert.ok(Math.abs(pearl.vx[0] - -2.1625) < EPS && Math.abs(eaves.vx[0] - -0.6125) < EPS,
      `half-wet seam, bounced then held: ${pearl.vx[0]}, ${eaves.vx[0]}`);
  }
  // Cling holds a cross-strata separation (equal masses, slow parting,
  // neither stratum in an impulse mode — the medium, not the mode).
  {
    const { pearl, eaves, ses } = dishPair(1, 1, 'none', 'none', -0.2, 0.2);
    eaves.mass[0] = 1;
    runDishContacts(ses, pearl);
    assert.ok(Math.abs(pearl.vx[0]) < EPS && Math.abs(eaves.vx[0]) < EPS,
      `cross-strata separation held: ${pearl.vx[0]}, ${eaves.vx[0]}`);
    assert.ok(Object.is(pearl.x[0], 395) && Object.is(eaves.x[0], 435), 'depenetration across the seam unchanged');
  }
}

// (h) — bake parity through the dish bake driver.
{
  const lpFor = (wet) => normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', particleCount: 40,
    contactRadius: 14, contactRestitution: 0.7, contactMode: 'bounce',
    accumulationWetness: wet,
  });
  const bake = (wet) => bakeDishParticles({
    layers: [
      { key: 'pearl', seed: SEED, count: 40, layoutParams: lpFor(wet), activeAssets: assets, palette, maxParticles: 200 },
      { key: 'eaves', seed: SEED + 7, count: 35, layoutParams: lpFor(wet), activeAssets: assets, palette, maxParticles: 200 },
    ],
    canvasW: 1000, canvasH: 700, steps: 45,
  });
  const dry = bake(0); const wetA = bake(1); const wetB = bake(1);
  const flat = (m) => JSON.stringify([...m.entries()].map(([k, items]) => [k, items.map((it) => [it.x, it.y])]));
  assert.strictEqual(flat(wetA), flat(wetB), 'the wet bake is a pure function of its inputs');
  assert.notStrictEqual(flat(wetA), flat(dry), 'the medium acts in the bake, not only live');
}

// (i) — wiring pins (the B-stage habit): call sites exist, the law
// stays in its module, the module itself is clock- and dice-free.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const dish = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  const bake = readFileSync(new URL('./kernel/bake/dishBake.mjs', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishMedium.mjs', import.meta.url), 'utf8');
  assert.ok(particles.includes('dishMediumFor(layoutParams.accumulationWetness)'),
    'update() maps the knob at the contact pass call site');
  assert.ok(particles.includes('Math.pow(mediumDampRetention, dtFrames)'),
    'the drag rides the integrator damping at the call site');
  assert.ok(particles.includes('mediumClingCapture(med.clingK, vnNow)'),
    'the per-system pass applies the capture law');
  assert.ok(particles.includes('mediumFrictionImpulse(mu, jnTotal, vt, spinInvMassT(wSum') && particles.includes('FRIC_MAX * med.fricK'),
    'the per-system pass applies the friction law (D1; contact-point slide + spin mass since D2)');
  assert.ok(dish.includes('mediumFrictionImpulse(mu, jnTotal, vt, spinInvMassT(wSum') && dish.includes('FRIC_MAX * pairMed.fricK'),
    'the dish pass applies the friction law (D1; contact-point slide + spin mass since D2)');
  assert.ok(!particles.includes('mediumClingK(') && !particles.includes('smoothstep'),
    'no curve arithmetic leaks into the integrator');
  assert.ok(dish.includes('e.wetness = clampWetness(wetness)'), 'enrolment carries the medium, clamped');
  assert.ok(dish.includes('mediumClingCapture(pairMed.clingK, vnNow)'), 'the dish pass applies the capture law');
  assert.ok(resolve.includes('wetness: ctx.layoutParams.accumulationWetness'), 'the resolver enrols wetness');
  assert.ok(bake.includes('wetness: layer.layoutParams.accumulationWetness'), 'the bake driver enrols wetness');
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the medium law is deterministic by construction');
}

console.log('dishMedium.selfcheck: OK (#1413 — curves unit-pinned, wet bounce/cling closed forms, mode composition, WETNESS=0 bit-identity, one-step drag, settle probe, cross-strata medium, bake parity, wiring)');
