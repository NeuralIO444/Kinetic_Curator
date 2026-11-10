// recipeStack.selfcheck.mjs — a share link / recipe / keep carries the whole layer stack (#1131).
//
// Built on the real store: the KC track, FX, MATH and PATTERN tracks.
// Encode (link and text) -> decode -> applyProject into a fresh store state -> the stack comes back.
// A one-track scene must stay byte-identical to v1.
// #2038: the stack is ONE content stratum now — the pre-rebuild
// two-content stack (with its inactive track's own seed and palette in
// layerSnapshots) opens under the strata migration law instead; that
// case is pinned at the bottom of this file.
import assert from 'node:assert';
import { useStore } from './store.js';
import {
  recipeFieldsFromKept,
  encodeRecipe,
  parseRecipe,
  recipeToProjectDoc,
  RECIPE_VERSION,
  RECIPE_VERSION_2,
} from './recipes.js';
import {
  encodeRecipeUrl,
  decodeRecipeUrl,
  extractRecipePayload,
  parseBootHash,
  RECIPE_URL_PREFIX,
  RECIPE_URL_PREFIX_2,
} from './recipeUrls.js';
import { isTrivialStack, stackOf, expandStack } from './recipeStack.js';
import { captureFavorite, sanitizeFavorite } from './slices/davisSlice.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const fields = (st = S()) => ({ ...recipeFieldsFromKept(st), paletteOverrides: st.paletteOverrides ?? null });

// one plain KC track: exactly v1
const base = S();
const v1Url = encodeRecipeUrl(fields());
const v1Text = encodeRecipe(fields());

// a real stack — the lawful maximum under #2038: one content stratum,
// a pattern ground, one FX track, one MATH track.
S().setSeed?.(0x1234);
S().addPatternLayer('GLYPH');
S().setPatternParam(S().layers.find((l) => l.type === 'pattern').id, 'drift', 0.6);
S().addFxLayer();
S().addMathLayer();
S().setActiveLayer(S().layers.find((l) => l.type === 'content').id);
const live = S();

