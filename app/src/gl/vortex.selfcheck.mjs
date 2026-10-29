// vortex.selfcheck.mjs — #970 slice 1, CPU vortex-particle core.
// Pairs not monopoles, splat in layer|key order, speed capped at
// SMEAR_MAX_SPEED, freeze holds the last field, seeded ambient, golden hash.
// Does not cover the feed hook (slice 2 hashes the velocity texture).
import assert from 'node:assert';
import { getCostTier } from './costTiers.mjs';
import { SMEAR_MAX_SPEED } from './velocitySmear.mjs';
import {
  accrueEdgeDarkening,
  advectGain,
  createVortex,
  emitAmbient,
  emitFromInstances,
  emitAmbientFrom,
  hashEdgeDarkening,
  hashPacked,
  hashPigment,
  hashVelocity,
  motionAmount,
  noteWetFrame,
  packPigmentDeposited,
  packVelocity,
  stampPigment,
  transferPigment,
  stepVortex,
  wetnessStep,
  EDGE_BAND_HI,
  EDGE_BAND_LO,
  EDGE_DARKEN_CAP,
  EDGE_DARKEN_K,
  PIGMENT_DIFFUSE,
  STAMP_FOOTPRINT_HALF,
  VORTEX_DECAY,
  VORTEX_GAMMA_PER_SPEED,
  VORTEX_GRID,
  VORTEX_JACOBI,
  VORTEX_MAX,
  VORTEX_WET_DRY,
} from './vortex.mjs';
import { mixColorsRgb } from './pigmentKM.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const mark = (layer, key, x, y, vx, vy) => ({ layer, key, x, y, vx, vy });

const SCRIPT = [
  [mark('a', 'o0-s0', 200, 300, 12, -4), mark('b', 'o1-s0', 500, 200, -8, 6)],
  [mark('a', 'o0-s0', 214, 294, 14, -6), mark('b', 'o1-s0', 490, 208, -10, 8)],
  [mark('a', 'o0-s0', 230, 286, 16, -8), mark('b', 'o1-s0', 478, 218, -12, 10)],
  [mark('a', 'o0-s0', 248, 276, 18, -10), mark('b', 'o1-s0', 464, 230, -14, 12)],
];

function runScript(seed = 970) {
  const v = createVortex({ seed, width: 1000, height: 700 });
  for (const frame of SCRIPT) {
    emitFromInstances(v, frame);
    stepVortex(v);
  }
  return v;
}

ok('wetness gate is integer 0 / 1, and dry gain is exactly 0', () => {
  assert.strictEqual(wetnessStep(0), 0);
  assert.strictEqual(wetnessStep(-0.2), 0);
  assert.strictEqual(wetnessStep(Number.NaN), 0);
  assert.strictEqual(wetnessStep(0.0001), 1);
  assert.strictEqual(wetnessStep(1), 1);
  assert.strictEqual(advectGain(0), 0);
  assert.strictEqual(advectGain(-1), 0);
  assert.strictEqual(advectGain(0.4), 0.4);
  assert.strictEqual(advectGain(4), 1);
});

ok('an unstirred step is a zero velocity field', () => {
  const v = createVortex({ seed: 970 });
  stepVortex(v);
  assert.strictEqual(hashVelocity(v), hashVelocity(createVortex({ seed: 1 })));
  assert.strictEqual(v.count, 0);
});

ok('moving marks shed pairs, not monopoles, opposite and equal', () => {
  const v = createVortex({ seed: 970 });
  const emitted = emitFromInstances(v, [mark('a', 'k', 100, 100, 10, 0)]);
  assert.strictEqual(emitted, 2);
  assert.strictEqual(v.count, 2);
  assert.ok(Math.abs(v.vortons[2] + v.vortons[6]) < 1e-9, 'pair gammas cancel');
  assert.ok(Math.abs(Math.abs(v.vortons[2]) - VORTEX_GAMMA_PER_SPEED * 10) < 1e-6);
  // Perpendicular to +x motion, so the pair separates in y.
  assert.strictEqual(v.vortons[0], v.vortons[4]);
  assert.notStrictEqual(v.vortons[1], v.vortons[5]);
});

ok('stationary paint wets the paper and sheds nothing', () => {
  const v = createVortex({ seed: 970 });
  const emitted = emitFromInstances(v, [mark('a', 'k', 400, 300, 0, 0)]);
  assert.strictEqual(emitted, 0);
  assert.strictEqual(v.count, 0);
  let wet = 0;
  for (let i = 0; i < v.wet.length; i++) wet += v.wet[i];
  assert.ok(wet > 0, 'wet mask stamped');
});

ok('emission order is layer|key, independent of input order', () => {
  const items = [mark('b', 'z', 10, 20, 5, 0), mark('a', 'm', 30, 40, 0, 7)];
  const a = createVortex({ seed: 970 });
  const b = createVortex({ seed: 970 });
  emitFromInstances(a, items);
  emitFromInstances(b, [items[1], items[0]]);
  assert.strictEqual(a.count, b.count);
  for (let i = 0; i < a.count * 4; i++) assert.strictEqual(a.vortons[i], b.vortons[i]);
  // 'a|m' at (30, 40) moving +y sorts first; the + pair sits 12 units to its left.
  assert.ok(Math.abs(a.vortons[0] - 18) < 1e-6, `first vorton x ${a.vortons[0]}`);
  assert.ok(Math.abs(a.vortons[1] - 40) < 1e-6, `first vorton y ${a.vortons[1]}`);
});

ok('teleports clamp to SMEAR_MAX_SPEED before the pair is shed', () => {
  const capped = createVortex({ seed: 970 });
  const jumped = createVortex({ seed: 970 });
  emitFromInstances(capped, [mark('a', 'k', 100, 100, SMEAR_MAX_SPEED, 0)]);
  emitFromInstances(jumped, [mark('a', 'k', 100, 100, 10000, 0)]);
  assert.strictEqual(jumped.vortons[2], capped.vortons[2]);
  assert.ok(Math.abs(jumped.vortons[2] - VORTEX_GAMMA_PER_SPEED * SMEAR_MAX_SPEED) < 1e-6);
});

