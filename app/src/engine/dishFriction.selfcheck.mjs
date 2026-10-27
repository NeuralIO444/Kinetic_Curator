// node src/engine/dishFriction.selfcheck.mjs
//
// Petri dish D1 (#1595) — friction: the tangential half of the
// contact impulse. The law in dishMedium.mjs (unit-pinned there,
// in dishMedium.selfcheck (a)); this suite pins the ACCEPTANCE
// probes at the two passes:
//
//   (a) the oblique-collision probe, per-system: two discs, known
//       vt. Dry: vt out = vt in, bit-exact. Wet: vt reduced by the
//       predicted Coulomb amount (μ × the normal impulse exchanged
//       × wSum); the small-vt case grips to exactly zero; the
//       half-wet case composes bounce → cling → friction in one
//       closed form; an approaching pair in a non-impulse mode
//       exchanges no normal impulse and grips nothing (no grip
//       from nothing); a separating pair's friction is funded by
//       the cling capture alone. KE out ≤ KE in across a sweep.
//   (b) the same probe across the seam (dishContacts): unequal
//       masses, the pair's medium averaged; dry seam bit-exact.
//   (c) slide-to-grip: a disc sliding against a partner under a
//       re-imposed approach each step — wet, it pays exactly the
//       budget per step, grips at zero, and holds; dry, it glides
//       unchanged forever.
//   (d) determinism: full updates at full wet repeat bit for bit
//       and differ from dry (live and bake run the same pass, so
//       parity is structural — bake repeatability is pinned in
//       dishMedium.selfcheck (h) and the bake suites).
//   (e) wiring: in both passes the friction block sits after the
//       cling block and before the #1410 deform feed.
//
// D2 amendment (#1596): the slide the block answers is now read
// at the contact point (centres + ω×r) and spread over the
// spin-inclusive mass, so two D1 pins that measured the CENTRES'
// slide are re-pinned to the contact-point law — the (a) grip
// (the surfaces grip to zero; the centres keep the rolling
// share) and the (c) trail (slide converts to roll instead of
// stopping). Everything D1 pinned about budgets, dry parity,
// and energy is unchanged and still asserted below; the spin
// probes proper live in dishSpin.selfcheck.mjs.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import { dishMediumFor, FRIC_MAX } from './dishMedium.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-12;

// Direct-pass fixtures (the dishMedium.selfcheck idiom): discs
// r=20, centres 30 apart on the x axis (overlap 10), so the
// contact normal is (1, 0) and the tangent is (0, 1): vt is the
// y-velocity difference, vn the x-velocity difference.
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
const ke = (sys) => {
  let e = 0;
  for (let i = 0; i < sys.n; i++) e += 0.5 * sys.mass[i] * (sys.vx[i] ** 2 + sys.vy[i] ** 2);
  return e;
};
const vtOf = (sys) => sys.vy[1] - sys.vy[0];

