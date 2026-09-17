import assert from 'node:assert';
import { ASSETS } from '../data/assets/index.js';
import {
  sanitizeOverlay, duplicateIntoOverlay, ingestIntoOverlay, mergePool,
  renameOverlayAsset, replaceOverlayAsset, OVERLAY_CAP,
} from './overlay.js';

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

// ── #134 QA gap: cap boundary behavior at 31 / 32 / 33 ─────────────────────
const SVG = '<svg viewBox="0 0 100 100"><path d="M0 0 L10 10"/></svg>';
const mkSlots = (n) => Array.from({ length: n }, (_, i) => ({ id: `user:slot_${i}`, svg: '<path d="M0 0L1 1"/>' }));

// 31 items: adding one more succeeds and lands exactly on the cap.
const almost = mkSlots(OVERLAY_CAP - 1);
const last = ingestIntoOverlay(SVG, almost, 'last_one');
assert.ok(last.ok, 'ingest at 31 items should succeed');
assert.strictEqual(last.overlay.length, OVERLAY_CAP);
assert.strictEqual(last.asset.id, 'user:last_one');

// 32 items: the 33rd is refused — for ingest AND duplicate — and the
// existing overlay is returned untouched (no silent eviction of the oldest).
const over = ingestIntoOverlay(SVG, full, 'too_many');
assert.strictEqual(over.ok, false);
assert.strictEqual(over.error, 'overlay full');
assert.deepStrictEqual(over.overlay.map((a) => a.id), full.map((a) => a.id));

const overDup = duplicateIntoOverlay(src, full);
assert.strictEqual(overDup.ok, false);
assert.strictEqual(overDup.error, 'overlay full');
assert.deepStrictEqual(overDup.overlay.map((a) => a.id), full.map((a) => a.id));

// sanitizeOverlay (load path) truncates rather than overflows: first 32 win.
const bloated = mkSlots(OVERLAY_CAP + 8);
const trimmed = sanitizeOverlay(bloated);
assert.strictEqual(trimmed.length, OVERLAY_CAP);
assert.strictEqual(trimmed[OVERLAY_CAP - 1].id, `user:slot_${OVERLAY_CAP - 1}`);

// ── #134 QA gap: REN round-trip (pure function) ────────────────────────────
const pair = [
  { id: 'user:alpha', svg: '<path d="M0 0"/>' },
  { id: 'user:beta', svg: '<path d="M1 1"/>' },
];
const renamed = renameOverlayAsset('user:alpha', 'gamma', pair);
assert.ok(renamed.ok);
assert.strictEqual(renamed.from, 'user:alpha');
assert.strictEqual(renamed.to, 'user:gamma');
const renamedIds = renamed.overlay.map((a) => a.id).sort();
assert.deepStrictEqual(renamedIds, ['user:beta', 'user:gamma']);
assert.strictEqual(renamed.overlay.find((a) => a.id === 'user:beta').svg, '<path d="M1 1"/>');

// Rename to a taken id is refused; rename of a canon asset is refused.
assert.strictEqual(renameOverlayAsset('user:alpha', 'beta', pair).ok, false);
assert.strictEqual(renameOverlayAsset('user:alpha', 'beta', pair).error, 'id taken');
assert.strictEqual(renameOverlayAsset('org_blob_01', 'nope', pair).ok, false);
// Display name is slugified into the user: namespace.
assert.strictEqual(renameOverlayAsset('user:alpha', 'My Motif!', pair).to, 'user:My_Motif_');
// Renaming to the same id is a no-op round-trip.
const sameName = renameOverlayAsset('user:alpha', 'alpha', pair);
assert.ok(sameName.ok);
assert.strictEqual(sameName.from, sameName.to);

// ── #134 QA gap: SWAP round-trip (pure function) ───────────────────────────
const NEW_SVG = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const swapped = replaceOverlayAsset('user:alpha', NEW_SVG, pair);
assert.ok(swapped.ok);
// The id is stable: it still resolves, now carrying the new content.
assert.strictEqual(swapped.asset.id, 'user:alpha');
assert.ok(swapped.asset.svg.includes('<circle'));
assert.ok(!swapped.asset.svg.includes('<path d="M0 0"'), 'old svg fully replaced');
const swappedIds = swapped.overlay.map((a) => a.id).sort();
assert.deepStrictEqual(swappedIds, ['user:alpha', 'user:beta']);
assert.strictEqual(swapped.overlay.find((a) => a.id === 'user:beta').svg, '<path d="M1 1"/>');
// Canon assets are read-only; hostile replacement markup is refused.
assert.strictEqual(replaceOverlayAsset('org_blob_01', NEW_SVG, pair).ok, false);
assert.strictEqual(replaceOverlayAsset('user:alpha', '<svg><script>x</script></svg>', pair).ok, false);

console.log('overlay.selfcheck: OK');
