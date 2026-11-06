// assetPool.selfcheck.mjs — #1943 (asset descriptors, slice 2): the pool panel's logic and the store actions behind it.
//
//   edit       confirm / reject / remove / free / clear are deterministic and idempotent; a removed suggestion stays gone
//   filters    facet AND/OR logic (OR within a facet, AND across), role floor, category, text over the EFFECTIVE tags
//   counts     facet chip counts equal a direct count; category counts equal countBy; the chip row mirrors the filters
//   selection  toggle / range select follow the visible order
//   store      tag edits and bulk weight / on-off touch exactly the selection, library and import alike, and ride the
//              project document (round trip); setCategoryWeight reaches imports
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { countBy, assetRecords } from '../data/assetStyle.js';
import { editTags, suggestTags } from '../data/assetFacets.js';
import { libraryTraits } from '../data/assetDescriptor.js';
import {
  poolDescriptors,
  matchesFilters,
  filterRecords,
  facetCounts,
  categoryCounts,
  activeChips,
  toggleFacet,
  nextSelection,
} from './assetPoolLogic.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { useStore } = await import('../state/store.js');
const { serializeProject, parseProject } = await import('../state/projectDocument.js');
const S = () => useStore.getState();

// ---- edit
const sug = suggestTags(
  ASSETS.find((a) => a.id === 'geo_circle_01'),
  libraryTraits('geo_circle_01'),
);
assert.ok(
  sug.some((s) => s.tag === 'circle'),
  'fixture: circle is suggested for geo_circle_01',
);
const a1 = editTags(null, { op: 'reject', facet: 'form', tag: 'circle' }, sug);
assert.deepEqual(a1, { drop: { form: ['circle'] } }, 'reject tombstones');
assert.deepEqual(editTags(a1, { op: 'reject', facet: 'form', tag: 'circle' }, sug), a1, 'reject is idempotent');
assert.equal(
  editTags(a1, { op: 'confirm', facet: 'form', tag: 'circle' }, sug).drop,
  undefined,
  'confirm lifts the tombstone',
);
const a2 = editTags(null, { op: 'confirm', facet: 'subject', tag: 'leaf' }, sug);
assert.deepEqual(a2, { add: { subject: ['leaf'] } });
assert.equal(
  editTags(a2, { op: 'remove', facet: 'subject', tag: 'leaf' }, sug),
  null,
  'remove of a non-suggested tag just unadds it',
);
assert.deepEqual(
  editTags(
    editTags(null, { op: 'confirm', facet: 'form', tag: 'circle' }, sug),
    { op: 'remove', facet: 'form', tag: 'circle' },
    sug,
  ),
  { drop: { form: ['circle'] } },
  'removing a suggested tag tombstones it, so it does not reappear',
);
assert.deepEqual(
  editTags(null, { op: 'free', tag: 'My Tag' }, sug),
  { add: { free: ['my-tag'] } },
  'free words normalize',
);
assert.equal(editTags({ add: { free: ['x'] } }, { op: 'unfree', tag: 'x' }, sug), null);
assert.equal(editTags(a1, { op: 'clear' }, sug), null, 'clear forgets everything');
assert.deepEqual(
  editTags(a1, { op: 'confirm', facet: 'form', tag: 'leaf' }, sug),
  a1,
  'a term in the wrong facet changes nothing',
);
assert.deepEqual(editTags(a1, { op: 'nonsense' }, sug), a1, 'an unknown op changes nothing');

// ---- filters
const recs = poolDescriptors(ASSETS);
// #1982 — the pool covers the library MINUS the poem-only kana stamps (Matt's
// hard requirement: FIELD's stamps never become pool tiles). The exclusion is
// exactly the kana pack, by id — nothing else may drop out of the records,
// and every count below is taken over this pool-visible set.
// #1998 RE-PIN (cause: slice 2) — the exclusion is now the native-script
// union: the curated kanji pack rides the kana pack's road, so the excluded
// set grows by exactly the kanji pack and the assertion's meaning is
// unchanged (the exclusion is exactly the poem-only packs, by id).
const { ASSETS_KANA } = await import('../data/assets/assets-kana.js');
const { ASSETS_KANJI } = await import('../data/assets/assets-kanji.js');
const kanaIds = new Set([...ASSETS_KANA, ...ASSETS_KANJI].map((k) => k.id));
const poolVisible = ASSETS.filter((a) => !kanaIds.has(a.id));
assert.equal(recs.length, poolVisible.length);
assert.ok(!recs.some((r) => kanaIds.has(r.id)), 'no native-script record in the pool');
const lines = filterRecords(recs, { facets: { form: ['line'] } });
assert.ok(lines.length > 0 && lines.length < recs.length, 'a facet filter narrows');
for (const r of lines) assert.ok(r.descriptor.tags.effective.form.includes('line'));
const lineOrDot = filterRecords(recs, { facets: { form: ['line', 'dot'] } });
assert.ok(lineOrDot.length >= lines.length, 'OR within a facet widens');
const both = filterRecords(recs, { facets: { form: ['line'], mood: ['hud'] } });
assert.ok(both.length <= lines.length, 'AND across facets narrows');
for (const r of both)
  assert.ok(r.descriptor.tags.effective.mood.includes('hud') && r.descriptor.tags.effective.form.includes('line'));
