// #1202 selfcheck — TE compaction engine: 4-state mirror, scale X/Y,
// kaleido dihedral, and legacy migrations.
import assert from 'node:assert';
import { normalizeLayoutParams, validateLayoutParams, MIRROR_STATES, mirrorMultiplier, symmetryParts } from '../data/layout-modes.js';
import { buildPlacements, mirrorItems, clampCount } from '../engine/buildPlacements.js';
import { computeGeometrySoA, applyAttributes } from '../engine/placement.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// ── MIRROR_STATES ──
ok('MIRROR_STATES is the 4-state enum', () => {
  assert.deepStrictEqual(MIRROR_STATES, ['off', 'x', 'y', 'xy']);
});

// ── mirrorMultiplier ──
ok('mirrorMultiplier: off=1, x/y=2, xy=4', () => {
  assert.strictEqual(mirrorMultiplier('off'), 1);
  assert.strictEqual(mirrorMultiplier('x'), 2);
  assert.strictEqual(mirrorMultiplier('y'), 2);
  assert.strictEqual(mirrorMultiplier('xy'), 4);
  assert.strictEqual(mirrorMultiplier(true), 2, 'legacy boolean true → 2');
  assert.strictEqual(mirrorMultiplier(false), 1, 'legacy boolean false → 1');
});

// ── symmetryParts ──
ok('symmetryParts parses radial and kaleido', () => {
  assert.deepStrictEqual(symmetryParts('radial-4'), { kind: 'radial', folds: 4 });
  assert.deepStrictEqual(symmetryParts('kaleido-6'), { kind: 'kaleido', folds: 6 });
  assert.deepStrictEqual(symmetryParts('bilateral'), { kind: 'bilateral', folds: 0 });
  assert.deepStrictEqual(symmetryParts('none'), { kind: 'none', folds: 0 });
});

// ── mirrorItems ──
ok('mirrorItems: x reflects across vertical axis', () => {
  const items = [{ x: 10, y: 20, rotation: 30, key: 'a' }];
  const out = mirrorItems(items, 'x', 100, 100);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[1].x, 90, 'W - x');
  assert.strictEqual(out[1].y, 20, 'y unchanged');
  assert.strictEqual(out[1].rotation, -30, 'rotation negated');
  assert.strictEqual(out[1]._mirrored, true, 'chirality flagged');
  assert.strictEqual(out[1].key, 'a-mx');
});

ok('mirrorItems: y reflects across horizontal axis', () => {
  const items = [{ x: 10, y: 20, rotation: 30, key: 'a' }];
  const out = mirrorItems(items, 'y', 100, 100);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[1].x, 10, 'x unchanged');
  assert.strictEqual(out[1].y, 80, 'H - y');
  assert.strictEqual(out[1].rotation, -30, 'rotation negated');
  assert.strictEqual(out[1]._mirrored, true);
  assert.strictEqual(out[1].key, 'a-my');
});

ok('mirrorItems: xy quadruples with 180° turn', () => {
  const items = [{ x: 10, y: 20, rotation: 30, key: 'a' }];
  const out = mirrorItems(items, 'xy', 100, 100);
  assert.strictEqual(out.length, 4);
  // The 4th item is the double-mirror (180° turn).
  const d = out[3];
  assert.strictEqual(d.x, 90, 'W - x');
  assert.strictEqual(d.y, 80, 'H - y');
  assert.strictEqual(d.rotation, 30, 'rotation unchanged (chirality restored)');
  assert.strictEqual(d._mirrored, undefined, 'not flagged');
  assert.strictEqual(d.key, 'a-mxy');
});

ok('mirrorItems: off returns items unchanged', () => {
  const items = [{ x: 10, y: 20, key: 'a' }];
  assert.strictEqual(mirrorItems(items, 'off', 100, 100), items);
  assert.strictEqual(mirrorItems(items, 'none', 100, 100).length, 1);
});

// ── clampCount ──
ok('clampCount scales the cap by the mirror multiplier', () => {
  const caps = { maxCount: 800, maxCountMirrored: 650 };
  assert.strictEqual(clampCount(800, 'off', caps), 800);
  assert.strictEqual(clampCount(800, 'x', caps), 650, '2× mirror halves the cap');
  assert.strictEqual(clampCount(800, 'y', caps), 650);
  assert.strictEqual(clampCount(800, 'xy', caps), 325, '4× mirror quarters the cap');
});

// ── scale X/Y ──
ok('scale: linked Y is a provable no-op', () => {
  const soa = computeGeometrySoA({ mode: 'grid', count: 50, seed: 1, canvasW: 100, canvasH: 100 });
  applyAttributes(soa, { scale: { x: [0.4, 1.6], y: [0.4, 1.6] }, rotate: [0, 0], alpha: [100, 100] });
  for (let k = 0; k < soa.n; k++) {
    assert.strictEqual(soa.scaleY[k], soa.scale[k], `item ${k}: Y === X when linked`);
  }
});

ok('scale: unlinked Y draws independently', () => {
  const soa = computeGeometrySoA({ mode: 'grid', count: 50, seed: 1, canvasW: 100, canvasH: 100 });
  applyAttributes(soa, { scale: { x: [0.2, 2.0], y: [0.5, 0.5] }, rotate: [0, 0], alpha: [100, 100] });
  const xs = [...soa.scale], ys = [...soa.scaleY];
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1, 'X varies');
  assert.ok(ys.every((v) => v === 0.5), 'Y constant at 0.5');
});

// ── legacy migrations ──
ok('normalize migrates legacy array scale to linked {x, y}', () => {
  const lp = normalizeLayoutParams({ scale: [0.5, 2.0] });
  assert.deepStrictEqual(lp.scale, { x: [0.5, 2.0], y: [0.5, 2.0] });
});

ok('normalize migrates legacy boolean mirror', () => {
  assert.strictEqual(normalizeLayoutParams({ mirror: true }).mirror, 'x');
  assert.strictEqual(normalizeLayoutParams({ mirror: false }).mirror, 'off');
});

ok('validate accepts legacy booleans for mirror without rejection', () => {
  const { params, rejected } = validateLayoutParams({ mirror: true });
  assert.strictEqual(params.mirror, 'x');
  assert.ok(!rejected.includes('mirror'), 'migrated, not rejected');
});

console.log(`\n#1202.selfcheck: ${n} checks passed`);
