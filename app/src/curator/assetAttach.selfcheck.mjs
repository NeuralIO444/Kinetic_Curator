// node src/curator/assetAttach.selfcheck.mjs
// #1355 — ATTACH points: set on the asset in the wet lab, at most four, saved with the project.
import assert from 'node:assert/strict';
import { MAX_ATTACH, ATTACH_HIT, clickAttach, sanitizeAttachPoints, sanitizeAssetAttach } from './assetAttach.js';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';

// 1. a click adds a point; a click on a point removes it; never more than four
{
  let p = [];
  for (const pt of [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 10, y: 90 }, { x: 90, y: 90 }]) p = clickAttach(p, pt);
  assert.equal(p.length, MAX_ATTACH);
  assert.equal(clickAttach(p, { x: 50, y: 50 }), p, 'at the limit a new click adds nothing and moves nothing');
  const q = clickAttach(p, { x: 90 + ATTACH_HIT / 2, y: 10 });
  assert.deepEqual(q, [{ x: 10, y: 10 }, { x: 10, y: 90 }, { x: 90, y: 90 }], 'a click near a point removes that point only');
  assert.deepEqual(clickAttach([], { x: 33.33333, y: 66.66666 }), [{ x: 33.33, y: 66.67 }], 'stored to two decimals');
}

// 2. junk and out-of-box clicks never become points
{
  const p = [{ x: 1, y: 2 }];
  for (const bad of [null, {}, { x: NaN, y: 1 }, { x: -1, y: 5 }, { x: 5, y: 100.1 }, { x: '5', y: 5 }]) assert.equal(clickAttach(p, bad), p);
  assert.deepEqual(sanitizeAttachPoints([{ x: 5, y: 5, z: 1 }, { x: 500, y: 5 }, null]), [{ x: 5, y: 5 }]);
  assert.equal(sanitizeAssetAttach(null), null);
  assert.equal(sanitizeAssetAttach({ a: [], b: 'x' }), null, 'nothing set = null, so an untouched project saves as before');
  assert.deepEqual(sanitizeAssetAttach({ a: [{ x: 1, y: 2 }], b: [] }), { a: [{ x: 1, y: 2 }] });
}

// 3. the store action, and the round trip through a saved project
{
  const before = JSON.stringify(serializeProject(useStore.getState()));
  assert.ok(!before.includes('assetAttach'), 'a project with no points does not mention them');
  useStore.getState().clickAssetAttach('org_blob_01', { x: 20, y: 30 });
  useStore.getState().clickAssetAttach('org_blob_01', { x: 70, y: 60 });
  assert.deepEqual(useStore.getState().assetAttach, { org_blob_01: [{ x: 20, y: 30 }, { x: 70, y: 60 }] });
  const doc = JSON.parse(JSON.stringify(serializeProject(useStore.getState())));
  assert.deepEqual(doc.assetAttach, { org_blob_01: [{ x: 20, y: 30 }, { x: 70, y: 60 }] }, 'saved with the project');
  // removing the last point removes the asset's entry
  useStore.getState().clickAssetAttach('org_blob_01', { x: 20, y: 30 });
  useStore.getState().clearAssetAttach('org_blob_01');
  assert.deepEqual(useStore.getState().assetAttach, {});
  // loading the saved project brings the points back
  const s = useStore.getState();
  const load = s.loadProject || s.applyProject || s.importProject;
  assert.equal(typeof load, 'function', 'the store has a project loader');
  const parsed = parseProject(doc); // the same gate a real file goes through
  assert.ok(parsed.ok, 'the saved project parses');
  assert.deepEqual(parsed.doc.assetAttach, doc.assetAttach, 'the parser keeps the points');
  assert.deepEqual(parseProject({ ...doc, assetAttach: { x: [{ x: 'bad', y: 1 }] } }).doc.assetAttach, {}, 'a hostile map collapses to nothing');
  load(parsed.doc);
  assert.deepEqual(useStore.getState().assetAttach, { org_blob_01: [{ x: 20, y: 30 }, { x: 70, y: 60 }] }, 'reloaded');
}

console.log('assetAttach.selfcheck: ok (#1355 attach points)');