ok('freeze holds velocity, wet mask, and vortons', () => {
  const v = runScript();
  const hash = hashVelocity(v);
  const wet0 = v.wet[100];
  const gamma = v.vortons[2];
  const steps = v.steps;
  stepVortex(v, { freeze: true });
  assert.strictEqual(v.held, true);
  assert.strictEqual(hashVelocity(v), hash);
  assert.strictEqual(v.wet[100], wet0);
  assert.strictEqual(v.vortons[2], gamma);
  assert.strictEqual(v.steps, steps);
});

ok('wet mask dries multiplicatively when the step runs', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 0, 0)]);
  let before = 0;
  for (let i = 0; i < v.wet.length; i++) before += v.wet[i];
  stepVortex(v);
  let after = 0;
  for (let i = 0; i < v.wet.length; i++) after += v.wet[i];
  assert.ok(Math.abs(after - before * VORTEX_WET_DRY) < 1e-4, `dry ${after} vs ${before * VORTEX_WET_DRY}`);
});

ok('wet mask advects downwind instead of fading in place (#998)', () => {
  const v = createVortex({ seed: 970 });
  const inst = [mark('a', 'k', 300, 350, 20, 0)];
  for (let f = 0; f < 10; f++) {
    inst[0].x += 20;
    emitFromInstances(v, inst);
    stepVortex(v, { wetAdvect: 0.6 });
  }
  const comX = () => {
    let m = 0,
      cx = 0;
    for (let j = 0; j < v.n; j++)
      for (let i = 0; i < v.n; i++) {
        const w = v.wet[j * v.n + i];
        m += w;
        cx += w * i;
      }
    return cx / m;
  };
  const x0 = comX();
  let m0 = 0;
  for (let i = 0; i < v.wet.length; i++) m0 += v.wet[i];
  for (let f = 0; f < 60; f++) stepVortex(v, { wetAdvect: 0.6 });
  const x1 = comX();
  let m1 = 0;
  for (let i = 0; i < v.wet.length; i++) m1 += v.wet[i];
  assert.ok(x1 > x0 + 0.1, `mask drifted right: ${x0.toFixed(2)} -> ${x1.toFixed(2)}`);
  assert.ok(m1 < m0, 'mask still dries while it drifts');
});

ok('ambient emission is seeded: same seed matches, different seed does not', () => {
  const a = createVortex({ seed: 7 });
  const b = createVortex({ seed: 7 });
  const c = createVortex({ seed: 8 });
  emitAmbient(a, 3);
  emitAmbient(b, 3);
  emitAmbient(c, 3);
  stepVortex(a);
  stepVortex(b);
  stepVortex(c);
  assert.strictEqual(hashVelocity(a), hashVelocity(b));
  assert.notStrictEqual(hashVelocity(a), hashVelocity(c));
});

ok('golden: four scripted frames at the #1810 constants, seed 970', () => {
  // The constants are Matt's ruling (#1810): 128 grid, 20 Jacobi, cap 4096.
  assert.strictEqual(VORTEX_GRID, 128);
  assert.strictEqual(VORTEX_JACOBI, 20);
  assert.strictEqual(VORTEX_MAX, 4096);
  const a = runScript();
  const b = runScript();
  assert.strictEqual(a.steps, 4);
  assert.strictEqual(hashVelocity(a), hashVelocity(b));
  // Re-pinned from 3932816161 (64/30) by the resolution change itself; the
  // field-statistics case below is the character evidence for the re-pin.
  assert.strictEqual(hashVelocity(a), 2493009798);
});

ok('a stirred field is not zero, and a step stays inside a loose budget', () => {
  const v = runScript();
  assert.notStrictEqual(hashVelocity(v), hashVelocity(createVortex({ seed: 970 })));
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) stepVortex(v);
  const per = (performance.now() - t0) / 30;
  // Loose sandbox bound, not the cost gate: this script is pigment-absent
  // (the #1810 path, measured 2.66–2.72 ms/step on this class of VM; the
  // registered gate below is the pigment-LIVE figure since #1811). 6 ms
  // catches an order-of-magnitude regression (a 256 grid, a doubled
  // Jacobi) without flaking on shared-machine load.
  console.log(`    step ${per.toFixed(3)} ms (pigment-absent path; registered gate is the live 6.6, fail above 6)`);
  assert.ok(per < 6, `step ${per.toFixed(3)} ms exceeds the loose budget`);
});

ok('cost tier is 1, and the registered step cost is the measured one', () => {
  const d = getCostTier('gl/vortex');
  assert.ok(d, 'gl/vortex registered');
  assert.strictEqual(d.tier, 1);
  // Was 0.5 by the module's own admission ("the selfcheck budget, not a
  // measured fact"). #1810 measured the step and registered 2.7 (the
  // filled-cap figure). #1811 re-measured on the pigment build and
  // registered the pigment-LIVE step — the sim's worst case, same
  // convention (two sandbox runs, medians 6.93 / 6.28 ms; the
  // pigment-absent path still measures ~2.1–2.7). Moving this pin
  // requires a new measurement, not a new opinion (docs/review/1811/).
  // #1876 measured its A/B on the same bench in one sandbox session
  // (base 3.53–3.73 ms vs this build 3.98 ms scale-less tinted, 3.84–
  // 4.31 ms scaled; pigment-absent unchanged) — a +0.3–0.5 ms delta of
  // the same size #1812 recorded inside this figure, so the pin stands
  // (docs/review/1876/).
  assert.strictEqual(d.timeMs, 6.6);
  // The full state ledger: 9 grid planes + 3 pigment RGBA arrays +
  // vorton ring and scratch. The #1810 formula (5 planes + ring)
  // omitted the wet pair and the scratch; #1811 counts what the state
  // actually allocates; #1812 adds the edge-accrual plane and its
  // wet-snapshot scratch (docs/review/1812/); #1876 adds the
  // worked-film byte plane (docs/review/1876/).
  assert.strictEqual(d.memoryBytes, 128 * 128 * 4 * 9 + 128 * 128 * 16 * 3 + 4096 * 16 * 2 + 128 * 128);
});

