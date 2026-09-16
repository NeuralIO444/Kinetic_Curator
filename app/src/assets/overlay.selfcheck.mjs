import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay, duplicateIntoOverlay, ingestIntoOverlay, mergePool, OVERLAY_CAP } from './overlay.js';

const hostile = sanitizeOverlay([
  { id: 'user:x', svg: '<script>alert(1)</script>' },
  { id: 'org_blob', svg: '<path d="M0 0"/>' },
]);
assert.strictEqual(hostile.length, 0);

const src = ASSETS[0];
const once = duplicateIntoOverlay(src, []);
assert.ok(once.ok);
assert.ok(once.asset.id.startsWith('user:'));

const ink = ingestIntoOverlay('<svg viewBox="0 0 100 100"><path d="M0 0 L10 10" fill="#e0245e"/></svg>', [], 'wing');
assert.ok(ink.ok);
assert.strictEqual(ink.asset.id, 'user:wing');
assert.ok(ink.asset.svg.includes('var(--accent)'));

const bad = ingestIntoOverlay('<svg><script>x</script></svg>', []);
assert.strictEqual(bad.ok, false);

const merged = mergePool(ASSETS, once.overlay);
assert.strictEqual(merged.length, ASSETS.length + 1);
assert.strictEqual(merged[0].id, ASSETS[0].id);

const full = Array.from({ length: OVERLAY_CAP }, (_, i) => ({
  id: `user:slot_${i}`,
  svg: '<path d="M0 0L1 1"/>',
}));
assert.strictEqual(duplicateIntoOverlay(src, full).ok, false);
assert.strictEqual(ingestIntoOverlay('<svg><path d="M0 0"/></svg>', full).ok, false);

console.log('overlay.selfcheck: OK');
