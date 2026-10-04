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
// #114: studio save lands as a hand-source overlay record with the chosen family.
const hand = ingestIntoOverlay(
  '<svg viewBox="0 0 100 100"><rect x="28" y="28" width="44" height="44" fill="currentColor"/></svg>',
  [],
  'hex-motif',
  { category: 'organic', source: 'hand' },
);
assert.ok(hand.ok);
assert.ok(hand.asset.id.startsWith('user:'));
assert.strictEqual(hand.asset.category, 'organic');
assert.strictEqual(hand.asset.weight, 'medium');
assert.strictEqual(hand.asset.source, 'hand');
assert.ok(hand.asset.tags.includes('hand'));
assert.ok(hand.asset.tags.includes('overlay'));

// Defaults preserved when the pool ingests without studio opts (#113 path).
const pooled = ingestIntoOverlay('<svg viewBox="0 0 100 100"><path d="M0 0L1 1"/></svg>', [], 'drop');
assert.ok(pooled.ok);
assert.strictEqual(pooled.asset.source, 'ingest');
assert.strictEqual(pooled.asset.category, 'fragments');

// ── #708 gap: gradient must survive the ONE path that carries untrusted
// custom assets in — a loaded project file — and only through re-validation.
{
  const legal = { type: 'linear', dir: 'down', from: 'ink', to: 'accent' };
  const withGrad = sanitizeOverlay([{ id: 'user:lit', svg: '<path d="M0 0"/>', gradient: legal }]);
  assert.strictEqual(withGrad.length, 1);
  assert.deepStrictEqual(withGrad[0].gradient, legal, 'a legal gradient must round-trip through project load');

  // Untrusted input is re-validated, not trusted verbatim: an arbitrary
  // colour (not a palette slot) must not survive, same as sanitizeGradient
  // enforces everywhere else.
  const withBadGrad = sanitizeOverlay([{ id: 'user:lit', svg: '<path d="M0 0"/>', gradient: { type: 'linear', from: '#ff0000', to: 'accent' } }]);
  assert.ok(!('gradient' in withBadGrad[0]), 'an illegal gradient must not survive load');

  // Absent stays absent — the field key itself must not appear, so a flat
  // asset that never had a gradient is indistinguishable from one that did
  // and lost it (hasGradient() and every `.gradient` truthiness check in
  // liveAtlas.mjs / atlas.mjs depend on this).
  const flat = sanitizeOverlay([{ id: 'user:flat', svg: '<path d="M0 0"/>' }]);
  assert.ok(!('gradient' in flat[0]), 'an asset with no gradient must not gain the key');

  // A duplicate keeps the source asset's gradient (duplicateAsset spreads
  // `...asset`) — the boundary above is the only place it can be lost.
  const dup = duplicateIntoOverlay(withGrad[0], withGrad);
  assert.ok(dup.ok);
  assert.deepStrictEqual(dup.asset.gradient, legal, 'duplicating a gradient asset must keep the gradient');

  // Replacing an asset's SVG is a deliberate exception: a genuinely new
  // shape does not inherit a gradient authored for the old one.
  const replaced = replaceOverlayAsset('user:lit', '<svg viewBox="0 0 100 100"><circle r="10"/></svg>', withGrad);
  assert.ok(replaced.ok);
  assert.ok(!('gradient' in replaced.asset), 'replacing the shape must drop the old gradient, not carry it silently');
}

// ── #725: region mattes cross the same trust boundary. Regions and slot
// assignments round-trip when well-formed; malformed input is dropped.
{
  const regions = [
    { id: 'rm-ff0000-2-2', color: 'ff0000', cx: 0.25, cy: 0.25, x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.4, area: 3600 },
  ];
  const clean = sanitizeOverlay([{
    id: 'user:matte', svg: '<path d="M0 0"/>',
    regions,
    regionSlots: { A: 'rm-ff0000-2-2', B: 'bogus', C: null, D: null },
  }]);
  assert.deepStrictEqual(clean[0].regions, regions, 'well-formed regions must round-trip');
  assert.deepStrictEqual(clean[0].regionSlots, { A: 'rm-ff0000-2-2', B: null, C: null, D: null },
    'well-formed slot assignments must round-trip; bogus IDs dropped');

  const hostile = sanitizeOverlay([{
    id: 'user:matte', svg: '<path d="M0 0"/>',
    regions: 'x',
    regionSlots: { A: 42, __proto__: 'rm-ff0000-2-2' },
    extra: 'drop me',
  }]);
  assert.ok(!('regions' in hostile[0]), 'malformed regions must not survive load');
  assert.ok(!('regionSlots' in hostile[0]), 'malformed slots must not survive load');
  assert.ok(!('extra' in hostile[0]), 'unknown fields must not survive load');

  const bare = sanitizeOverlay([{ id: 'user:matte', svg: '<path d="M0 0"/>' }]);
  assert.ok(!('regions' in bare[0]) && !('regionSlots' in bare[0]),
    'an asset without mattes must not gain the keys');

  // Replace: geometry is re-detected, but slot assignments carry forward so
  // a redraw keeping the flat colors keeps its slots (IDs are stable).
  const withSlots = sanitizeOverlay([{
    id: 'user:matte', svg: '<path d="M0 0"/>',
    regions,
    regionSlots: { A: 'rm-ff0000-2-2', B: null, C: null, D: null },
  }]);
  const rep = replaceOverlayAsset('user:matte', '<svg viewBox="0 0 100 100"><circle r="10"/></svg>', withSlots);
  assert.ok(rep.ok);
  assert.ok(!('regions' in rep.asset), 'replace must drop stale geometry');
  assert.strictEqual(rep.asset.regionSlots.A, 'rm-ff0000-2-2',
    'replace must carry slot assignments (ID stability does the rest)');
}

console.log('overlay.selfcheck: OK');
