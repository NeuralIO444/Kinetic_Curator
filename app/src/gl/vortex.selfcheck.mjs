// vortex.selfcheck.mjs — #970 slice 1, CPU vortex-particle core.
// Pairs not monopoles, splat in layer|key order, speed capped at
// SMEAR_MAX_SPEED, freeze holds the last field, seeded ambient, golden hash.
// Does not cover the feed hook (slice 2 hashes the velocity texture).
import assert from 'node:assert';
import { getCostTier } from './costTiers.mjs';
import { SMEAR_MAX_SPEED } from './velocitySmear.mjs';
import {
  advectGain,
  createVortex,
  emitAmbient,
  emitFromInstances,
  emitAmbientFrom,
  hashPacked,
  hashVelocity,
  motionAmount,
  noteWetFrame,
  packVelocity,
  stepVortex,
  wetnessStep,
  VORTEX_DECAY,
  VORTEX_GAMMA_PER_SPEED,
  VORTEX_GRID,
  VORTEX_JACOBI,
  VORTEX_MAX,
  VORTEX_WET_DRY,
} from './vortex.mjs';

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
  // Loose sandbox bound, not the cost gate: the #1810 measurement (scripted
  // steady state, filled cap) is 2.66–2.72 ms/step on this class of VM —
  // the gate itself is the registered timeMs below. 6 ms catches an
  // order-of-magnitude regression (a 256 grid, a doubled Jacobi) without
  // flaking on shared-machine load.
  console.log(`    step ${per.toFixed(3)} ms (measured gate 2.7, fail above 6)`);
  assert.ok(per < 6, `step ${per.toFixed(3)} ms exceeds the loose budget`);
});

ok('cost tier is 1, and the registered step cost is the #1810 measurement', () => {
  const d = getCostTier('gl/vortex');
  assert.ok(d, 'gl/vortex registered');
  assert.strictEqual(d.tier, 1);
  // Was 0.5 by the module's own admission ("the selfcheck budget, not a
  // measured fact"). #1810 measured the step on identical scripted sessions
  // before/after the resolution change and registered the result; moving
  // this pin requires a new measurement, not a new opinion.
  assert.strictEqual(d.timeMs, 2.7);
  assert.strictEqual(d.memoryBytes, 128 * 128 * 4 * 5 + 4096 * 16);
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

console.log(`vortex.selfcheck: ${n} checks passed`);
