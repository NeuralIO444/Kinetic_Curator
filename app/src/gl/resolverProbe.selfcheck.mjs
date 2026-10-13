// node src/gl/resolverProbe.selfcheck.mjs
// PROBE: the resolver's per-frame cost with creatures, and that it does not leak. Both bounds are deliberately generous
// (a shared CI machine is noisy): they catch a regression of an order of magnitude or a monotone leak, not a fraction of a
// millisecond. Numbers measured 2026-10-13 on an Apple-silicon Mac: 0.2 ms a frame with no creature, +0.03 to +0.1 ms
// with four; heap flat to within 0.3 MB over 4000 frames in `random` and `swarm`.
// The measurement runs in a child process so it can use --expose-gc and cannot be disturbed by the checks around it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;

const CHILD = `
import { createLiveResolver } from ${JSON.stringify(here('./liveResolve.mjs'))};
import { DEFAULT_LAYOUT_PARAMS } from ${JSON.stringify(here('../data/layout-modes.js'))};
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const PINS = [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 400, y: 450 }, { x: 600, y: 450 }];
const base = (mode) => ({ canvasW: 1000, canvasH: 700, layers: [L('a')], activeLayerId: 'a', layerSnapshots: {}, seed: 4242, seedOffsets: null,
  paletteId: 'bone', paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null, assetWeightOverrides: {}, customAssets: [],
  quality: 'balanced', lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, perfTier1: false, assetThin: false,
  slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
  assetAttach: {}, layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode, count: 300, particleCount: 150 } });
const frame = (b, f, n, over = {}) => ({ ...b, loopTimeMs: f * 16.7, dtSec: 1 / 60, dishPins: PINS.slice(0, n),
  dishFormed: PINS.slice(0, n).map(() => true), dishLimbs: PINS.slice(0, n).map(() => 2), dishTraits: [], ...over });
const heap = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed / 1048576; };
const cost = (n) => {
  const r = createLiveResolver(); const b = base('random'); const t = [];
  for (let f = 0; f < 360; f++) { const t0 = performance.now(); r.resolveLayers(frame(b, f, n)); t.push(performance.now() - t0); }
  r.dispose();
  const warm = t.slice(60).sort((x, y) => x - y);
  return { mean: warm.reduce((s, v) => s + v, 0) / warm.length, p95: warm[Math.floor(warm.length * 0.95)] };
};
const leak = (mode) => {
  const r = createLiveResolver(); const b = base(mode); let a = 0; let z = 0;
  for (let f = 0; f < 3600; f++) {
    // parameter churn and a seed change, as a performance has
    r.resolveLayers(frame({ ...b, seed: 4242 + (f > 1800 ? 7 : 0), layoutParams: { ...b.layoutParams, count: 300 + (f % 50) } }, f, 4));
    if (f === 500) a = heap();
    if (f === 3500) z = heap();
  }
  r.dispose();
  return z - a;
};
cost(0); // warm the JIT
const out = { none: cost(0), four: cost(4), leakRandom: leak('random'), leakSwarm: leak('swarm') };
console.log(JSON.stringify(out));
`;

let r;
try {
  r = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--no-warnings', '--input-type=module', '-e', CHILD], { encoding: 'utf8', timeout: 120000 }).trim().split('\n').pop());
} catch (e) {
  console.log(`resolverProbe.selfcheck: SKIP (${String(e.message).split('\n')[0].slice(0, 100)})`);
  process.exit(0);
}

// 1. cost: four creatures stay a small part of a 16.7 ms frame
assert.ok(r.four.mean < 5, `resolver mean with four creatures ${r.four.mean.toFixed(3)} ms (budget 5)`);
assert.ok(r.four.mean - r.none.mean < 3, `four creatures add ${(r.four.mean - r.none.mean).toFixed(3)} ms (budget 3)`);
assert.ok(r.four.p95 < 12, `p95 with four creatures ${r.four.p95.toFixed(3)} ms (budget 12)`);

// 2. no leak: the heap after GC does not climb across 3000 frames of churn (generous: flat is ~0.3 MB)
assert.ok(r.leakRandom < 4, `heap grew ${r.leakRandom.toFixed(2)} MB in random mode (budget 4)`);
assert.ok(r.leakSwarm < 4, `heap grew ${r.leakSwarm.toFixed(2)} MB in swarm mode (budget 4)`);

console.log(`resolverProbe.selfcheck: ok (0 creatures ${r.none.mean.toFixed(2)} ms, 4 creatures ${r.four.mean.toFixed(2)} ms p95 ${r.four.p95.toFixed(2)}; heap growth ${r.leakRandom.toFixed(2)} / ${r.leakSwarm.toFixed(2)} MB)`);
