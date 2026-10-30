// node src/engine/dishWet.selfcheck.mjs
//
// Petri dish × the shared wet field (#1841, slice B of #1809): the
// dish's wet quantities — the pair medium (restitution / cling /
// friction), the grip verdicts that feed bond formation, and the
// integrator's medium drag — read from the wet-frame service's
// field, and the dish's contacts stamp into it. The law lives in
// dishMedium.mjs (the source + the stamp), dishContacts.mjs (the
// session's sampler + stamp list) and gl/wetFrame.mjs (the service);
// this suite pins the migration's acceptance shape:
//
//   (a) NO FIELD, NO CHANGE — a driver that attaches no sampler
//       (suites, census, any pre-service caller) runs the knob
//       medium exactly as #1413 shipped it: two trajectory goldens
//       measured on the tree BEFORE the migration, held bit for
//       bit (per-system 2258814921, cross-strata 3750751918).
//   (b) A UNIFORM FIELD IS THE KNOB — the (a) scene run against a
//       constant sampler at the same wetness lands on the same
//       golden: the knob was always a uniform field, and the
//       migration only gives "here" a local answer.
//   (c) THE SAMPLE POINT IS THE PAIR — at the direct pass: a dry
//       sampler is the dry pass bit for bit (a wet knob medium in
//       the ctx is a decoy and never runs); a sampler wet only at
//       the pair's midpoint gives the full-wet outcome; a sampler
//       wet everywhere EXCEPT the midpoint gives the dry outcome.
//   (d) GRIP READS THE FIELD — bond formation by sustained grip:
//       with the knob at 0 and the field wet, a resting pair bonds;
//       with the knob at 0.9 and the field dry, it never does. The
//       counters in dishLinks.mjs are unchanged; their wet basis
//       is the field now.
//   (e) CONTACTS STAMP — a wet contact records exactly one press
//       per pass at the pair's midpoint, amount = the resting
//       stamp × the pair's wetness; a dry field records nothing.
//       Both passes (per-system and across the seam) feed the one
//       session list the driver drains into the service request.
//   (f) THE BAKE — dry bake golden unchanged (3304663090, measured
//       pre-migration); the wet bake's golden is RE-PINNED with
//       cause: 212945750 → 2527199455, because the bake now steps
//       an injected wet field and the dish reads it — the field
//       source legitimately changes the values (#1809 slice B
//       acceptance). The wet bake still repeats bit for bit.
//   (g) THE WIRE — gl/wetLive carries the shed line only while the
//       service reports degraded or shed; live/off are silence.
//
// Behaviour in the live instrument (spatially varying medium, the
// dish under a real wash) is judged by Matt's eyes in the review
// lane — this suite pins the mechanics, not the feel.

import assert from 'node:assert';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish } from './dishContacts.mjs';
import { dishMediumFor } from './dishMedium.mjs';
import { bakeDishParticles } from './kernel/bake/dishBake.mjs';
import { publishWetMode, getWetModeLine, clearWetMode } from '../gl/wetLive.mjs';
import { createWetFrameService } from '../gl/wetFrame.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';
import { BAKE_TIME_ORIGIN, BAKE_DT_MS } from './kernel/bake/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;
const EPS = 1e-9;

function fnvBytes(arrays) {
  let h = 0x811c9dc5;
  const mix = (byte) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const arr of arrays) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < u8.length; i++) mix(u8[i]);
  }
  return h >>> 0;
}
const hashSys = (sys) =>
  fnvBytes([sys.x.subarray(0, sys.n), sys.y.subarray(0, sys.n), sys.vx.subarray(0, sys.n), sys.vy.subarray(0, sys.n)]);

const lpFor = (extra = {}) =>
  normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: 3,
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
    accumulationWetness: 0,
    ...extra,
  });

function place(sys, i, x, y, vx, vy) {
  sys.x[i] = x;
  sys.y[i] = y;
  sys.vx[i] = vx;
  sys.vy[i] = vy;
}

const sceneA = () => {
  const sys = new ParticleSystem();
  sys.init(3, 1000, 700, assets, palette, SEED);
  place(sys, 0, 400, 350, 1.5, 0.3);
  place(sys, 1, 445, 350, -1.2, -0.2);
  place(sys, 2, 420, 300, 0.2, 1.1);
  return sys;
};
const stepN = (sys, lp, steps) => {
  for (let s = 0; s < steps; s++) sys.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
};