ok('field character at 128/20 matches the 64/30 field on the same scripted input (#1810)', () => {
  // The issue's equivalence evidence: the same scripted session run on the
  // old constants (measured on the parent branch, sandbox, 2026-10-28 —
  // full tables in docs/review/1810/) vs this run at the new constants.
  // The session never saturates either vorton cap (720 emitted), so the
  // comparison isolates grid + iterations.
  const REF64 = {
    meanSpeed: 1.415098,
    p95Speed: 6.372211,
    maxSpeed: 33.790241,
    intAbsOmega: 0.086797,
    totalWet: 103.27813,
  };
  const inst = (i) => [
    { layer: 'content-0', key: 'a', x: 100 + ((i * 7) % 800), y: 200 + (i % 5) * 3, vx: 30, vy: 5 },
    { layer: 'content-0', key: 'b', x: 500 - ((i * 3) % 400), y: 400, vx: -12, vy: 20 },
    { layer: 'content-1', key: 'c', x: 700, y: 150 + ((i * 2) % 500), vx: 0, vy: 0 },
    { layer: 'content-1', key: 'd', x: 200 + ((i * 11) % 600), y: 550 - (i % 7) * 9, vx: 22, vy: -14 },
  ];
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  for (let i = 0; i < 120; i++) {
    emitFromInstances(v, inst(i));
    stepVortex(v, { wetAdvect: 0.6 });
  }
  assert.strictEqual(v.count, 720, 'same session: same emitted vortons');
  const cells = v.n * v.n;
  const cellArea = (v.width / (v.n - 1)) * (v.height / (v.n - 1));
  let sumSpeed = 0,
    sumAbsOmega = 0,
    totalWet = 0,
    maxSpeed = 0;
  const speeds = new Float32Array(cells);
  for (let i = 0; i < cells; i++) {
    const s = Math.hypot(v.vx[i], v.vy[i]);
    speeds[i] = s;
    sumSpeed += s;
    if (s > maxSpeed) maxSpeed = s;
    sumAbsOmega += Math.abs(v.omega[i]);
    totalWet += v.wet[i];
  }
  const sorted = Float32Array.from(speeds).sort();
  const got = {
    meanSpeed: sumSpeed / cells,
    p95Speed: sorted[Math.floor(0.95 * cells)],
    maxSpeed,
    intAbsOmega: (sumAbsOmega * cellArea) / (v.width * v.height),
    totalWet,
  };
  // Bands are ≈1.5× the deviation measured for this change, each with its
  // physical reason — they pin character, not bytes:
  // - meanSpeed down (measured 0.66×): 20 damped-Jacobi iterations transport
  //   the low-frequency modes less far on a finer grid — the accepted trade
  //   the issue's research names ("finer structure instead of redundant
  //   convergence"). p95 falls less (0.85×) for the same reason.
  // - maxSpeed / ∫|ω| up (1.36× / 1.16×): near-vorton gradients the 64 splat
  //   smeared over 4× the area now resolve.
  // - totalWet conserved (1.05×): a stamp deposits the same mass at any
  //   grid; it concentrates in ¼ the area, so per-cell means and threshold
  //   coverage drop ~4× BY RESOLUTION — the sum is the invariant to pin.
  const BANDS = {
    meanSpeed: [0.55, 1.05],
    p95Speed: [0.7, 1.1],
    maxSpeed: [0.8, 1.6],
    intAbsOmega: [0.75, 1.25],
    totalWet: [0.9, 1.1],
  };
  for (const k of Object.keys(BANDS)) {
    const [lo, hi] = BANDS[k];
    assert.ok(
      got[k] >= REF64[k] * lo && got[k] <= REF64[k] * hi,
      `${k}: ${got[k].toFixed(4)} outside [${(REF64[k] * lo).toFixed(4)}, ${(REF64[k] * hi).toFixed(4)}] (64-grid ref ${REF64[k]})`,
    );
  }
});

ok('vortons decay, so a held pair does not live forever', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 10, 0)]);
  const g0 = Math.abs(v.vortons[2]);
  stepVortex(v);
  assert.ok(Math.abs(v.vortons[2]) < g0, 'gamma decayed');
  assert.ok(Math.abs(Math.abs(v.vortons[2]) - g0 * VORTEX_DECAY) < 1e-3);
});

