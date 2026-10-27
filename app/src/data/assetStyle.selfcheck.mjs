// node src/data/assetStyle.selfcheck.mjs
// #1769 (KINETIC variety S3): every library asset carries category + family + style + normalized tags; the tag
// vocabulary is controlled; the read API filters by any dimension; imports get a record too.
import assert from 'node:assert/strict';
import { ASSETS } from './assets/index.js';
import { ALL_CATEGORIES } from './categories.js';
import {
  STYLES,
  FAMILIES,
  TAG_VOCAB,
  TAG_SYNONYMS,
  canonTag,
  assetRecords,
  assetRecord,
  assetsWhere,
  countBy,
} from './assetStyle.js';

const records = assetRecords(ASSETS);

// 1. every asset: a known category, a known family (none fell through to 'imported'), a style from the list
assert.equal(records.length, ASSETS.length);
const catIds = new Set(ALL_CATEGORIES);
for (const r of records) {
  assert.ok(catIds.has(r.category), `${r.id}: category ${r.category} is in data/categories.js`);
  assert.ok(FAMILIES.includes(r.family) && r.family !== 'imported', `${r.id}: a library family (${r.family})`);
  assert.ok(STYLES.includes(r.style), `${r.id}: style ${r.style} is in the controlled list`);
  assert.ok(r.tags.length > 0, `${r.id}: at least one canonical tag`);
  for (const t of r.tags) assert.ok(TAG_VOCAB.includes(t), `${r.id}: tag ${t} is in the vocabulary`);
}

// 2. the vocabulary is total over the library: every raw tag has exactly one canonical home
const homes = new Map();
for (const [canon, raws] of Object.entries(TAG_SYNONYMS))
  for (const r of raws) {
    assert.ok(!homes.has(r), `raw tag "${r}" has one home (also under ${homes.get(r)})`);
    homes.set(r, canon);
  }
for (const a of ASSETS) for (const t of a.tags) assert.ok(canonTag(t), `${a.id}: raw tag "${t}" has a canonical home`);
assert.ok(TAG_VOCAB.length <= 40, `the vocabulary stays small (${TAG_VOCAB.length})`);

// 3. every style and every library family is actually used (no dead entries)
const byStyle = countBy(records, 'style');
for (const s of STYLES) assert.ok(byStyle[s] > 0, `style ${s} has assets`);
const byFamily = countBy(records, 'family');
for (const f of FAMILIES.filter((x) => x !== 'imported')) assert.ok(byFamily[f] > 0, `family ${f} has assets`);

// 4. the read API: filters compose (all named dimensions), exclusion works, empty filter = everything
const japanese = assetsWhere(records, { styles: ['japanese'] });
assert.ok(japanese.length >= 10 && japanese.every((id) => records.find((r) => r.id === id).style === 'japanese'));
const pixelStamps = assetsWhere(records, { families: ['pixel-glyphs'], categories: ['stamps'] });
assert.ok(pixelStamps.length > 0 && pixelStamps.every((id) => id.startsWith('pxg')));
assert.equal(assetsWhere(records).length, records.length);
assert.equal(assetsWhere(records, { exclude: ['creature'] }).length, records.length - 1);
assert.ok(assetsWhere(records, { tags: ['flower'] }).length >= 5);

// 5. an imported asset (#1479) gets the same record shape — family 'imported', a style from its category/tags
const imp = assetRecord({ id: 'user:koi', category: 'floral', tags: ['flower', 'petal', 'mystery'] });
assert.equal(imp.family, 'imported');
assert.equal(imp.style, 'japanese');
assert.deepEqual(imp.tags, ['flower']);
assert.ok(
  STYLES.includes(assetRecord({ id: 'user:x', category: 'nope', tags: [] }).style),
  'nothing to go on still lands in a style',
);

// 6. pure data: no render input is touched (the module never mutates an asset)
const before = JSON.stringify(ASSETS.map((a) => [a.id, a.category, a.tags]));
assetRecords(ASSETS);
assert.equal(JSON.stringify(ASSETS.map((a) => [a.id, a.category, a.tags])), before);

console.log(
  `assetStyle.selfcheck: ok (#1769 — ${records.length} assets, ${STYLES.length} styles, ${TAG_VOCAB.length} tags)`,
);