// (a) — the fallback goldens, measured pre-migration.
ok('(a) no field attached: the knob medium is bit-identical to the pre-migration engine', () => {
  const sys = sceneA();
  stepN(sys, lpFor({ accumulationWetness: 0.65 }), 180);
  assert.strictEqual(hashSys(sys), 2258814921, 'per-system golden (pre-migration measurement)');

  const session = createDishSession();
  const a = sceneA();
  const b = new ParticleSystem();
  b.init(3, 1000, 700, assets, palette, SEED);
  place(b, 0, 430, 360, -1.0, 0.6);
  place(b, 1, 380, 320, 0.8, -0.5);
  place(b, 2, 470, 310, -0.4, -1.0);
  const lp = { ...lpFor({ accumulationWetness: 0.65 }), dishSession: session };
  for (const [key, sysX] of [
    ['a', a],
    ['b', b],
  ]) {
    enrolDishBody(session, {
      key,
      sys: sysX,
      radius: 22,
      restitution: 0.85,
      contactMode: 'bounce',
      umask: 0xffffffff,
      organism: false,
      wetness: 0.65,
      accum: false,
      ecology: false,
      cap: 3,
    });
  }
  for (let s = 0; s < 180; s++) {
    armDish(session, ['a', 'b']);
    a.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    b.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
  }
  assert.strictEqual(
    fnvBytes([new Uint32Array([hashSys(a), hashSys(b)])]),
    3750751918,
    'cross-strata golden (pre-migration measurement)',
  );
});

// (b) — a uniform field is the knob.
ok('(b) a uniform field at the knob’s wetness reproduces the knob golden exactly', () => {
  const session = createDishSession();
  session.wetSampler = () => 0.65;
  const sys = sceneA();
  stepN(sys, { ...lpFor({ accumulationWetness: 0.65 }), dishSession: session }, 180);
  assert.strictEqual(hashSys(sys), 2258814921, 'uniform field ≡ uniform knob, bit for bit');
});

// (c) — the sample point is the pair (direct pass, dishFriction's probe shape).
{
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
    place(sys, 0, 400, 350, vx0, vy0);
    place(sys, 1, 430, 350, vx1, vy1);
    sys.mass[0] = 1;
    sys.mass[1] = 1;
    sys.scale[0] = 1;
    sys.scale[1] = 1;
    return sys;
  };
  // The oblique probe: vn approach swaps elastically when dry; vt = −4.
  const dryRun = (over) => {
    const sys = pair2(1, 3, -1, -1);
    sys._contactPass({ ...CTX, medium: dishMediumFor(0), ...over });
    return sys;
  };
  ok('(c) the pair reads the field at its midpoint — dry field dry, wet point wet, wet elsewhere dry', () => {
    const dry = dryRun({});
    assert.ok(Object.is(dry.vy[0], 3) && Object.is(dry.vy[1], -1), 'reference: dry slide passes through');
    // A wet knob medium rides the ctx as a decoy in all three runs.
    const decoy = { medium: dishMediumFor(0.65) };
    const dryField = dryRun({ ...decoy, wetSampler: () => 0, wetStamps: null });
    assert.ok(
      Object.is(dryField.vy[0], dry.vy[0]) &&
        Object.is(dryField.vy[1], dry.vy[1]) &&
        Object.is(dryField.vx[0], dry.vx[0]),
      'a dry field is the dry pass, bit for bit — the decoy medium never runs',
    );
    const wetPoint = dryRun({
      ...decoy,
      wetSampler: (x, y) => (Math.abs(x - 415) < 2 && Math.abs(y - 350) < 2 ? 1 : 0),
      wetStamps: null,
    });
    assert.ok(
      Object.is(wetPoint.vy[0], 2.5) && Object.is(wetPoint.vy[1], -0.5),
      `a field wet at the midpoint gives the full-wet slide (vy ${wetPoint.vy[0]}, ${wetPoint.vy[1]})`,
    );
    const wetElsewhere = dryRun({
      ...decoy,
      wetSampler: (x, y) => (Math.abs(x - 415) < 2 && Math.abs(y - 350) < 2 ? 0 : 1),
      wetStamps: null,
    });
    assert.ok(
      Object.is(wetElsewhere.vy[0], dry.vy[0]) && Object.is(wetElsewhere.vy[1], dry.vy[1]),
      'a field wet everywhere except the pair is the dry pass — the sample point is the pair',
    );
  });
}

