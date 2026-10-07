// recipeStack.selfcheck.mjs — a share link / recipe / keep carries the whole layer stack (#1131).
//
// Built on the real store: extra KC track, FX, MATH and PATTERN tracks, an inactive track with its own seed and
// palette. Encode (link and text) -> decode -> applyProject into a fresh store state -> the stack comes back.
// A one-track scene must stay byte-identical to v1.
import assert from 'node:assert';
import { useStore } from './store.js';
import { recipeFieldsFromKept, encodeRecipe, parseRecipe, recipeToProjectDoc, RECIPE_VERSION, RECIPE_VERSION_2 } from './recipes.js';
import { encodeRecipeUrl, decodeRecipeUrl, extractRecipePayload, parseBootHash, RECIPE_URL_PREFIX, RECIPE_URL_PREFIX_2 } from './recipeUrls.js';
import { isTrivialStack, stackOf, expandStack } from './recipeStack.js';
import { captureFavorite, sanitizeFavorite } from './slices/davisSlice.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const fields = (st = S()) => ({ ...recipeFieldsFromKept(st), paletteOverrides: st.paletteOverrides ?? null });

// one plain KC track: exactly v1
const base = S();
const v1Url = encodeRecipeUrl(fields());
const v1Text = encodeRecipe(fields());

// a real stack
S().setSeed?.(0x1234);
S().addLayer('content');
const second = S().layers.filter((l) => l.type === 'content')[1].id;
S().addPatternLayer('GLYPH');
S().setPatternParam(S().layers.find((l) => l.type === 'pattern').id, 'drift', 0.6);
S().addFxLayer();
S().addMathLayer();
S().setActiveLayer(S().layers.find((l) => l.type === 'content').id);
const live = S();