// (a) — the oblique-collision probe, per-system.
{
  // Dry, two ways (no medium key; the dry medium): the elastic
  // bounce swaps vx and the slide passes through bit for bit.
  for (const ctx of [{ ...CTX }, { ...CTX, medium: dishMediumFor(0) }]) {
    const dry = pair2(1, 3, -1, -1);
    dry._contactPass(ctx);
    assert.ok(Object.is(dry.vx[0], -1) && Object.is(dry.vx[1], 1), 'dry bounce is the elastic exchange');
    assert.ok(Object.is(dry.vy[0], 3) && Object.is(dry.vy[1], -1), `dry: vt out = vt in, bit-exact (${vtOf(dry)})`);
  }

  // Wet slide: full wet kills the bounce (e = 0, jimp = 1), so the
  // budget is FRIC_MAX × 1 = 0.5 and the slide pays exactly
  // budget × wSum = 1 of its −4.
  const slide = pair2(1, 3, -1, -1);
  slide._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(Object.is(slide.vx[0], 0) && Object.is(slide.vx[1], 0), 'full wet: the bounce meets as stick');
  assert.ok(
    Object.is(slide.vy[0], 2.5) && Object.is(slide.vy[1], -0.5),
    `wet slide pays the Coulomb amount: vy ${slide.vy[0]}, ${slide.vy[1]} (vt −4 → −3)`,
  );
  assert.ok(Math.abs(vtOf(slide) - -3) < EPS, 'vt reduced by exactly μ × jn × wSum');

  // Wet grip: a small slide fits inside the budget and the
  // CONTACT-POINT slide zeroes (D2 re-pin — see the header note):
  // the centres keep vt × (1 − wSum/kt) = −0.4 × 2/3 of slide as
  // rolling motion, and both discs carry ω = −1/150.
  const grip = pair2(1, 0.2, -1, -0.2);
  grip._contactPass({ ...CTX, medium: dishMediumFor(1) });
  assert.ok(
    Math.abs(grip.vy[0] - 2 / 15) < EPS && Math.abs(grip.vy[1] - -2 / 15) < EPS,
    `grip: the centres keep the rolling share: ${grip.vy[0]}, ${grip.vy[1]}`,
  );
  assert.ok(
    Math.abs(grip.omega[0] - -1 / 150) < EPS && Math.abs(grip.omega[1] - -1 / 150) < EPS,
    `grip: both discs spin up by Δω = −R·jt/I: ${grip.omega[0]}, ${grip.omega[1]}`,
  );
  const gripCp = grip.vy[1] - grip.omega[1] * 20 - (grip.vy[0] + grip.omega[0] * 20);
  assert.ok(Math.abs(gripCp) < EPS, `grip: the contact point itself is at rest: ${gripCp}`);

  // Half wet, composed: restitution halves the bounce (jimp 1.5),
  // the tension taxes the way out (cap 0.45, jc −0.225), and
  // friction (μ = FRIC_MAX × 0.5) clamps to the total exchanged
  // (1.5 + 0.225) — one closed form through all three curves.
  const half = pair2(1, 3, -1, -1);
  half._contactPass({ ...CTX, medium: dishMediumFor(0.5) });
  assert.ok(
    Math.abs(half.vx[0] - -0.275) < EPS && Math.abs(half.vx[1] - 0.275) < EPS,
    `half-wet normal composition: ${half.vx[0]}, ${half.vx[1]}`,
  );
  assert.ok(
    Math.abs(half.vy[0] - 2.56875) < EPS && Math.abs(half.vy[1] - -0.56875) < EPS,
    `half-wet friction on the composed budget: ${half.vy[0]}, ${half.vy[1]} (jt = 0.25 × 1.725)`,
  );

  // No grip from nothing: an approaching pair in mode 'none'
  // exchanges no normal impulse (no bounce, and cling never reads
  // an approach) — wet or not, the slide is untouched, bit-exact.
  const none = pair2(1, 3, -1, -1);
  none._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(1) });
  assert.ok(Object.is(none.vy[0], 3) && Object.is(none.vy[1], -1), 'an unfunded slide keeps every bit of itself');

  // Cling-funded friction: a slow separation in mode 'none' is
  // captured by the tension (cap 0.2, jc −0.1), and that capture
  // alone funds a budget of FRIC_MAX × 0.1 = 0.05.
  const funded = pair2(-0.1, 2, 0.1, -2);
  funded._contactPass({ ...CTX, mode: 'none', medium: dishMediumFor(1) });
  assert.ok(
    Math.abs(funded.vy[0] - 1.95) < EPS && Math.abs(funded.vy[1] - -1.95) < EPS,
    `cling-funded friction: ${funded.vy[0]}, ${funded.vy[1]} (jt = 0.05)`,
  );

  // Friction never adds energy: KE out ≤ KE in across the probe
  // space (bounce mode; restitution ≤ 1 under any medium).
  for (const wet of [0.3, 0.65, 1]) {
    for (const vn of [-3, -1, -0.5]) {
      for (const vt of [-6, -2.5, -0.7, 0.9, 3, 5.5]) {
        const s = pair2(0, 0, vn, vt);
        const before = ke(s);
        s._contactPass({ ...CTX, medium: dishMediumFor(wet) });
        assert.ok(ke(s) <= before + 1e-9, `KE out ≤ KE in (wet ${wet}, vn ${vn}, vt ${vt}): ${ke(s)} vs ${before}`);
        assert.ok(
          Math.sign(vtOf(s)) === Math.sign(vt) || vtOf(s) === 0,
          `friction never reverses a slide (wet ${wet}, vn ${vn}, vt ${vt})`,
        );
      }
    }
  }
}

