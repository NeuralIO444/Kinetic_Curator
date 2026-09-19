// node src/engine/kernel/bake/swarmWasm.selfcheck.mjs
//
// #175 — Rust/wasm swarm fast path: the module loads, the noise field is
// bit-identical to noise.js, the port is faithful (tight gates at low step
// counts), long bakes agree with JS at the distribution level, out-of-scope
// configs fall back to JS exactly, and the 400x120 workload is faster than
// the JS engine it replaces.
//
// On fidelity: the swarm is chaotic, and the wasm module evaluates sin/cos/
// atan2 with libm while JS uses V8's implementations (~1 ulp apart — the same
// gap the engine already documents between x64 and arm64 in kernel/bake's
// header). A 1-ulp wind-force perturbation grows ~1.35x per step, so after
// ~60 steps the two trajectories are microscopically different swarms with
// the same macroscopic distribution. The gates below assert exactly that:
// bit-exact noise, near-exact short bakes, distribution-level long bakes.
import assert from 'node:assert';
import { bakeParticles } from './index.js';
import {
  ensureSwarmWasm,
  getSwarmWasm,
  wasmBakeEligible,
  swarmWasmLoadError,
} from './swarmWasm.mjs';
import { createNoise } from '../../noise.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const base = {
  seed: 0xa17e9b21,
  count: 400,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  activeAssets: assets,
  palette,
  canvasW: 1000,
  canvasH: 700,
  steps: 120,
};

const wasm = await ensureSwarmWasm();
assert.ok(wasm, `swarm wasm must load in Node (checked-in artifact): ${swarmWasmLoadError()}`);
assert.ok(getSwarmWasm(), 'getSwarmWasm() must return the loaded module');
console.log('[ok] wasm module loads and instantiates');

{
  const points = [
    [0, 0, 0], [1.5, -2.25, 3.125], [100.7, 200.3, 0.5],
    [-50.25, 75.5, -12.75], [0.001, 0.002, 999.999], [-999.5, -999.5, -999.5],
  ];
  const seeds = [444, 0, 1, 7, 0xa17e9b21, -7, 3.14, NaN];
  let checked = 0;
  for (const seed of seeds) {
    const js = createNoise(seed);
    for (const [x, y, z] of points) {
      const a = js.noise3D(x, y, z);
      const b = wasm.instance.exports.swarm_noise3d(seed, x, y, z);
      assert.ok(Object.is(a, b), `noise mismatch: seed=${seed} (${x},${y},${z}) js=${a} wasm=${b}`);
      checked++;
    }
  }
  console.log(`[ok] noise bit-identical to JS across ${checked} seed/point combos`);
}

function maxPosDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    if (d > m) m = d;
  }
  return m;
}
{
  for (const [steps, limit] of [[1, 1e-12], [10, 1e-9]]) {
    const js = bakeParticles({ ...base, steps, engine: 'js' });
    const w = bakeParticles({ ...base, steps, engine: 'wasm' });
    const d = maxPosDiff(js, w);
    assert.ok(d <= limit, `wasm/JS fidelity at ${steps} steps: ${d} > ${limit}`);
    console.log(`[ok] wasm vs JS at ${steps} steps: max pos diff ${d.toExponential(2)} (limit ${limit})`);
  }
}

const w1 = bakeParticles({ ...base, engine: 'wasm' });
const w2 = bakeParticles({ ...base, engine: 'wasm' });
assert.strictEqual(w1.length, w2.length);
for (let i = 0; i < w1.length; i++) {
  assert.ok(Object.is(w1[i].x, w2[i].x) && Object.is(w1[i].y, w2[i].y),
    `wasm bake not deterministic at particle ${i}`);
}
console.log('[ok] wasm bake is exactly deterministic run-to-run');

const wDiff = bakeParticles({ ...base, seed: 0xbeef, engine: 'wasm' });
assert.ok(maxPosDiff(w1, wDiff) > 1, 'a different seed must give a different wasm swarm');
console.log('[ok] wasm bake is seed-sensitive');

function distStats(items) {
  let mx = 0, my = 0;
  for (const p of items) { mx += p.x; my += p.y; }
  mx /= items.length; my /= items.length;
  let sx = 0, sy = 0;
  for (const p of items) { sx += (p.x - mx) ** 2; sy += (p.y - my) ** 2; }
  return { mx, my, sdx: Math.sqrt(sx / items.length), sdy: Math.sqrt(sy / items.length) };
}
for (const seed of [0xa17e9b21, 12345]) {
  const js = bakeParticles({ ...base, seed, engine: 'js' });
  const w = bakeParticles({ ...base, seed, engine: 'wasm' });
  const a = distStats(js), b = distStats(w);
  const cdx = Math.abs(a.mx - b.mx), cdy = Math.abs(a.my - b.my);
  const sdx = Math.abs(a.sdx - b.sdx), sdy = Math.abs(a.sdy - b.sdy);
  assert.ok(cdx <= 15 && cdy <= 15, `centroid drift too large: ${cdx}, ${cdy}`);
  assert.ok(sdx <= 8 && sdy <= 8, `spread drift too large: ${sdx}, ${sdy}`);
  for (const p of w) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'non-finite wasm position');
  }
  console.log(`[ok] 120-step distribution: centroid drift (${cdx.toFixed(2)}, ${cdy.toFixed(2)})px, ` +
    `spread drift (${sdx.toFixed(2)}, ${sdy.toFixed(2)})px`);
}