ok('a scene with one plain KC track has no stack: link and text are exactly v1', () => {
  assert.equal(isTrivialStack([{ id: 'a', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off' } }]), true);
  assert.equal(isTrivialStack([]), true);
  assert.ok(v1Url.startsWith(RECIPE_URL_PREFIX) && !v1Url.startsWith(RECIPE_URL_PREFIX_2));
  assert.equal(v1Text.split('\n')[0], RECIPE_VERSION); assert.ok(!v1Text.includes('stack:'));
  assert.equal(stackOf(base), null);
});

ok('a real stack makes a kc-r/2 link and a kc-recipe/2 text, and the link stays short', () => {
  assert.ok(live.layers.length >= 5);
  const url = encodeRecipeUrl(fields(live)); const text = encodeRecipe(fields(live));
  assert.ok(url.startsWith(RECIPE_URL_PREFIX_2), url.slice(0, 12));
  assert.equal(text.split('\n')[0], RECIPE_VERSION_2); assert.ok(/^stack: \{/m.test(text));
  assert.ok(url.length < 3500, `link is ${url.length} chars`);
  assert.equal(extractRecipePayload(`https://x/#r=${url}`), url, 'a pasted link finds both versions');
  assert.equal(parseBootHash(`#r=${url}`).status, 'ok');
});

const roundTrip = (decode) => {
  const doc = recipeToProjectDoc(decode);
  // a fresh document: apply over a state that has a different, wrong stack
  useStore.setState({ layers: [{ id: 'old', name: 'KC-1', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } }], activeLayerId: 'old', layerSnapshots: {} });
  S().applyProject({ ...doc, paletteOverrides: decode.paletteOverrides ?? null });
  return S();
};
const types = (st) => st.layers.map((l) => `${l.type}`).join(',');

ok('link round trip: every track, the pattern block, the active track and the other track\'s own state come back', () => {
  const want = live; const dec = decodeRecipeUrl(encodeRecipeUrl(fields(want)));
  assert.ok(dec.ok, dec.error);
  const got = roundTrip(dec.recipe);
  assert.equal(types(got), types(want)); assert.deepEqual(got.layers.map((l) => l.id), want.layers.map((l) => l.id));
  assert.equal(got.activeLayerId, want.activeLayerId);
  const wp = want.layers.find((l) => l.type === 'pattern').pattern; const gp = got.layers.find((l) => l.type === 'pattern').pattern;
  assert.deepEqual(gp, wp); assert.equal(gp.drift, 0.6);
  assert.equal(got.seed, want.seed); assert.equal(got.paletteId, want.paletteId);
  const s2 = want.layerSnapshots[second]; const g2 = got.layerSnapshots[second];
  assert.ok(g2, 'the other KC track kept its own save state'); assert.equal(g2.seed, s2.seed >>> 0); assert.equal(g2.paletteId, s2.paletteId);
  assert.deepEqual(g2.layoutParams, JSON.parse(JSON.stringify(s2.layoutParams)));
  assert.deepEqual(Object.keys(g2.enabledAssets).sort(), Object.keys(s2.enabledAssets).filter((k) => s2.enabledAssets[k]).sort(), 'and its own cast: not an empty one');
});

ok('text round trip: kc-recipe/2 gives the same stack', () => {
  const want = live; const p = parseRecipe(encodeRecipe(fields(want)));
  assert.ok(p.ok, p.error); assert.equal(p.recipe.version, RECIPE_VERSION_2);
  const got = roundTrip(p.recipe); assert.equal(types(got), types(want));
  assert.deepEqual(got.layers.find((l) => l.type === 'pattern').pattern, want.layers.find((l) => l.type === 'pattern').pattern);
});

ok('older recipes still open: v1 text and v1 links decode with no stack', () => {
  const t = parseRecipe(v1Text); assert.ok(t.ok && !t.recipe.stack); assert.equal('layers' in recipeToProjectDoc(t.recipe), false);
  const u = decodeRecipeUrl(v1Url); assert.ok(u.ok && !u.recipe.stack);
  assert.equal(parseRecipe('kc-recipe/3\nseed: 0x1').ok, false); assert.equal(decodeRecipeUrl('kc-r/3.abc').ok, false);
});

ok('hostile stacks are refused whole, in plain language, and never throw', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const k of [null, 7, 'x', {}, { l: [] }, { l: [{ id: 5 }] }, { l: [{ id: 'p', type: 'pattern', pattern: {} }] }, { l: 'no' }]) {
    const r = decodeRecipeUrl(`kc-r/2.${b64({ v: 2, s: 1, k })}`);
    assert.equal(r.ok, false, JSON.stringify(k)); assert.match(r.error, /Bad recipe link/);
  }
  assert.equal(decodeRecipeUrl(`kc-r/1.${b64({ v: 2, s: 1, k: { l: [] } })}`).ok, false, 'the prefix and the payload must agree');
  assert.equal(parseRecipe('kc-recipe/2\nseed: 0x1\nstack: not json').ok, false);
  assert.equal(parseRecipe('kc-recipe/1\nseed: 0x1\nstack: {}').ok, false, 'a /1 recipe has no stack key');
  // 100 tracks, wild pattern values: bounded and clamped by the normalizers
  const many = { v: 2, s: 1, k: { l: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, type: i % 2 ? 'pattern' : 'content', pattern: { mode: 'ZZZ', density: 9999, drift: -4 } })), a: 't0' } };
  const r = decodeRecipeUrl(`kc-r/2.${b64(many)}`); assert.ok(r.ok); assert.ok(r.recipe.stack.layers.length <= 16);
  for (const l of r.recipe.stack.layers.filter((x) => x.type === 'pattern')) assert.ok(l.pattern.density <= 12 && l.pattern.drift >= 0 && l.pattern.mode === 'QUILT');
});

ok('keeps: a favorite carries the stack, survives its own sanitizer, and gives the same link', () => {
  const fav = captureFavorite({ ...live, enabledAssets: live.enabledAssets }, live.paletteId);
  assert.ok(fav.stack && fav.stack.l.length === live.layers.length);
  const back = sanitizeFavorite(JSON.parse(JSON.stringify(fav)));
  assert.deepEqual(back.stack, fav.stack);
  assert.equal(encodeRecipeUrl(recipeFieldsFromKept(back)).startsWith(RECIPE_URL_PREFIX_2), true);
  assert.equal(sanitizeFavorite({ ...JSON.parse(JSON.stringify(fav)), stack: { l: 'junk' } }).stack, undefined, 'a damaged stack drops, the keep stays');
  assert.equal(sanitizeFavorite({ ...JSON.parse(JSON.stringify(fav)), stack: { l: [], pad: 'x'.repeat(70000) } }).stack, undefined, 'and an oversized one');
  const plain = captureFavorite({ seed: 1, seedOffsets: {}, layoutParams: {}, enabledAssets: {} }, 'praystation');
  assert.ok(!('stack' in plain), 'a plain keep is unchanged');
});

ok('expandStack never returns raw input: layers are normalized', () => {
  const ex = expandStack({ l: [{ id: 'k', type: 'content', layerOpacity: 9, junk: 1 }], a: 'k' });
  assert.ok(ex.ok); assert.equal(ex.stack.layers[0].layerOpacity, 1); assert.ok(!('junk' in ex.stack.layers[0]));
});

console.log(`recipeStack.selfcheck: ${n} checks passed`);
