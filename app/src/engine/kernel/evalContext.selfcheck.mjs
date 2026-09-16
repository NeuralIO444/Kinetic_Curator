// EvalContext ABI parity + Transferable-shape selfcheck (#108 item 5)
//
//   node src/engine/kernel/evalContext.selfcheck.mjs

import assert from 'node:assert';
import { evaluate } from './evalContext.js';
import { buildPlacements } from '../buildPlacements.js';

const LAYOUT_PARAMS = {
  mode: 'grid', composition: 'default', count: 40,
  scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
  jitter: 10, density: 100, zTiers: 1, bleed: false,
  mirror: false, overlap: true, displacement: 0,
  noiseFreq: 0.005, noiseSpeed: 0.5,
};
const ASSETS = [
  { id: 'a', weight: 'heavy' }, { id: 'b', weight: 'medium' }, { id: 'c', weight: 'light' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const CAPS = { maxCount: 420, maxCountMirrored: 360, allowMirror: true };
const SEED = 0x1a4f;
const CANVAS_W = 1000;
const CANVAS_H = 700;

const baseCtx = {
  seed: SEED,
  layout: { layoutParams: LAYOUT_PARAMS, canvasW: CANVAS_W, canvasH: CANVAS_H, caGrid: null },
  palette: PALETTE,
  assets: ASSETS,
  caps: CAPS,
};

// ── (a) parity: evaluate(ctx) must match buildPlacements(flattened args) ───
const viaCtx = evaluate({ ...baseCtx, t: 0 });
const viaDirect = buildPlacements({
  layoutParams: LAYOUT_PARAMS,
  seed: SEED,
  activeAssets: ASSETS,
  palette: PALETTE,
  caGrid: null,
  caps: CAPS,
  canvasW: CANVAS_W,
  canvasH: CANVAS_H,
});

assert.deepStrictEqual(viaCtx, viaDirect, 'evaluate(ctx) must match buildPlacements(...) exactly');
assert.ok(viaCtx.items.length > 0, 'sanity: fixture should produce items');

// `t` is documented as unthreaded (see evalContext.js) — prove that holds:
// two contexts differing only in t must produce identical output.
const viaCtxOtherT = evaluate({ ...baseCtx, t: 999.5 });
assert.deepStrictEqual(viaCtxOtherT, viaCtx, 'ctx.t must not affect evaluate() output (documented no-op)');

// ── (b) buffers round-trip. The pooled cache is where the actual typed
// arrays / SoA columns live (buildPlacements writes cache.soa/etc in place —
// see buildPlacements.js's staged-eval comment). ctx.buffers IS that cache
// object, so after a call it holds the real Transferable-relevant state.
// structuredClone is what postMessage uses under the hood, so a clean
// round-trip here proves handing this object across a Worker boundary loses
// nothing, without spinning a Worker up.
const buffers = {};
evaluate({ ...baseCtx, t: 0, buffers });

assert.ok(buffers.soa, 'evaluate should populate ctx.buffers.soa via buildPlacements\' cache');
const clonedBuffers = structuredClone(buffers);
assert.deepStrictEqual(clonedBuffers, buffers, 'buffers must round-trip through structuredClone unchanged');
for (const key of ['x', 'y', 'scale', 'rotation', 'alpha', 't', 'index', 'zTier']) {
  assert.ok(ArrayBuffer.isView(buffers.soa[key]), `soa.${key} should be a typed array`);
  assert.strictEqual(
    clonedBuffers.soa[key].constructor,
    buffers.soa[key].constructor,
    `soa.${key} typed-array kind must survive the clone`,
  );
}

// ── (b2) the returned {preset, items, safeCount} is itself structured-clone
// safe too — the other half of a Worker round trip (main thread receiving
// the built items back) needs no special handling either.
const clonedResult = structuredClone(viaCtx);
assert.deepStrictEqual(clonedResult, viaCtx, 'evaluate() result must round-trip through structuredClone unchanged');

console.log('evalContext.selfcheck: OK', {
  items: viaCtx.items.length,
  safeCount: viaCtx.safeCount,
  soaCapacity: buffers.soa.x.length,
});