assert.deepStrictEqual(wasmBakeEligible({ layoutParams: { mode: 'swarm' }, count: 10 }).ok, true);
for (const [label, args, reason] of [
  ['hype mode', { layoutParams: { mode: 'hype' }, count: 10 }, 'organism-mode'],
  ['contacts', { layoutParams: { mode: 'swarm', contactRadius: 5 }, count: 10 }, 'contacts'],
  ['attractor', { layoutParams: { mode: 'swarm' }, attractor: { x: 1, y: 2 }, count: 10 }, 'attractor'],
  ['empty', { layoutParams: { mode: 'swarm' }, count: 0 }, 'empty'],
  // #287 — the wasm cloud path doesn't implement the breathing scale
  // modulation; the JS engine handles it.
  ['breath', { layoutParams: { mode: 'swarm', breath: 0.5 }, count: 10 }, 'breath'],
]) {
  const r = wasmBakeEligible(args);
  assert.strictEqual(r.ok, false, `${label} must be ineligible`);
  assert.strictEqual(r.reason, reason, `${label} reason`);
}
console.log('[ok] scope gate routes hype/contacts/attractor/empty/breath to JS');

{
  const small = { ...base, count: 40, steps: 30 };
  const hypeJs = bakeParticles({ ...small, layoutParams: { ...small.layoutParams, mode: 'hype' }, engine: 'js' });
  const hypeWasm = bakeParticles({ ...small, layoutParams: { ...small.layoutParams, mode: 'hype' }, engine: 'wasm' });
  assert.deepStrictEqual(
    hypeWasm.map((p) => [p.x, p.y]),
    hypeJs.map((p) => [p.x, p.y]),
    'hype + engine:"wasm" must fall back to the JS engine exactly',
  );
  const contactJs = bakeParticles({ ...small, layoutParams: { ...small.layoutParams, contactRadius: 8 }, engine: 'js' });
  const contactWasm = bakeParticles({ ...small, layoutParams: { ...small.layoutParams, contactRadius: 8 }, engine: 'wasm' });
  assert.deepStrictEqual(
    contactWasm.map((p) => [p.x, p.y]),
    contactJs.map((p) => [p.x, p.y]),
    'contacts + engine:"wasm" must fall back to the JS engine exactly',
  );
  globalThis.process.env.KC_SWARM_WASM = '0';
  try {
    const forced = bakeParticles({ ...small, engine: 'auto' });
    const plain = bakeParticles({ ...small, engine: 'js' });
    assert.deepStrictEqual(
      forced.map((p) => [p.x, p.y]),
      plain.map((p) => [p.x, p.y]),
      'KC_SWARM_WASM=0 must force the JS engine',
    );
  } finally {
    delete globalThis.process.env.KC_SWARM_WASM;
  }
  console.log('[ok] fallback paths produce exactly the JS result');
}

// --- 9. performance: HARD = not slower than JS; SOFT = 30ms reference budget ---
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function timeMs(fn, { warmup, trials }) {
  for (let i = 0; i < warmup; i++) fn();
  const ts = [];
  for (let i = 0; i < trials; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return median(ts);
}
{
  const REF_BUDGET_MS = 30;
  const jsMs = timeMs(() => bakeParticles({ ...base, engine: 'js' }), { warmup: 1, trials: 5 });
  const wasmMs = timeMs(() => bakeParticles({ ...base, engine: 'wasm' }), { warmup: 2, trials: 7 });
  const ratio = jsMs / Math.max(wasmMs, 1e-9);
  const underBudget = wasmMs <= REF_BUDGET_MS;
  const enforce = String(globalThis.process?.env?.KC_WASM_ENFORCE_BUDGET || '') === '1';

  console.log(
    `  [${underBudget ? 'OK  ' : 'SOFT'}] wasm bake 400x120: ${wasmMs.toFixed(2)}ms ` +
    `(reference budget ${REF_BUDGET_MS}ms${enforce ? ', ENFORCED' : ', advisory'})`,
  );
  console.log(`  [info] JS baseline on this machine: ${jsMs.toFixed(2)}ms — wasm is ${ratio.toFixed(2)}x faster`);
  console.log('  [info] reference machine (JS ~36ms per #175) projects to ' +
    `${(36 / ratio).toFixed(1)}ms for wasm`);

  assert.ok(wasmMs <= jsMs * 1.05,
    `wasm must not be slower than JS: wasm ${wasmMs.toFixed(2)}ms > JS ${jsMs.toFixed(2)}ms`);

  if (enforce && !underBudget) {
    assert.fail(
      `KC_WASM_ENFORCE_BUDGET=1: wasm ${wasmMs.toFixed(2)}ms exceeds reference budget ${REF_BUDGET_MS}ms`,
    );
  }
}
console.log('\nswarmWasm.selfcheck: all green (parity hard; budget soft unless KC_WASM_ENFORCE_BUDGET=1)');
