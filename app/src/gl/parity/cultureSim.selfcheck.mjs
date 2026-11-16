// node src/gl/parity/cultureSim.selfcheck.mjs — K2 (#2187) slice 1: the GPU culture kernel against the JS reference.
// The culture is integer state, so the bar is EXACT equality, every generation: stepCulture and the GPU pass must produce the
// same bytes from the same seed, including decay states, glass (mask) and bedrock. Pure half first (runs everywhere).
import assert from 'node:assert/strict';
import {
  createCulture,
  stepCulture,
  seedRandom,
  ellipseMask,
  CULTURE_RULE,
  DEFAULT_RULE,
} from '../../engine/dishLife.mjs';
import { cultureRuleMasks } from '../cultureSim.mjs';
import { hashBase, hashU32 } from '../../engine/kernel/rng.js';
import { injectFluidBirths, FLUID_BIRTH_CHANNEL } from '../../engine/dishFluidCouple.mjs';
import { openHarnessPage, closeGlDriver } from './glDriver.mjs';

// ---- pure: the rule masks agree with the JS luts
{
  for (const rule of [
    CULTURE_RULE,
    DEFAULT_RULE,
    { birth: [3, 6], survive: [2, 3], states: 4 },
    { birth: [], survive: [0, 8], states: 16 },
  ]) {
    const c = createCulture({ cols: 4, rows: 4, rule });
    const m = cultureRuleMasks(rule);
    for (let k = 0; k <= 8; k++) {
      assert.equal((m.birth >> k) & 1, c.birthLut[k], `birth bit ${k}`);
      assert.equal((m.survive >> k) & 1, c.surviveLut[k], `survive bit ${k}`);
    }
    assert.equal(m.states, c.rule.states);
  }
  // junk entries are ignored, as the JS lut ignores them
  assert.equal(cultureRuleMasks({ birth: [3, 9, -1, 1.5, 'x'], survive: [], states: 8 }).birth, 1 << 3);
  console.log('  [ok] rule masks match the JS luts');
}

// ---- pure: the birth shader's integer hash (base ^ index*c, avalanche) is hashU32 — bit for bit
{
  const avalanche = (base, index) => {
    let h = (base ^ Math.imul(index, 0x85ebca6b)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h || 1;
  };
  for (const seed of [0, 1, 7, 444, -5, 0x7fffffff]) {
    const base = hashBase(seed, FLUID_BIRTH_CHANNEL);
    for (const idx of [0, 1, 95, 5183, 8192 * 3 + 17, 8192 * 4000 + 5183]) {
      assert.equal(avalanche(base, idx), hashU32(seed, FLUID_BIRTH_CHANNEL, idx), `seed ${seed} idx ${idx}`);
    }
  }
  console.log('  [ok] hashBase + the shader avalanche reproduce hashU32 exactly');
}

const COLS = 96;
const ROWS = 54;
let harness;
try {
  harness = await openHarnessPage('/parity/cultureSim.html');
} catch (e) {
  if (String(e && e.message).includes("Executable doesn't exist")) {
    console.log('  [skip] GPU culture kernel vs JS: Playwright browser not installed in this environment');
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
  for (let i = 0; i < bedrock.length; i += 37) bedrock[i] = 1;
  const cases = [
    ['CULTURE_RULE, open dish, 120 gens', CULTURE_RULE, null, null, 11, 120],
    ['CULTURE_RULE, glass + bedrock, 120 gens', CULTURE_RULE, mask, bedrock, 12, 120],
    ['DEFAULT_RULE, glass, 80 gens', DEFAULT_RULE, mask, null, 13, 80],
    ['B36/S23 4-state, bedrock, 60 gens', { birth: [3, 6], survive: [2, 3], states: 4 }, null, bedrock, 14, 60],
  ];
  for (const [label, rule, m, b, seed, gens] of cases) {
    const c = createCulture({
      cols: COLS,
      rows: ROWS,
      rule,
      seed: seedRandom(COLS, ROWS, seed, 0.35),
      mask: m,
      bedrock: b,
    });
    const start = Uint8Array.from(c.cur);
    const blocked = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < blocked.length; i++) blocked[i] = (m && !m[i]) || (b && b[i]) ? 1 : 0;
    const run = {
      cols: COLS,
      rows: ROWS,
      state: Array.from(start),
      blocked: Array.from(blocked),
      rule,
      gens,
      sampleEvery: 10,
    };
    const g = await page.evaluate((r) => window.__kcCultureRun(r), run);
    let firstBad = -1;
    let gi = 0;
    for (let n = 1; n <= gens; n++) {
      stepCulture(c);
      if (n % 10 === 0) {
        const grid = g.samples[gi++].grid;
        if (firstBad < 0 && !c.cur.every((v, i) => v === grid[i])) firstBad = n;
      }
    }
    check(
      label + ' — byte-identical to stepCulture at every 10th generation',
      firstBad < 0,
      firstBad >= 0 ? `first mismatch by gen ${firstBad}` : '',
    );
    check(
      label + ' — final grid identical',
      c.cur.every((v, i) => v === g.final[i]),
    );
  }

  // ---- in-shader fluid births (K2 slice 2): per generation, against injectFluidBirths + stepCulture
  {
    const N = COLS * ROWS;
    const density = new Float32Array(N);
    for (let i = 0; i < N; i++) density[i] = ((i * 37) % 128) / 128; // exactly representable; spans the 0.25 floor
    for (const [label, strength, seed, gens] of [
      ['strength 0.8', 0.8, 9, 40],
      ['strength 0.3', 0.3, 21, 40],
      ['strength 0 is the plain culture', 0, 5, 20],
    ]) {
      const c = createCulture({ cols: COLS, rows: ROWS, rule: CULTURE_RULE, seed: seedRandom(COLS, ROWS, seed, 0.3), mask, bedrock });
      const start = Uint8Array.from(c.cur);
      const blocked = new Uint8Array(N);
      for (let i = 0; i < N; i++) blocked[i] = (mask && !mask[i]) || bedrock[i] ? 1 : 0;
      const g = await page.evaluate(
        (r) => window.__kcCultureBirthsRun(r),
        { cols: COLS, rows: ROWS, state: Array.from(start), blocked: Array.from(blocked), rule: CULTURE_RULE, density: Array.from(density), strength, seed, gens },
      );
      let bad = 0;
      let firstBad = -1;
      for (let n = 0; n < gens; n++) {
        injectFluidBirths(c, density, strength, seed);
        stepCulture(c);
        const grid = g.samples[n];
        let diff = 0;
        for (let i = 0; i < N; i++) if (c.cur[i] !== grid[i]) diff++;
        if (diff && firstBad < 0) firstBad = n + 1;
        bad += diff;
      }
      check(label + ' — in-shader births byte-identical to injectFluidBirths + stepCulture every generation', bad === 0, bad ? `${bad} cells differ, first at gen ${firstBad}` : '');
    }
  }
} finally {
  await close();
  await closeGlDriver();
}
if (failed) {
  console.error(`cultureSim.selfcheck: ${failed} FAILED`);
  process.exit(1);
}
console.log('cultureSim.selfcheck: ok — K2 slice 1 #2187');
