// node src/engine/dishSpin.selfcheck.mjs
//
// Petri dish D2 (#1596) — spin: an ω column, torque from D1's
// jt, angular damping + clamp. The law in dishSpin.mjs (unit-
// pinned in (a) here); this suite pins the issue's ACCEPTANCE
// probes at both passes and at the integrator:
//
// #1841 re-pin (slice B of #1809): the (f) wiring pins named the
// per-system medium local `med.` — the medium now resolves PER
// PAIR in that pass (the shared field sampled at the pair, or
// the step's medium as fallback), so the local is `medPair.` and
// the pins follow it. The guards they pin are unchanged.
//
//   (a) the leaf: inertia, contact-point velocity, the spin-
//       inclusive tangential mass, Δω, the damping step + clamp,
//       the θ wrap.
//   (b) the oblique wet collision, per-system: D1's slide now
//       also transfers spin by the predicted Δω = −R·jt/I; a
//       rolling contact (surfaces matched) cancels — friction
//       does nothing, bit for bit; a slide carried by spin alone
//       is answered and pays spin down.
//   (c) the same transfer across the seam (masses 1 vs 3, each
//       disc torqued by its own R and I); the dry seam leaves ω
//       exactly 0.
//   (d) rolling: sustained contact spins the pair up until the
//       contact point grips — from then on the pair ROLLS
//       (centres keep their slide, surfaces matched, θ's rate
//       is ω) instead of sliding to a stop.
//   (e) the integrator: a free spin decays by (1 − c·dt) per
//       step and θ advances by the damped rate, closed form;
//       ω never exceeds the clamp, even from a violent pre-spin
//       in a seeded chaos run; full updates repeat bit for bit
//       on the spin columns too; dry runs leave ω and θ exactly
//       0, and an unrolled body's item rotation is its heading
//       bit for bit (θ rides only when nonzero).
//   (f) wiring: in both passes the spin-fed friction block sits
//       after cling and before the #1410 deform feed; the
//       integrator takes its spin step from the leaf; the law is
//       clock- and dice-free; this suite is manifest-registered.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import { dishMediumFor } from './dishMedium.mjs';
import {
  SPIN_DAMP_C,
  SPIN_MAX,
  spinInertia,
  spinContactVt,
  spinInvMassT,
  spinDeltaOmega,
  spinStepOmega,
  spinWrapAngle,
} from './dishSpin.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// Direct-pass fixtures (the dishFriction idiom): discs r=20,
// centres 30 apart on the x axis, contact normal (1, 0), tangent
// (0, 1) — vt is the y-velocity difference at the centres, and a
// body's contact-point tangential speed is vy ± ω·20.
const CTX = {
  radius: 20,
  restitution: 1,
  repel: 0,
  mode: 'bounce',
  umask: 0xffffffff,
  breedCap: 10,
  seed: SEED,
  organism: false,
  minScale: 0.4,
  maxScale: 1.6,
  minAlpha: 40,
  maxAlpha: 100,
};
const pair2 = (vx0, vy0, vx1, vy1) => {
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.x[0] = 400;
  sys.y[0] = 350;
  sys.x[1] = 430;
  sys.y[1] = 350;
  sys.vx[0] = vx0;
  sys.vy[0] = vy0;
  sys.vx[1] = vx1;
  sys.vy[1] = vy1;
  sys.mass[0] = 1;
  sys.mass[1] = 1;
  sys.scale[0] = 1;
  sys.scale[1] = 1;
  return sys;
};
const cpVt = (sys) => sys.vy[1] - sys.omega[1] * 20 - (sys.vy[0] + sys.omega[0] * 20);

