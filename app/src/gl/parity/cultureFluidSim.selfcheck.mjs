// node src/gl/parity/cultureFluidSim.selfcheck.mjs — CULTURE Phase 1, slice K1 (the parent issue 2186):
// the culture world's dish fluid on the GPU kernel (gl/fluidSim.mjs, backend gpu.gs.v1) against the
// world's own JS reference (engine/dishFluid.mjs stepFluid, js.gs.v1), seeded from a culture world's
// birth field and stepped at the world's own cadence (the JS side advances through the world's
// scheduler, never by calling the kernel directly).
//
// THE TOLERANCE LAW (Tier S per K0, spec §5.4): the GPU computes in float32 end to end; the JS
// reference computes in float64 and stores float32. Short runs must agree to float noise — max
// |Δ| < 1e-3 on both phases at 60 steps, the K1 stage-1 precedent for this same kernel pair at
// this same grid. Long runs are chaotic reaction-diffusion: pointwise divergence grows while the
// regime's statistics hold, so 600 steps is judged on character — mean V within 15% — plus both
// fields finite and in [0, 1]. Never bytes: a GPU medium is the recording device's own.
import assert from 'node:assert/strict';
import { createCultureWorld, advanceCultureWorld } from '../../engine/cultureWorld.mjs';
import { fluidMeanDensity } from '../../engine/dishFluid.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

// The lint job's runner skips `playwright install` to stay fast (same as fluidSim.selfcheck.mjs):
// no browser there is a skip, not a failure. The selfcheck-browser job and dev machines run it.
let harness;
try {
  harness = await openHarnessPage('/parity/fluidSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU culture fluid vs the world JS reference: Playwright browser not installed');
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
const inLaw = (arr) => arr.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);

try {
  for (const [label, fluidSteps] of [
    ['60 fluid steps (one sim-second of medium)', 60],
    ['600 fluid steps (ten sim-seconds)', 600],
  ]) {
    // The JS side: a culture world, advanced ONLY through its own scheduler until its medium
    // has taken the wanted number of steps (the cadence does the counting).
    const w = createCultureWorld({ seed: 20261122 });
    const birth = { u: Array.from(w.fluid.u), v: Array.from(w.fluid.v) };
    while (w.fluid.step < fluidSteps) advanceCultureWorld(w, 1 / 60);
    assert.equal(w.fluid.step, fluidSteps, 'the world cadence lands exactly on the step count');

    // The GPU side: the same birth field, the kernel defaults the world's stepFluid runs under
    // (no magnets, no culture field, dial defaults), the same number of passes.
    const g = await page.evaluate((r) => window.__kcFluidRun(r), {
      cols: w.fluid.cols,
      rows: w.fluid.rows,
      u: birth.u,
      v: birth.v,
      steps: fluidSteps,
      opts: { magnets: [], pull: 0.7, flow: 0.5, couple: 0.5, aspectHW: 0.7 },
      culture: null,
    });
    const du = stats(w.fluid.u, g.u);
    const dv = stats(w.fluid.v, g.v);
    console.log(
      `      ${label}: |ΔV| max ${dv.max.toExponential(2)} mean ${dv.mean.toExponential(2)} · |ΔU| max ${du.max.toExponential(2)}`,
    );
    check(
      `${label}: both fields finite and in [0, 1]`,
      inLaw(g.u) && inLaw(g.v) && inLaw(w.fluid.u) && inLaw(w.fluid.v),
    );
    if (fluidSteps <= 60) {
      check(`${label}: GPU agrees with the JS reference to float noise (< 1e-3)`, dv.max < 1e-3 && du.max < 1e-3);
    } else {
      const mj = fluidMeanDensity(w.fluid);
      const mg = g.v.reduce((s, x) => s + x, 0) / g.v.length;
      check(
        `${label}: same character (mean V within 15%)`,
        Math.abs(mg - mj) <= 0.15 * Math.max(mj, 1e-6),
        `JS ${mj.toFixed(4)} GPU ${mg.toFixed(4)}`,
      );
    }
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.log(`cultureFluidSim.selfcheck: FAIL (${failed})`);
  process.exit(1);
}
console.log(
  'cultureFluidSim.selfcheck: OK — the world medium on GPU matches its JS reference (float noise short, character long)',
);
