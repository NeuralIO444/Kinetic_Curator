// node src/gl/parity/cultureLifeSim.selfcheck.mjs — CULTURE Phase 1, slice K2 (the parent issue 2187):
// the culture world's DISH LIFE culture on the GPU kernel (gl/cultureSim.mjs, backend gpu.life.v1)
// against the world's own JS reference (engine/dishLife.mjs stepCulture + the #1997 birth seam,
// js.life.v1), seeded from a culture world's birth grid and stepped at the world's own cadence
// (the JS side advances ONLY through the world's scheduler, in generation chunks; the density the
// births read at each generation is captured from the world at that generation boundary and handed
// to the GPU as that generation's density texture — the shader-space coupling, no readback).
//
// THE LAW: the culture is integer state, so the bar is EXACT equality, every generation — the
// K2 slice-1 precedent (parity/cultureSim.selfcheck). One documented boundary: the birth deal's
// draws are bit-identical integer hashes on both sides, but the threshold compare is float32 in
// the shader (see CULTURE_BIRTH_FS), so a draw landing within ~2^-24 of its chance could flip.
// This suite therefore MEASURES the margin first (pure JS): every candidate draw of the run is
// asserted to land more than 1e-5 from its threshold — two orders past the compare window — so
// the byte-exact assertion below is a claim about the kernels, never a coin flip.
import assert from 'node:assert/strict';
import {
  CULTURE_LIFE_STEP_DIVISOR,
  CULTURE_COUPLING,
  createCultureWorld,
  stepCultureWorld,
  cultureFluidDensity,
} from '../../engine/cultureWorld.mjs';
import { createCulture, stepCulture, CULTURE_RULE } from '../../engine/dishLife.mjs';
import { fluidBirthChance, FLUID_BIRTH_CHANNEL } from '../../engine/dishFluidCouple.mjs';
import { hashU01 } from '../../engine/kernel/rng.js';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

const SEED = 20261122;
const GENS = 40;

// The JS side: a culture world advanced only through its own scheduler, one generation chunk
// at a time. Per generation: the grid the culture stood at, the density its births read (the
// fluid's state at the generation boundary — the births inside the chunk read exactly this,
// as the world suite's lockstep group proves), and the grid it landed on.
const w = createCultureWorld({ seed: SEED });
const birthGrid = Array.from(w.life.cur);
const densities = [];
const grids = [];
let minMargin = Infinity;
for (let g = 0; g < GENS; g++) {
  const before = Uint8Array.from(w.life.cur);
  for (let s = 0; s < CULTURE_LIFE_STEP_DIVISOR; s++) stepCultureWorld(w);
  const density = cultureFluidDensity(w);
  densities.push(Array.from(density));
  grids.push(Array.from(w.life.cur));
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== 0) continue;
    const chance = fluidBirthChance(density[i], CULTURE_COUPLING);
    if (!(chance > 0)) continue;
    const draw = hashU01(SEED | 0, FLUID_BIRTH_CHANNEL, g * 8192 + i);
    minMargin = Math.min(minMargin, Math.abs(draw - chance));
  }
}
assert.equal(w.life.gen, GENS, 'the world cadence lands exactly on the generation count');
assert.ok(
  minMargin > 1e-5,
  `every birth draw of the run clears its threshold by > 1e-5 (measured ${minMargin.toExponential(2)}) — the float32 compare cannot flip one`,
);
console.log(`  [ok] margin guard: closest birth draw is ${minMargin.toExponential(2)} from its threshold`);

// The lint job's runner skips `playwright install` to stay fast (same as cultureSim.selfcheck.mjs):
// no browser there is a skip, not a failure. The selfcheck-browser job and dev machines run it.
let harness;
try {
  harness = await openHarnessPage('/parity/cultureSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log(
      '  [skip] GPU culture-life vs the world JS reference: Playwright browser not installed in this environment',
    );
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
  // The coupled run: the world's own density sequence, dealt in shader space.
  const g = await page.evaluate((r) => window.__kcCultureBirthsSeqRun(r), {
    cols: w.life.cols,
    rows: w.life.rows,
    state: birthGrid,
    blocked: null,
    rule: CULTURE_RULE,
    densities,
    strength: CULTURE_COUPLING,
    seed: SEED,
    gens: GENS,
  });
  let firstBad = -1;
  for (let k = 0; k < GENS; k++) {
    if (firstBad < 0 && !grids[k].every((v, i) => v === g.samples[k][i])) firstBad = k + 1;
  }
  check(
    `coupled: GPU culture byte-identical to the world's culture at every one of ${GENS} generations`,
    firstBad < 0,
    firstBad >= 0
      ? `first mismatch at generation ${firstBad}`
      : 'in-shader births + step, the world’s density sequence',
  );

  // The control: a zero density sequence deals no births — the GPU run is the bare rule,
  // stepped here in JS from the same birth grid.
  const ref = createCulture({
    cols: w.life.cols,
    rows: w.life.rows,
    rule: CULTURE_RULE,
    seed: Uint8Array.from(birthGrid),
  });
  const zero = densities.map((d) => d.map(() => 0));
  const gz = await page.evaluate((r) => window.__kcCultureBirthsSeqRun(r), {
    cols: w.life.cols,
    rows: w.life.rows,
    state: birthGrid,
    blocked: null,
    rule: CULTURE_RULE,
    densities: zero,
    strength: CULTURE_COUPLING,
    seed: SEED,
    gens: GENS,
  });
  let badZ = -1;
  for (let k = 0; k < GENS; k++) {
    stepCulture(ref);
    if (badZ < 0 && !Array.from(ref.cur).every((v, i) => v === gz.samples[k][i])) badZ = k + 1;
  }
  check(
    'control: zero density is the bare rule on GPU too, byte-identical every generation',
    badZ < 0,
    badZ >= 0 ? `first mismatch at generation ${badZ}` : '',
  );
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`cultureLifeSim.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log(
  'cultureLifeSim.selfcheck: ok — the world’s soil on GPU matches its JS reference byte-for-byte, births included',
);
