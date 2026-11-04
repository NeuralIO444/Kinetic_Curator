// assetDescriptor.selfcheck.mjs — #1942 (asset descriptors, slice 1): measured traits, role fits, faceted tags, the door.
//
//   traits    ordering on known shapes (a squiggle is stroke-like and elongated, a blob filled and compact, a circle
//             symmetric, a letterform busier than a circle); every trait in [0, 1] and rounded to 3 places
//   bake      the committed table is exactly what the Node bake gives (bit-for-bit), every authored asset covered
//   raster    the browser canvas differs from resvg only at anti-aliased edges: traits hold within TOL under an
//             alpha-cutoff shift and a premultiplied-alpha quantization of the same raster
//   roles     all five fits for every asset, in [0, 1]; the top-10 limbs are elongated, the top-10 bodies massive
//   facets    every TAG_VOCAB term has exactly one facet (no orphans); every suggestion carries a real reason
//   door      hostile tags are discarded, free words normalize, tombstones win, a drop never resurrects on recompute
//   persist   the overlay door validates traits + edits; a swap keeps the artist's tags and drops stale traits;
//             a rename keeps them; the project document round-trips assetTags (library ids only)
//   inert     no stage reads a descriptor yet: the live loop, resolver and scene contract do not import these modules
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS_AUTHORED as ASSETS } from '../data/assets/index.js';
import { TAG_VOCAB } from '../data/assetStyle.js';
import { traitsFromRaster, sanitizeTraits, TRAIT_NAMES, INK_ALPHA } from './assetTraits.js';
import { ROLES, ROLE_FORMULAS, roleFits } from './assetRoles.js';
import { bakeAssetTraits, bakeTraitsLibrary, renderTraitsModule } from './assetTraitsBake.mjs';
import { ASSET_TRAITS_ROWS } from '../data/assets/traits.generated.js';
import {
  FACETS,
  FACET_OF,
  FACET_TERMS,
  suggestTags,
  sanitizeAssetTags,
  sanitizeAssetTagsDoc,
  layerTags,
} from '../data/assetFacets.js';
import { assetDescriptor, libraryTraits } from '../data/assetDescriptor.js';
import { assetRecords, assetsWhere } from '../data/assetStyle.js';
import { sanitizeOverlay, replaceOverlayAsset, renameOverlayAsset, ingestIntoOverlay } from './overlay.js';

const byId = Object.fromEntries(ASSETS.map((a) => [a.id, a]));
const T = (id) => libraryTraits(id);

// ---- traits
for (const a of ASSETS) {
  const t = T(a.id);
  assert.ok(t, `${a.id} has baked traits`);
  for (const k of TRAIT_NAMES) {
    assert.ok(t[k] >= 0 && t[k] <= 1, `${a.id}.${k} in [0,1]`);
    assert.equal(t[k], Math.round(t[k] * 1000) / 1000, `${a.id}.${k} rounded to 3 places`);
  }
}
const sq = T('line_squiggle_03');
const blob = T('org_blob_01');
const circ = T('geo_circle_01');
assert.ok(sq.stroke > blob.stroke + 0.3, 'a squiggle is more stroke-like than a blob');
assert.ok(sq.elong > blob.elong + 0.4, 'a squiggle is more elongated than a blob');
assert.ok(blob.fill > 0.9 && blob.mass > sq.mass, 'a blob is a filled mass');
assert.ok(circ.sym > 0.99, 'a circle is symmetric');
assert.ok(circ.elong < 0.05, 'a circle is not elongated');
assert.ok(T('typ_A').busy > circ.busy, 'a letterform is busier than a circle');
assert.deepEqual(
  traitsFromRaster(new Uint8Array(40 * 40 * 4), 40, 40),
  { elong: 0, fill: 0, stroke: 0, sym: 0, busy: 0, mass: 0 },
  'blank → zeros',
);
assert.equal(sanitizeTraits({ ...circ, fill: 2 }), null, 'an out-of-range trait is refused whole');
assert.equal(sanitizeTraits({ elong: 0.1 }), null, 'a partial record is refused');