// (a) — the leaf, unit-pinned.
{
  assert.strictEqual(spinInertia(2, 10), 100, 'I = ½mR² for a solid disc');
  assert.strictEqual(spinInertia(1, 20), 200, 'the probe discs: I = 200');
  assert.strictEqual(spinInertia(0, 10), 0, 'no mass, no inertia');
  assert.strictEqual(spinInertia(2, 0), 0, 'no disc, no inertia');

  assert.strictEqual(spinContactVt(-4, 0, 20, 0, 20), -4, 'spin-less: the centres’ slide, bit for bit');
  assert.strictEqual(spinContactVt(4, 0.1, 20, 0.1, 20), 0, 'surfaces matched: the contact point is at rest');
  assert.strictEqual(spinContactVt(0, 0.2, 20, 0, 20), -4, 'spin alone slides the contact point');

  assert.strictEqual(spinInvMassT(2, 20, 200, 20, 200), 6, 'kt = wSum + Σ R²/I = 3·wSum for solid discs');
  assert.strictEqual(spinInvMassT(2, 20, 0, 20, 0), 2, 'no inertia: the centres’ mass only');

  assert.strictEqual(spinDeltaOmega(20, 0.5, 200), -0.05, 'Δω = −R·jt/I');
  assert.strictEqual(spinDeltaOmega(20, -0.5, 200), 0.05, 'the torque follows the impulse’s sign');
  assert.strictEqual(spinDeltaOmega(20, 0.5, 0), 0, 'no inertia, no torque');

  assert.strictEqual(SPIN_DAMP_C, 0.01, 'the damping coefficient is the frictionAir analogue');
  assert.strictEqual(SPIN_MAX, Math.PI, 'the clamp is half a turn per step');
  assert.ok(Math.abs(spinStepOmega(1, 1) - (1 - SPIN_DAMP_C)) < 1e-15, 'one step of damping at 60 fps');
  assert.strictEqual(spinStepOmega(50, 1), Math.PI, 'a violent spin clamps at +SPIN_MAX');
  assert.strictEqual(spinStepOmega(-50, 1), -Math.PI, 'the clamp is symmetric');

  assert.strictEqual(spinWrapAngle(0.5), 0.5, 'an in-range angle is itself');
  assert.strictEqual(spinWrapAngle(-0.5), -0.5, 'negative in-range too');
  assert.strictEqual(spinWrapAngle(Math.PI), -Math.PI, 'π wraps to −π (the range is [−π, π))');
  assert.ok(Math.abs(spinWrapAngle(3 * Math.PI) - -Math.PI) < EPS, 'wrapping is magnitude-safe');
}

// (b) — the oblique wet collision, per-system: spin transfer.
{
  // D1's wet slide (budget-saturated, jt = 0.5): the linear
  // outcome is D1's, bit for bit — and both discs now also take
  // Δω = −20 × 0.5 / 200 = −0.05.
  const slide = pair2(1, 3, -1, -1);
  slide._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(Object.is(slide.vy[0], 2.5) && Object.is(slide.vy[1], -0.5), 'the linear slide outcome is D1’s, unchanged');
  assert.ok(
    Math.abs(slide.omega[0] - -0.05) < EPS && Math.abs(slide.omega[1] - -0.05) < EPS,
    `spin transfers by the predicted Δω: ${slide.omega[0]}, ${slide.omega[1]}`,
  );
  assert.ok(Math.abs(cpVt(slide) - -1) < EPS, 'the saturated impulse pays the contact slide by jt × kt, no more');

  // The counter-rotating case cancels: both discs at ω = 0.1
  // with the centres’ slide exactly the surfaces’ agreement
  // (vt = ω·R + ω·R = 4) — a rolling contact. Friction has
  // nothing to answer: velocities and spins pass bit for bit
  // (the normal still meets as stick at full wet).
  const roll = pair2(1, 0, -1, 4);
  roll.omega[0] = 0.1;
  roll.omega[1] = 0.1;
  roll._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(
    Object.is(roll.vy[0], 0) && Object.is(roll.vy[1], 4),
    'rolling contact: the slide is untouched, bit for bit',
  );
  assert.ok(
    Object.is(roll.omega[0], 0.1) && Object.is(roll.omega[1], 0.1),
    'rolling contact: the spins are untouched, bit for bit',
  );
  assert.ok(Object.is(roll.vx[0], 0) && Object.is(roll.vx[1], 0), 'the normal still resolves');

  // A slide carried by spin alone: centres tangentially at rest,
  // one disc spinning (ω = 0.2, surface speed 4). Friction
  // answers the contact slide (jt = 0.5, the budget), paying the
  // spin down and the centres up by the same impulse.
  const spun = pair2(1, 0, -1, 0);
  spun.omega[0] = 0.2;
  spun._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(
    Math.abs(spun.vy[0] - -0.5) < EPS && Math.abs(spun.vy[1] - 0.5) < EPS,
    `spin-only slide moves the centres: ${spun.vy[0]}, ${spun.vy[1]}`,
  );
  assert.ok(
    Math.abs(spun.omega[0] - 0.15) < EPS && Math.abs(spun.omega[1] - -0.05) < EPS,
    `and pays the spin down by the same jt: ${spun.omega[0]}, ${spun.omega[1]}`,
  );
}

