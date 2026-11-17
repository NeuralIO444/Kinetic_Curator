// node src/engine/particles.gpuStep.selfcheck.mjs — K3 swarm takeover (#2188): the particles.js `gpuStep` seam.
// With { n, vx, vy } on the params the force loop is skipped and the integration takes those velocities; everything else is JS.
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
// `u` (speed / maxSpeed) reads the speed BEFORE the clamp in the legacy path and the already-clamped kernel velocity under the seam: equal to 1 ulp
const sameU = (p, q) => p.u.subarray(0, p.n).every((v, i) => Math.abs(v - q.u[i]) < 1e-12);

// 1. the seam reproduces the legacy step exactly when it is handed the legacy step's own velocities
{
  const a = mk();
  const b = mk();
  for (let k = 0; k < 10; k++) {
    a.update(lp, assets, palette, SEED, T(k), null);
    b.update(lp, assets, palette, SEED, T(k), null);
  }
  const base = mk();
  const c = mk();
  // advance c to the same state as a, then take one step each way
  for (let k = 0; k < 10; k++) c.update(lp, assets, palette, SEED, T(k), null);
  a.update(lp, assets, palette, SEED, T(10), null);
  const gs = { n: c.n, vx: Float64Array.from(a.vx.subarray(0, a.n)), vy: Float64Array.from(a.vy.subarray(0, a.n)) };
  c.update({ ...lp, gpuStep: gs }, assets, palette, SEED, T(10), null);
  assert.deepEqual(cols(c), cols(a), 'handed the legacy velocities, the step is the legacy step, bit for bit');
  assert.ok(sameU(c, a), 'u agrees to 1e-12');
  void base;
  console.log('  [ok] the seam with the legacy velocities == the legacy step');
}

// 2. the force loop really is skipped: velocities are the handed ones, whatever the neighbours would have done
{
  const c = mk();
  for (let k = 0; k < 5; k++) c.update(lp, assets, palette, SEED, T(k), null);
  const vx = new Float64Array(c.n).fill(1.5);
  const vy = new Float64Array(c.n).fill(-0.5);
  const x0 = Array.from(c.x.subarray(0, c.n));
  c.update({ ...lp, gpuStep: { n: c.n, vx, vy } }, assets, palette, SEED, T(5), null);
  for (let i = 0; i < c.n; i++) {
    assert.equal(c.vx[i], 1.5);
    assert.equal(c.vy[i], -0.5);
    const want = x0[i] + 1.5;
    const wrapped = want > W + 120 ? -120 : want;
    assert.ok(
      Math.abs(c.x[i] - wrapped) < 1e-9,
      'position integrates the handed velocity in float64, and wraps as ever',
    );
  }
  console.log('  [ok] the handed velocities drive the step');
}

// 3. a seam of the wrong size is ignored (fail closed -> the legacy step)
{
  const a = mk();
  const b = mk();
  for (let k = 0; k < 4; k++) {
    a.update(lp, assets, palette, SEED, T(k), null);
    b.update(
      { ...lp, gpuStep: { n: 3, vx: new Float64Array(3), vy: new Float64Array(3) } },
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