ok('packed velocity hash is stable, and freeze does not zero it', () => {
  const slot = {};
  const inst = [mark('a', 'k', 200, 300, 12, -4)];
  const a = noteWetFrame(slot, { wetness: 0.6, freeze: false, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(a.wetStep, 1);
  assert.ok(a.wetGain > 0);
  const h = hashPacked(a.wetVel);
  const held = noteWetFrame(slot, { wetness: 0.6, freeze: true, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(hashPacked(held.wetVel), h);
  const dry = noteWetFrame(slot, { wetness: 0, freeze: false, seed: 970, width: 1000, height: 700, instances: inst });
  assert.strictEqual(dry.wetStep, 0);
  assert.strictEqual(dry.wetGain, 0);
  assert.strictEqual(dry.wetVel, null);
  const again = noteWetFrame(slot, {
    wetness: 0.6,
    freeze: true,
    seed: 970,
    width: 1000,
    height: 700,
    instances: inst,
  });
  assert.strictEqual(hashPacked(again.wetVel), h, 'dry frame must not drop the held field');
});

ok('packed texture is not the zero texture after a moving mark', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [mark('a', 'k', 400, 300, 16, 0)]);
  stepVortex(v);
  const packed = packVelocity(v);
  assert.notStrictEqual(hashPacked(packed), hashPacked(packVelocity(createVortex({ seed: 970 }))));
});

ok('ambient behave is seeded and changes the field', () => {
  const a = createVortex({ seed: 11, width: 200, height: 140 });
  const b = createVortex({ seed: 11, width: 200, height: 140 });
  const c = createVortex({ seed: 11, width: 200, height: 140 });
  emitAmbientFrom(a, { behave: 'orbit', motion: 0.2 });
  emitAmbientFrom(b, { behave: 'orbit', motion: 0.2 });
  emitAmbientFrom(c, { behave: 'scatter', motion: 0.2 });
  assert.strictEqual(a.count, b.count);
  for (let i = 0; i < a.count * 4; i++) assert.strictEqual(a.vortons[i], b.vortons[i]);
  assert.notStrictEqual(a.vortons[0], c.vortons[0]);
  assert.ok(a.count >= 4, 'orbit sheds pairs');
});

ok('motion amount reads wind, breath, and flap', () => {
  assert.strictEqual(motionAmount({}), 0);
  assert.strictEqual(motionAmount({ wind: 3 }), 1);
  assert.strictEqual(motionAmount({ breath: 0.4, flap: 0.2 }), 0.4);
});

ok('noteWetFrame seeds ambient from behave without dropping the dry gate', () => {
  const slot = {};
  const wet = noteWetFrame(slot, {
    wetness: 0.8,
    freeze: false,
    seed: 11,
    width: 200,
    height: 140,
    instances: [],
    behave: 'orbit',
    motion: 0.8,
  });
  assert.strictEqual(wet.wetStep, 1);
  assert.ok(slot.vortex.count >= 4, 'ambient pairs landed');
  const dry = noteWetFrame(slot, { wetness: 0, freeze: false, seed: 11, width: 200, height: 140, instances: [] });
  assert.strictEqual(dry.wetStep, 0);
  assert.strictEqual(dry.wetGain, 0);
});

ok('#1811 pigment absent: a session without coloured marks leaves both compartments zero', () => {
  const v = runScript(); // SCRIPT's marks carry no tint/rgb
  assert.strictEqual(v.pigmentLive, false);
  for (let i = 0; i < v.pigS.length; i++) {
    assert.strictEqual(v.pigS[i], 0);
    assert.strictEqual(v.pigD[i], 0);
  }
  // And the frame publication stays in the absent shape.
  const slot = {};
  const out = noteWetFrame(slot, {
    wetness: 0.6,
    freeze: false,
    seed: 970,
    width: 1000,
    height: 700,
    instances: [mark('a', 'k', 200, 300, 12, -4)],
  });
  assert.strictEqual(out.pigStep, 0);
  assert.strictEqual(out.pigDep, null);
});

const pigTotals = (v) => {
  let s = 0,
    d = 0;
  for (let k = 0; k < v.n * v.n; k++) {
    s += v.pigS[k * 4 + 3];
    d += v.pigD[k * 4 + 3];
  }
  return [s, d];
};
const pigCentroid = (v, arr) => {
  let m = 0,
    cx = 0,
    cy = 0;
  for (let j = 0; j < v.n; j++)
    for (let i = 0; i < v.n; i++) {
      const w = arr[(j * v.n + i) * 4 + 3];
      m += w;
      cx += w * i;
      cy += w * j;
    }
  return [cx / m, cy / m, m];
};
const PIG_BLUE = [0.1, 0.25, 0.85];
const PIG_YELLOW = [0.95, 0.8, 0.1];

ok('#1811 coloured marks stamp suspended pigment of their colour (rgb and tint forms)', () => {
  const v = createVortex({ seed: 970 });
  emitFromInstances(v, [{ layer: 'a', key: 'k', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE }]);
  const gi = Math.round(0.5 * (v.n - 1));
  const o = (gi * v.n + gi) * 4;
  assert.ok(v.pigmentLive);
  assert.ok(v.pigS[o + 3] > 0, 'suspended density landed');
  assert.ok(Math.abs(v.pigS[o] / v.pigS[o + 3] - PIG_BLUE[0]) < 0.02, 'cell colour is the stamped colour');
  const w = createVortex({ seed: 970 });
  emitFromInstances(w, [{ layer: 'a', key: 'k', x: 500, y: 350, vx: 0, vy: 0, tint: '#1947d6' }]);
  assert.ok(w.pigS[o + 3] > 0, 'tint hex stamps too');
  assert.ok(Math.abs(w.pigS[o + 2] / w.pigS[o + 3] - 0xd6 / 255) < 0.02, 'tint parsed to its colour');
  const u = createVortex({ seed: 970 });
  emitFromInstances(u, [{ layer: 'a', key: 'k', x: 500, y: 350, vx: 0, vy: 0, tint: 'not-a-colour' }]);
  assert.strictEqual(u.pigmentLive, false, 'unparseable tint stamps water only');
});

ok('#1811 field mixture is Kubelka-Munk: a blue + yellow overlap deposits green', () => {
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  const marks = [
    { layer: 'a', key: 'b', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE },
    { layer: 'a', key: 'y', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_YELLOW },
  ];
  for (let f = 0; f < 40; f++) {
    emitFromInstances(v, marks);
    stepVortex(v);
  }
  for (let f = 0; f < 300; f++) stepVortex(v);
  const gi = Math.round(0.5 * (v.n - 1));
  const o = (gi * v.n + gi) * 4;
  const tot = v.pigD[o + 3];
  assert.ok(tot > 0.5, `pigment deposited (${tot.toFixed(2)})`);
  const col = [v.pigD[o] / tot, v.pigD[o + 1] / tot, v.pigD[o + 2] / tot];
  // Measured (docs/review/1811/): the deposited colour is (0.167, 0.532,
  // 0.241) — the KM module's green — where density-averaging the two
  // colours would store their greyish mean (0.525, 0.525, 0.475).
  assert.ok(col[1] > col[0] + 0.25, `deposited green dominates red (${col.map((x) => x.toFixed(3))})`);
  assert.ok(col[1] > col[2] + 0.2, `deposited green dominates blue (${col.map((x) => x.toFixed(3))})`);
});

ok('#1811 transfer conserves total pigment; settling is one-way to the deposit', () => {
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  stampPigment(v, 500, 350, PIG_BLUE, 2.0);
  const [s0, d0] = pigTotals(v);
  assert.ok(s0 > 0 && d0 === 0);
  for (let f = 0; f < 600; f++) stepVortex(v);
  const [s1, d1] = pigTotals(v);
  // No flow, no new stamps: the total moves only by float rounding
  // (measured drift 2e-5 % — docs/review/1811/); the transfer itself
  // conserves by construction (both moves computed from start values).
  assert.ok(Math.abs(s1 + d1 - (s0 + d0)) / (s0 + d0) < 0.001, `total conserved (${s0 + d0} -> ${s1 + d1})`);
  assert.ok(d1 > 0.99 * (s0 + d0), 'essentially everything settled in 600 steps');
  assert.ok(s1 < 0.01 * (s0 + d0), 'suspension emptied into the deposit');
});

ok('#1811 deposited never moves laterally; suspended rides the flow', () => {
  // Deposit at (150, 150), settle unstirred, then stir hard at the far
  // corner (800, 550) for 600 steps with tintless movers.
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  const dep = [{ layer: 'a', key: 'd', x: 150, y: 150, vx: 0, vy: 0, rgb: PIG_BLUE }];
  for (let f = 0; f < 30; f++) {
    emitFromInstances(v, dep);
    stepVortex(v);
  }
  for (let f = 0; f < 200; f++) stepVortex(v);
  const c0 = pigCentroid(v, v.pigD);
  for (let f = 0; f < 600; f++) {
    const a = f * 0.05;
    emitFromInstances(v, [
      {
        layer: 'b',
        key: 'm0',
        x: 800 + 60 * Math.cos(a),
        y: 550 + 60 * Math.sin(a),
        vx: -180 * Math.sin(a),
        vy: 180 * Math.cos(a),
      },
      {
        layer: 'b',
        key: 'm1',
        x: 800 + 60 * Math.cos(a + 3),
        y: 550 + 60 * Math.sin(a + 3),
        vx: -180 * Math.sin(a + 3),
        vy: 180 * Math.cos(a + 3),
      },
    ]);
    stepVortex(v, { wetAdvect: 0.6 });
  }
  const c1 = pigCentroid(v, v.pigD);
  const drift = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  // Measured drift 0.005 cells (docs/review/1811/): what little moves is
  // lift-and-resettle beside the deposit under advected moisture, not
  // lateral transport — deposited has no advection path at all.
  assert.ok(drift < 0.5, `deposited centroid stationary (${drift.toFixed(3)} cells over 600 stirred steps)`);
  // The other half: a suspended burst in an established vortex travels.
  const burst = (stir) => {
    const w = createVortex({ seed: 970, width: 1000, height: 700 });
    const movers = (f) => {
      const a = f * 0.05;
      return [
        {
          layer: 'b',
          key: 'm',
          x: 500 + 120 * Math.cos(a),
          y: 350 + 120 * Math.sin(a),
          vx: -360 * Math.sin(a),
          vy: 360 * Math.cos(a),
        },
        {
          layer: 'b',
          key: 'n',
          x: 500 + 120 * Math.cos(a + 3),
          y: 350 + 120 * Math.sin(a + 3),
          vx: -360 * Math.sin(a + 3),
          vy: 360 * Math.cos(a + 3),
        },
      ];
    };
    for (let f = 0; f < 60; f++) {
      if (stir) emitFromInstances(w, movers(f));
      stepVortex(w, { wetAdvect: 0.6 });
    }
    stampPigment(w, 620, 350, PIG_BLUE, 3);
    const b0 = pigCentroid(w, w.pigS);
    for (let f = 60; f < 100; f++) {
      if (stir) emitFromInstances(w, movers(f));
      stepVortex(w, { wetAdvect: 0.6 });
    }
    const b1 = pigCentroid(w, w.pigS);
    return Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
  };
  // Measured: control 0.011 cells (settling only), stirred 12.8 cells.
  assert.ok(burst(false) < 0.5, 'unstirred burst stays put');
  assert.ok(burst(true) > 5, 'stirred burst rides the flow');
});

ok('#1811 lift: fresh water pulls deposited pigment back into suspension', () => {
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  const dep = [{ layer: 'a', key: 'd', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE }];
  for (let f = 0; f < 30; f++) {
    emitFromInstances(v, dep);
    stepVortex(v);
  }
  for (let f = 0; f < 200; f++) stepVortex(v);
  const [, dBefore] = pigTotals(v);
  // Rewet hard with a tintless (pure water) stationary mark on the deposit.
  const water = [{ layer: 'a', key: 'w', x: 500, y: 350, vx: 0, vy: 0 }];
  for (let f = 0; f < 120; f++) {
    emitFromInstances(v, water);
    stepVortex(v);
  }
  const [sAfter, dAfter] = pigTotals(v);
  // Measured: deposited 5.54 -> 2.67 (docs/review/1811/) — lift at
  // wet ~0.99 overcomes resettling; some lifted pigment resettles, which
  // is why the bound is a ratio, not the full lift rate.
  assert.ok(dAfter < 0.7 * dBefore, `deposit lifted (${dBefore.toFixed(2)} -> ${dAfter.toFixed(2)})`);
  assert.ok(sAfter > 0.3, 'lifted pigment is back in suspension');
});

ok('#1811 freeze holds pigment; identical tinted sessions hash identical compartments', () => {
  const session = () => {
    const v = createVortex({ seed: 970, width: 1000, height: 700 });
    for (let f = 0; f < 60; f++) {
      emitFromInstances(v, [
        { layer: 'a', key: 'a', x: 200 + f * 5, y: 300, vx: 30, vy: 5, tint: '#1a4fd6' },
        { layer: 'a', key: 'b', x: 700 - f * 4, y: 420, vx: -20, vy: 10, tint: '#e8c832' },
      ]);
      stepVortex(v, { wetAdvect: 0.6 });
    }
    return v;
  };
  const a = session();
  const b = session();
  assert.strictEqual(hashPigment(a), hashPigment(b), 'two runs, one field (the warm-up determinism)');
  const held = hashPigment(a);
  stepVortex(a, { freeze: true });
  assert.strictEqual(hashPigment(a), held, 'freeze holds the compartments');
});

ok('#1811 deposited pack: bare paper where nothing settled, KM reflectance where it did', () => {
  const empty = packPigmentDeposited(createVortex({ seed: 970 }));
  for (let k = 0; k < empty.n * empty.n; k++) {
    assert.strictEqual(empty.rgba[k * 4], 255);
    assert.strictEqual(empty.rgba[k * 4 + 3], 0);
  }
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  const marks = [
    { layer: 'a', key: 'b', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE },
    { layer: 'a', key: 'y', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_YELLOW },
  ];
  for (let f = 0; f < 40; f++) {
    emitFromInstances(v, marks);
    stepVortex(v);
  }
  for (let f = 0; f < 300; f++) stepVortex(v);
  const pack = packPigmentDeposited(v);
  const gi = Math.round(0.5 * (v.n - 1));
  const o = (gi * v.n + gi) * 4;
  // Measured pack at the overlap: (43, 136, 62) — the KM reflectance of
  // the green deposit; bare-paper cells stay 255.
  assert.ok(pack.rgba[o + 3] > 0, 'density published');
  assert.ok(
    pack.rgba[o + 1] > pack.rgba[o] + 40,
    `reflectance is the green's (${pack.rgba[o]}, ${pack.rgba[o + 1]}, ${pack.rgba[o + 2]})`,
  );
  assert.strictEqual(pack.rgba[0], 255, 'far corner is bare paper');
});

// ---- #1812: edge darkening on drying ------------------------------------
// A scripted single wash: a disc of blue, radius 6 cells at the field's
// centre, stamped wet (wetness 1) and settled by direct transfer (the
// fluid never steps during settling, so the deposit is clean and the
// wetness still stands at 1 when the dry begins).
const WASH = { cx: 64, cy: 64, r: 6 };
function makeWash() {
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  const { cx, cy, r } = WASH;
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      const dx = i - cx,
        dy = j - cy;
      if (dx * dx + dy * dy > r * r) continue;
      stampPigment(v, (i / (v.n - 1)) * v.width, (j / (v.n - 1)) * v.height, PIG_BLUE, 1.0);
      v.wet[j * v.n + i] = 1;
    }
  }
  for (let s = 0; s < 400; s++) transferPigment(v);
  return v;
}
function dryWash(v) {
  // Step with no new water until the whole field is below the damp band.
  for (let s = 0; s < 700; s++) {
    stepVortex(v);
    let m = 0;
    for (let k = 0; k < v.n * v.n; k++) if (v.wet[k] > m) m = v.wet[k];
    if (m < EDGE_BAND_LO - 0.01) break;
  }
}
function rewetWash(v) {
  const { cx, cy, r } = WASH;
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      const dx = i - cx,
        dy = j - cy;
      if (dx * dx + dy * dy <= r * r) v.wet[j * v.n + i] = 1;
    }
  }
}
const washCell = (v, i, j) => j * v.n + i;
const rimK = (v) => washCell(v, WASH.cx + WASH.r, WASH.cy);
const centreK = (v) => washCell(v, WASH.cx, WASH.cy);