// ---- bake: bit-for-bit
const baked = bakeTraitsLibrary(ASSETS);
assert.equal(Object.keys(baked).length, ASSETS.length, 'every authored asset is baked');
assert.equal(Object.keys(ASSET_TRAITS_ROWS).length, ASSETS.length, 'the committed table covers the library');
const modA = renderTraitsModule(baked);
assert.equal(renderTraitsModule(bakeTraitsLibrary(ASSETS)), modA, 'the bake is deterministic');
assert.equal(
  readFileSync(new URL('../data/assets/traits.generated.js', import.meta.url), 'utf8'),
  modA,
  'committed table == bake',
);

// ---- raster path tolerance (browser canvas ≈ resvg up to edge anti-aliasing)
const TOL = 0.06;
{
  const { Resvg } = await import('@resvg/resvg-js');
  const { canonicalSvg } = await import('./regionBake.mjs');
  const { RESVG_FONT } = await import('./resvgFont.mjs');
  for (const id of ['org_blob_01', 'line_squiggle_03', 'geo_circle_01', 'typ_A', 'hae_root_01', 'dot_field_01']) {
    const r = new Resvg(canonicalSvg(byId[id].svg), { font: RESVG_FONT }).render();
    const base = traitsFromRaster(r.pixels, r.width, r.height);
    // premultiplied-alpha quantization: what a canvas hands back for faint edge pixels
    const pm = new Uint8Array(r.pixels);
    for (let i = 3; i < pm.length; i += 4) pm[i] = Math.round(pm[i] / 17) * 17;
    const q = traitsFromRaster(pm, r.width, r.height);
    for (const k of TRAIT_NAMES)
      assert.ok(Math.abs(base[k] - q[k]) <= TOL, `${id}.${k}: quantized alpha within ${TOL} (${base[k]} vs ${q[k]})`);
    // an alpha-cutoff shift of one INK_ALPHA step either way
    const hi = new Uint8Array(r.pixels);
    for (let i = 3; i < hi.length; i += 4) hi[i] = hi[i] < INK_ALPHA + 24 ? 0 : hi[i];
    const s = traitsFromRaster(hi, r.width, r.height);
    for (const k of TRAIT_NAMES)
      assert.ok(Math.abs(base[k] - s[k]) <= TOL, `${id}.${k}: cutoff shift within ${TOL} (${base[k]} vs ${s[k]})`);
  }
}

// ---- roles
const fits = ASSETS.map((a) => [a.id, roleFits(T(a.id))]);
for (const [id, f] of fits) for (const r of ROLES) assert.ok(f[r] >= 0 && f[r] <= 1, `${id} has a ${r} fit in [0,1]`);
for (const r of ROLES)
  assert.ok(Math.abs(ROLE_FORMULAS[r].reduce((s, t) => s + t.w, 0) - 1) < 1e-9, `${r} weights sum to 1`);
const top = (role) =>
  fits
    .slice()
    .sort((a, b) => b[1][role] - a[1][role] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 10)
    .map((x) => x[0]);
const median = (k) => TRAIT_NAMES && ASSETS.map((a) => T(a.id)[k]).sort((a, b) => a - b)[Math.floor(ASSETS.length / 2)];
for (const id of top('limb')) assert.ok(T(id).elong >= median('elong'), `top limb ${id} is elongated`);
for (const id of top('body')) assert.ok(T(id).mass >= median('mass'), `top body ${id} is massive`);
assert.ok(roleFits(null).body === 0 && roleFits(null).accent === 0, 'no traits → no fit');
assert.ok(
  roleFits(blob).body > roleFits(sq).body && roleFits(sq).limb > roleFits(blob).limb,
  'blob → body, squiggle → limb',
);

