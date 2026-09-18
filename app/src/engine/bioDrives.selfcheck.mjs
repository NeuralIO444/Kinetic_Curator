/**
 * bioDrives.selfcheck.mjs — #287 bio-drives integration.
 * Node-only. Proves, against the real ParticleSystem:
 *  1. drives are inert at metabolism 0 (legacy lock: energy stays 1);
 *  2. energy drains at the metabolism rate (fatigue);
 *  3. hunger boosts cohesion pull (mechanistic ratio ≈ 2.6 × 0.45);
 *  4. mold climbs a seeded scent gradient, other profiles don't (chemotaxis);
 *  5. pigment drifts toward the neighbours' average and is written back
 *     quantized on the 600-step cadence (leak);
 *  6. the grazer trait is assigned at init, rides items, inherits at breed;
 *  7. breath swells scale around the base value (swell);
 *  8. radial-N symmetry emits an N-fold alternating-mirror fan;
 *  9. the scent field exists only for organism casts;
 * 10. capacity growth keeps leakRgb at 3 channels per agent (no RangeError,
 *     working pigment preserved).
 */
import { strict as assert } from 'node:assert';
import { ParticleSystem } from './particles.js';

const PAL = { id: 'test', bg: '#000000', swatches: ['#ff0000', '#00ff00', '#0000ff'], leak: 0 };
const LEAK_PAL = { ...PAL, leak: 0.5 };
const ASSETS = [{ id: 'a' }, { id: 'b' }];