// (b) — the oblique probe across the seam.
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

  // Dry seam: the A1 elastic exchange (masses 1 and 3), and the
  // slide passes through bit for bit.
  {
    const { pearl, eaves } = dishPair2(null, null, [1, 3], [-1, -1]);
    assert.ok(Object.is(pearl.vx[0], -2) && Object.is(eaves.vx[0], 0), 'dry seam: the elastic exchange');
    assert.ok(Object.is(pearl.vy[0], 3) && Object.is(eaves.vy[0], -1), 'dry seam: vt bit-exact');
  }
  // Both wet: e = 0, jimp = 1.5 funds budget 0.75; the slide pays
  // budget × wSum = 1 of its −4, split by inverse mass.
  {
    const { pearl, eaves } = dishPair2(1, 1, [1, 3], [-1, -1]);
    assert.ok(
      Math.abs(pearl.vx[0] - -0.5) < EPS && Math.abs(eaves.vx[0] - -0.5) < EPS,
      `wet seam is inelastic: ${pearl.vx[0]}, ${eaves.vx[0]}`,
    );
    assert.ok(
      Math.abs(pearl.vy[0] - 2.25) < EPS && Math.abs(eaves.vy[0] - -0.75) < EPS,
      `wet seam friction: ${pearl.vy[0]}, ${eaves.vy[0]} (jt = 0.75)`,
    );
  }
  // One wet, one dry: the pair's medium is the average (0.5) —
  // bounce (jimp 2.25), cling (jc −0.3375), friction (μ 0.25 on
  // the total 2.5875) compose exactly as per-system.
  {
    const { pearl, eaves } = dishPair2(1, 0, [1, 3], [-1, -1]);
    assert.ok(
      Math.abs(pearl.vx[0] - -0.9125) < EPS && Math.abs(eaves.vx[0] - -0.3625) < EPS,
      `half-wet seam, normal: ${pearl.vx[0]}, ${eaves.vx[0]}`,
    );
    assert.ok(
      Math.abs(pearl.vy[0] - 2.353125) < EPS && Math.abs(eaves.vy[0] - -0.784375) < EPS,
      `half-wet seam, friction: ${pearl.vy[0]}, ${eaves.vy[0]} (jt = 0.646875)`,
    );
  }
}

// (c) — slide-to-grip: sustained contact, simulated the direct-
// pass way — positions re-parked and the approach re-imposed each
// step (the load a resting contact carries), velocities carried.
{
  const slideRun = (medium, steps) => {
    const sys = pair2(0.5, 2, -0.5, -2);
    const trail = [];
    for (let s = 0; s < steps; s++) {
      sys.x[0] = 400;
      sys.y[0] = 350;
      sys.x[1] = 430;
      sys.y[1] = 350;
      sys.vx[0] = 0.5;
      sys.vx[1] = -0.5; // the approach, re-imposed
      sys._contactPass({ ...CTX, mode: 'stick', medium });
      trail.push(vtOf(sys));
    }
    return { sys, trail };
  };
  // Wet: each step's stick impulse (0.5) funds a budget of 0.25.
  // D1's trail paid budget × wSum = 0.5 of CENTRE slide per step
  // to zero at step 8. Since D2 the same payments also spin the
  // discs up: the centre slide pays 0.5 for two steps, then the
  // contact point grips (step 3) and the pair ROLLS — the centres
  // hold −8/3 of relative slide with both discs at ω = −1/15 and
  // the surfaces matched (the re-pin the header note describes;
  // the full rolling probes live in dishSpin.selfcheck (d)).
  const wet = slideRun(dishMediumFor(1), 11);
  assert.ok(
    Object.is(wet.trail[0], -3.5) && Object.is(wet.trail[1], -3),
    `wet slide pays the budget while spin builds: ${wet.trail[0]}, ${wet.trail[1]}`,
  );
  for (let s = 2; s < wet.trail.length; s++) {
    assert.ok(
      Math.abs(wet.trail[s] - -8 / 3) < 1e-9,
      `wet roll step ${s + 1}: centre vt ${wet.trail[s]} holds at −8/3 (rolling, not sliding)`,
    );
  }
  assert.ok(
    Math.abs(wet.sys.omega[0] - -1 / 15) < 1e-9 && Math.abs(wet.sys.omega[1] - -1 / 15) < 1e-9,
    `the rolled pair carries ω = −1/15 each: ${wet.sys.omega[0]}, ${wet.sys.omega[1]}`,
  );
  assert.ok(Object.is(wet.sys.vx[0], 0) && Object.is(wet.sys.vx[1], 0), 'stick holds the normal too');
  // Dry: the same sustained contact never touches the slide.
  const dry = slideRun(dishMediumFor(0), 11);
  for (let s = 0; s < dry.trail.length; s++) {
    assert.ok(Object.is(dry.trail[s], -4), `dry slide step ${s + 1}: vt ${dry.trail[s]} — glides unchanged`);
  }
}