// (d) — grip reads the field.
ok('(d) bond formation follows the field, not the knob', () => {
  const restingPair = (sampler, knob) => {
    const session = createDishSession();
    session.wetSampler = sampler;
    const sys = new ParticleSystem();
    sys.init(2, 1000, 700, assets, palette, SEED);
    sys.scale[0] = 1;
    sys.scale[1] = 1;
    place(sys, 0, 400, 350, 0, 0);
    place(sys, 1, 444.5, 350, 0, 0); // parked in the near-touch band (rsum 44 × 1.06)
    stepN(sys, { ...lpFor({ accumulationWetness: knob, particleCount: 2 }), dishSession: session }, 60);
    return sys;
  };
  const wetField = restingPair(() => 0.9, 0);
  assert.ok(
    wetField._dishBonds && wetField._dishBonds.formed.size === 1,
    'knob dry + field wet: sustained grip hardens into a bond',
  );
  const dryField = restingPair(() => 0, 0.9);
  assert.ok(
    !dryField._dishBonds || dryField._dishBonds.formed.size === 0,
    'knob wet + field dry: no grip accrues, no bond forms',
  );
});

// (e) — contacts stamp.
ok('(e) a wet contact records one press per pass at the pair midpoint; a dry field records none', () => {
  // Per-system pass.
  const session = createDishSession();
  session.wetSampler = () => 0.8;
  const sys = new ParticleSystem();
  sys.init(2, 1000, 700, assets, palette, SEED);
  sys.scale[0] = 1;
  sys.scale[1] = 1;
  place(sys, 0, 400, 350, 0.5, 0);
  place(sys, 1, 430, 350, -0.5, 0);
  sys.update({ ...lpFor({ particleCount: 2 }), dishSession: session }, assets, palette, SEED, BAKE_TIME_ORIGIN, null);
  // (The update spawns the authored population beside the placed
  // pair; other seeded pairs may press too — the pin is the placed
  // pair's press, present with the law's shape.)
  const st = session.wetStamps.find((s2) => Math.abs(s2.x - 415) < EPS && Math.abs(s2.y - 350) < EPS);
  assert.ok(st, `the placed pair's press is recorded (${JSON.stringify(session.wetStamps)})`);
  assert.ok(Math.abs(st.amount - 0.35 * 0.8) < EPS, `amount = resting stamp × pair wetness (${st.amount})`);

  // Cross-strata pass, enrolment wetness 0 as the decoy.
  const seam = createDishSession();
  seam.wetSampler = () => 0.8;
  const mk = () => {
    const s2 = new ParticleSystem();
    s2.init(2, 1000, 700, assets, palette, SEED);
    s2.scale[0] = 1;
    s2.scale[1] = 1;
    return s2;
  };
  const a = mk();
  const b = mk();
  place(a, 0, 400, 350, 0, 0);
  place(a, 1, 200, 200, 0, 0);
  place(b, 0, 430, 360, 0, 0);
  place(b, 1, 800, 600, 0, 0);
  const lp = { ...lpFor({ particleCount: 2 }), dishSession: seam };
  for (const [key, sysX] of [
    ['a', a],
    ['b', b],
  ]) {
    enrolDishBody(seam, {
      key,
      sys: sysX,
      radius: 22,
      restitution: 0.85,
      contactMode: 'bounce',
      umask: 0xffffffff,
      organism: false,
      wetness: 0,
      accum: false,
      ecology: false,
      cap: 2,
    });
  }
  armDish(seam, ['a', 'b']);
  a.update(lp, assets, palette, SEED, BAKE_TIME_ORIGIN, null);
  assert.ok(
    seam.wetStamps.some(
      (s2) => Math.abs(s2.x - 415) < EPS && Math.abs(s2.y - 355) < EPS && Math.abs(s2.amount - 0.28) < EPS,
    ),
    `the seam press is on the one list (${JSON.stringify(seam.wetStamps)})`,
  );

  // Dry field: nothing records, either pass.
  const dry = createDishSession();
  dry.wetSampler = () => 0;
  const sysD = new ParticleSystem();
  sysD.init(2, 1000, 700, assets, palette, SEED);
  sysD.scale[0] = 1;
  sysD.scale[1] = 1;
  place(sysD, 0, 400, 350, 0.5, 0);
  place(sysD, 1, 430, 350, -0.5, 0);
  sysD.update({ ...lpFor({ particleCount: 2 }), dishSession: dry }, assets, palette, SEED, BAKE_TIME_ORIGIN, null);
  assert.strictEqual(dry.wetStamps.length, 0, 'a dry contact presses nothing into the field');
});

