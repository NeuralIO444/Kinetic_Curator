// enabledAssetsRoundTrip.selfcheck.mjs — export -> import -> export leaves the asset set alone (#1062).
//
// applyProject used to seed the default four assets ON and then overlay the
// document's keys, so a document that did not MENTION a default (a narrow set,
// e.g. after a voice or preset loaded) came back with it ON. The restored project
// had a wider asset set than the one that was saved, through ↑ PROJECT, the
// autosave and the bundle alike.
import assert from 'node:assert';
import { useStore } from './store.js';
import { serializeProject, parseProject } from './projectDocument.js';
import { initialEnabledAssets } from './slices/globalSlice.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const S = () => useStore.getState();
const clone = (o) => JSON.parse(JSON.stringify(o));
const DEFAULTS = Object.keys(initialEnabledAssets);

// A narrow set that deliberately omits every default, from real asset ids so the sanitizer keeps them.
const ids = ASSETS.map((a) => a.id);
const nonDefault = ids.filter((id) => !DEFAULTS.includes(id)).slice(0, 4);
const narrow = Object.fromEntries(nonDefault.map((id) => [id, true]));

const roundTrip = () => {
  const doc = serializeProject(S());
  const parsed = parseProject(clone(doc));
  assert.ok(parsed.ok, 'the exported document parses');
  S().applyProject(parsed.doc);
  return serializeProject(S());
};

ok('the fixture is a real narrow set: none of the default four are in it', () => {
  assert.equal(nonDefault.length, 4);
  for (const d of DEFAULTS) assert.ok(!(d in narrow));
});

ok('export -> import -> export leaves enabledAssets unchanged (layered document)', () => {
  useStore.setState({ enabledAssets: { ...narrow } });
  const first = serializeProject(S());
  const second = roundTrip();
  assert.deepEqual(second.enabledAssets, first.enabledAssets, 'root map');
  assert.deepEqual(S().enabledAssets, narrow, 'the store holds exactly what was saved: no default re-enabled');
  const snap = (d) => d.layerSnapshots[d.activeLayerId].enabledAssets;
  assert.deepEqual(snap(second), snap(first), 'the active layer snapshot too');
  for (const d of DEFAULTS) assert.ok(!(d in S().enabledAssets), `${d} was never in the file, so it must not come back`);
});

ok('and it is a fixed point: a second round trip changes nothing', () => {
  const a = roundTrip();
  const b = roundTrip();
  assert.deepEqual(b, a);
});

ok('a deliberate OFF survives (false round-trips as false), and so does a default left ON', () => {
  const [d0, d1] = DEFAULTS;
  const map = { ...narrow, [d0]: false, [d1]: true };
  useStore.setState({ enabledAssets: { ...map } });
  roundTrip();
  assert.deepEqual(S().enabledAssets, map);
});

ok('a document with no enabledAssets at all still boots with the default four', () => {
  const doc = clone(serializeProject(S()));
  delete doc.enabledAssets;
  for (const id of Object.keys(doc.layerSnapshots || {})) delete doc.layerSnapshots[id].enabledAssets;
  const parsed = parseProject(doc);
  assert.ok(parsed.ok);
  useStore.setState({ enabledAssets: { ...narrow } });
  S().applyProject(parsed.doc);
  // Absent means "use the default", exactly as before this change.
  for (const d of DEFAULTS) assert.equal(S().enabledAssets[d], true, `${d} is on`);
});

ok('an empty or hostile map is NOT read as "no assets": a damaged file must not blank the canvas', () => {
  for (const bad of [{}, { 'not-an-asset': true, '__proto__': true }]) {
    const doc = clone(serializeProject(S()));
    doc.enabledAssets = bad;
    doc.layerSnapshots[doc.activeLayerId].enabledAssets = bad;
    const parsed = parseProject(doc);
    assert.ok(parsed.ok);
    useStore.setState({ enabledAssets: { ...narrow } });
    S().applyProject(parsed.doc);
    for (const d of DEFAULTS) assert.equal(S().enabledAssets[d], true, `${JSON.stringify(bad)}: ${d} on`);
  }
});

console.log(`enabledAssetsRoundTrip.selfcheck: ${n} checks passed`);