// (c) — the transfer across the seam.
{
  const dishPair2 = (wetA, wetB, vA, vB) => {
    const mk = (x, v, mass) => {
      const s = new ParticleSystem();
      s.init(1, 1000, 700, assets, palette, SEED);
      s.x[0] = x;
      s.y[0] = 350;
      s.vx[0] = v[0];
      s.vy[0] = v[1];
      s.mass[0] = mass;
      s.scale[0] = 1;
      return s;
    };
    const pearl = mk(400, vA, 1);
    const eaves = mk(430, vB, 3);
    const ses = createDishSession();
    const enrol = { radius: 20, restitution: 1, umask: 0xffffffff, organism: false };
    enrolDishBody(ses, {
      key: 'pearl',
      sys: pearl,
      contactMode: 'bounce',
      ...(wetA === null ? {} : { wetness: wetA }),
      ...enrol,
    });
    enrolDishBody(ses, {
      key: 'eaves',
      sys: eaves,
      contactMode: 'bounce',
      ...(wetB === null ? {} : { wetness: wetB }),
      ...enrol,
    });
    armDish(ses, ['pearl', 'eaves']);
    runDishContacts(ses, pearl);
    return { pearl, eaves };
  };
  // Both wet: jt = 0.75 (D1's pin); each disc is torqued by its
  // own R and I — pearl (I = 200) takes −0.075, eaves (I = 600)
  // takes −0.025.
  {
    const { pearl, eaves } = dishPair2(1, 1, [1, 3], [-1, -1]);
    assert.ok(
      Math.abs(pearl.vy[0] - 2.25) < EPS && Math.abs(eaves.vy[0] - -0.75) < EPS,
      'the seam’s linear outcome is D1’s, unchanged',
    );
    assert.ok(Math.abs(pearl.omega[0] - -0.075) < EPS, `the light disc torques by its own I: ${pearl.omega[0]}`);
    assert.ok(Math.abs(eaves.omega[0] - -0.025) < EPS, `the heavy disc torques by its own I: ${eaves.omega[0]}`);
  }
  // Dry seam: no friction, no torque — ω stays exactly 0.
  {
    const { pearl, eaves } = dishPair2(null, null, [1, 3], [-1, -1]);
    assert.ok(
      Object.is(pearl.omega[0], 0) && Object.is(eaves.omega[0], 0),
      'dry seam: spin state at rest stays at rest, exactly',
    );
  }
}

// (d) — rolling: sustained contact under a re-imposed approach
// (the dishFriction (c) fixture). The payments spin the pair up
// until the contact point grips; from then on the pair rolls.
{
  const sys = pair2(0.5, 2, -0.5, -2);
  const centreTrail = [];
  const contactTrail = [];
  for (let s = 0; s < 11; s++) {
    sys.x[0] = 400;
    sys.y[0] = 350;
    sys.x[1] = 430;
    sys.y[1] = 350;
    sys.vx[0] = 0.5;
    sys.vx[1] = -0.5; // the approach, re-imposed
    sys._contactPass({ ...CTX, mode: 'stick', medium: dishMediumFor(1) });
    centreTrail.push(sys.vy[1] - sys.vy[0]);
    contactTrail.push(cpVt(sys));
  }
  assert.ok(
    Object.is(centreTrail[0], -3.5) && Object.is(centreTrail[1], -3),
    'the first payments are D1’s, while spin builds',
  );
  assert.ok(
    Math.abs(contactTrail[0] - -2.5) < EPS && Math.abs(contactTrail[1] - -1) < EPS,
    `the contact slide pays by jt × kt per step: ${contactTrail[0]}, ${contactTrail[1]}`,
  );
  for (let s = 2; s < 11; s++) {
    assert.ok(
      Math.abs(contactTrail[s]) < 1e-9,
      `step ${s + 1}: the contact point is at rest (${contactTrail[s]}) — rolling, not sliding`,
    );
    assert.ok(
      Math.abs(centreTrail[s] - -8 / 3) < 1e-9,
      `step ${s + 1}: the centres keep their rolling slide (${centreTrail[s]})`,
    );
  }
}

