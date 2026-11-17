// node src/engine/particles.gpuStep.selfcheck.mjs — K3 swarm takeover (#2188): the particles.js `gpuStep` seam.
// With { n, fx, fy } on the params the force loop is skipped and those accelerations are added to the accumulators; the rest is the legacy step.
import assert from 'node:assert/strict';
import { ParticleSystem } from './particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../data/layout-modes.js';

const W = 1000;
const H = 700;
const SEED = 0x2188;
const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', behave: 'cruise', particleCount: 80 });
const mk = () => {
  const s = new ParticleSystem();
  s.init(80, W, H, assets, palette, SEED);
  return s;
};
const T = (k) => 1_000_000 + k * (1000 / 60);
const cols = (s) =>
  ['x', 'y', 'vx', 'vy', 'rotation', 'scale', 'alpha', 'phase'].map((k) => Array.from(s[k].subarray(0, s.n)));

// 1. zero accelerations = a step with no steering at all: pure damping + integration, in float64
{
  const c = mk();
  for (let k = 0; k < 5; k++) c.update(lp, assets, palette, SEED, T(k), null);
  const v0 = { x: Array.from(c.vx.subarray(0, c.n)), y: Array.from(c.vy.subarray(0, c.n)) };
  const x0 = Array.from(c.x.subarray(0, c.n));
  const z = { n: c.n, fx: new Float64Array(c.n), fy: new Float64Array(c.n) };
  c.update({ ...lp, gpuStep: z }, assets, palette, SEED, T(5), null);
  const damp = lp.damping ?? 0.95;
  for (let i = 0; i < c.n; i++) {
    assert.ok(
      Math.abs(c.vx[i] - v0.x[i] * damp) < 1e-12 && Math.abs(c.vy[i] - v0.y[i] * damp) < 1e-12,
      'v = v * damping',
    );
    const want = x0[i] + c.vx[i];
    if (want > -120 && want < W + 120) assert.ok(Math.abs(c.x[i] - want) < 1e-9, 'x integrates the damped velocity');
  }
  console.log('  [ok] zero steering = damping + integration only (the force loop is skipped)');
}

// 2. the accelerations are ADDED to the accumulators (a force already there still counts), then the legacy integrator runs: damp, clamp
{
  const c = mk();
  for (let k = 0; k < 5; k++) c.update(lp, assets, palette, SEED, T(k), null);
  const v0 = Array.from(c.vx.subarray(0, c.n));
  c.ax[7] = 0.25; // an impulse left by something earlier in the frame (a contact pass run inside another system's update)
  const fx = new Float64Array(c.n).fill(0.5);
  const fy = new Float64Array(c.n);
  fx[9] = 1000; // far past the speed clamp
  c.update({ ...lp, gpuStep: { n: c.n, fx, fy } }, assets, palette, SEED, T(5), null);
  const damp = lp.damping ?? 0.95;
  assert.ok(Math.abs(c.vx[3] - (v0[3] + 0.5) * damp) < 1e-12, 'v = (v + f) * damping');
  assert.ok(Math.abs(c.vx[7] - (v0[7] + 0.75) * damp) < 1e-12, 'the pre-loaded impulse composes with the GPU steering');
  assert.ok(Math.hypot(c.vx[9], c.vy[9]) <= 8 + 1e-9, 'the CPU speed clamp still governs');
  assert.equal(c.ax[3], 0, 'accumulators are cleared by the integrator as ever');
  console.log('  [ok] steering adds to the accumulators; damping and the clamp are the legacy ones');
}

// 3. a seam of the wrong size is ignored (fail closed -> the legacy step)
{
  const a = mk();
  const b = mk();
  for (let k = 0; k < 4; k++) {
    a.update(lp, assets, palette, SEED, T(k), null);
    b.update(
      { ...lp, gpuStep: { n: 3, fx: new Float64Array(3), fy: new Float64Array(3) } },
      assets,
      palette,
      SEED,
      T(k),
      null,
    );
  }
  assert.deepEqual(cols(a), cols(b));
  console.log('  [ok] a seam for a different population is ignored');
}

