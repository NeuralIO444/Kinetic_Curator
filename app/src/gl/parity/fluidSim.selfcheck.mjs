// node src/gl/parity/fluidSim.selfcheck.mjs — K1 (#2186) stage 1: the GPU Gray-Scott kernel against the JS reference.
// Seeds both from the same createFluid state, runs the same steps, and reports (a) agreement of the two fields,
// (b) a long stability soak on the GPU. Tier S per K0: judged on character + stability, never on bytes.
import assert from 'node:assert/strict';
import { createFluid, stepFluid, sanitizeMagnets } from '../../engine/dishFluid.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const COLS = 96;
const ROWS = 54;
const magnets = sanitizeMagnets([
  { x: 0.5, y: 0.5 },
  { x: 0.25, y: 0.3 },
]);
const opts = { magnets, pull: 0.7, flow: 0.5, couple: 0.5, aspectHW: 0.7 };
// a culture level at a different grid (48x27) so the nearest-sample path is exercised
const cw = 48;
const ch = 27;
const level = new Float32Array(cw * ch);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) level[y * cw + x] = (x + y) % 5 === 0 ? 0.8 : 0;

const stats = (a, b) => {
  let maxd = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    maxd = Math.max(maxd, d);
    sum += d;
  }
  return { max: maxd, mean: sum / a.length };
};

// The lint job's runner skips `playwright install` to stay fast (same as parity.selfcheck.mjs): no browser there is a
// skip, not a failure. The selfcheck-browser job and dev machines run it for real.
let harness;
try {
  harness = await openHarnessPage('/parity/fluidSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU fluid kernel vs JS: Playwright browser not installed in this environment');
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
try {
  for (const [label, withCulture, steps] of [
    ['magnets only, 60 steps', false, 60],
    ['magnets + culture, 60 steps', true, 60],
    ['magnets + culture, 600 steps', true, 600],
  ]) {
    const f = createFluid({ cols: COLS, rows: ROWS, seedKey: 1234567, magnets });
    const run = { cols: COLS, rows: ROWS, u: Array.from(f.u), v: Array.from(f.v), steps, opts, culture: null };
    const jopts = { ...opts, culture: null };
    if (withCulture) {
      run.culture = { level: Array.from(level), cw, ch };
      jopts.culture = { cols: cw, rows: ch, level };
    }
    for (let i = 0; i < steps; i++) stepFluid(f, jopts);
    const g = await page.evaluate((r) => window.__kcFluidRun(r), run);
    const du = stats(f.u, g.u);
    const dv = stats(f.v, g.v);
    console.log(
      `      ${label}: |ΔV| max ${dv.max.toExponential(2)} mean ${dv.mean.toExponential(2)} · |ΔU| max ${du.max.toExponential(2)}`,
    );
    // short runs must agree to float noise; long runs are chaotic reaction-diffusion, judged on character below
    if (steps <= 60) check(label + ' agrees with the JS kernel', dv.max < 1e-3 && du.max < 1e-3);
    else {
      const mj = f.v.reduce((s, x) => s + x, 0) / f.v.length;
      const mg = g.v.reduce((s, x) => s + x, 0) / g.v.length;
      check(
        label + ' same character (mean V within 15%)',
        Math.abs(mg - mj) <= 0.15 * Math.max(mj, 1e-6),
        `JS ${mj.toFixed(4)} GPU ${mg.toFixed(4)}`,
      );
    }
  }
  // stability soak: 30k steps (≈ 62 s of stage time at 480 steps/s) sampled every 1500
  const f = createFluid({ cols: COLS, rows: ROWS, seedKey: 99, magnets });
  const soak = await page.evaluate((r) => window.__kcFluidRun(r), {
    cols: COLS,
    rows: ROWS,
    u: Array.from(f.u),
    v: Array.from(f.v),
    steps: 30000,
    sampleEvery: 1500,
    opts,
    culture: null,
  });
  const bad = soak.samples.filter((s) => !s.finite || s.minU < 0 || s.maxU > 1 || s.minV < 0 || s.maxV > 1);
  check('soak 30,000 steps: finite and inside [0,1]', bad.length === 0);
  const last = soak.samples[soak.samples.length - 1];
  check('soak: the field is still alive (mean V > 0.005)', last.meanV > 0.005, `mean V ${last.meanV.toFixed(4)}`);
} finally {
  await close();
  await closeGlDriver();
}
assert.equal(failed, 0, `${failed} check(s) failed`);
console.log('fluidSim.selfcheck: OK — K1 #2186 stage 1');