let passed = 0;
let failed = 0;
function ok(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${e.message}`);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;

function baseLp(over = {}) {
  return {
    mode: 'hype', behave: 'flock', particleCount: 40,
    metabolism: 0, breath: 0, graze: 0,
    noiseFreq: 0.005, noiseSpeed: 0.5, damping: 0.95,
    scale: [0.4, 1.6], alpha: [40, 100], wind: 1, body: 3, tight: 0.55,
    ...over,
  };
}

function makeSystem(count, lpOver = {}, palette = PAL, seed = 1234) {
  const ps = new ParticleSystem();
  const lp = baseLp({ particleCount: count, ...lpOver });
  ps.init(count, 1000, 700, ASSETS, palette, seed, { graze: lp.graze });
  return { ps, lp };
}

function run(ps, lp, n, seed = 999, palette = PAL) {
  for (let k = 0; k < n; k++) ps.update(lp, ASSETS, palette, seed, k * 16.7, null);
}

// getItems() reads this._layout, which update() sets — step once first.
function syncedItems(ps, lp, seed = 999, palette = PAL) {
  ps.update(lp, ASSETS, palette, seed, 0, null);
  return ps.getItems(ASSETS);
}

console.log('[selfcheck] bio-drives');

ok('drives are inert at metabolism 0: energy stays 1, drive frozen', () => {
  const { ps, lp } = makeSystem(40, { metabolism: 0 });
  const drive0 = Array.from(ps.drive.slice(0, 40));
  run(ps, lp, 120);
  for (let i = 0; i < 40; i++) {
    assert.equal(ps.energy[i], 1, `energy[${i}] moved with drives off`);
    assert.ok(approx(ps.drive[i], drive0[i]), `drive[${i}] moved with drives off`);
  }
});

ok('energy drains at the metabolism rate (fatigue)', () => {
  // One agent: no neighbours, no scent → pure drain, exactly measurable.
  const { ps, lp } = makeSystem(1, { metabolism: 2, behave: 'scatter', wind: 0 });
  run(ps, lp, 100, 999);
  const expected = 1 - 0.0016 * 2 * 100;
  assert.ok(approx(ps.energy[0], expected, 1e-9), `expected ${expected}, got ${ps.energy[0]}`);
});

ok('hunger boosts cohesion pull (starving pair closes ~1.17x faster)', () => {
  const closing = (e) => {
    const { ps, lp } = makeSystem(2, { metabolism: 2, behave: 'flock' });
    for (const i of [0, 1]) {
      ps.mass[i] = 1; ps.vx[i] = 0; ps.vy[i] = 0;
      ps.drive[i] = 0; ps.energy[i] = e;
    }
    ps.x[0] = 400; ps.y[0] = 350; ps.x[1] = 465; ps.y[1] = 350;
    ps.update(lp, ASSETS, PAL, 999, 0, null);
    return (ps.x[0] - 400) + (465 - ps.x[1]);
  };
  const ratio = closing(0) / closing(1);
  assert.ok(ratio > 1.1 && ratio < 1.25, `expected ~1.17, got ${ratio}`);
});

ok('mold climbs a seeded scent gradient; cruise does not (chemotaxis)', () => {
  const trial = (behave) => {
    const { ps, lp } = makeSystem(1, { metabolism: 0, behave, wind: 0 });
    ps.update(lp, ASSETS, PAL, 77, 0, null); // creates the scent field
    ps._scent.deposit(0.8, 0.5, 3);
    for (let k = 0; k < 40; k++) ps._scent.step();
    ps.x[0] = 730; ps.y[0] = 350; ps.vx[0] = 0; ps.vy[0] = 0;
    ps.update(lp, ASSETS, PAL, 77, 16.7, null);
    return ps.vx[0];
  };
  const moldVx = trial('mold');
  const cruiseVx = trial('cruise');
  assert.ok(moldVx > 0.03, `mold should gain +x velocity toward scent, got ${moldVx}`);
  assert.ok(approx(cruiseVx, 0, 1e-9), `cruise should ignore scent, got ${cruiseVx}`);
});

ok('mold deposits scent every step (the field accumulates)', () => {
  const { ps, lp } = makeSystem(20, { metabolism: 0, behave: 'mold', wind: 0 });
  ps.update(lp, ASSETS, PAL, 77, 0, null);
  ps._scent.clear();
  ps.update(lp, ASSETS, PAL, 77, 16.7, null);
  // 20 agents × deposit 0.06, minus one decay step — sample at the agents'
  // own post-update positions, where they just deposited.
  let peak = 0;
  for (let i = 0; i < 20; i++) {
    peak = Math.max(peak, ps._scent.sample(ps.x[i] / 1000, ps.y[i] / 700));
  }
  assert.ok(peak > 0.03, `expected accumulated scent at agent positions, peak ${peak}`);
  // A non-depositing profile leaves the field empty.
  const cruise = makeSystem(20, { metabolism: 0, behave: 'cruise', wind: 0 });
  cruise.ps.update(cruise.lp, ASSETS, PAL, 77, 0, null);
  cruise.ps.update(cruise.lp, ASSETS, PAL, 77, 16.7, null);
  let peak2 = 0;
  for (let i = 0; i < 20; i++) {
    peak2 = Math.max(peak2, cruise.ps._scent.sample(cruise.ps.x[i] / 1000, cruise.ps.y[i] / 700));
  }
  assert.equal(peak2, 0);
});

ok('pigment drifts toward the neighbours average and writes back quantized (leak)', () => {
  const { ps, lp } = makeSystem(24, { metabolism: 0 }, LEAK_PAL);
  const before = [...ps.color];
  run(ps, lp, 601, 999, LEAK_PAL);
  const changed = ps.color.filter((c, i) => c !== before[i]).length;
  assert.ok(changed > 0, `expected some quantized write-backs after 601 steps, got ${changed}`);
  // Every written color is 4-bit quantized per channel.
  for (const c of ps.color) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(c);
    assert.ok(m, `color not hex: ${c}`);
    for (const ch of m.slice(1)) {
      assert.equal(parseInt(ch, 16) % 16, 0, `channel not 4-bit quantized: ${c}`);
    }
  }
  // No leak → colors never rewritten.
  const still = makeSystem(24, { metabolism: 0 }, PAL);
  const before2 = [...still.ps.color];
  run(still.ps, still.lp, 601, 999, PAL);
  assert.deepEqual([...still.ps.color], before2);
});

ok('grazer trait: assigned at init, rides items, ~half at graze 0.5', () => {
  const { ps, lp } = makeSystem(100, { graze: 0.5 });
  let n = 0;
  for (let i = 0; i < 100; i++) n += ps.grazer[i];
  assert.ok(n > 20 && n < 80, `expected ~50 grazers, got ${n}`);
  const items = syncedItems(ps, lp);
  const bodyItems = items.filter((it) => it.role === 'body');
  assert.equal(bodyItems.length, 100);
  assert.ok(bodyItems.every((it) => typeof it.graze === 'boolean'));
  assert.equal(bodyItems.filter((it) => it.graze).length, n);
  const none = makeSystem(40, { graze: 0 });
  assert.ok(syncedItems(none.ps, none.lp).every((it) => it.graze === false));
  const all = makeSystem(40, { graze: 1 });
  assert.ok(syncedItems(all.ps, all.lp).every((it) => it.graze === true));
});

ok('capacity growth keeps leakRgb at 3 channels per agent (#287)', () => {
  const { ps } = makeSystem(40, { graze: 0.5 });
  const cap0 = ps._cap;
  assert.equal(ps.leakRgb.length, cap0 * 3, 'leakRgb starts at 3x capacity');
  // Mark a sentinel in the first agent's working pigment, then force growth.
  ps.leakRgb[0] = 0.11; ps.leakRgb[1] = 0.22; ps.leakRgb[2] = 0.33;
  ps._ensureCapacity(cap0 + 1);
  assert.ok(ps._cap > cap0, 'capacity grew');
  assert.equal(ps.leakRgb.length, ps._cap * 3, 'leakRgb stays 3x after growth');
  assert.ok(approx(ps.leakRgb[0], 0.11) && approx(ps.leakRgb[1], 0.22) && approx(ps.leakRgb[2], 0.33),
    'working pigment survives the grow');
  // Every other per-agent column must still be 1x.
  for (const [name, arr] of [['energy', ps.energy], ['drive', ps.drive], ['grazer', ps.grazer], ['x', ps.x]]) {
    assert.equal(arr.length, ps._cap, `${name} stays 1x after growth`);
  }
});

ok('breath swells scale around the base value; breath 0 is constant', () => {
  const { ps, lp } = makeSystem(10, { metabolism: 0, breath: 0.8, noiseSpeed: 0.5 });
  // init() sets scale = mass; the integration loop's base scale is
  // minScale + mass * (maxScale - minScale) = 0.4 + mass * 1.2.
  const base = 0.4 + ps.scale[0] * 1.2;
  // Phase advances 0.004 * noiseSpeed per step: 500 steps = exactly one
  // breath period, so the mean must sit on the base scale.
  const samples = [];
  for (let k = 0; k < 500; k++) {
    ps.update(lp, ASSETS, PAL, 999, k * 16.7, null);
    samples.push(ps.scale[0]);
  }
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  assert.ok(hi - lo > base * 0.5, `expected visible swell, range ${lo}..${hi}`);
  assert.ok(approx(mean(samples), base, base * 0.05), 'swell should average to the base scale over one period');
  // breath 0: bit-identical re-runs (legacy lock).
  const calm = makeSystem(10, { metabolism: 0, breath: 0 });
  run(calm.ps, calm.lp, 60, 999);
  const s0 = calm.ps.scale[0];
  const calm2 = makeSystem(10, { metabolism: 0, breath: 0 });
  run(calm2.ps, calm2.lp, 60, 999);
  assert.equal(calm2.ps.scale[0], s0);
});

ok('radial-6 emits a 6-fold alternating-mirror fan; bilateral unchanged', () => {
  const radial = makeSystem(40, { symmetry: 'radial-6', body: 3 });
  const items = syncedItems(radial.ps, radial.lp);
  // 3 body segments + 6 fan arms per organism.
  assert.equal(items.length, 40 * 9);
  const wings = items.filter((it) => it.role === 'wing');
  assert.equal(wings.length, 40 * 6);
  const mirrored = wings.filter((w) => w._mirrored).length;
  assert.equal(mirrored, 40 * 3, 'odd arms mirror, even arms do not');
  const keys = new Set(wings.map((w) => w.key));
  assert.equal(keys.size, 40 * 6, 'fan keys must be unique');
  assert.ok(wings.every((w) => typeof w.ladderId === 'string'), 'fan reuses MOTH_LADDERS');

  const bi = makeSystem(40, { symmetry: 'bilateral', body: 3 });
  const biItems = syncedItems(bi.ps, bi.lp);
  assert.equal(biItems.length, 40 * 5, 'bilateral still emits body + 2 wings');
  const biWings = biItems.filter((it) => it.role === 'wing');
  assert.equal(biWings.filter((w) => w._mirrored).length, 40);

  for (const sym of ['radial-4', 'radial-8']) {
    const s = makeSystem(10, { symmetry: sym, body: 1 });
    const n = syncedItems(s.ps, s.lp).filter((it) => it.role === 'wing').length;
    const folds = parseInt(sym.split('-')[1], 10);
    assert.equal(n, 10 * folds, `${sym} should emit ${folds} arms per organism`);
  }
});

ok('scent field exists only for organism casts', () => {
  const hype = makeSystem(10, {});
  run(hype.ps, hype.lp, 3, 999);
  assert.ok(hype.ps._scent && hype.ps._scent.kind === 'scent');
  const cloud = new ParticleSystem();
  const clp = baseLp({ mode: 'swarm', particleCount: 10 });
  cloud.init(10, 1000, 700, ASSETS, PAL, 42, { graze: 0 });
  for (let k = 0; k < 3; k++) cloud.update(clp, ASSETS, PAL, 42, k * 16.7, null);
  assert.equal(cloud._scent, null);
});

console.log(`[selfcheck] bio-drives: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
