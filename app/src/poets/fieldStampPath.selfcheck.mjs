// fieldStampPath.selfcheck.mjs — FIELD S3 (#1904): placement reaches the dish.
//
// The parity law is MEASURED, not asserted: the same buildPlacements call
// with no form, an undefined form, and a garbage form must produce
// byte-identical item lists; with an armed form, the layer's own marks are
// untouched and the form's stamps appear at exactly the placement positions.
import assert from 'node:assert';
import { buildPlacements, FIELD_EM_SCALE } from '../engine/buildPlacements.js';
import { fieldFormForDeal, sanitizeFieldForm, MAX_FIELD_STAMPS } from './fieldForm.js';
import { placePiece } from './placement.js';
import { mkRng } from '../engine/prng.js';

const assets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const palette = { swatches: ['#111', '#222', '#333', '#444'] };
const baseParams = {
  mode: 'grid',
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const W = 1000;
const H = 700;
const build = (layoutParams, extra = {}) =>
  buildPlacements({ layoutParams, seed: 0x1a4f, activeAssets: assets, palette, caps, canvasW: W, canvasH: H, ...extra });
const itemsJson = (r) => JSON.stringify(r.items);

// ── The deal: fieldFormForDeal ───────────────────────────────────────────
assert.strictEqual(fieldFormForDeal(null, mkRng(1)), null, 'silence deals no form');
assert.strictEqual(fieldFormForDeal({ poetId: 'nobody', pieceId: 'x' }, mkRng(1)), null, 'unknown poet deals no form');
assert.strictEqual(fieldFormForDeal({ poetId: 'gibson', pieceId: 'nope' }, mkRng(1)), null, 'unknown piece deals no form');
const deal = fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r3' }, mkRng(42));
assert.ok(deal && deal.layout === 'square' && deal.stamps.length > 0, 'a deal carries stamps');
const placed = placePiece({ id: 'r3', lines: ['DENSE LINE', 'EDGE TO EDGE'], layout: 'square', density: 0.8 }, mkRng(42), { aspect: deal.aspect });
assert.deepStrictEqual(
  deal.stamps.map((s) => [s.x, s.y, s.em]),
  placed.stamps.map((s) => [s.x, s.y, s.em]),
  'the deal IS the placement, stamp for stamp',
);
const denser = fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r3', density: 0.1 }, mkRng(42));
assert.ok(denser.stamps[0].em < deal.stamps[0].em, "the decision's density wins over the deck's");

// ── sanitizeFieldForm: the document door ─────────────────────────────────
assert.deepStrictEqual(sanitizeFieldForm(deal), deal, 'an honest form round-trips');
assert.strictEqual(sanitizeFieldForm(null), null);
assert.strictEqual(sanitizeFieldForm('form'), null);
assert.strictEqual(sanitizeFieldForm({ ...deal, poetId: 'nobody' }), null, 'unknown poet refused');
assert.strictEqual(sanitizeFieldForm({ ...deal, layout: 'scatter' }), null, 'unknown layout refused');
assert.strictEqual(sanitizeFieldForm({ ...deal, aspect: 9 }), null, 'dishonest aspect refused');
assert.strictEqual(
  sanitizeFieldForm({ ...deal, stamps: deal.stamps.map((s, j) => (j === 0 ? { ...s, x: 99 } : s)) }),
  null,
  'one off-dish stamp refuses the whole form (no stillborn forms)',
);
assert.strictEqual(
  sanitizeFieldForm({ ...deal, stamps: deal.stamps.map((s, j) => (j === 0 ? { ...s, assetId: 'typ_B' } : s)) }),
  null,
  'a stamp id that disagrees with its glyph is refused',
);
assert.strictEqual(
  sanitizeFieldForm({ ...deal, stamps: Array.from({ length: MAX_FIELD_STAMPS + 1 }, () => deal.stamps[0]) }),
  null,
  'over the stamp ceiling is refused',
);
assert.strictEqual(sanitizeFieldForm({ ...deal, stamps: [] }), null, 'an empty form is silence, not a form');

// ── Parity, measured: no form / undefined form / garbage form ────────────
const baseline = build(baseParams);
const undefForm = build({ ...baseParams, fieldForm: undefined });
const garbageForm = build({ ...baseParams, fieldForm: { poetId: 'x', stamps: 'lots' } });
assert.strictEqual(itemsJson(undefForm), itemsJson(baseline), 'undefined form: byte-identical items');
assert.strictEqual(itemsJson(garbageForm), itemsJson(baseline), 'garbage form: byte-identical items');
assert.ok(baseline.items.every((it) => !String(it.key).startsWith('field-')), 'baseline carries no field items');

// ── Armed: the layer's marks untouched, the form at exact positions ──────
const armed = build({ ...baseParams, fieldForm: deal });
assert.strictEqual(armed.items.length, baseline.items.length + deal.stamps.length, 'the form appends, nothing else moves');
assert.strictEqual(
  itemsJson({ items: armed.items.slice(0, baseline.items.length) }),
  itemsJson(baseline),
  "the layer's own marks are byte-identical under an armed form",
);
const fieldItems = armed.items.slice(baseline.items.length);
fieldItems.forEach((it, j) => {
  const s = deal.stamps[j];
  assert.strictEqual(it.assetId, s.assetId, `stamp ${j}: asset`);
  assert.strictEqual(it.x, (s.x / deal.aspect) * W, `stamp ${j}: x is exactly the placement position`);
  assert.strictEqual(it.y, s.y * H, `stamp ${j}: y is exactly the placement position`);
  assert.strictEqual(it.scale, s.em * FIELD_EM_SCALE, `stamp ${j}: scale is the placement em`);
  assert.strictEqual(it.rotation, 0, `stamp ${j}: held upright`);
  assert.strictEqual(it.key, `field-rosselli-r3-${j}`, `stamp ${j}: field key`);
  assert.ok(typeof it.color === 'string' && it.color.length > 0, `stamp ${j}: coloured by the layer strategy`);
});

// ── Replay determinism ───────────────────────────────────────────────────
const armed2 = build({ ...baseParams, fieldForm: deal });
assert.strictEqual(itemsJson(armed2), itemsJson(armed), 'same form, same build: identical items every time');

// ── Pool safety: armed builds on a shared cache never accumulate ─────────
const cache = {};
const c1 = build({ ...baseParams, fieldForm: deal }, { cache });
const c2 = build({ ...baseParams, fieldForm: deal }, { cache });
assert.strictEqual(itemsJson(c2), itemsJson(c1), 'second armed build on the pool: identical, no duplication');
assert.strictEqual(c2.items.filter((it) => String(it.key).startsWith('field-')).length, deal.stamps.length, 'field items appear exactly once');
const c3 = build(baseParams, { cache });
assert.strictEqual(itemsJson(c3), itemsJson(baseline), 'form cleared on the same cache: baseline restored exactly');
const c4 = build(baseParams, { cache });
assert.strictEqual(itemsJson(c4), itemsJson(baseline), 'pool healed: baseline stable');

// ── Mirror treats the form as ordinary marks of the layer ────────────────
const mirrored = build({ ...baseParams, mirror: 'x', fieldForm: deal });
assert.strictEqual(mirrored.items.length, 2 * armed.items.length, 'mirror reflects the form with the layer');

console.log('fieldStampPath.selfcheck: all assertions passed');
