// node src/gl/parity/swarmSim.selfcheck.mjs — K3 slice 1a (#2188): the GPU swarm core against the real ParticleSystem.
// The bar (K0): ONE-STEP agreement to float32 noise from the same state — the swarm is chaotic, so a long run is judged by
// properties (bounded speed, no NaN, seek < cruise < flee), not by trajectory. Wind is 0 in both (the noise kernels are a later
// slice). Pure half first; the GL half skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { ParticleSystem } from '../../engine/particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../data/layout-modes.js';
import { swarmTextureLayout, SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from '../swarmSim.mjs';
import { hashBase, hashU01, CH } from '../../engine/kernel/rng.js';
import { levyStep } from '../../engine/organisms/behave.js';
import { decodeTypedInto } from '../../engine/kernel/stateCodec.mjs';
import { createScentField } from '../../engine/kernel/field/scent.js';
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

  // ---- point wind: the real noise (seed SEED), cloud swarm (windMul 1), one step from live state
  {
    const count = 200;
    const lp = { ...lpFor(count), noise: undefined };
    delete lp.noise;
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const T0 = 1_000_000;
    for (let s = 0; s < 20; s++) sys.update(lp, assets, palette, SEED, T0 + s * (1000 / 60), null);
    const start = { ...stateOf(sys), seedOffset: Array.from(sys.seedOffset.subarray(0, sys.n)) };
    const tNext = T0 + 20 * (1000 / 60);
    sys.update(lp, assets, palette, SEED, tNext, null);
    const after = stateOf(sys);
    const params = {
      ...coreParams(lp, null),
      wind: {
        seed: SEED,
        freq: lp.noiseFreq ?? 0.005,
        offX: 0,
        offY: 0,
        nt: tNext * (lp.noiseSpeed ?? 0.5) * 0.001,
      },
    };
    const g = await page.evaluate((r) => window.__kcSwarmRun(r), { n: count, state: start, steps: 1, params });
    const got = g.samples[1];
    const d = Math.max(
      maxDiff(after.x, got.x),
      maxDiff(after.y, got.y),
      maxDiff(after.vx, got.vx),
      maxDiff(after.vy, got.vy),
    );
    check('point wind — one step matches the JS swarm to float noise', d < 1e-3, `max |d| ${d.toExponential(2)}`);
    // and the wind is really on: the same step with wind off must differ
    const g0 = await page.evaluate((r) => window.__kcSwarmRun(r), {
      n: count,
      state: start,
      steps: 1,
      params: { ...params, wind: null },
    });
    const off = Math.max(maxDiff(after.vx, g0.samples[1].vx), maxDiff(after.vy, g0.samples[1].vy));
    check('point wind — is not a no-op', off > 1e-3, `wind-off differs by ${off.toExponential(2)}`);
  }

  // ---- curl wind (organism default kernel), windMul 1.3, one step from live state
  {
    const count = 150;
    const lp = { ...lpFor(count), windMode: 'curl' };
    delete lp.noise;
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const T0 = 2_000_000;
    for (let s = 0; s < 20; s++) sys.update(lp, assets, palette, SEED, T0 + s * (1000 / 60), null);
    const start = { ...stateOf(sys), seedOffset: Array.from(sys.seedOffset.subarray(0, sys.n)) };
    const tNext = T0 + 20 * (1000 / 60);
    sys.update(lp, assets, palette, SEED, tNext, null);
    const after = stateOf(sys);
    const params = {
      ...coreParams(lp, null),
      wind: {
        seed: SEED,
        freq: lp.noiseFreq ?? 0.005,
        offX: 0,
        offY: 0,
        nt: tNext * (lp.noiseSpeed ?? 0.5) * 0.001,
        curl: true,
      },
    };
    const g = await page.evaluate((r) => window.__kcSwarmRun(r), { n: count, state: start, steps: 1, params });
    const got = g.samples[1];
    const d = Math.max(
      maxDiff(after.x, got.x),
      maxDiff(after.y, got.y),
      maxDiff(after.vx, got.vx),
      maxDiff(after.vy, got.vy),
    );
    check('curl wind — one step matches the JS swarm to float noise', d < 1e-3, `max |d| ${d.toExponential(2)}`);
    const g0 = await page.evaluate((r) => window.__kcSwarmRun(r), {
      n: count,
      state: start,
      steps: 1,
      params: { ...params, wind: { ...params.wind, curl: false } },
    });
    const diff = Math.max(maxDiff(after.vx, g0.samples[1].vx), maxDiff(after.vy, g0.samples[1].vy));
    check('curl wind — differs from the point kernel', diff > 1e-3, `${diff.toExponential(2)}`);
  }

  // ---- chemotaxis: climb the scent gradient. The kernel reads the same cells the JS field holds.
  {
    const count = 120;
    const lp = lpFor(count);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const scent = createScentField();
    for (let k = 0; k < 40; k++) scent.deposit(0.3 + 0.004 * k, 0.4 + 0.002 * k, 1.5);
    for (let k = 0; k < 6; k++) scent.step();
    const GAIN = 40;
    // JS reference for ONE substep: the chemotaxis force is added to the kernel's own force sum
    const st = stateOf(sys);
    const params = { ...coreParams(lp, null), chemotaxis: GAIN };
    const raw = new Float64Array(scent.cols * scent.rows);
    decodeTypedInto(scent.snapshotCells(), raw);
    const cells = Array.from(raw);
    const run = (chem) =>
      page.evaluate((r) => window.__kcSwarmRun(r), {
        n: count,
        state: st,
        steps: 1,
        params: { ...params, chemotaxis: chem },
        scent: { cells, cols: scent.cols, rows: scent.rows },
      });
    const base = (await run(0)).samples[1];
    const withC = (await run(GAIN)).samples[1];
    // expected dv = gradient * GAIN / mass, then the damping and clamp the kernel applies; compare the DIFFERENCE it makes
    let worst = 0;
    for (let i = 0; i < count; i++) {
      const g = scent.gradient(st.x[i] / W, st.y[i] / H);
      const m = st.mass[i];
      const sp0 = Math.hypot(base.vx[i], base.vy[i]);
      if (sp0 > 7.5) continue; // the speed clamp would mask the term
      const ex = ((g.gx * GAIN) / m) * SWARM_CORE_CLOUD.damping;
      const ey = ((g.gy * GAIN) / m) * SWARM_CORE_CLOUD.damping;
      const sp1 = Math.hypot(withC.vx[i], withC.vy[i]);
      if (sp1 > 7.9) continue;
      worst = Math.max(worst, Math.abs(withC.vx[i] - base.vx[i] - ex), Math.abs(withC.vy[i] - base.vy[i] - ey));
    }
    check(
      'chemotaxis — the kernel adds the JS scent gradient force',
      worst < 1e-2,
      `max |d| ${worst.toExponential(2)}`,
    );
    check('chemotaxis — is not a no-op', maxDiff(base.vx, withC.vx) + maxDiff(base.vy, withC.vy) > 1e-3);
  }

  // ---- Levy flights: the kernel's integer hash draws the same flights as particles.js
  {
    const count = 200;
    const lp = lpFor(count);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const st = stateOf(sys);
    const GAIN = 0.8;
    const ALPHA = 1.2;
    const run = (levy, step) =>
      page.evaluate((r) => window.__kcSwarmRun(r), {
        n: count,
        state: st,
        steps: 1,
        params: { ...coreParams(lp, null), levy },
      });
    let worstRel = 0;
    let strongest = 0;
    for (const step of [3, 44, 45, 46, 1000, 123457]) {
      const base = (await run(null, step)).samples[1];
      const got = (await run({ gain: GAIN, alpha: ALPHA, step, base: hashBase(SEED, CH.dyn) }, step)).samples[1];
      for (let i = 0; i < count; i++) {
        const phase = hashU01(SEED, CH.dyn, 224717 + i) * 45;
        const epoch = Math.floor((step + phase) / 45);
        const ul = hashU01(SEED, CH.dyn, epoch * 7919 + 224737 + i);
        const ua = hashU01(SEED, CH.dyn, epoch * 7919 + 224753 + i);
        const stride = levyStep(ul, ALPHA) * GAIN;
        const m = st.mass[i];
        const ex = ((Math.cos(ua * 2 * Math.PI) * stride) / m) * SWARM_CORE_CLOUD.damping;
        const ey = ((Math.sin(ua * 2 * Math.PI) * stride) / m) * SWARM_CORE_CLOUD.damping;
        if (Math.hypot(got.vx[i], got.vy[i]) > 7.9 || Math.hypot(base.vx[i], base.vy[i]) > 7.5) continue; // speed clamp masks it
        const dx = got.vx[i] - base.vx[i];
        const dy = got.vy[i] - base.vy[i];
        const err = Math.hypot(dx - ex, dy - ey);
        worstRel = Math.max(worstRel, err / Math.max(1, Math.hypot(ex, ey)));
        strongest = Math.max(strongest, Math.hypot(ex, ey));
      }
    }
    check(
      'levy — kernel flights match the JS draws (same hash, same epoch)',
      worstRel < 1e-3,
      `max rel err ${worstRel.toExponential(2)}, strongest force seen ${strongest.toFixed(2)}`,
    );
    check('levy — the walk is exercised (some flights are strong)', strongest > 0.5, `${strongest.toFixed(2)}`);
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
