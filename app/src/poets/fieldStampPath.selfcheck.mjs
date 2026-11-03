// fieldStampPath.selfcheck.mjs — FIELD S3 (#1904), re-pinned by #1928.
//
// #1928 re-pin (cause: Matt's ruling 2026-11-02 — the poem is a clean TYPE PLATE, not marks): S3's law was "the
// form's stamps appear in the item list at exactly the placement positions, and mirror reflects them with the
// layer". Under the plate the form never enters the item list at all, so the parity law is now total: no form,
// a garbage form AND an armed form all build byte-identical marks, mirrored or not. Where the poem goes instead
// (the contract's plate, drawn after the frame) is measured in poets/typePlate.selfcheck.mjs.
import assert from 'node:assert';
import { buildPlacements } from '../engine/buildPlacements.js';
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

// ── Armed (#1928): the poem never joins the marks — byte-identical, every time ─
const armed = build({ ...baseParams, fieldForm: deal });
assert.strictEqual(itemsJson(armed), itemsJson(baseline), 'an armed form leaves the marks byte-identical');
assert.ok(armed.items.every((it) => !String(it.key).startsWith('field-')), 'no field items, ever');

// ── Pool safety: armed builds on a shared cache stay the baseline ────────
const cache = {};
const c1 = build({ ...baseParams, fieldForm: deal }, { cache });
const c2 = build({ ...baseParams, fieldForm: deal }, { cache });
const c3 = build(baseParams, { cache });
for (const c of [c1, c2, c3]) assert.strictEqual(itemsJson(c), itemsJson(baseline), 'cache: always the baseline');

// ── Mirror never reflects the poem (#1928: it is not a mark) ─────────────
const mirroredBase = build({ ...baseParams, mirror: 'x' });
const mirroredArmed = build({ ...baseParams, mirror: 'x', fieldForm: deal });
assert.strictEqual(itemsJson(mirroredArmed), itemsJson(mirroredBase), 'mirror: the armed dish is the plain dish');

console.log('fieldStampPath.selfcheck: all assertions passed');