// (e) — the integrator: damping, θ, clamp, determinism, dry.
{
  const lpFor = (wet, radius, count) =>
    normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'swarm',
      particleCount: count,
      contactRadius: radius,
      contactMode: 'bounce',
      contactRestitution: 0.85,
      contactRepel: 0,
      wind: 0,
      swarmCohesion: 0,
      gravityWells: 0,
      noiseSpeed: 0,
      damping: 0.995,
      kinemeBreath: 0,
      kinemeDrift: 0,
      kinemePaletteBreath: 0,
      lifeDrift: 0,
      ...(wet === null ? {} : { accumulationWetness: wet }),
    });
  const step = (sys, lp, steps) => {
    for (let s = 0; s < steps; s++) sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  };

  // A free spin decays by (1 − c) per step and θ advances by
  // the damped rate — the geometric closed form, no contacts
  // (contactRadius 0) to disturb it.
  {
    const sys = new ParticleSystem();
    sys.init(3, 1000, 700, assets, palette, SEED);
    sys.x[0] = 100;
    sys.y[0] = 100;
    sys.x[1] = 500;
    sys.y[1] = 100;
    sys.x[2] = 900;
    sys.y[2] = 600;
    for (let i = 0; i < 3; i++) {
      sys.vx[i] = 0;
      sys.vy[i] = 0;
    }
    sys.omega[0] = 0.3;
    sys.omega[1] = -0.3;
    const lp = { ...lpFor(null, 0, 3), maxParticles: 10 };
    step(sys, lp, 10);
    const r = 1 - SPIN_DAMP_C;
    assert.ok(
      Math.abs(sys.omega[0] - 0.3 * Math.pow(r, 10)) < 1e-9,
      `ω decays geometrically: ${sys.omega[0]} vs ${0.3 * Math.pow(r, 10)}`,
    );
    const thetaWant = (0.3 * r * (1 - Math.pow(r, 10))) / (1 - r);
    assert.ok(
      Math.abs(sys.theta[0] - thetaWant) < 1e-9,
      `θ advances at the damped rate: ${sys.theta[0]} vs ${thetaWant}`,
    );
    assert.ok(Math.abs(sys.theta[1] - -thetaWant) < 1e-9, 'the counter-spin rolls the other way');
    assert.ok(Object.is(sys.omega[2], 0) && Object.is(sys.theta[2], 0), 'a never-spun body is never touched');
    // With damping on, a spun disc's ω reaches rest in bounded
    // steps (exponential decay: below 1e-6 well within 2000).
    step(sys, lp, 2000);
    assert.ok(Math.abs(sys.omega[0]) < 1e-6, `a free spin dies: ω = ${sys.omega[0]} after 2010 steps`);
  }

  // The clamp, from a violent pre-spin, in one step.
  {
    const sys = new ParticleSystem();
    sys.init(2, 1000, 700, assets, palette, SEED);
    sys.omega[0] = 50;
    sys.omega[1] = -50;
    step(sys, { ...lpFor(null, 0, 2), maxParticles: 10 }, 1);
    assert.ok(Object.is(sys.omega[0], Math.PI) && Object.is(sys.omega[1], -Math.PI), 'ω never exceeds the clamp');
  }

  // Chaos: a tangential-rich clump at full wet, pre-spun hard —
  // ω stays clamped and finite, and the whole run (spin columns
  // included) repeats bit for bit.
  const clump = (wet, prespin) => {
    const sys = new ParticleSystem();
    sys.init(24, 1000, 700, assets, palette, SEED);
    for (let i = 0; i < 24; i++) {
      sys.x[i] = 340 + (i % 6) * 48;
      sys.y[i] = 230 + Math.floor(i / 6) * 48;
      sys.vx[i] = ((i % 3) - 1) * 1.7;
      sys.vy[i] = (((i * 7) % 3) - 1) * 1.3;
      sys.mass[i] = 1;
      sys.scale[i] = 1;
      if (prespin) sys.omega[i] = i % 2 ? 40 : -40;
    }
    step(sys, { ...lpFor(wet, 22, 24), maxParticles: 40 }, 240);
    return sys;
  };
  {
    const a = clump(1, true);
    const b = clump(1, true);
    let spun = false;
    for (let i = 0; i < a.n; i++) {
      assert.ok(
        Number.isFinite(a.omega[i]) && Math.abs(a.omega[i]) <= SPIN_MAX,
        `chaos: ω[${i}] = ${a.omega[i]} stays inside the clamp`,
      );
      assert.ok(
        Number.isFinite(a.theta[i]) && Math.abs(a.theta[i]) <= Math.PI,
        `chaos: θ[${i}] = ${a.theta[i]} stays wrapped`,
      );
      assert.ok(
        Object.is(a.omega[i], b.omega[i]) && Object.is(a.theta[i], b.theta[i]),
        `chaos repeat: spin columns bit-identical at ${i}`,
      );
      if (a.omega[i] !== 0) spun = true;
    }
    assert.ok(spun, 'the chaos run actually carries spin (the clamp assertions are not vacuous)');
  }

  // Dry identity through full updates: a dish that starts
  // unspun stays exactly unspun — ω and θ are 0, absent medium
  // and explicit 0 alike — and the render forward is the
  // heading alone until θ exists.
  {
    const dryA = clump(null, false);
    const dryB = clump(0, false);
    for (let i = 0; i < dryA.n; i++) {
      assert.ok(
        Object.is(dryA.omega[i], 0) && Object.is(dryA.theta[i], 0),
        `dry: body ${i} carries no spin and no roll`,
      );
      assert.ok(
        Object.is(dryA.omega[i], dryB.omega[i]) && Object.is(dryA.theta[i], dryB.theta[i]),
        'dry: absent and explicit-0 media agree on the spin columns',
      );
    }
    const items = dryA.getItems(assets);
    assert.strictEqual(items.length, dryA.n, 'every dry body renders');
    for (let i = 0; i < dryA.n; i++) {
      assert.ok(
        Object.is(items[i].rotation, dryA.rotation[i]),
        `dry: item ${i}’s rotation is its heading, bit for bit`,
      );
    }
    dryA.theta[0] = 0.25;
    const rolled = dryA.getItems(assets);
    assert.ok(
      Math.abs(rolled[0].rotation - (dryA.rotation[0] + 0.25 * (180 / Math.PI))) < 1e-9,
      'a rolled body’s item rotation is heading + θ',
    );
    assert.ok(Object.is(rolled[1].rotation, dryA.rotation[1]), 'its neighbour is untouched');
  }
}