// (f) — the bake.
{
  const bakeHash = (wetness) => {
    const mkLayer = (key) => ({
      key,
      seed: SEED,
      count: 3,
      layoutParams: lpFor({ accumulationWetness: wetness }),
      activeAssets: assets,
      palette,
      steps: 180,
    });
    // The bake takes the service by injection (the kernel imports
    // no gl): a fresh service per bake, disposed by this caller —
    // the same ownership the live loop has of its own service.
    const svc = createWetFrameService();
    const out = bakeDishParticles({
      layers: [mkLayer('a'), mkLayer('b')],
      canvasW: 1000,
      canvasH: 700,
      steps: 180,
      wetFrame: svc,
    });
    svc.dispose();
    let h = 0x811c9dc5;
    const mix = (byte) => {
      h ^= byte;
      h = Math.imul(h, 0x01000193) >>> 0;
    };
    for (const key of ['a', 'b']) {
      for (const it of out.get(key)) {
        const buf = new Float64Array([it.x, it.y]);
        const u8 = new Uint8Array(buf.buffer);
        for (let i = 0; i < u8.length; i++) mix(u8[i]);
      }
    }
    return h >>> 0;
  };
  ok('(f) the bake: dry golden unchanged; wet golden re-pinned with cause (the injected field)', () => {
    assert.strictEqual(bakeHash(0), 3304663090, 'dry bake: bit-identical to the pre-migration bake');
    assert.strictEqual(bakeHash(0.65), 2527199455, 'wet bake: the field-driven golden (was 212945750 on the knob)');
    assert.strictEqual(bakeHash(0.65), 2527199455, 'and it repeats bit for bit');
  });
}

// (g) — the wire + the end-to-end interleave in miniature.
ok('(g) the shed-line wire carries only degraded/shed; the dish reads what the service served', () => {
  clearWetMode();
  publishWetMode('live', null);
  assert.strictEqual(getWetModeLine(), null, 'live: silence');
  publishWetMode('degraded', 'perfTier1');
  assert.deepStrictEqual(getWetModeLine(), { mode: 'degraded', shed: 'perfTier1' }, 'degraded: the line');
  publishWetMode('shed', 'perfTier1');
  assert.deepStrictEqual(getWetModeLine(), { mode: 'shed', shed: 'perfTier1' }, 'shed: the line');
  publishWetMode('off', null);
  assert.strictEqual(getWetModeLine(), null, 'off: silence');
  clearWetMode();
  assert.strictEqual(getWetModeLine(), null, 'cleared: silence');

  // The interleave: physics reads the standing field; the request
  // steps it. Before any serve the dish's point is dry; after the
  // service serves frames stamped at that point, it reads wet.
  const svc = createWetFrameService();
  const sampler = (x, y) => svc.sampleWet(x, y);
  assert.strictEqual(sampler(500, 350), 0, 'unborn field: dry');
  const resting = [{ layer: 'content-0', key: 'a', x: 500, y: 350, vx: 0, vy: 0 }];
  for (let i = 0; i < 10; i++) {
    svc.frame({
      consumers: { dish: true },
      shed: null,
      degradedOk: true,
      wetness: 0.65,
      freeze: false,
      seed: 970,
      width: 1000,
      height: 700,
      instances: resting,
      behave: 'flock',
      motion: 0.4,
    });
  }
  assert.ok(sampler(500, 350) >= 0.35, `after serving, the dish’s point reads wet (${sampler(500, 350).toFixed(3)})`);
});

console.log(`dishWet.selfcheck: ${n} checks passed`);
