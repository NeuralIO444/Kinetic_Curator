// node src/engine/kernel/bake/bake.selfcheck.mjs
// K4 (#63) AC1: same inputs -> identical baked positions, every run.
import assert from 'node:assert';
import { bakeParticles, bakeSwarmItems, BAKE_DT_MS } from './index.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../../data/layout-modes.js';

const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const base = {
  seed: 0xc0ffee,
  count: 40,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  activeAssets: assets,
  palette,
  canvasW: 1000,
  canvasH: 700,
  steps: 30,
};

const pos = (items) => items.map((p) => [+p.x.toFixed(9), +p.y.toFixed(9)]);

// --- AC1: determinism -------------------------------------------------------
const a = bakeParticles(base);
const b = bakeParticles(base);
assert.strictEqual(a.length, base.count, 'should bake the requested population');
assert.deepStrictEqual(pos(a), pos(b), 'AC1: identical inputs must give identical positions');

// a third run, after other work has happened, still matches
bakeParticles({ ...base, seed: 1 });
assert.deepStrictEqual(pos(bakeParticles(base)), pos(a),
  'AC1: baking a different swarm in between must not disturb the result');

// --- seed actually matters --------------------------------------------------
assert.notDeepStrictEqual(pos(bakeParticles({ ...base, seed: 0xbeef })), pos(a),
  'a different seed must give a different swarm');

// --- the simulation actually runs -------------------------------------------
const one = bakeParticles({ ...base, steps: 1 });
const many = bakeParticles({ ...base, steps: 90 });
assert.notDeepStrictEqual(pos(one), pos(many), 'more steps must move the particles');

// step count is itself deterministic
assert.deepStrictEqual(pos(bakeParticles({ ...base, steps: 90 })), pos(many));

// --- particles stay finite and on-canvas-ish --------------------------------
for (const p of many) {
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `non-finite position: ${p.x},${p.y}`);
  assert.ok(Math.abs(p.x) < 1e5 && Math.abs(p.y) < 1e5, 'positions must not blow up');
}

// --- render-item shape ------------------------------------------------------
const items = bakeSwarmItems(base);
assert.strictEqual(items.length, base.count);
for (const it of items) {
  assert.ok(it.assetId, 'baked items need an assetId to be stamped');
  assert.ok(it.color && it.accent, 'baked items need colour and accent');
}
assert.deepStrictEqual(
  bakeSwarmItems(base).map((i) => i.assetId),
  items.map((i) => i.assetId),
  'asset assignment must be stable too',
);

// --- dt is honoured ---------------------------------------------------------
assert.ok(BAKE_DT_MS > 16 && BAKE_DT_MS < 17, 'default dt should be ~60fps');
assert.notDeepStrictEqual(
  pos(bakeParticles({ ...base, dt: BAKE_DT_MS * 4 })), pos(a),
  'a different timestep must change the trajectory',
);

console.log('kernel/bake.selfcheck: OK (K4)', { particles: a.length, steps: base.steps });
