// node src/data/inkPaint.selfcheck.mjs — #2104 Q2 (second half): the paint-structure
// census the ink ruling stands on. Line work = an asset whose ink slot is painted
// by strokes only (Q1–Q3, Matt, 2026-11-14). Pins the census counts, the named
// exemplars on both sides of the line, and the poem carve-out (every letterform
// and stamp face is fill-only, so no letter can ever take the ink).
import assert from 'node:assert';
import { INK_PAINT_CENSUS, inkPaintOf, inkPaintStructure, isStrokeOnlyInkAsset } from './inkPaint.js';
import { ASSETS_LETTERS } from './assets/assets-letterforms.js';
import { ASSETS_KANA } from './assets/assets-kana.js';
import { ASSETS_KANJI } from './assets/assets-kanji.js';
import { ASSETS_LATIN } from './assets/assets-latin.js';
import { ASSETS_SERIF } from './assets/assets-serif.js';
import { ASSETS_PLATE } from './assets/assets-plate.js';
import { ASSETS_WEAR } from './assets/assets-wear.js';
import { ASSETS_ORNAMENTS } from './assets/assets-ornaments.js';

// ── the structure function, on synthetic SVGs ────────────────────────────
assert.strictEqual(inkPaintStructure('<path stroke="var(--ink)" fill="none"/>'), 'stroke');
assert.strictEqual(inkPaintStructure('<rect fill="var(--ink)"/>'), 'fill');
assert.strictEqual(inkPaintStructure('<circle fill="var(--ink)"/><path stroke="var(--ink)"/>'), 'mixed');
assert.strictEqual(inkPaintStructure('<rect fill="#123456"/>'), 'none');
assert.strictEqual(inkPaintStructure(''), 'none');
assert.strictEqual(inkPaintStructure(null), 'none');
assert.strictEqual(inkPaintStructure(undefined), 'none');
// Q3: the accent slot is never read — an accent stroke does not make line work,
// and an accent fill does not make a stroke asset mixed.
assert.strictEqual(
  inkPaintStructure('<path stroke="var(--ink)"/><line stroke="var(--accent)"/>'),
  'stroke',
  'Q3: accent strokes do not enter the census',
);
assert.strictEqual(
  inkPaintStructure('<path stroke="var(--ink)"/><rect fill="var(--accent)"/>'),
  'stroke',
  'Q3: accent fills do not enter the census',
);
assert.strictEqual(
  inkPaintStructure('<line stroke="var(--accent)"/><rect fill="var(--ink)"/>'),
  'fill',
  'Q3: an accent-stroked, ink-filled asset is a fill',
);

// ── the census, pinned (measured on this head) ───────────────────────────
assert.deepStrictEqual(
  INK_PAINT_CENSUS,
  { total: 985, stroke: 107, fill: 813, mixed: 46, none: 19 },
  'the library census: 107 stroke-only / 813 fill-only / 46 mixed / 19 no ink slot',
);

// ── named exemplars: line work (takes a standing world's ink) ────────────
for (const id of ['line_squiggle_01', 'line_squiggle_02', 'mic_wave', 'mic_chevrons', 'geo_circle_02', 'rad_rings_01'])
  assert.ok(isStrokeOnlyInkAsset(id), `${id} is stroke-only line work`);

// ── named exemplars: NOT line work (keeps its dealt colour whole) ────────
// Q1 — mixed assets, however line-like they read:
for (const id of ['mic_dial', 'bio08', 'rad_rings_02', 'stamp_num_01', 'line_arrow_01'])
  assert.strictEqual(inkPaintOf(id), 'mixed', `Q1: ${id} is mixed and keeps its colour`);
// Q2 — the spec bars are fills, not lines:
for (const id of ['mic_specbar_h', 'mic_specbar_v'])
  assert.strictEqual(inkPaintOf(id), 'fill', `Q2: ${id} is fill-only, not a line`);
// Plain fills and the no-ink-slot set:
assert.strictEqual(inkPaintOf('geo_tri_01'), 'fill');
assert.strictEqual(inkPaintOf('creature'), 'fill', 'the creature citizen paints a filled pod');
assert.strictEqual(inkPaintOf('xsh01'), 'none');
// Unknown ids (custom assets) fail closed to not-line-work:
assert.strictEqual(inkPaintOf('no_such_asset'), 'none');
assert.ok(!isStrokeOnlyInkAsset('no_such_asset'));
assert.ok(!isStrokeOnlyInkAsset(undefined));

// ── the poem carve-out, by construction ──────────────────────────────────
// Every letterform and every FIELD stamp face paints its ink slot with
// fills only, so the ruling's "the poem's letters are not the ink's
// business" needs no special case at any consumer.
const faces = [
  ['letterforms', ASSETS_LETTERS],
  ['kana stamps', ASSETS_KANA],
  ['kanji stamps', ASSETS_KANJI],
  ['latin stamps', ASSETS_LATIN],
  ['serif stamps', ASSETS_SERIF],
  ['plate face', ASSETS_PLATE],
  ['worn letters', ASSETS_WEAR],
  ['ornaments', ASSETS_ORNAMENTS],
];
for (const [name, arr] of faces) {
  assert.ok(arr.length > 0, `${name}: the face exists`);
  for (const a of arr) assert.strictEqual(inkPaintOf(a.id), 'fill', `${name}: ${a.id} is fill-only — never line work`);
}

console.log('inkPaint.selfcheck: OK');
