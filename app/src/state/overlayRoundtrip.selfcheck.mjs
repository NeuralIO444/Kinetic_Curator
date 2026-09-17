// #134 QA gap — overlay cap + REN/SWAP round-trips at the store level.
//
// Pure-function coverage lives in src/assets/overlay.selfcheck.mjs. This file
// drives the real globalSlice actions (ingestAsset / duplicateAsset /
// renameCustomAsset / replaceCustomAsset / removeCustomAsset) through a
// minimal store harness (same pattern as firewall.selfcheck.mjs) and asserts
// that ids propagate to every id-keyed map: customAssets, enabledAssets, and
// assetWeightOverrides.
//
// Note on paths: every overlay entry point funnels through these actions —
// pool paste/drop/import, the DUP/REN/SWAP/DEL tile buttons, and the Asset
// Studio's SAVE TO POOL (ASSETS_INGEST) and EDIT-save (ASSETS_REPLACE) all
// dispatch here via wireEventBus — so one round-trip per action covers the
// pool/paste paths and the hand-authored path together.
import assert from 'node:assert';
import { createGlobalSlice } from './slices/globalSlice.js';
import { OVERLAY_CAP } from '../assets/overlay.js';

function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  state = { ...createGlobalSlice(set) };
  return { get: () => state };
}

const SVG_A = '<svg viewBox="0 0 100 100"><path d="M0 0 L10 10"/></svg>';
const SVG_B = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const ids = (s) => s.customAssets.map((a) => a.id);

// ── Cap: 32 ingest ok, 33rd refused, no eviction ─────────────────────────────
{
  const store = makeStore();
  const s = () => store.get();
  for (let i = 0; i < OVERLAY_CAP; i += 1) {
    s().ingestAsset(SVG_A, `cap_${i}`);
    assert.strictEqual(s().ingestError, null, `ingest ${i} should succeed`);
  }
  assert.strictEqual(s().customAssets.length, OVERLAY_CAP);
  const before = ids(s());

  s().ingestAsset(SVG_A, 'one_too_many');
  assert.strictEqual(s().ingestError, 'overlay full');
  assert.strictEqual(s().customAssets.length, OVERLAY_CAP);
  assert.deepStrictEqual(ids(s()), before, 'refused ingest must not evict anything');

  s().duplicateAsset(s().customAssets[0].id);
  assert.strictEqual(s().ingestError, 'overlay full');
  assert.strictEqual(s().customAssets.length, OVERLAY_CAP);
  assert.deepStrictEqual(ids(s()), before, 'refused duplicate must not evict anything');
}

// ── REN round-trip: old id fully gone, new id resolves everywhere ───────────
{
  const store = makeStore();
  const s = () => store.get();
  s().ingestAsset(SVG_A, 'ren_me');
  s().toggleAsset('user:ren_me');
  s().setAssetWeight('user:ren_me', 'heavy');
  assert.strictEqual(s().ingestError, null);

  s().renameCustomAsset('user:ren_me', 'renamed');

  // Overlay list: old id gone, new id present, content carried over.
  assert.ok(!ids(s()).includes('user:ren_me'), 'old id gone from overlay');
  assert.ok(ids(s()).includes('user:renamed'), 'new id present in overlay');
  const renamed = s().customAssets.find((a) => a.id === 'user:renamed');
  assert.ok(renamed.svg.includes('<path'), 'asset content carried over');

  // Enabled-asset map: toggle state followed the rename.
  assert.ok(!('user:ren_me' in s().enabledAssets), 'old id gone from enabledAssets');
  assert.strictEqual(s().enabledAssets['user:renamed'], true, 'enabled state followed rename');

  // Weight overrides: the override followed the rename (was left stale pre-#134 fix).
  assert.ok(!('user:ren_me' in s().assetWeightOverrides), 'old id gone from overrides');
  assert.strictEqual(s().assetWeightOverrides['user:renamed'], 'heavy', 'weight override followed rename');
  const effective = s().assetWeightOverrides['user:renamed'] || renamed.weight || 'medium';
  assert.strictEqual(effective, 'heavy', 'panel effectiveWeight resolves heavy after rename');

  // Renaming to the same id is a no-op: no map churn.
  s().renameCustomAsset('user:renamed', 'renamed');
  assert.strictEqual(s().ingestError, null);
  assert.strictEqual(s().enabledAssets['user:renamed'], true);
  assert.strictEqual(s().assetWeightOverrides['user:renamed'], 'heavy');

  // Rename to a taken id is refused and changes nothing.
  s().ingestAsset(SVG_A, 'other');
  s().renameCustomAsset('user:renamed', 'other');
  assert.strictEqual(s().ingestError, 'id taken');
  assert.ok(ids(s()).includes('user:renamed'));
}

// ── SWAP round-trip: id stable, content replaced, references intact ─────────
{
  const store = makeStore();
  const s = () => store.get();
  s().ingestAsset(SVG_A, 'swappy');
  s().toggleAsset('user:swappy');
  s().setAssetWeight('user:swappy', 'light');

  s().replaceCustomAsset('user:swappy', SVG_B);
  assert.strictEqual(s().ingestError, null);

  const swapped = s().customAssets.find((a) => a.id === 'user:swappy');
  assert.ok(swapped, 'id still resolves after SWAP');
  assert.ok(swapped.svg.includes('<circle'), 'new content live after SWAP');
  assert.ok(!swapped.svg.includes('<path d="M0 0 L10 10"'), 'old content fully replaced');
  assert.strictEqual(s().enabledAssets['user:swappy'], true, 'enabled state untouched by SWAP');
  assert.strictEqual(s().assetWeightOverrides['user:swappy'], 'light', 'weight override untouched by SWAP');

  // Hostile replacement markup is refused; original survives.
  s().replaceCustomAsset('user:swappy', '<svg><script>x</script></svg>');
  assert.ok(s().ingestError, 'hostile SWAP refused');
  assert.ok(s().customAssets.find((a) => a.id === 'user:swappy').svg.includes('<circle'));
}

// ── Remove: old id fully gone from every id-keyed map ───────────────────────
{
  const store = makeStore();
  const s = () => store.get();
  s().ingestAsset(SVG_A, 'doomed');
  s().toggleAsset('user:doomed');
  s().setAssetWeight('user:doomed', 'heavy');

  s().removeCustomAsset('user:doomed');
  assert.strictEqual(s().ingestError, null);
  assert.ok(!ids(s()).includes('user:doomed'));
  assert.ok(!('user:doomed' in s().enabledAssets), 'removed id gone from enabledAssets');
  assert.ok(!('user:doomed' in s().assetWeightOverrides), 'removed id gone from overrides');
}

console.log('overlayRoundtrip.selfcheck: OK');
