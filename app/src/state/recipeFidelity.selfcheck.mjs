// node src/state/recipeFidelity.selfcheck.mjs
// #2325 (R5, spec §3.5) — the fidelity proof: a v3 link's optional `f` is the hash of frame 0, the receiver compares
// it after applying, and a difference only ever adds a notice.
import assert from 'node:assert/strict';
import { sceneFrame0Hash, checkFrame0, fidelityNotice, isFrame0Hash, FIDELITY_NOTICE } from './recipeFidelity.js';
import { encodeRecipeUrl, decodeRecipeUrl, buildShareHref, extractRecipePayload } from './recipeUrls.js';

let n = 0;
const ok = (msg) => console.log(`  ok ${++n} — ${msg}`);
const { useStore } = await import('./store.js');
const { serializeProject } = await import('./projectDocument.js');
const st = () => useStore.getState();
// the stage with two marks on: the doc a real sender would hash (serializeProject of the live store)
st().setEnabledAssets({ org_petal_01: true, org_petal_02: true });
const REST = useStore.getState();
/** The project doc after `edit()` has run on the store; the store is put back afterwards. */
const docAfter = (edit = () => {}) => {
  edit();
  const d = serializeProject(st());
  useStore.setState(REST, true);
  return d;
};

// 1. a hash is 16 hex chars, the same on every call, and moves with every scene field the e2e dresses (so a field
// dropped from a link is caught, not just a changed seed).
{
  const base = await sceneFrame0Hash(docAfter());
  assert.ok(isFrame0Hash(base), `hash is 16 hex (got ${base})`);
  assert.equal(await sceneFrame0Hash(docAfter()), base, 'same scene, same hash');
  const world = { chapter: 'engraving', ground: '#10161c', ink: '#e6dcc4', boilFps: 8, finish: { grain: 0.4 } };
  const moves = {
    seed: () => useStore.setState({ seed: 1234 }),
    'palette overrides': () => st().setPaletteOverrides({ bg: '#123456' }),
    light: () => st().setLight({ azimuth: 2, elevation: 0.5 }),
    world: () => useStore.setState({ world }),
    'asset kineme': () => st().setAssetKineme('org_petal_01', 'rock'),
    'enabled assets': () => st().setEnabledAssets({ org_petal_01: true }),
    'weight overrides': () => useStore.setState({ assetWeightOverrides: { org_petal_01: 3 } }),
    canvas: () => st().setCanvasSize(1200, 800),
  };
  for (const [name, edit] of Object.entries(moves)) {
    assert.notEqual(await sceneFrame0Hash(docAfter(edit)), base, `${name} must change frame 0`);
  }
  ok(`frame-0 hash is stable and moves with ${Object.keys(moves).join(', ')}`);
}

// 2. it never throws: a doc the resolver refuses is "no proof", not an error.
{
  assert.equal(await sceneFrame0Hash(null), null);
  assert.equal(await sceneFrame0Hash('x'), null);
  assert.equal(await sceneFrame0Hash([]), null);
  assert.equal(await sceneFrame0Hash({ layers: 'bad' }), null);
  ok('a null, non-object, array or unresolvable doc gives null, never a throw');
}

// 3. the link carries `f`; it survives the codec; a malformed one is dropped; an older link has none.
{
  const f = await sceneFrame0Hash(docAfter());
  const link = await encodeRecipeUrl({ seed: 7, paletteId: 'bone', layoutParams: {}, frame0Hash: f });
  const dec = await decodeRecipeUrl(link);
  assert.ok(dec.ok);
  assert.equal(dec.recipe.frame0Hash, f);
  assert.equal(extractRecipePayload(buildShareHref(link, 'https://x.test/')) !== null, true);
  for (const bad of ['XYZ', '276009AA90FB8C42', '276009aa90fb8c4', 12345, {}, null]) {
    const l = await encodeRecipeUrl({ seed: 7, paletteId: 'bone', layoutParams: {}, frame0Hash: bad });
    assert.equal((await decodeRecipeUrl(l)).recipe.frame0Hash, undefined, `${String(bad)} is not carried`);
  }
  const none = await decodeRecipeUrl(await encodeRecipeUrl({ seed: 7, paletteId: 'bone', layoutParams: {} }));
  assert.equal(none.recipe.frame0Hash, undefined, 'no proof requested, none written');
  ok('`f` round-trips through kc-r/3; a malformed or absent hash is dropped, never half-carried');
}

// 4. the receiver check: equal = quiet, different = the notice, no proof = nothing to say.
{
  const sent = await sceneFrame0Hash(docAfter());
  const same = await checkFrame0(sent, docAfter());
  assert.deepEqual([same.match, same.sent === same.got], [true, true]);
  const diff = await checkFrame0(
    sent,
    docAfter(() => st().setLight({ azimuth: 2, elevation: 0.1 })),
  );
  assert.equal(diff.match, false);
  assert.equal(await checkFrame0(undefined, docAfter()), null, 'an older link is never checked');
  assert.equal(await checkFrame0('not-a-hash', docAfter()), null);
  assert.equal(await checkFrame0(sent, null), null, 'an uncomputable receiver frame is not a mismatch');
  ok('equal frame 0 is quiet, a different one is flagged, and a missing proof says nothing');
}

// 5. the notice: exact words, only on a mismatch, only for a recipe that carries `f`.
{
  assert.equal(FIDELITY_NOTICE, "Scene differs from sender's build");
  const state = st();
  const mine = await sceneFrame0Hash(serializeProject(state));
  assert.ok(isFrame0Hash(mine), 'the stage has a frame 0');
  assert.equal(await fidelityNotice({ frame0Hash: mine }, state), null, 'same frame 0: no notice');
  const other = mine === '0000000000000000' ? '1111111111111111' : '0000000000000000';
  assert.equal(await fidelityNotice({ frame0Hash: other }, state), FIDELITY_NOTICE);
  assert.equal(await fidelityNotice({}, state), null, 'a link without f is never checked');
  assert.equal(await fidelityNotice(null, state), null);
  ok(`a mismatch reads "${FIDELITY_NOTICE}"; a match, an older link and no recipe stay silent`);
}

console.log(`recipeFidelity.selfcheck: OK (${n} checks)`);
process.exit(0);