ok('a scene with one plain KC track has no stack: link and text are exactly v1', () => {
  assert.equal(
    isTrivialStack([
      { id: 'a', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off' } },
    ]),
    true,
  );
  assert.equal(isTrivialStack([]), true);
  assert.ok(v1Url.startsWith(RECIPE_URL_PREFIX) && !v1Url.startsWith(RECIPE_URL_PREFIX_2));
  assert.equal(v1Text.split('\n')[0], RECIPE_VERSION);
  assert.ok(!v1Text.includes('stack:'));
  assert.equal(stackOf(base), null);
});

ok('a real stack makes a kc-r/2 link and a kc-recipe/2 text, and the link stays short', () => {
  assert.ok(live.layers.length >= 4);
  const url = encodeRecipeUrl(fields(live));
  const text = encodeRecipe(fields(live));
  assert.ok(url.startsWith(RECIPE_URL_PREFIX_2), url.slice(0, 12));
  assert.equal(text.split('\n')[0], RECIPE_VERSION_2);
  assert.ok(/^stack: \{/m.test(text));
  assert.ok(url.length < 3500, `link is ${url.length} chars`);
  assert.equal(extractRecipePayload(`https://x/#r=${url}`), url, 'a pasted link finds both versions');
  assert.equal(parseBootHash(`#r=${url}`).status, 'ok');
});

const roundTrip = (decode) => {
  const doc = recipeToProjectDoc(decode);
  // a fresh document: apply over a state that has a different, wrong stack
  useStore.setState({
    layers: [
      {
        id: 'old',
        name: 'KC-1',
        type: 'content',
        visible: true,
        layerBlendMode: 'normal',
        layerOpacity: 1,
        patch: { mode: 'off', to: null, strength: 0.16 },
      },
    ],
    activeLayerId: 'old',
    layerSnapshots: {},
  });
  S().applyProject({ ...doc, paletteOverrides: decode.paletteOverrides ?? null });
  return S();
};
const types = (st) => st.layers.map((l) => `${l.type}`).join(',');

ok('link round trip: every track, the pattern block, and the active track come back', () => {
  const want = live;
  const dec = decodeRecipeUrl(encodeRecipeUrl(fields(want)));
  assert.ok(dec.ok, dec.error);
  const got = roundTrip(dec.recipe);
  assert.equal(types(got), types(want));
  assert.deepEqual(
    got.layers.map((l) => l.id),
    want.layers.map((l) => l.id),
  );
  assert.equal(got.activeLayerId, want.activeLayerId);
  const wp = want.layers.find((l) => l.type === 'pattern').pattern;
  const gp = got.layers.find((l) => l.type === 'pattern').pattern;
  assert.deepEqual(gp, wp);
  assert.equal(gp.drift, 0.6);
  assert.equal(got.seed, want.seed);
  assert.equal(got.paletteId, want.paletteId);
});

ok('#2038: a pre-rebuild two-content stack opens under the migration law — first content kept, second trimmed', () => {
  // The old shape this suite was built on: two KC tracks, the inactive
  // one carrying its own seed/palette snapshot. stackOf normalizes on
  // the way in, so the compact stack itself already holds ONE content
  // stratum and no snapshot for the trimmed track.
  const kcA = {
    id: 'kc-a',
    name: 'KC-1',
    type: 'content',
    visible: true,
    layerBlendMode: 'normal',
    layerOpacity: 1,
    patch: { mode: 'off', to: null, strength: 0.16 },
  };
  const kcB = { ...kcA, id: 'kc-b', name: 'KC-2' };
  const carrier = {
    // (a pattern ground rides along so the stack is non-trivial — a
    // lone content stratum has no stack at all, by the v1 rule above)
    layers: [{ id: 'pt-1', name: 'PT-1', type: 'pattern', pattern: { mode: 'QUILT' } }, kcA, kcB],
    activeLayerId: 'kc-a',
    layerSnapshots: {
      'kc-b': { seed: 777, paletteId: 'v01d', layoutParams: {}, enabledAssets: { someGlyph: true } },
    },
  };
  const stack = stackOf(carrier);
  assert.ok(stack, 'the stack still encodes');
  assert.equal(stack.l.filter((l) => l.type === 'content').length, 1, 'one content stratum in the compact stack');
  assert.equal(stack.l.find((l) => l.type === 'content').id, 'kc-a', 'the FIRST content stratum is the one kept');
  assert.deepEqual(Object.keys(stack.n || {}), [], 'no snapshot rides for the trimmed track');
});

ok('text round trip: kc-recipe/2 gives the same stack', () => {
  const want = live;
  const p = parseRecipe(encodeRecipe(fields(want)));
  assert.ok(p.ok, p.error);
  assert.equal(p.recipe.version, RECIPE_VERSION_2);
  const got = roundTrip(p.recipe);
  assert.equal(types(got), types(want));
  assert.deepEqual(
    got.layers.find((l) => l.type === 'pattern').pattern,
    want.layers.find((l) => l.type === 'pattern').pattern,
  );
});

ok('older recipes still open: v1 text and v1 links decode with no stack', () => {
  const t = parseRecipe(v1Text);
  assert.ok(t.ok && !t.recipe.stack);
  assert.equal('layers' in recipeToProjectDoc(t.recipe), false);
  const u = decodeRecipeUrl(v1Url);
  assert.ok(u.ok && !u.recipe.stack);
  assert.equal(parseRecipe('kc-recipe/3\nseed: 0x1').ok, false);
  assert.equal(decodeRecipeUrl('kc-r/3.abc').ok, false);
});

ok('hostile stacks are refused whole, in plain language, and never throw', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const k of [
    null,
    7,
    'x',
    {},
    { l: [] },
    { l: [{ id: 5 }] },
    { l: [{ id: 'p', type: 'pattern', pattern: {} }] },
    { l: 'no' },
  ]) {
    const r = decodeRecipeUrl(`kc-r/2.${b64({ v: 2, s: 1, k })}`);
    assert.equal(r.ok, false, JSON.stringify(k));
    assert.match(r.error, /Bad recipe link/);
  }
  assert.equal(
    decodeRecipeUrl(`kc-r/1.${b64({ v: 2, s: 1, k: { l: [] } })}`).ok,
    false,
    'the prefix and the payload must agree',
  );
  assert.equal(parseRecipe('kc-recipe/2\nseed: 0x1\nstack: not json').ok, false);
  assert.equal(parseRecipe('kc-recipe/1\nseed: 0x1\nstack: {}').ok, false, 'a /1 recipe has no stack key');
  // 100 tracks, wild pattern values: bounded and clamped by the normalizers
  const many = {
    v: 2,
    s: 1,
    k: {
      l: Array.from({ length: 100 }, (_, i) => ({
        id: `t${i}`,
        type: i % 2 ? 'pattern' : 'content',
        pattern: { mode: 'ZZZ', density: 9999, drift: -4 },
      })),
      a: 't0',
    },
  };
  const r = decodeRecipeUrl(`kc-r/2.${b64(many)}`);
  assert.ok(r.ok);
  assert.ok(r.recipe.stack.layers.length <= 16);
  for (const l of r.recipe.stack.layers.filter((x) => x.type === 'pattern'))
    assert.ok(l.pattern.density <= 12 && l.pattern.drift >= 0 && l.pattern.mode === 'QUILT');
});

