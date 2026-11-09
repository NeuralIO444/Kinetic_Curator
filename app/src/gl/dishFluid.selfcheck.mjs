// dishFluid.selfcheck.mjs — FERROFLUID (#1997): the GPU display instance (gl/dishFluidGl.mjs).
//
//   A source     the step shader is the kernel's step: the same laplacian weights, the rim
//                reads ground, the magnet loop is capped at the kernel's MAX_MAGNETS, and the
//                renderer's dishfluid programme declares exactly the uniforms the floor
//                shader uses
//   B browser    (skipped when no Playwright browser is present) the GPU chain runs a plan:
//                two runs on the same device are BIT-IDENTICAL (the ruling's same-device
//                guarantee), and the GPU field agrees with the JS kernel statistically —
//                correlation + dark coverage — never byte-for-byte (fp16 vs fp32 is the
//                accepted cross-implementation variance, stated, not hidden)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLUID_STEP_FS, FLUID_DISPLAY_FS } from './dishFluidGl.mjs';
import { RENDERER_PROGRAMS } from './renderer.mjs';
import { MAX_MAGNETS } from '../engine/dishFluid.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// ---- A: source pins
ok('the step shader carries the kernel’s constants and shape', () => {
  assert.ok(FLUID_STEP_FS.includes('0.2 * tap') && FLUID_STEP_FS.includes('0.05 * tap'), 'the 9-point weights');
  assert.ok(FLUID_STEP_FS.includes('return vec2(1.0, 0.0)'), 'the rim reads ground, like the kernel');
  assert.ok(FLUID_STEP_FS.includes(`u_magnets[${MAX_MAGNETS}]`), 'the magnet array is the kernel cap');
  assert.ok(FLUID_STEP_FS.includes('texelFetch'), 'exact taps, no filtering in the step');
  assert.ok(!/Math\.random|Date\.now/.test(FLUID_STEP_FS), 'no unseeded anything');
  const src = readFileSync(new URL('./dishFluidGl.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('FERRO_FEED') && src.includes('MAGNET_RADIUS'), 'gains upload from the kernel constants');
  assert.ok(!/cross-device|byte-identical across/i.test(src), 'no cross-device promise anywhere');
});

ok('the floor programme in the renderer table matches its shader', () => {
  const def = RENDERER_PROGRAMS.find((d) => d.key === 'dishfluid');
  assert.ok(def, 'the dishfluid programme is registered');
  assert.equal(def.fs, FLUID_DISPLAY_FS);
  assert.equal(def.cost.tier, 0, 'the floor draw is tier 0 plumbing; the shed is the governor rung');
  const declared = [...FLUID_DISPLAY_FS.matchAll(/uniform\s+\w+\s+(u_\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual([...def.uniforms].sort(), declared, 'the upload list is exactly the declared set');
});

// ---- B: browser (GPU) section
let skipped = false;
try {
  const { chromium } = await import('playwright');
  let browser = null;
  try {
    browser = await chromium.launch();
  } catch (e) {
    if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
    else throw e;
  }
  if (browser) await browser.close();
} catch (e) {
  if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
  else throw e;
}

if (!skipped) {
  const { openHarnessPage, closeGlDriver } = await import('./parity/glDriver.mjs');
  const { page, close } = await openHarnessPage('/parity/fluidProbe.html');
  try {
    const res = await page.evaluate((p) => window.__kcFluidProbe(p), {
      cols: 96,
      rows: 54,
      seedKey: 20240,
      magnets: [{ x: 0.5, y: 0.5 }],
      dial: { flow: 0.5, pull: 0.8, couple: 0 },
      steps: 120, // within one frame's catch-up budget (FLUID_CATCHUP_STEPS), as a live arm serves it
    });
    ok('the GPU serves the plan’s steps', () => {
      assert.equal(res.served, 120);
      assert.equal(res.bytes.length, 96 * 54);
    });
    ok('two GPU runs on this device are bit-identical (the same-device guarantee)', () => {
      assert.deepEqual(res.bytes2, res.bytes);
    });
    ok('the GPU field agrees with the kernel statistically (never byte-for-byte)', () => {
      const cov = (arr) => arr.filter((v) => v > 31).length / arr.length;
      const gpuCov = cov(res.bytes);
      const mirCov = cov(res.mirror);
      assert.ok(gpuCov > 0.005 && gpuCov < 0.6, `GPU dark coverage sane (${gpuCov.toFixed(3)})`);
      assert.ok(
        Math.abs(gpuCov - mirCov) < 0.08,
        `coverage agrees (gpu ${gpuCov.toFixed(3)} vs kernel ${mirCov.toFixed(3)})`,
      );
      // correlation over all cells
      const N = res.bytes.length;
      let mg = 0;
      let mm = 0;
      for (let i = 0; i < N; i++) {
        mg += res.bytes[i];
        mm += res.mirror[i];
      }
      mg /= N;
      mm /= N;
      let covXY = 0;
      let varG = 0;
      let varM = 0;
      for (let i = 0; i < N; i++) {
        covXY += (res.bytes[i] - mg) * (res.mirror[i] - mm);
        varG += (res.bytes[i] - mg) ** 2;
        varM += (res.mirror[i] - mm) ** 2;
      }
      const corr = covXY / Math.sqrt(varG * varM);
      assert.ok(corr > 0.75, `field correlation with the kernel (${corr.toFixed(3)})`);
      assert.notDeepEqual(res.bytes, res.mirror, 'fp16 GPU vs fp32 kernel: agreement is statistical, stated plainly');
    });
  } finally {
    await close();
    await closeGlDriver();
  }
} else {
  console.log('  [skip] browser section — no Playwright browser in this sandbox');
}

console.log(`dishFluid.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
