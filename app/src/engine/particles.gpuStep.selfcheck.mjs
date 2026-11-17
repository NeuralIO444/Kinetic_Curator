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
console.log('particles.gpuStep.selfcheck: ok — K3 takeover #2188');