ok('#1812 a wash dried once darkens at its rim, not its centre (the signature)', () => {
  const v = makeWash();
  dryWash(v);
  const rim = rimK(v),
    centre = centreK(v);
  const rimEdge = v.pigEdge[rim];
  const centreEdge = v.pigEdge[centre];
  // Measured (docs/review/1812/): rim accrues 0.596 (≈ K · the rim's
  // density cliff 0.44), the centre — flat interior, gradient ≈ 0 —
  // accrues 0.008. Displayed density = deposited × (1 + accrued).
  assert.ok(rimEdge > 0.4 && rimEdge < 0.8, `rim accrued ${rimEdge.toFixed(3)}`);
  assert.ok(centreEdge < 0.02, `centre accrued ${centreEdge.toFixed(4)} — the interior must not darken`);
  const rimDisp = v.pigD[rim * 4 + 3] * (1 + rimEdge);
  const centreDisp = v.pigD[centre * 4 + 3] * (1 + centreEdge);
  const ratio = rimDisp / centreDisp;
  assert.ok(ratio >= 1.45, `edge-to-centre displayed density ratio ${ratio.toFixed(2)} (expectation ~1.5–2×)`);
  // The pack carries it: rim reflectance is darker than the same
  // deposit packed with the accrual zeroed; the centre is untouched
  // within a byte.
  const pack = packPigmentDeposited(v);
  const saved = Float32Array.from(v.pigEdge);
  v.pigEdge.fill(0);
  const ctrl = packPigmentDeposited(v);
  v.pigEdge.set(saved);
  const lum = (p, k) => p.rgba[k * 4] + p.rgba[k * 4 + 1] + p.rgba[k * 4 + 2];
  assert.ok(lum(ctrl, rim) - lum(pack, rim) >= 10, `rim pack darkened (${lum(ctrl, rim)} -> ${lum(pack, rim)})`);
  // Centre bytes: rgb within a byte; alpha within two — the centre's
  // own ≤2% density excess (asserted above) crosses one extra byte
  // boundary only because this wash's density (0.99) sits hard against
  // the alpha clamp. The centre pin that carries weight is centreEdge.
  for (let ch = 0; ch < 4; ch++) {
    const tol = ch === 3 ? 2 : 1;
    assert.ok(
      Math.abs(pack.rgba[centre * 4 + ch] - ctrl.rgba[centre * 4 + ch]) <= tol,
      `centre pack byte ${ch} moved (${ctrl.rgba[centre * 4 + ch]} -> ${pack.rgba[centre * 4 + ch]})`,
    );
  }
});

