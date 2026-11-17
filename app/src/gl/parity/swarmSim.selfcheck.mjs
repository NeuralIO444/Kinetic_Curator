// node src/gl/parity/swarmSim.selfcheck.mjs — K3 slice 1a (#2188): the GPU swarm core against the real ParticleSystem.
// The bar (K0): ONE-STEP agreement to float32 noise from the same state — the swarm is chaotic, so a long run is judged by
// properties (bounded speed, no NaN, seek < cruise < flee), not by trajectory. Wind is 0 in both (the noise kernels are a later
// slice). Pure half first; the GL half skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { ParticleSystem } from '../../engine/particles.js';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../data/layout-modes.js';
import { swarmTextureLayout, SWARM_CORE_CLOUD, ATTRACTOR_GAIN } from '../swarmSim.mjs';
import { createNoise } from '../../engine/noise.js';
import { hashBase, hashU01, CH } from '../../engine/kernel/rng.js';
import { levyStep, lorenzAdvance, lorenzSeed, LORENZ_DT } from '../../engine/organisms/behave.js';
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

  // ---- heading: the facing follows the clamped velocity (cloud: snap; organism: shortest turn, damped, capped per step)
  {
    const count = 150;
    const lp = lpFor(count);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    for (let s = 0; s < 20; s++) sys.update(lp, assets, palette, SEED, 1_000_000 + s * (1000 / 60), null);
    const start = { ...stateOf(sys), rotation: Array.from(sys.rotation.subarray(0, sys.n)) };
    sys.update(lp, assets, palette, SEED, 1_000_000 + 20 * (1000 / 60), null);
    const want = Array.from(sys.rotation.subarray(0, sys.n));
    const angDiff = (a, b) => {
      let d = (a - b) % 360;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return Math.abs(d);
    };
    const cloud = (
      await page.evaluate((r) => window.__kcSwarmRun(r), {
        n: count,
        state: start,
        steps: 1,
        params: { ...coreParams(lp, null), heading: { mode: 1 } },
      })
    ).samples[1];
    let worst = 0;
    for (let i = 0; i < count; i++) worst = Math.max(worst, angDiff(cloud.rotation[i], want[i]));
    check(
      'heading (cloud) — the facing after one step matches the JS swarm',
      worst < 1e-2,
      `max |d| ${worst.toExponential(2)} deg`,
    );
    const off = (
      await page.evaluate((r) => window.__kcSwarmRun(r), {
        n: count,
        state: start,
        steps: 1,
        params: coreParams(lp, null),
      })
    ).samples[1];
    check(
      'heading — off (no p.heading) leaves the facing exactly as seeded',
      maxDiff(off.rotation, start.rotation.map(Math.fround)) === 0,
    );

    // organism turn: shortest-arc, damped by 1 - exp(-lambda dt), capped at 600 deg/s * dt. The reference is particles.js's own lines,
    // fed the velocity the kernel just produced (so the comparison isolates the heading maths, in every wrap / cap regime).
    const rot0 = Array.from({ length: count }, (_, i) => (i % 5) * 200 - 400 + (i % 7) * 13.7); // spans below -360 and above 360
    const st2 = { ...start, rotation: rot0 };
    for (const [label, lambda, dtSec] of [
      ['damped (lambda 10)', 10, 1 / 60],
      ['stiff (lambda 400, so the 10 deg/step cap binds)', 400, 1 / 60],
    ]) {
      const turn = 1 - Math.exp(-lambda * dtSec);
      const maxTurn = 600 * dtSec;
      const got = (
        await page.evaluate((r) => window.__kcSwarmRun(r), {
          n: count,
          state: st2,
          steps: 1,
          params: { ...coreParams(lp, null), heading: { mode: 2, turn, maxTurn } },
        })
      ).samples[1];
      let w = 0;
      let moved = 0;
      let capped = 0;
      for (let i = 0; i < count; i++) {
        const speed = Math.hypot(start.vx[i], start.vy[i]);
        if (!(speed > 0.04)) continue; // (the kernel judges the pre-clamp speed of the damped velocity; the stats below use the output)
        const next = (Math.atan2(got.vy[i], got.vx[i]) * 180) / Math.PI;
        let dlt = next - rot0[i];
        while (dlt > 180) dlt -= 360;
        while (dlt < -180) dlt += 360;
        let step = dlt * turn;
        if (step > maxTurn) step = maxTurn;
        if (step < -maxTurn) step = -maxTurn;
        if (Math.abs(step) >= maxTurn - 1e-6) capped++;
        const wantR = rot0[i] + step;
        w = Math.max(w, Math.abs(got.rotation[i] - wantR));
        moved += Math.abs(got.rotation[i] - rot0[i]) > 1e-6 ? 1 : 0;
      }
      check(
        `heading (organism) ${label} — matches particles.js's turn`,
        w < 0.05,
        `max |d| ${w.toExponential(2)} deg; ${moved} moved`,
      );
      if (lambda > 100)
        check('heading (organism) — the per-step cap binds for some agents', capped > 0, `${capped} capped`);
    }
  }

  // ---- Lorenz: per-agent attractor state advances like behave.js lorenzAdvance, and its direction steers
  {
    const count = 150;
    const lp = lpFor(count);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const lz0 = { x: [], y: [], z: [] };
    for (let i = 0; i < count; i++) {
      const l = lorenzSeed(
        hashU01(SEED, CH.dyn, 9000 + i),
        hashU01(SEED, CH.dyn, 9500 + i),
        hashU01(SEED, CH.dyn, 9900 + i),
      );
      lz0.x.push(l.x);
      lz0.y.push(l.y);
      lz0.z.push(l.z);
    }
    const st = { ...stateOf(sys), lorenz: lz0 };
    const RHO = 28;
    const GAIN = 0.7;
    const STEPS = 60;
    const run = (lorenz, steps) =>
      page.evaluate((r) => window.__kcSwarmRun(r), {
        n: count,
        state: st,
        steps,
        params: { ...coreParams(lp, null), lorenz },
      });
    // state: 60 RK2 steps against the JS reference (float32 vs float64; Lorenz is chaotic but 0.36 time units is short)
    const got = (await run({ rho: RHO, gain: 0 }, STEPS)).samples[STEPS].lz;
    let worst = 0;
    for (let i = 0; i < count; i++) {
      let s = { x: lz0.x[i], y: lz0.y[i], z: lz0.z[i] };
      for (let k = 0; k < STEPS; k++) s = lorenzAdvance(s.x, s.y, s.z, RHO, LORENZ_DT);
      worst = Math.max(worst, Math.abs(got.x[i] - s.x), Math.abs(got.y[i] - s.y), Math.abs(got.z[i] - s.z) / 4);
    }
    check(
      'lorenz — per-agent state after 60 RK2 steps matches the JS integrator',
      worst < 5e-3,
      `max |d| ${worst.toExponential(2)}`,
    );
    // steering: one step, gain on vs off
    const off = (await run({ rho: RHO, gain: 0 }, 1)).samples[1];
    const on = (await run({ rho: RHO, gain: GAIN }, 1)).samples[1];
    let fw = 0;
    for (let i = 0; i < count; i++) {
      const a = lorenzAdvance(lz0.x[i], lz0.y[i], lz0.z[i], RHO, LORENZ_DT);
      const mag = Math.hypot(a.dx, a.dy);
      const m = st.mass[i];
      const ex = (((a.dx / mag) * GAIN) / m) * SWARM_CORE_CLOUD.damping;
      const ey = (((a.dy / mag) * GAIN) / m) * SWARM_CORE_CLOUD.damping;
      if (Math.hypot(on.vx[i], on.vy[i]) > 7.9 || Math.hypot(off.vx[i], off.vy[i]) > 7.5) continue;
      fw = Math.max(fw, Math.abs(on.vx[i] - off.vx[i] - ex), Math.abs(on.vy[i] - off.vy[i] - ey));
    }
    check('lorenz — the ride direction steers the agent (gain / mass)', fw < 1e-3, `max |d| ${fw.toExponential(2)}`);
    check('lorenz — steering is not a no-op', maxDiff(off.vx, on.vx) + maxDiff(off.vy, on.vy) > 1e-3);
  }

  // ---- drives (fatigue / feeding / curiosity walk + detour, vigor) and leak (pigment drift), against the JS formulas
  {
    const count = 120;
    const lp = lpFor(count);
    const sys = new ParticleSystem();
    sys.init(count, W, H, assets, palette, SEED);
    const base = stateOf(sys);
    const f32 = Math.fround;
    const st = {
      ...base,
      x: base.x.map(f32),
      y: base.y.map(f32),
      seedOffset: Array.from(sys.seedOffset.subarray(0, count)).map(f32),
      energy: Array.from({ length: count }, (_, i) => f32(0.2 + 0.7 * hashU01(SEED, CH.dyn, 777 + i))),
      drive: Array.from({ length: count }, (_, i) => f32(hashU01(SEED, CH.dyn, 888 + i))),
      leakRgb: Array.from({ length: count * 3 }, (_, i) => f32(255 * hashU01(SEED, CH.dyn, 999 + i))),
    };
    const META = 1.2;
    const LEAK = 0.6;
    const STEP = 321;
    const FREQ = 0.005;
    const NT = 1.75;
    const noise = createNoise(SEED);
    const run = (params, state = st) =>
      page.evaluate((r) => window.__kcSwarmRun(r), { n: count, state, steps: 1, params });
    const wind = { seed: SEED, freq: FREQ, offX: 0, offY: 0, nt: NT };
    const drives = { meta: META, step: STEP, base: hashBase(SEED, CH.dyn) };
    // (a) isolation: radii 1 => no neighbours => the only force is the curiosity detour, damped by vigor
    const iso = {
      ...coreParams(lp, null),
      sepR: 1,
      aliR: 1,
      cohR: 1,
      wind: null,
      drives: { ...drives },
      windOnlyFor: 0,
    };
    iso.wind = { ...wind };
    // wind term would also fire (windOn): neutralise it by mul 0 so only the drives detour acts
    iso.wind.mul = 0;
    const off = (await run({ ...iso, drives: null })).samples[1];
    const on = (await run(iso)).samples[1];
    let worstE = 0;
    let worstD = 0;
    let worstF = 0;
    for (let i = 0; i < count; i++) {
      const e0 = st.energy[i];
      const e = Math.min(1, Math.max(0, e0 - 0.0016 * META)); // no neighbours, no scent
      const h = hashU01(SEED, CH.dyn, STEP * 131071 + 104729 + i);
      const dd = Math.min(1, Math.max(0, st.drive[i] + (h - 0.5) * 0.06 * META));
      worstE = Math.max(worstE, Math.abs(on.dr.energy[i] - e));
      worstD = Math.max(worstD, Math.abs(on.dr.drive[i] - dd));
      let fx = 0;
      let fy = 0;
      if (dd > 0.001) {
        const wa =
          noise.noise3D(st.x[i] * FREQ + 500, st.y[i] * FREQ + 500, NT + st.seedOffset[i] * 0.0001 + 7.3) * 2 * Math.PI;
        const wm = (dd * META * 0.6) / st.mass[i];
        fx = Math.cos(wa) * wm;
        fy = Math.sin(wa) * wm;
      }
      const vigor = 0.45 + 0.55 * e;
      if (Math.hypot(on.vx[i], on.vy[i]) > 7.9 || Math.hypot(off.vx[i], off.vy[i]) > 7.5) continue;
      worstF = Math.max(
        worstF,
        Math.abs(on.vx[i] - off.vx[i] - fx * vigor * SWARM_CORE_CLOUD.damping),
        Math.abs(on.vy[i] - off.vy[i] - fy * vigor * SWARM_CORE_CLOUD.damping),
      );
    }
    check('drives — energy fatigue matches', worstE < 1e-5, `${worstE.toExponential(2)}`);
    check('drives — curiosity walk (kernel hash) matches', worstD < 1e-5, `${worstD.toExponential(2)}`);
    check('drives — detour force, damped by vigor, matches', worstF < 3e-3, `${worstF.toExponential(2)}`);
    // (b) company: real radii => feeding (+0.0012) when cohCount > 0, and the pigment drifts to the neighbour mean (leak)
    const co = { ...coreParams(lp, null), wind: null, drives: { ...drives }, leak: LEAK };
    const gotC = (await run(co)).samples[1];
    let worstFeed = 0;
    let worstLeak = 0;
    let fed = 0;
    for (let i = 0; i < count; i++) {
      let n = 0;
      const sum = [0, 0, 0];
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const dx = st.x[j] - st.x[i];
        const dy = st.y[j] - st.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < SWARM_CORE_CLOUD.cohR ** 2) {
          n++;
          for (let c = 0; c < 3; c++) sum[c] += st.leakRgb[j * 3 + c];
        }
      }
      let e = st.energy[i] - 0.0016 * META + (n > 0 ? 0.0012 * META : 0);
      e = Math.min(1, Math.max(0, e));
      worstFeed = Math.max(worstFeed, Math.abs(gotC.dr.energy[i] - e));
      if (n > 0) fed++;
      for (let c = 0; c < 3; c++) {
        const cur = st.leakRgb[i * 3 + c];
        const exp = n > 0 ? cur + (sum[c] / n - cur) * (LEAK * 0.004) : cur;
        worstLeak = Math.max(worstLeak, Math.abs(gotC.dr.leakRgb[i * 3 + c] - exp));
      }
    }
    check(
      'drives — feeding in company matches',
      worstFeed < 1e-5 && fed > 10,
      `${worstFeed.toExponential(2)} (${fed} fed)`,
    );
    check(
      'leak — pigment drifts toward the neighbour mean',
      worstLeak < 5e-3,
      `${worstLeak.toExponential(2)} (0..255 scale)`,
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
