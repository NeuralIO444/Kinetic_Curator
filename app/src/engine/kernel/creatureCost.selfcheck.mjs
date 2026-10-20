// creatureCost.selfcheck.mjs — #1694 slice 2: the citizen's cost declarations vs measurement.
//
// The registry carries one declaration per creature family (creature/moth,
// creature/dish — engine/kernel/costRegistry.mjs), measured the weather way:
// the live resolver driven by a child process on a creature-bearing scene,
// per-frame medians, the family stage minus the empty stage. This suite
//   1. pins the declarations' shape (present, tier 0 — the citizen sheds by
//      the governor's count cut, never the effect ladder — positive time);
//   2. judges them against the 2.0 ms creature allowance (data/quality.js):
//      over the allowance FAILS; at ≥80% of it (the #1639 near-bust rule)
//      the suite says so in its output, never rounds it down;
//   3. RE-MEASURES both families in a child process and asserts the fresh
//      medians sit in the declared band — the band is wide on purpose (a
//      shared sandbox's CPU is not the device; the declarations are
//      sandbox-labelled in the registry), and its job is to catch an
//      order-of-magnitude lie, not to re-litigate decimals;
//   4. pins the budget report's wiring (rows read from the registry,
//      judged by the allowance export — nothing hard-coded).
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getCostTier } from './costRegistry.mjs';
import { CREATURE_FRAME_ALLOWANCE_MS, FRAME_BUDGETS } from '../../data/quality.js';

const nearBustFrom = CREATURE_FRAME_ALLOWANCE_MS * FRAME_BUDGETS.ipad.nearBustRatio;
const verdict = (ms) => (ms > CREATURE_FRAME_ALLOWANCE_MS ? 'BUST' : ms >= nearBustFrom ? 'NEAR-BUST' : 'ok');

for (const id of ['creature/moth', 'creature/dish']) {
  const d = getCostTier(id);
  assert.ok(d, `${id} is declared in the cost registry`);
  assert.equal(d.tier, 0, `${id} is tier 0 (structural — sheds by the count cut, not the ladder)`);
  assert.ok(d.timeMs > 0, `${id} declares a measured, positive time`);
  assert.ok(d.timeMs <= CREATURE_FRAME_ALLOWANCE_MS, `${id} at ${d.timeMs} ms BUSTS the ${CREATURE_FRAME_ALLOWANCE_MS} ms creature allowance`);
  console.log(`  [declare] ${id}: ${d.timeMs} ms = ${(100 * d.timeMs / CREATURE_FRAME_ALLOWANCE_MS).toFixed(0)}% of the ${CREATURE_FRAME_ALLOWANCE_MS} ms allowance — ${verdict(d.timeMs)}`);
}
const combined = getCostTier('creature/moth').timeMs + getCostTier('creature/dish').timeMs;
assert.ok(combined <= CREATURE_FRAME_ALLOWANCE_MS, `both families at their own caps (${combined} ms, conservative) BUST the allowance`);
console.log(`  [declare] combined (conservative — the 4-pin cap means the caps cannot co-occur): ${combined.toFixed(2)} ms — ${verdict(combined)}`);

// ── re-measurement (child process, resolver-probe pattern) ──────────────────
const srcUrl = (p) => pathToFileURL(new URL(`../../${p}`, import.meta.url).pathname).href;
const CHILD = `
import { createLiveResolver } from ${JSON.stringify(srcUrl('gl/liveResolve.mjs'))};
import { DEFAULT_LAYOUT_PARAMS } from ${JSON.stringify(srcUrl('data/layout-modes.js'))};
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const PINS = [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 400, y: 450 }, { x: 600, y: 450 }];
const base = { canvasW: 1000, canvasH: 700, layers: [L('a')], activeLayerId: 'a', layerSnapshots: {}, seed: 4242, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [],
  quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, perfTier1: false, assetThin: false,
  slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
  assetAttach: {}, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 300, particleCount: 150 } };
const frame = (f, over) => ({ ...base, loopTimeMs: f * 16.7, dtSec: 1 / 60, dishTraits: [], ...over });
const NONE = { dishPins: [], dishFormed: [], dishLimbs: [], dishHosted: [], dishPressure: [] };
const MOTHS4 = { dishPins: PINS, dishFormed: [true, true, true, true], dishLimbs: [2, 2, 2, 2], dishHosted: [false, false, false, false], dishPressure: [1, 1, 1, 1] };
const DISH1 = { dishPins: [PINS[0]], dishFormed: [true], dishLimbs: [2], dishHosted: [true], dishPressure: [1] };
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const cost = (scene) => {
  const r = createLiveResolver(); const t = [];
  for (let f = 0; f < 420; f++) { const t0 = performance.now(); r.resolveLayers(frame(f, scene)); if (f >= 60) t.push(performance.now() - t0); }
  r.dispose();
  return med(t);
};
cost(NONE);
console.log(JSON.stringify({ none: cost(NONE), moths: cost(MOTHS4), dish: cost(DISH1) }));
`;
const runs = [];
for (let i = 0; i < 3; i++) {
  const out = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', CHILD], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop();
  runs.push(JSON.parse(out));
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const measured = {
  moth: median(runs.map((r) => r.moths - r.none)),
  dish: median(runs.map((r) => r.dish - r.none)),
};
console.log(`  [measure] sandbox medians of 3 runs — moth ${measured.moth.toFixed(3)} ms, dish ${measured.dish.toFixed(3)} ms`);
assert.ok(measured.moth > measured.dish, 'the moth family measures costlier than the dish creature (ordering truth)');
for (const id of ['creature/moth', 'creature/dish']) {
  const fam = id.endsWith('moth') ? 'moth' : 'dish';
  const declared = getCostTier(id).timeMs;
  const m = measured[fam];
  assert.ok(m > 0, `${id}: the family really costs something on re-measurement`);
  assert.ok(m >= declared / 3 && m <= Math.max(declared * 3, declared + 0.15),
    `${id}: re-measured ${m.toFixed(3)} ms vs declared ${declared} ms — outside the sandbox band (an order-of-magnitude drift, not noise)`);
  console.log(`  [measure] ${id}: declared ${declared} ms, re-measured ${m.toFixed(3)} ms — in band`);
}

// ── the budget report reads the registry, judged by the allowance ──────────
const report = readFileSync(new URL('../../../scripts/costBudgetReport.mjs', import.meta.url), 'utf8');
assert.ok(/allCostTiers\(\)/.test(report) && /CREATURE_FRAME_ALLOWANCE_MS/.test(report), 'the budget report reads creature rows from the registry against the allowance export');

console.log('creatureCost.selfcheck: ok (#1694 S2 — declarations honest, in band, under the allowance)');