ok('#1812 kept wet, the same wash does not darken (the gate, not an assumption)', () => {
  const v = makeWash();
  // Hold the wash soaked — wetness restored above the band before every
  // step, for longer than the dry in the signature case takes.
  for (let s = 0; s < 300; s++) {
    rewetWash(v);
    stepVortex(v);
  }
  let sum = 0;
  for (let k = 0; k < v.n * v.n; k++) sum += v.pigEdge[k];
  assert.strictEqual(sum, 0, 'no drying through the band, no darkening');
  // Unit level, the rest of the gate: level-in-band, rising, and
  // falls that never enter the band all accrue nothing.
  const u = makeWash();
  const rim = rimK(u);
  const before = Float32Array.from(u.pigEdge);
  const drive = (prevVal, curVal) => {
    const prev = Float32Array.from(u.wet);
    for (let k = 0; k < u.n * u.n; k++) {
      prev[k] = prevVal;
      u.wet[k] = curVal;
    }
    accrueEdgeDarkening(u, prev);
  };
  drive(0.2, 0.2); // level inside the band
  drive(0.1, 0.3); // rising through the band
  drive(0.9, 0.5); // falling, but never enters the band
  drive(0.04, 0.01); // falling, already below the band
  assert.strictEqual(u.pigEdge[rim], before[rim], 'no gate passage, no accrual');
  drive(EDGE_BAND_HI + 0.05, EDGE_BAND_LO - 0.01); // one full-band fall
  const full = u.pigEdge[rim];
  // Exactly K · |∇d| at the rim cell, the gradient read off the deposit
  // itself (this wash settled by transfer alone, so its rim is softer
  // than the dried wash's — the formula, not the wash, is what's pinned).
  const depAt = (i, j) => u.pigD[(j * u.n + i) * 4 + 3];
  const gx = (depAt(WASH.cx + WASH.r + 1, WASH.cy) - depAt(WASH.cx + WASH.r - 1, WASH.cy)) * 0.5;
  const gy = (depAt(WASH.cx + WASH.r, WASH.cy + 1) - depAt(WASH.cx + WASH.r, WASH.cy - 1)) * 0.5;
  const expect = EDGE_DARKEN_K * Math.hypot(gx, gy);
  assert.ok(
    Math.abs(full - expect) < 0.02,
    `a full-band dry accrues K·|∇d| (${full.toFixed(3)} vs ${expect.toFixed(3)})`,
  );
});

