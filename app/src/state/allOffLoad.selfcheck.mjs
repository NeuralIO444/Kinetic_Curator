// node src/state/allOffLoad.selfcheck.mjs
// #2522 path 4 — a saved all-off project is a genuine state and loads as saved, but never silently: a boot notice
// says the stage is empty. A normal project, a null map and a missing map get no notice.
import assert from 'node:assert';
import { useStore } from './store.js';
import { allOffLoadNotice } from './slices/globalSlice.js';
import { serializeProject } from './projectDocument.js';
import { ASSETS } from '../data/assets/index.js';

assert.deepStrictEqual(allOffLoadNotice({ a: true, b: false }), {});
assert.deepStrictEqual(allOffLoadNotice(null), {});
assert.deepStrictEqual(allOffLoadNotice(undefined), {});
assert.deepStrictEqual(allOffLoadNotice({}), {}, '{} falls back to the default set on load, not all-off');
assert.match(allOffLoadNotice({ a: false, b: false }).bootNotice, /All assets are off/);

// Through the real store: a real all-off document (top level AND the active layer snapshot, as serializeProject
// writes them) lands as saved and raises the notice.
const S = () => useStore.getState();
const ids = ASSETS.slice(0, 4).map((a) => a.id); // known catalog ids: sanitize keeps these, drops strangers
const mapOf = (on) => Object.fromEntries(ids.map((id, i) => [id, on === true && i === 0]));
const withAssets = (doc, map) => {
  const out = { ...doc, enabledAssets: map };
  if (doc.layerSnapshots && doc.activeLayerId && doc.layerSnapshots[doc.activeLayerId]) {
    out.layerSnapshots = {
      ...doc.layerSnapshots,
      [doc.activeLayerId]: { ...doc.layerSnapshots[doc.activeLayerId], enabledAssets: map },
    };
  }
  return out;
};
const base = serializeProject(S());
S().applyProject(withAssets(base, mapOf(false)));
assert.ok(
  Object.values(S().enabledAssets).length > 0 && Object.values(S().enabledAssets).every((v) => v === false),
  'kept as saved',
);
assert.match(String(S().bootNotice), /All assets are off/, 'the load says so');
S().setBootNotice(null);
S().applyProject(withAssets(base, mapOf(true)));
assert.ok(Object.values(S().enabledAssets).some(Boolean), 'one asset on is on');
assert.doesNotMatch(String(S().bootNotice || ''), /All assets are off/, 'a project with an asset on raises no notice');

console.log('allOffLoad.selfcheck: OK');
