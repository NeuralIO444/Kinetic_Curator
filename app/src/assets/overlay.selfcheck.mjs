import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay, duplicateIntoOverlay, mergePool, OVERLAY_CAP } from './overlay.js';

const hostile = sanitizeOverlay([
  { id: 'user:x', svg: '<script>alert(1)</script>' },
  { id: 'org_blob', svg: '<path d="M0 0"/>' },
]);
assert.strictEqual(hostile.length, 0);

const src = ASSETS[0];
const once = duplicateIntoOverlay(src, []);
assert.ok(once.ok);
assert.ok(once.asset.id.startsWith('user:'));
assert.notStrictEqual(once.asset.id, src.id);

const merged = mergePool(ASSETS, once.overlay);
assert.strictEqual(merged.length, ASSETS.length + 1);
assert.strictEqual(merged[0].id, ASSETS[0].id);

const full = Array.from({ length: OVERLAY_CAP }, (_, i) => ({
  id: `user:slot_${i}`,
  svg: '<path d="M0 0L1 1"/>',
}));
const blocked = duplicateIntoOverlay(src, full);
assert.strictEqual(blocked.ok, false);

console.log('overlay.selfcheck: OK');