const limbs = filterRecords(recs, { role: { limb: 0.6 } });
assert.ok(limbs.length > 0 && limbs.length < recs.length);
for (const r of limbs) assert.ok(r.descriptor.roles.limb >= 0.6, 'the role floor holds');
assert.deepEqual(filterRecords(recs, { cat: 'user' }), [], 'no imports in the library');
const cat0 = recs[0].category;
assert.ok(filterRecords(recs, { cat: cat0 }).every((r) => r.category === cat0));
// text matches the effective tags, family, style and category — not only the raw tags
const tagged = recs.find((r) => r.descriptor.tags.effective.form.includes('line'));
assert.ok(matchesFilters(tagged, { text: 'line' }), 'text matches an effective tag');
assert.ok(matchesFilters(tagged, { text: tagged.family }), 'text matches the family');
assert.ok(matchesFilters(tagged, { text: tagged.style }), 'text matches the style');
assert.ok(matchesFilters(tagged, { text: tagged.category }), 'text matches the category');
assert.ok(!matchesFilters(tagged, { text: 'zzzznope' }));
assert.ok(!matchesFilters(tagged, { text: `${tagged.family} zzzznope` }), 'every word must match, not just one');
assert.ok(matchesFilters(tagged, { text: `${tagged.family} line` }), 'several words must all match');
const edited = poolDescriptors([ASSETS[0]], { [ASSETS[0].id]: { add: { free: ['kanji-practice'] } } })[0];
assert.ok(matchesFilters(edited, { text: 'kanji-practice' }), 'text matches an artist free tag');
assert.ok(!matchesFilters(poolDescriptors([ASSETS[0]])[0], { text: 'kanji-practice' }));

// ---- counts
const fc = facetCounts(recs);
for (const f of Object.keys(fc))
  for (const [t, n] of Object.entries(fc[f]))
    assert.equal(n, recs.filter((r) => r.descriptor.tags.effective[f].includes(t)).length, `${f}:${t} count`);
const cc = categoryCounts(recs);
const by = countBy(assetRecords(poolVisible), 'category');
for (const [c, n] of Object.entries(by)) assert.equal(cc[c], n, `category ${c} count equals countBy`);
assert.equal(cc.all, poolVisible.length);
assert.equal(cc.user, 0);
const withUser = categoryCounts(
  poolDescriptors([
    ...ASSETS.slice(0, 3),
    { id: 'user:x', category: 'organic', weight: 'medium', tags: [], svg: '<circle r="5"/>' },
  ]),
);
assert.equal(withUser.user, 1, 'imports are counted under user');
assert.equal(withUser.all, 4);
assert.equal(
  toggleFacet(toggleFacet({}, 'form', 'line'), 'form', 'line').form,
  undefined,
  'toggling twice clears the facet',
);
const chips = activeChips({ cat: 'geometric', text: 'x', facets: { form: ['line'] }, role: { limb: 0.6 } });
assert.deepEqual(
  chips.map((c) => c.kind),
  ['cat', 'text', 'facet', 'role'],
  'the chip row mirrors the filters',
);
assert.deepEqual(activeChips({}), []);

// ---- selection
const order = ['a', 'b', 'c', 'd', 'e'];
assert.deepEqual(nextSelection([], order, 'b'), ['b']);
assert.deepEqual(nextSelection(['b'], order, 'b'), []);
assert.deepEqual(
  nextSelection(['b'], order, 'd', { range: true, anchor: 'b' }),
  ['b', 'c', 'd'],
  'shift selects the range',
);
assert.deepEqual(nextSelection(['b', 'zz'], order, 'c'), ['b', 'c'], 'ids no longer visible drop out');