// (d) — determinism through full updates: a tangential-rich
// clump at full wet repeats bit for bit, and is not the dry run.
{
  const lpFor = (wet) =>
    normalizeLayoutParams({
      ...DEFAULT_LAYOUT_PARAMS,
      mode: 'swarm',
      particleCount: 24,
      contactRadius: 22,
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
  const run = (wet) => {
    const sys = new ParticleSystem();
    sys.init(24, 1000, 700, assets, palette, SEED);
    for (let i = 0; i < 24; i++) {
      sys.x[i] = 340 + (i % 6) * 48;
      sys.y[i] = 230 + Math.floor(i / 6) * 48;
      sys.vx[i] = ((i % 3) - 1) * 1.7;
      sys.vy[i] = (((i * 7) % 3) - 1) * 1.3;
      sys.mass[i] = 1;
      sys.scale[i] = 1;
    }
    const lp = { ...lpFor(wet), maxParticles: 40 };
    for (let s = 0; s < 240; s++) sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    return sys;
  };
  const a = run(1);
  const b = run(1);
  assert.strictEqual(a.n, b.n, 'wet repeat: population');
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < a.n; i++) {
      assert.ok(Object.is(a[fld][i], b[fld][i]), `wet repeat: ${fld}[${i}] ${a[fld][i]} vs ${b[fld][i]}`);
    }
  }
  const dry = run(null);
  const dryZero = run(0);
  for (const fld of ['x', 'y', 'vx', 'vy']) {
    for (let i = 0; i < dry.n; i++) {
      assert.ok(Object.is(dry[fld][i], dryZero[fld][i]), `dry identity through full updates: ${fld}[${i}]`);
    }
  }
  let differs = false;
  for (let i = 0; i < a.n; i++) {
    if (!Object.is(a.x[i], dry.x[i]) || !Object.is(a.vy[i], dry.vy[i])) differs = true;
  }
  assert.ok(differs, 'the wet run is not the dry run (the repeat comparison is not vacuous)');
}

// (e) — wiring: the block's place in both passes.
{
  const particles = readFileSync(new URL('./particles.js', import.meta.url), 'utf8');
  const dish = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const order = (src, a, b, c, label) => {
    const ia = src.indexOf(a);
    const ib = src.indexOf(b, ia);
    const ic = src.indexOf(c, ib);
    assert.ok(ia >= 0 && ib > ia && ic > ib, `${label}: cling < friction < deform feed`);
  };
  order(
    particles,
    'mediumClingCapture(med.clingK, vnNow)',
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
  assert.ok(particles.includes('if (med.fricK > 0)'), 'per-system friction is guarded by the medium');
  assert.ok(dish.includes('if (pairMed && pairMed.fricK > 0)'), 'cross-strata friction is guarded by the pair medium');
}

console.log(
  'dishFriction.selfcheck: OK (#1595 — oblique probe dry bit-exact / wet Coulomb / grip / cling-funded / no-grip-from-nothing, KE sweep, cross-strata probe, slide-to-grip, full-update determinism, wiring order)',
);