ok('keeps: a favorite carries the stack, survives its own sanitizer, and gives the same link', () => {
  const fav = captureFavorite({ ...live, enabledAssets: live.enabledAssets }, live.paletteId);
  assert.ok(fav.stack && fav.stack.l.length === live.layers.length);
  const back = sanitizeFavorite(JSON.parse(JSON.stringify(fav)));
  assert.deepEqual(back.stack, fav.stack);
  assert.equal(encodeRecipeUrl(recipeFieldsFromKept(back)).startsWith(RECIPE_URL_PREFIX_2), true);
  assert.equal(
    sanitizeFavorite({ ...JSON.parse(JSON.stringify(fav)), stack: { l: 'junk' } }).stack,
    undefined,
    'a damaged stack drops, the keep stays',
  );
  assert.equal(
    sanitizeFavorite({ ...JSON.parse(JSON.stringify(fav)), stack: { l: [], pad: 'x'.repeat(70000) } }).stack,
    undefined,
    'and an oversized one',
  );
  const plain = captureFavorite({ seed: 1, seedOffsets: {}, layoutParams: {}, enabledAssets: {} }, 'praystation');
  assert.ok(!('stack' in plain), 'a plain keep is unchanged');
});

ok('clicking a keep brings its tracks back (recall and morph), in one undo; a plain keep changes nothing', () => {
  const fav = captureFavorite({ ...live, enabledAssets: live.enabledAssets }, live.paletteId);
  const wantTypes = types(live);
  const wantPattern = live.layers.find((l) => l.type === 'pattern').pattern;
  const plainLayers = [
    {
      id: 'solo',
      name: 'KC-1',
      type: 'content',
      visible: true,
      layerBlendMode: 'normal',
      layerOpacity: 1,
      patch: { mode: 'off', to: null, strength: 0.16 },
    },
  ];
  const reset = () =>
    useStore.setState({
      layers: plainLayers,
      activeLayerId: 'solo',
      layerSnapshots: {},
      historyUndoStack: [],
      historyRedoStack: [],
    });
  for (const act of ['recallFavorite', 'morphToFavorite']) {
    reset();
    S()[act](JSON.parse(JSON.stringify(fav)));
    assert.equal(types(S()), wantTypes, `${act}: the tracks are back`);
    assert.deepEqual(
      S().layers.find((l) => l.type === 'pattern').pattern,
      wantPattern,
      `${act}: the PATTERN block is back`,
    );
    assert.equal(S().activeLayerId, live.activeLayerId);
    // #2038: there is no "other KC track" any more — the keep's own
    // state (seed + palette of the one content stratum) is what comes
    // back, and no phantom snapshot appears for a trimmed track.
    assert.equal(S().seed, live.seed, `${act}: the keep's seed is back`);
    assert.equal(S().paletteId, live.paletteId, `${act}: the keep's palette is back`);
    S().undo();
    assert.deepEqual(
      S().layers.map((l) => l.id),
      ['solo'],
      `${act}: one undo gives the old stack back`,
    );
  }
  reset();
  const plain = captureFavorite(
    { seed: 5, seedOffsets: {}, layoutParams: { ...live.layoutParams }, enabledAssets: {} },
    'praystation',
  );
  S().recallFavorite(plain);
  assert.deepEqual(
    S().layers.map((l) => l.id),
    ['solo'],
    'a keep with no stack leaves the tracks alone',
  );
  S().recallFavorite({ ...plain, stack: { l: 'junk' } });
  assert.deepEqual(
    S().layers.map((l) => l.id),
    ['solo'],
    'a damaged stack is ignored; the look still restores',
  );
  assert.equal(S().seed, 5);
});

ok('expandStack never returns raw input: layers are normalized', () => {
  const ex = expandStack({ l: [{ id: 'k', type: 'content', layerOpacity: 9, junk: 1 }], a: 'k' });
  assert.ok(ex.ok);
  assert.equal(ex.stack.layers[0].layerOpacity, 1);
  assert.ok(!('junk' in ex.stack.layers[0]));
});

console.log(`recipeStack.selfcheck: ${n} checks passed`);