ok('#1812 rewet cycles darken again, and the accrued value never passes the cap', () => {
  const v = makeWash();
  const rim = rimK(v);
  dryWash(v);
  const e1 = v.pigEdge[rim];
  assert.ok(e1 > 0.4, `first dry accrued (${e1.toFixed(3)})`);
  rewetWash(v);
  dryWash(v);
  const e2 = v.pigEdge[rim];
  assert.ok(e2 > e1 + 0.3, `second dry added darkening (${e1.toFixed(3)} -> ${e2.toFixed(3)})`);
  // Three more full-band falls driven directly at the accrual: the
  // value climbs to the cap and stops there, never above it.
  for (let c = 0; c < 3; c++) {
    const prev = Float32Array.from(v.wet);
    for (let k = 0; k < v.n * v.n; k++) {
      prev[k] = EDGE_BAND_HI + 0.05;
      v.wet[k] = EDGE_BAND_LO - 0.01;
    }
    accrueEdgeDarkening(v, prev);
    assert.ok(v.pigEdge[rim] <= EDGE_DARKEN_CAP, `cycle ${c + 3}: rim within cap (${v.pigEdge[rim]})`);
  }
  assert.strictEqual(v.pigEdge[rim], EDGE_DARKEN_CAP, 'five cycles land exactly on the cap');
  for (let k = 0; k < v.n * v.n; k++) assert.ok(v.pigEdge[k] <= EDGE_DARKEN_CAP, 'no cell above the cap');
});

ok('#1812 pigment that never wets never darkens — the pack stays the #1811 pack', () => {
  const v = createVortex({ seed: 970, width: 1000, height: 700 });
  stampPigment(v, 500, 350, PIG_BLUE, 2.0);
  for (let s = 0; s < 400; s++) transferPigment(v);
  for (let s = 0; s < 50; s++) stepVortex(v); // steps run; the field was never wet
  let sum = 0;
  for (let k = 0; k < v.n * v.n; k++) sum += v.pigEdge[k];
  assert.strictEqual(sum, 0, 'dry-from-birth: nothing accrued');
  // Byte-exact against the pre-#1812 formula, computed directly.
  const pack = packPigmentDeposited(v);
  const gi = Math.round(0.5 * (v.n - 1));
  const o = (gi * v.n + gi) * 4;
  const tot = v.pigD[o + 3];
  assert.ok(tot > 0, 'deposit present');
  const refl = mixColorsRgb([{ rgb: [v.pigD[o] / tot, v.pigD[o + 1] / tot, v.pigD[o + 2] / tot], c: tot }]);
  const byte = (t) => Math.max(0, Math.min(255, Math.round(t * 255)));
  assert.strictEqual(pack.rgba[o], byte(refl[0]));
  assert.strictEqual(pack.rgba[o + 1], byte(refl[1]));
  assert.strictEqual(pack.rgba[o + 2], byte(refl[2]));
  assert.strictEqual(pack.rgba[o + 3], byte(Math.min(1, tot)));
});

ok('#1812 identical drying sessions accrue identically; freeze accrues nothing', () => {
  const session = () => {
    const v = makeWash();
    dryWash(v);
    return v;
  };
  const a = session();
  const b = session();
  assert.strictEqual(hashEdgeDarkening(a), hashEdgeDarkening(b), 'two runs, one accrual (the warm-up determinism)');
  assert.deepStrictEqual(packPigmentDeposited(a).rgba, packPigmentDeposited(b).rgba, 'packs byte-identical');
  const held = hashEdgeDarkening(a);
  stepVortex(a, { freeze: true });
  assert.strictEqual(hashEdgeDarkening(a), held, 'a held frame does not dry, so it does not darken');
});

ok('#1812 the recipe constants are the pinned ones', () => {
  assert.strictEqual(EDGE_DARKEN_K, 1.35);
  assert.strictEqual(EDGE_DARKEN_CAP, 2);
  assert.strictEqual(EDGE_BAND_LO, 0.05);
  assert.strictEqual(EDGE_BAND_HI, 0.35);
});

// ---- #1876: footprint stamps + suspended diffusion -----------------------
// The grid-dots fix. A mark stamps over the quad it draws (scaled by
// instance scale), conserving the stamp's load; suspended pigment
// diffuses inside the worked film, so a wash forms at rest. Measured
// behaviour in docs/review/1876/.

ok('#1876 a footprint stamp delivers the point stamp load, spread over the quad', () => {
  const oneEmit = (extra) => {
    const v = createVortex({ seed: 970, width: 1000, height: 700 });
    emitFromInstances(v, [{ layer: 'a', key: 'm', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE, ...extra }]);
    return v;
  };
  const point = oneEmit({});
  const foot = oneEmit({ scaleX: 0.26, scaleY: 0.26, rotation: 0 });
  const [pTot] = pigTotals(point);
  const [fTot] = pigTotals(foot);
  // Conservation is the normalisation: same suspended total to float
  // tolerance (measured identical to ~1e-7 relative).
  assert.ok(Math.abs(fTot - pTot) <= 1e-6 * pTot, `footprint load ${fTot} vs point load ${pTot}`);
  const support = (v) => {
    let cells = 0,
      peak = 0;
    for (let k = 0; k < v.n * v.n; k++) {
      const a = v.pigS[k * 4 + 3];
      if (a > 1e-9) cells++;
      if (a > peak) peak = a;
    }
    return { cells, peak };
  };
  const ps = support(point),
    fs = support(foot);
  assert.ok(ps.cells <= 4, `point stamp touches ${ps.cells} cells`);
  assert.ok(fs.cells >= 40, `footprint stamp touches ${fs.cells} cells (the quad at scale 0.26)`);
  assert.ok(fs.peak < ps.peak / 4, `footprint peak ${fs.peak.toFixed(4)} vs point peak ${ps.peak.toFixed(4)} — spread, not stacked`);
  // Water conserves the same way: the summed mask add of one emit
  // matches (neither emit saturates a cell from dry at this amount).
  const wetSum = (v) => v.wet.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(wetSum(foot) - wetSum(point)) < 1e-6, 'footprint water total = point water total');
});