// ---- store
const lib = ['geo_circle_01', 'org_blob_01', 'line_squiggle_03'];
const outside = 'org_blob_02';
S().editAssetTags(lib.slice(0, 2), { op: 'confirm', facet: 'subject', tag: 'seed' });
assert.deepEqual(Object.keys(S().assetTags).sort(), lib.slice(0, 2).sort(), 'only the selection is edited');
assert.equal(S().assetTags[outside], undefined);
S().editAssetTags(['nope', 7, null], { op: 'free', tag: 'x' });
assert.deepEqual(Object.keys(S().assetTags).sort(), lib.slice(0, 2).sort(), 'unknown ids are skipped');
const doc = JSON.parse(JSON.stringify(serializeProject(S())));
assert.deepEqual(Object.keys(doc.assetTags).sort(), lib.slice(0, 2).sort(), 'the edits ride the project document');
S().editAssetTags(lib.slice(0, 2), { op: 'clear' });
assert.deepEqual(S().assetTags, {}, 'a bulk clear leaves nothing behind');
S().applyProject(parseProject(doc).doc);
assert.deepEqual(Object.keys(S().assetTags).sort(), lib.slice(0, 2).sort(), 'and come back on load');

// an import: its edits ride the overlay record
S().ingestAsset('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#000"/></svg>', 'pooltest');
const uid = S().customAssets.at(-1).id;
S().editAssetTags([uid, lib[0]], { op: 'free', tag: 'both' });
assert.deepEqual(
  S().customAssets.find((a) => a.id === uid).tagEdits,
  { add: { free: ['both'] } },
  'an import carries its edits',
);
assert.deepEqual(S().assetTags[lib[0]].add.free, ['both']);

// bulk weight / on-off touch exactly the selection
const before = { ...S().assetWeightOverrides };
S().setAssetsWeight([lib[0], uid], 'heavy');
const w = S().assetWeightOverrides;
assert.equal(w[lib[0]] ?? ASSETS.find((a) => a.id === lib[0]).weight, 'heavy');
assert.equal(w[uid], 'heavy');
assert.equal(w[lib[1]], before[lib[1]], 'an unselected asset is untouched');
const baseW = ASSETS.find((a) => a.id === lib[1]).weight;
S().setAssetsWeight([lib[1]], 'heavy');
S().setAssetsWeight([lib[1]], baseW);
assert.equal(lib[1] in S().assetWeightOverrides, false, 'setting an asset back to its own weight drops the override');
S().setAssetsWeight([lib[0]], 'nonsense');
assert.equal(S().assetWeightOverrides[lib[0]] ?? 'heavy', 'heavy', 'a bad weight changes nothing');
const en0 = { ...S().enabledAssets };
S().setAssetsEnabled([lib[0], lib[2]], false);
assert.equal(S().enabledAssets[lib[0]], false);
assert.equal(S().enabledAssets[lib[2]], false);
assert.equal(S().enabledAssets[lib[1]], en0[lib[1]], 'an unselected asset keeps its switch');
S().setAssetsEnabled([lib[0]], true);
assert.equal(S().enabledAssets[lib[0]], true);

// setCategoryWeight reaches imports
S().setCategoryWeight(S().customAssets.find((a) => a.id === uid).category, 'light');
assert.equal(S().assetWeightOverrides[uid], 'light', 'a category weight covers imports');

console.log('assetPool.selfcheck: ok');

// ---- #1944 kitFromFilters
{
  const { kitFromFilters } = await import('./assetPoolLogic.mjs');
  const assertK = (await import('node:assert/strict')).default;
  assertK.equal(kitFromFilters('x', {}), null, 'no filter, no kit');
  assertK.equal(kitFromFilters('  ', { cat: 'radial' }), null, 'no name, no kit');
  const k = kitFromFilters('My Kit!', { cat: 'radial', facets: { subject: ['leaf'] }, role: { body: 0.6 } }, [
    'my-kit',
  ]);
  assertK.deepEqual(k, {
    id: 'my-kit-2',
    name: 'My Kit!',
    where: { facets: { subject: ['leaf'] }, categories: ['radial'], minRole: { body: 0.6 } },
    weights: {},
    cap: 4,
  });
  assertK.equal(kitFromFilters('u', { cat: 'user' }), null, 'the USER tab is not a category');
}