// ---- facets
const orphans = TAG_VOCAB.filter((t) => !FACET_OF[t]);
assert.deepEqual(orphans, [], 'every TAG_VOCAB term has a facet');
const seen = FACETS.flatMap((f) => FACET_TERMS[f]);
assert.equal(new Set(seen).size, seen.length, 'no term in two facets');
assert.equal(seen.length, TAG_VOCAB.length, 'the facets cover exactly the vocabulary');
for (const a of ASSETS)
  for (const s of suggestTags(a, T(a.id))) {
    assert.ok(['tag', 'category', 'family', 'trait'].includes(s.reason), `${a.id}: reason ${s.reason}`);
    assert.equal(FACET_OF[s.tag], s.facet, `${a.id}: ${s.tag} sits in its facet`);
  }
assert.ok(
  suggestTags(byId.typ_A, T('typ_A')).some((s) => s.reason === 'family' || s.reason === 'tag'),
  'a letterform is suggested a script tag',
);

// ---- the door
assert.equal(sanitizeAssetTags({ add: { form: ['leaf'] } }), null, 'a term in the wrong facet is discarded');
assert.equal(sanitizeAssetTags('x'), null);
const hostile = sanitizeAssetTags({
  add: { form: ['circle', '<script>', 7], free: ['  Hello World ', 'x'.repeat(30), '<b>', 'ok', 'ok'] },
  drop: { form: ['circle', 'ring'] },
});
assert.deepEqual(
  hostile,
  { add: { form: ['circle'], free: ['hello-world', 'ok'] }, drop: { form: ['ring'] } },
  'hostile tags discarded; add beats drop',
);
assert.equal(
  sanitizeAssetTags({ add: { free: Array.from({ length: 30 }, (_, i) => `w${i}`) } }).add.free.length,
  12,
  'free words capped at 12',
);
const sug = suggestTags(byId.geo_circle_01, T('geo_circle_01'));
assert.ok(layerTags(sug, null).effective.form.includes('circle'), 'fixture: circle is suggested');
const dropped = layerTags(sug, { drop: { form: ['circle'] } });
assert.ok(!dropped.effective.form.includes('circle'), 'a tombstone removes a suggestion');
assert.deepEqual(
  layerTags(suggestTags(byId.geo_circle_01, T('geo_circle_01')), { drop: { form: ['circle'] } }).effective.form,
  dropped.effective.form,
  'recompute does not resurrect it',
);
assert.ok(
  layerTags(sug, { add: { mood: ['print'], free: ['mine'] } }).effective.mood.includes('print'),
  'an addition lands',
);
assert.deepEqual(layerTags(sug, { add: { free: ['mine'] } }).effective.free, ['mine']);

// ---- descriptor + filters
const d = assetDescriptor(byId.org_blob_01, T('org_blob_01'), null);
assert.equal(d.descriptor.version, 1);
assert.equal(d.id, 'org_blob_01');
assert.ok(d.family && d.style && Array.isArray(d.tags), "assetRecord's fields are unchanged");
const recs = ASSETS.map((a) => assetDescriptor(a, T(a.id), null));
assert.equal(assetsWhere(recs, {}).length, ASSETS.length, 'an empty filter returns all');
assert.deepEqual(
  assetsWhere(assetRecords(ASSETS), { families: ['haeckel'] }),
  assetsWhere(recs, { families: ['haeckel'] }),
  'existing filters unchanged',
);
const limbs = assetsWhere(recs, { minRole: { limb: 0.7 } });
assert.ok(limbs.length > 0 && limbs.length < ASSETS.length, 'minRole narrows');
for (const id of limbs) assert.ok(recs.find((r) => r.id === id).descriptor.roles.limb >= 0.7);
const lines = assetsWhere(recs, { facets: { form: ['line'] } });
assert.ok(lines.length > 0, 'facets filter finds the lines');
for (const id of lines) assert.ok(recs.find((r) => r.id === id).descriptor.tags.effective.form.includes('line'));