// (f) — wiring.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const dish = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const law = readFileSync(new URL('./dishSpin.mjs', import.meta.url), 'utf8');
  const order = (src, a, b, c, label) => {
    const ia = src.indexOf(a);
    const ib = src.indexOf(b, ia);
    const ic = src.indexOf(c, ib);
    assert.ok(ia >= 0 && ib > ia && ic > ib, `${label}: cling < spin-fed friction < deform feed`);
  };
  order(
    particles,
    'mediumClingCapture(medPair.clingK, vnNow)',
    'mediumFrictionImpulse(mu, jnTotal, vt, spinInvMassT(wSum',
    'feedDishDeform',
    'per-system pass',
  );
  order(
    dish,
    'mediumClingCapture(pairMed.clingK, vnNow)',
    'mediumFrictionImpulse(mu, jnTotal, vt, spinInvMassT(wSum',
    'feedDishDeform',
    'cross-strata pass',
  );
  assert.ok(
    particles.includes('OMEGA[i] += spinDeltaOmega(ri, jt, iI)') &&
      particles.includes('OMEGA[j] += spinDeltaOmega(rj, jt, iJ)'),
    'the per-system block torques both discs',
  );
  assert.ok(
    dish.includes('sysA.omega[ia] += spinDeltaOmega(ra, jt, iA)') &&
      dish.includes('sysB.omega[ib] += spinDeltaOmega(rb, jt, iB)'),
    'the cross-strata block torques both discs',
  );
  assert.ok(
    particles.includes('spinStepOmega(omI, dtFrames)') && particles.includes('spinWrapAngle(THETA[i] + w * dtFrames)'),
    'the integrator damps, clamps, and advances θ from the leaf',
  );
  assert.ok(
    particles.includes('if (medPair.fricK > 0)') && dish.includes('if (pairMed && pairMed.fricK > 0)'),
    'both spin-feeding blocks stay behind the medium guards (dry writes no ω)',
  );
  assert.ok(!/Math\.random|Date\.now/.test(law), 'the spin law is deterministic by construction');
  const manifest = readFileSync(new URL('../../selfcheck.manifest', import.meta.url), 'utf8');
  assert.ok(manifest.includes('node src/engine/dishSpin.selfcheck.mjs'), 'this suite is registered in the manifest');
}

console.log(
  'dishSpin.selfcheck: OK (#1596 — leaf pins, oblique transfer + rolling-contact cancel + spin-only slide, cross-strata torque, sustained rolling, integrator damping/θ/clamp/chaos/determinism/dry identity, wiring)',
);
