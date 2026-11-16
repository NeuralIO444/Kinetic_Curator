// node src/gl/parity/swarmSim.selfcheck.mjs — K3 slice 1a (#2188): the GPU swarm core against the real ParticleSystem.
// The bar (K0): ONE-STEP agreement to float32 noise from the same state — the swarm is chaotic, so a long run is judged by
// properties (bounded speed, no NaN, seek < cruise < flee), not by trajectory. Wind is 0 in both (the noise kernels are a later
// slice). Pure half first; the GL half skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { ParticleSystem } from '../../engine/particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../data/layout-modes.js';
import { swarmTextureLayout, SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from '../swarmSim.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

// ---- pure: texture layout
{
  assert.deepEqual(swarmTextureLayout(350), { w: 128, h: 3, n: 350 });
  assert.deepEqual(swarmTextureLayout(5), { w: 5, h: 1, n: 5 });
  assert.deepEqual(swarmTextureLayout(2048), { w: 128, h: 16, n: 2048 });
  assert.deepEqual(swarmTextureLayout(0), { w: 1, h: 1, n: 1 });
  console.log('  [ok] texture layout');
}

const W = 1000;
const H = 700;
const SEED = 0x2188;
const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
// The cloud swarm's point wind ignores the `wind` knob (windMul is 1 off-organism), so the JS side runs on an injected noise whose
// noise3D is -1 everywhere: windShape = (n + 1) * 0.4 = 0, i.e. exactly no wind — the force terms this slice owns, alone.
const NO_WIND_NOISE = { noise3D: () => -1, curl2: (x, y, t, o, out) => Object.assign(out, { x: 0, y: 0 }) };
const lpFor = (count, extra = {}) => ({
  ...normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    behave: 'cruise',
    particleCount: count,
    ...extra,
  }),
  noise: NO_WIND_NOISE,
});
const stateOf = (sys) => ({
  x: Array.from(sys.x.subarray(0, sys.n)),
  y: Array.from(sys.y.subarray(0, sys.n)),
  vx: Array.from(sys.vx.subarray(0, sys.n)),
  vy: Array.from(sys.vy.subarray(0, sys.n)),
  mass: Array.from(sys.mass.subarray(0, sys.n)),
});
const coreParams = (lp, attractor) => ({
  ...SWARM_CORE_CLOUD,
  sepW: 1.8,
  aliW: 1.0,
  cohW: lp.swarmCohesion ?? 1.5,
  damping: lp.damping ?? SWARM_CORE_CLOUD.damping,
  dtFrames: 1,
  attractor,
  attractStrength: attractor ? (lp.gravityWells ?? 1) * ATTRACTOR_GAIN : 0,
  canvasW: W,
  canvasH: H,
});

let harness;
try {
  harness = await openHarnessPage('/parity/swarmSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU swarm kernel vs ParticleSystem: Playwright browser not installed in this environment');
    process.exit(0);
  }
  throw e;
}
const { page, close } = harness;
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  [${cond ? 'ok' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
};
const maxDiff = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
try {
  for (const [label, count, attractor, extra] of [
    ['no attractor, 120 particles', 120, null, {}],
    ['attractor (seek), 120 particles', 120, { x: 750, y: 200 }, { behave: 'seek' }],
    ['attractor (flee), 350 particles', 350, { x: 300, y: 400 }, { behave: 'flee' }],
  ]) {
    const lp = lpFor(count, extra);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    // let the JS swarm run a few steps so velocities are live, then snapshot and compare ONE further step
    for (let s = 0; s < 20; s++) sys.update(lp, assets, palette, SEED, 1_000_000 + s * (1000 / 60), attractor);
    const start = stateOf(sys);
    sys.update(lp, assets, palette, SEED, 1_000_000 + 20 * (1000 / 60), attractor);
    const after = stateOf(sys);
    const seekMul = extra.behave === 'seek' ? 1.6 : extra.behave === 'flee' ? -1.6 : 1;
    const params = coreParams(lp, attractor);
    params.attractStrength = attractor ? (lp.gravityWells ?? 1) * ATTRACTOR_GAIN * seekMul : 0;
    const g = await page.evaluate((r) => window.__kcSwarmRun(r), { n: count, state: start, steps: 1, params });
    const got = g.samples[1];
    const dx = maxDiff(after.x, got.x);
    const dy = maxDiff(after.y, got.y);
    const dvx = maxDiff(after.vx, got.vx);
    const dvy = maxDiff(after.vy, got.vy);
    check(
      label + ' — one step matches the JS swarm to float noise',
      Math.max(dx, dy) < 1e-3 && Math.max(dvx, dvy) < 1e-3,
      `max |dpos| ${Math.max(dx, dy).toExponential(2)}, |dvel| ${Math.max(dvx, dvy).toExponential(2)}`,
    );
  }

  // ---- properties over a long run (the swarm is chaotic: trajectories are not compared, behaviour is)
  {
    const count = 350;
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const start = stateOf(sys);
    const A = { x: 750, y: 200 };
    const run = async (strengthMul, bounds, steps = 300) => {
      const lp = lpFor(count);
      const params = { ...coreParams(lp, A), bounds };
      params.attractStrength = ATTRACTOR_GAIN * strengthMul;
      const r = await page.evaluate((q) => window.__kcSwarmRun(q), {
        n: count,
        state: start,
        steps,
        params,
        sampleAt: [steps],
      });
      return r.samples[steps];
    };
    const meanDist = (st) => {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += Math.hypot(st.x[i] - A.x, st.y[i] - A.y);
      return sum / count;
    };
    const seek = await run(1.6, 'wrap');
    const cruise = await run(1, 'wrap');
    const flee = await run(-1.6, 'wrap');
    const finite = (st) => [...st.x, ...st.y, ...st.vx, ...st.vy].every(Number.isFinite);
    check(
      '350 particles x 300 steps: no NaN or infinity under seek, cruise and flee',
      finite(seek) && finite(cruise) && finite(flee),
    );
    const maxSp = (st) => Math.max(...st.vx.map((v, i) => Math.hypot(v, st.vy[i])));
    check(
      'speed stays at or under the clamp (8.0)',
      Math.max(maxSp(seek), maxSp(cruise), maxSp(flee)) <= SWARM_CORE_CLOUD.maxSpeed + 1e-3,
    );
    const dS = meanDist(seek);
    const dC = meanDist(cruise);
    const dF = meanDist(flee);
    check(
      'the chips act: mean distance to the attractor orders seek < cruise < flee',
      dS < dC && dC < dF,
      `${dS.toFixed(0)} < ${dC.toFixed(0)} < ${dF.toFixed(0)}`,
    );
    const inWrap = (st) =>
      st.x.every((v) => v >= -120 - 9 && v <= W + 120 + 9) && st.y.every((v) => v >= -120 - 9 && v <= H + 120 + 9);
    check('wrap keeps every particle inside the padded canvas', inWrap(seek) && inWrap(cruise) && inWrap(flee));
    const bounced = await run(-1.6, 'bounce');
    check(
      'bounce keeps every particle inside the 8 px margin',
      bounced.x.every((v) => v >= 8 - 1e-3 && v <= W - 8 + 1e-3) &&
        bounced.y.every((v) => v >= 8 - 1e-3 && v <= H - 8 + 1e-3),
    );
    const again = await run(1, 'wrap');
    check(
      'same state, same params: the same device gives the same result',
      maxDiff(again.x, cruise.x) === 0 && maxDiff(again.vy, cruise.vy) === 0,
    );
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`swarmSim.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('swarmSim.selfcheck: ok — K3 slice 1a #2188');