// 4. no seam = no change (the legacy path is the same code)
{
  const a = mk();
  const b = mk();
  for (let k = 0; k < 6; k++) {
    a.update(lp, assets, palette, SEED, T(k), null);
    b.update({ ...lp, gpuStep: undefined }, assets, palette, SEED, T(k), null);
  }
  assert.deepEqual(cols(a), cols(b));
  console.log('  [ok] absent seam == legacy');
}

// 5. the organism form: `gpuStepFn` is called once per update with the step's own resolved values and returns the same { n, fx, fy }
{
  const olp = normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'hype',
    behave: 'flock',
    metabolism: 1,
    particleCount: 80,
  });
  const seen = [];
  const run = (g, energy) => {
    const sys = mk();
    for (let i = 0; i < sys.n; i++) sys.energy[i] = energy;
    sys.update(
      {
        ...olp,
        gpuStepFn: (c) => {
          seen.push(c);
          return { n: c.n, fx: g.fx(c.n), fy: g.fy(c.n) };
        },
      },
      assets,
      palette,
      SEED,
      T(0),
      null,
    );
    return sys;
  };
  const zero = { fx: (n) => new Float64Array(n), fy: (n) => new Float64Array(n) };
  const push = { fx: (n) => new Float64Array(n).fill(1), fy: (n) => new Float64Array(n).fill(-2) };
  const E = 0.3;
  const z = run(zero, E);
  const p1 = run(push, E);
  assert.equal(seen.length, 2, 'called once per update');
  const c = seen[0];
  assert.ok(c.organism === true && c.n === 80 && c.system && c.step >= 1, 'organism context');
  assert.ok(c.sepRadius > 0 && c.aliRadius > 0 && c.cohRadius > 0 && c.dtFrames > 0, 'radii and dt come resolved');
  assert.equal(c.meta, 1, 'drives on at metabolism 1');
  assert.equal(c.useCurl, true, 'flock rides the curl wind');
  // the steering is damped by vigor (0.45 + 0.55 * energy) on the energy the callback left, then damped like any velocity
  const vigor = 0.45 + 0.55 * E;
  const damp = Math.max(olp.damping ?? 0.95, 0.97);
  let worst = 0;
  let checked = 0;
  for (let i = 0; i < 80; i++) {
    if (Math.max(Math.hypot(p1.vx[i], p1.vy[i]), Math.hypot(z.vx[i], z.vy[i])) > 1.6) continue; // the organism speed clamp (1.65) is the legacy one, not under test here
    checked++;
    worst = Math.max(
      worst,
      Math.abs(p1.vx[i] - z.vx[i] - 1 * vigor * damp),
      Math.abs(p1.vy[i] - z.vy[i] + 2 * vigor * damp),
    );
  }
  assert.ok(checked > 20, `enough agents under the clamp (${checked})`);
  assert.ok(worst < 1e-9, `vigor scales the steering sum (worst ${worst})`);
  // a wrong-size answer is ignored: the legacy loop runs
  const a = mk();
  const b = mk();
  a.update(olp, assets, palette, SEED, T(0), null);
  b.update(
    { ...olp, gpuStepFn: () => ({ n: 3, fx: new Float64Array(3), fy: new Float64Array(3) }) },
    assets,
    palette,
    SEED,
    T(0),
    null,
  );
  assert.deepEqual(cols(a), cols(b));
  // a cloud layer reports organism false
  seen.length = 0;
  mk().update({ ...lp, gpuStepFn: (c2) => (seen.push(c2), null) }, assets, palette, SEED, T(0), null);
  assert.ok(seen.length === 1 && seen[0].organism === false && seen[0].meta === 0, 'cloud context');
  console.log('  [ok] the organism callback seam: context, vigor, wrong size ignored');
}
console.log('particles.gpuStep.selfcheck: ok — K3 takeover #2188');
