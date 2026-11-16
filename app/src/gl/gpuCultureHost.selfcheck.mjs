// node src/gl/gpuCultureHost.selfcheck.mjs — K2 slice 2b (#2187): the GPU culture host. The pure scheduler runs everywhere;
// the GL half follows the JS culture generation for generation (byte-identical) through the stamped gens, shed rungs, a seek
// back and a reseed, with and without the fluid births. Skips cleanly with no Playwright browser.
import assert from 'node:assert/strict';
import { createCulture, stepCulture, seedRandom, ellipseMask, CULTURE_RULE } from '../engine/dishLife.mjs';
import { injectFluidBirths } from '../engine/dishFluidCouple.mjs';
import { SHED_STEPS } from '../engine/dishLifeStage.mjs';
import { planCultureSteps } from './gpuCultureHost.mjs';
import { openHarnessPage, closeGlDriver } from './parity/glDriver.mjs';

// ---- pure: the scheduler
{
  const p0 = planCultureSteps(null, 'k', { gen: 5, shed: 0 });
  assert.deepEqual(
    p0,
    { reseed: true, from: 0, steps: SHED_STEPS[0], target: 5 },
    'first frame seeds and trickles by the rung',
  );
  const p1 = planCultureSteps({ key: 'k', gen: 4 }, 'k', { gen: 5, shed: 0 });
  assert.deepEqual(p1, { reseed: false, from: 4, steps: 1, target: 5 }, 'steps the gap');
  assert.equal(planCultureSteps({ key: 'k', gen: 5 }, 'k', { gen: 5, shed: 0 }).steps, 0, 'at the target: nothing');
  assert.equal(
    planCultureSteps({ key: 'k', gen: 0 }, 'k', { gen: 99, shed: 1 }).steps,
    SHED_STEPS[1],
    'bounded by the rung',
  );
  assert.equal(planCultureSteps({ key: 'k', gen: 0 }, 'k', { gen: 99, shed: 2 }).steps, 0, 'the last rung holds');
  assert.equal(planCultureSteps({ key: 'k', gen: 9 }, 'k', { gen: 3, shed: 0 }).reseed, true, 'a seek back reseeds');
  assert.equal(planCultureSteps({ key: 'k', gen: 3 }, 'j', { gen: 4, shed: 0 }).reseed, true, 'a new seed key reseeds');
  assert.equal(
    planCultureSteps({ key: 'k', gen: 3 }, 'k', { gen: 9, shed: 99 }).steps,
    0,
    'a rung past the end clamps to the last',
  );
  console.log('  [ok] scheduler');
}

const COLS = 96;
const ROWS = 54;
let harness;
try {
  harness = await openHarnessPage('/parity/cultureSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU culture host vs JS: Playwright browser not installed in this environment');
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
  const mask = ellipseMask(COLS, ROWS);
  const bedrock = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < bedrock.length; i += 41) bedrock[i] = 1;
  const N = COLS * ROWS;
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) blocked[i] = !mask[i] || bedrock[i] ? 1 : 0;
  const density = new Float32Array(N);
  for (let i = 0; i < N; i++) density[i] = ((i * 37) % 128) / 128;
  const fresh = (seed) =>
    createCulture({
      cols: COLS,
      rows: ROWS,
      rule: CULTURE_RULE,
      seed: seedRandom(COLS, ROWS, seed, 0.3),
      mask,
      bedrock,
    });

  // a stamp script: ramps, a hold, a shed rung, a seek back, a new key
  const script = [];
  for (let g = 0; g <= 30; g++) script.push({ key: 'a', gen: g, shed: 0 });
  for (let k = 0; k < 4; k++) script.push({ key: 'a', gen: 30, shed: 0 });
  script.push(
    { key: 'a', gen: 60, shed: 0 },
    { key: 'a', gen: 60, shed: 0 },
    { key: 'a', gen: 60, shed: 1 },
    { key: 'a', gen: 60, shed: 1 },
  );
  script.push({ key: 'a', gen: 10, shed: 0 }); // seek back
  for (let g = 11; g <= 20; g++) script.push({ key: 'a', gen: g, shed: 0 });
  script.push({ key: 'b', gen: 3, shed: 0 }, { key: 'b', gen: 3, shed: 0 }); // a new seed

  for (const [label, strength] of [
    ['uncoupled', 0],
    ['fluid births, strength 0.6', 0.6],
  ]) {
    const seeds = { a: fresh(5), b: fresh(6) };
    const seedState = (key) => ({
      key,
      cells: Array.from(seeds[key].cur),
      blocked: Array.from(blocked),
      rule: CULTURE_RULE,
    });
    const run = await page.evaluate((r) => window.__kcCultureHostRun(r), {
      cols: COLS,
      rows: ROWS,
      script: script.map((s) => ({ stamp: { wakeMs: 1, gen: s.gen, shed: s.shed }, seedState: seedState(s.key) })),
      density: Array.from(density),
      strength,
      seed: 3,
    });
    // the JS reference: the same per-frame bookkeeping the stage does
    let js = null;
    let key = null;
    let bad = 0;
    let firstBad = -1;
    for (let f = 0; f < script.length; f++) {
      const s = script[f];
      if (key !== s.key || !js || s.gen < js.gen) {
        js = fresh(s.key === 'a' ? 5 : 6);
        key = s.key;
      }
      for (let n = 0; js.gen < s.gen && n < SHED_STEPS[s.shed]; n++) {
        if (strength > 0) injectFluidBirths(js, density, strength, 3);
        stepCulture(js);
      }
      const got = run.frames[f];
      let diff = got.gen !== js.gen ? 1 : 0;
      for (let i = 0; i < N; i++) if (js.cur[i] !== got.grid[i]) diff++;
      if (diff && firstBad < 0) firstBad = f;
      bad += diff;
    }
    check(
      label +
        ' — the host follows the JS culture byte for byte through ramps, holds, shed rungs, a seek back and a reseed',
      bad === 0,
      bad ? `${bad} diffs, first at frame ${firstBad}` : '',
    );
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`gpuCultureHost.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('gpuCultureHost.selfcheck: ok — K2 slice 2b #2187');