// ---- persistence
const ing = ingestIntoOverlay(
  '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#000"/></svg>',
  [],
  'mine',
);
assert.ok(ing.ok, 'fixture: an import');
const id = ing.asset.id;
const edited = [
  {
    ...ing.asset,
    traits: circ,
    tagEdits: { add: { mood: ['print'], free: ['keep-me'] } },
    tags: ['overlay', 7, 'x'.repeat(40)],
  },
];
const clean = sanitizeOverlay(edited)[0];
assert.deepEqual(clean.traits, circ, 'traits survive the door');
assert.deepEqual(clean.tagEdits, { add: { mood: ['print'], free: ['keep-me'] } }, 'edits survive the door');
assert.deepEqual(clean.tags, ['overlay'], 'raw tags are validated (strings, ≤ 32 chars)');
assert.equal(
  sanitizeOverlay([{ ...edited[0], traits: { elong: 9 }, tagEdits: { add: { form: ['leaf'] } } }])[0].traits,
  undefined,
  'bad traits dropped',
);
assert.equal(
  sanitizeOverlay([{ ...edited[0], tagEdits: { add: { form: ['leaf'] } } }])[0].tagEdits,
  undefined,
  'bad edits dropped',
);
const swapped = replaceOverlayAsset(
  id,
  '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="20" fill="#000"/></svg>',
  edited,
);
assert.ok(swapped.ok);
assert.deepEqual(swapped.asset.tagEdits, edited[0].tagEdits, "a swap keeps the artist's tags");
assert.equal(swapped.asset.traits, undefined, 'a swap drops the stale traits (recomputed on arrival)');
const renamed = renameOverlayAsset(id, 'renamed', edited);
assert.ok(renamed.ok);
assert.deepEqual(renamed.overlay[0].tagEdits, edited[0].tagEdits, 'a rename keeps them');
assert.deepEqual(
  sanitizeAssetTagsDoc({ geo_circle_01: { drop: { form: ['circle'] } }, 'user:x': { add: { free: ['a'] } }, bad: 3 }),
  { geo_circle_01: { drop: { form: ['circle'] } } },
  'the document map is library-only',
);
{
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const { serializeProject, parseProject } = await import('../state/projectDocument.js');
  const { useStore } = await import('../state/store.js');
  const S = () => useStore.getState();
  assert.equal('assetTags' in serializeProject(S()), false, 'a piece with no tag edits exports exactly as before');
  S().setAssetTagEdits('geo_circle_01', { drop: { form: ['circle'] }, add: { free: ['mine'] } });
  S().setAssetTagEdits('geo_circle_01', { add: { form: ['leaf'] } });
  assert.equal(S().assetTags.geo_circle_01, undefined, 'an invalid edit clears the entry');
  S().setAssetTagEdits('geo_circle_01', { drop: { form: ['circle'] }, add: { free: ['mine'] } });
  const doc = serializeProject(S());
  assert.deepEqual(doc.assetTags, { geo_circle_01: { add: { free: ['mine'] }, drop: { form: ['circle'] } } });
  S().setAssetTagEdits('geo_circle_01', null);
  assert.deepEqual(S().assetTags, {}, 'null clears');
  S().applyProject(parseProject(JSON.parse(JSON.stringify(doc))).doc);
  assert.deepEqual(S().assetTags, doc.assetTags, 'the document round-trips the edits');
  S().applyProject(parseProject(JSON.parse(JSON.stringify({ ...doc, assetTags: 'junk' }))).doc);
  assert.deepEqual(S().assetTags, {}, 'a junk map loads as none');
}

// ---- inert: the live loop and the resolver read no descriptor; the contract (#1945, Davis's role deal) reads only the
// baked traits through assetDescriptor — never the tag facets, which are the artist's view of the pool, not a stage input
for (const f of ['../gl/liveLoop.mjs', '../gl/liveResolve.mjs']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.ok(!/assetDescriptor|assetFacets|assetRoles|assetTraits/.test(src), `${f} does not read descriptors yet`);
}
{
  const src = readFileSync(new URL('../gl/sceneContract.js', import.meta.url), 'utf8');
  assert.ok(/libraryTraits/.test(src), 'the contract reads library traits for Davis (#1945)');
  assert.ok(!/assetFacets|suggestTags|layerTags/.test(src), 'the contract never reads tags');
}
console.log('assetDescriptor.selfcheck: ok');