ok('#1876 the footprint is the drawn quad: anisotropic scale, rotation turns it', () => {
  const bbox = (extra) => {
    const v = createVortex({ seed: 970, width: 1000, height: 700 });
    emitFromInstances(v, [{ layer: 'a', key: 'm', x: 500, y: 350, vx: 0, vy: 0, rgb: PIG_BLUE, ...extra }]);
    let i0 = 1e9,
      j0 = 1e9,
      i1 = -1,
      j1 = -1;
    for (let j = 0; j < v.n; j++)
      for (let i = 0; i < v.n; i++)
        if (v.pigS[(j * v.n + i) * 4 + 3] > 1e-9) {
          if (i < i0) i0 = i;
          if (j < j0) j0 = j;
          if (i > i1) i1 = i;
          if (j > j1) j1 = j;
        }
    return { w: i1 - i0 + 1, h: j1 - j0 + 1 };
  };
  // scaleX 0.5 → ±49.9 scene units; scaleY 0.13 → ±13 units. In cells
  // the axes differ (h = 7.87, hy = 5.51): ±49.9 units spans ~13 cells
  // in x but ~18 in y. Rotation 90° (clockwise, the contract's
  // convention) turns the long axis from x to y.
  const wide = bbox({ scaleX: 0.5, scaleY: 0.13, rotation: 0 });
  const tall = bbox({ scaleX: 0.5, scaleY: 0.13, rotation: 90 });
  assert.ok(wide.w >= 11 && wide.w <= 15, `wide footprint width ${wide.w} cells`);
  assert.ok(wide.h >= 4 && wide.h <= 7, `wide footprint height ${wide.h} cells`);
  assert.ok(Math.abs(tall.w - wide.h) <= 1, `rotated width ${tall.w} vs unrotated height ${wide.h}`);
  assert.ok(tall.h >= 17 && tall.h <= 19, `rotated height ${tall.h} cells — the long axis now spans y's finer cells`);
});

ok('#1876 suspended diffusion spreads the worked film, conserves pigment, and strands a drying film', () => {
  const spread = (water, frames) => {
    const v = createVortex({ seed: 970, width: 1000, height: 700 });
    stampPigment(v, 500, 350, PIG_BLUE, 2.0);
    const wmark = [{ layer: 'a', key: 'w', x: 500, y: 350, vx: 0, vy: 0 }];
    for (let f = 0; f < frames; f++) {
      if (water) emitFromInstances(v, wmark);
      stepVortex(v);
    }
    let tot = 0,
      mx = 0,
      my = 0;
    for (let j = 0; j < v.n; j++)
      for (let i = 0; i < v.n; i++) {
        const a = v.pigS[(j * v.n + i) * 4 + 3] + v.pigD[(j * v.n + i) * 4 + 3];
        tot += a;
        mx += a * i;
        my += a * j;
      }
    mx /= tot;
    my /= tot;
    let varr = 0;
    for (let j = 0; j < v.n; j++)
      for (let i = 0; i < v.n; i++) {
        const a = v.pigS[(j * v.n + i) * 4 + 3] + v.pigD[(j * v.n + i) * 4 + 3];
        varr += a * ((i - mx) ** 2 + (j - my) ** 2);
      }
    return { var: varr / tot, tot, cx: mx, cy: my };
  };
  const open = spread(true, 240);
  const closed = spread(false, 240);
  const closedEarly = spread(false, 120);
  // Conservation: diffusion + transfer move pigment; nothing is
  // created or destroyed (measured exact to 4 decimals).
  assert.ok(Math.abs(open.tot - 2) < 1e-6 && Math.abs(closed.tot - 2) < 1e-6, `totals ${open.tot} / ${closed.tot}`);
  // The worked film spreads: measured variance 1.32 vs the unworked
  // film's 0.51 (the advection resample's own smear, which saturates
  // immediately and never grows — the closed film strands).
  assert.ok(open.var > closed.var * 1.8, `worked spread ${open.var.toFixed(2)} vs unworked ${closed.var.toFixed(2)}`);
  assert.ok(closed.var <= closedEarly.var * 1.05, `unworked spread grows ${closedEarly.var.toFixed(2)} -> ${closed.var.toFixed(2)} — a drying film strands its pigment`);
  // Spread is symmetric: the pigment's centroid stays on the stamp
  // (the deposited layer gains no lateral drift from the stage).
  assert.ok(Math.abs(open.cx - closed.cx) < 0.5 && Math.abs(open.cy - closed.cy) < 0.5, 'centroid holds under diffusion');
});

ok('#1876 stationary marks wash at rest: the grid-dots acceptance in miniature', () => {
  const gridRun = (scaled) => {
    const v = createVortex({ seed: 970, width: 1000, height: 700 });
    const marks = [];
    let k = 0;
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 5; i++) {
        const m = { layer: 'a', key: `m${k++}`, x: 500 + (i - 2) * 51.4, y: 350 + (j - 2) * 51.4, vx: 0, vy: 0, rgb: PIG_BLUE };
        if (scaled) {
          m.scaleX = 0.26;
          m.scaleY = 0.26;
          m.rotation = 0;
        }
        marks.push(m);
      }
    for (let f = 0; f < 900; f++) {
      emitFromInstances(v, marks);
      stepVortex(v);
    }
    const dep = (x, y) => v.pigD[(Math.round(y / v.hy) * v.n + Math.round(x / v.h)) * 4 + 3];
    let c = 0,
      m = 0,
      cnt = 0;
    for (let j = 1; j < 4; j++)
      for (let i = 1; i < 4; i++) {
        c += dep(500 + (i - 2) * 51.4, 350 + (j - 2) * 51.4);
        m += dep(500 + (i - 2) * 51.4 + 25.7, 350 + (j - 2) * 51.4 + 25.7);
        cnt++;
      }
    return c / Math.max(m, 1e-9); // ratio of the sums = ratio of the averages
  };
  // The defect, reproduced in-suite: scale-less (point) stamps leave
  // the midpoints empty — ratio in the thousands.
  const pointRatio = gridRun(false);
  assert.ok(pointRatio > 10, `point-stamp grid ratio ${pointRatio.toFixed(1)} — the defect`);
  // The fix at the same pitch and step count: measured 1.33 (the full
  // 266-mark probe measures 1.28; docs/review/1876/). Band keeps the
  // lattice dead without pinning the exact float.
  const footRatio = gridRun(true);
  assert.ok(footRatio > 0.6 && footRatio < 2.0, `footprint grid ratio ${footRatio.toFixed(2)} — a wash, not a lattice`);
});

ok('#1876 the recipe constants are the pinned ones', () => {
  assert.strictEqual(STAMP_FOOTPRINT_HALF, 99.75);
  assert.strictEqual(PIGMENT_DIFFUSE, 0.002);
});

console.log(`vortex.selfcheck: ${n} checks passed`);
