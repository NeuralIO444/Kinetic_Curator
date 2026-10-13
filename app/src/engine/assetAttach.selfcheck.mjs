// node src/engine/assetAttach.selfcheck.mjs
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
  assert.equal(sanitizeAssetAttach({ b: 'x' }), null, 'nothing set = null, so an untouched project saves as before');
  assert.deepEqual(sanitizeAssetAttach({ a: [{ x: 1, y: 2 }], b: [] }), { a: [{ x: 1, y: 2 }], b: [] }, 'an empty list is kept: the artist said "none"');
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
  // "clear points" is the artist saying none: an explicit empty list, not a return to auto
  useStore.getState().clearAssetAttach('org_blob_01');
  assert.deepEqual(useStore.getState().assetAttach, { org_blob_01: [] });
  // AUTO drops the hand edit
  useStore.getState().autoAssetAttach('org_blob_01');
  assert.deepEqual(useStore.getState().assetAttach, {});
  // loading the saved project brings the points back
  const s = useStore.getState();
  const load = s.loadProject || s.applyProject || s.importProject;
  assert.equal(typeof load, 'function', 'the store has a project loader');
  const parsed = parseProject(doc); // the same gate a real file goes through
  assert.ok(parsed.ok, 'the saved project parses');
  assert.deepEqual(parsed.doc.assetAttach, doc.assetAttach, 'the parser keeps the points');
  assert.deepEqual(parseProject({ ...doc, assetAttach: { x: [{ x: 'bad', y: 1 }], y: 'junk' } }).doc.assetAttach, { x: [] }, 'hostile points are dropped');
  load(parsed.doc);
  assert.deepEqual(useStore.getState().assetAttach, { org_blob_01: [{ x: 20, y: 30 }, { x: 70, y: 60 }] }, 'reloaded');
}

// 3b. AUTO: every asset has points from its shape; a hand edit starts from them and then wins (Matt, 2026-10-11)
{
  const { autoAttachPoints, attachPointsFor } = await import('./autoAttach.js');
  const { ASSETS } = await import('../data/assets/index.js');
  const { readFileSync } = await import('node:fs');
  for (const a of ASSETS) {
    const p = autoAttachPoints(a.svg);
    assert.ok(p.length >= 1 && p.length <= MAX_ATTACH, `${a.id}: ${p.length} points`);
    assert.deepEqual(sanitizeAttachPoints(p), p, `${a.id}: points are inside the box`);
    assert.equal(autoAttachPoints(a.svg), p, 'the same markup gives the same points');
  }
  const four = ASSETS.filter((a) => autoAttachPoints(a.svg).length === 4).length;
  assert.ok(four >= ASSETS.length * 0.8, `most shapes read fully (${four} of ${ASSETS.length} get four points)`);
  // known shapes: a square's points are the middles of its sides; a triangle's top is its tip
  const sq = '<rect x="20" y="20" width="60" height="60"/>';
  assert.deepEqual(autoAttachPoints(sq), [{ x: 50, y: 20 }, { x: 80, y: 50 }, { x: 50, y: 80 }, { x: 20, y: 50 }], 'top, right, bottom, left');
  assert.deepEqual(autoAttachPoints('<circle cx="50" cy="50" r="40"/>'), [{ x: 50, y: 10 }, { x: 90, y: 50 }, { x: 50, y: 90 }, { x: 10, y: 50 }]);
  assert.deepEqual(autoAttachPoints('<polygon points="50,10 90,86 10,86"/>')[0], { x: 50, y: 10 });
  assert.deepEqual(autoAttachPoints('<line x1="10" y1="50" x2="90" y2="50"/>'), [{ x: 50, y: 50 }, { x: 90, y: 50 }, { x: 10, y: 50 }], 'extremes on the same spot collapse');
  assert.deepEqual(autoAttachPoints('<text x="50" y="60">A</text>'), [{ x: 50, y: 50 }], 'no readable outline: the centre');
  assert.deepEqual(autoAttachPoints(''), []); assert.deepEqual(autoAttachPoints(null), []);
  assert.ok(!/Math\.random|Date\.now|document\.|window\./.test(readFileSync(new URL('./autoAttach.js', import.meta.url), 'utf8')), 'pure: no chance, no clock, no DOM');
  // hand edits win
  const asset = { id: 'sq', svg: sq };
  assert.deepEqual(attachPointsFor(asset, {}), autoAttachPoints(sq));
  assert.deepEqual(attachPointsFor(asset, { sq: [] }), [], 'the artist said none');
  assert.deepEqual(attachPointsFor(asset, { sq: [{ x: 1, y: 1 }] }), [{ x: 1, y: 1 }]);
  // the first hand edit starts from what the lab showed: removing one auto point leaves the other three as the artist's
  useStore.getState().clickAssetAttach('sq', { x: 50, y: 20 }, autoAttachPoints(sq));
  assert.deepEqual(useStore.getState().assetAttach.sq, [{ x: 80, y: 50 }, { x: 50, y: 80 }, { x: 20, y: 50 }]);
  useStore.getState().autoAssetAttach('sq');
  assert.ok(!('sq' in useStore.getState().assetAttach));
}

// 4. the tile preview shows where the points are, in structure red (never Davis amber: DS rule 5)
{
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync(new URL('../panels/AssetPoolPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/a\.svg \+ \(enabled\[a\.id\] \? attachMarks\(attachPointsFor\(a, attach\)/.test(panel), 'the tile preview of an asset in use draws its attach points');
  assert.ok(/data-attach[^`]*var\(--kc-red\)/.test(panel) && !/kc-davis/.test(readFileSync(new URL('../panels/WetLab.jsx', import.meta.url), 'utf8')));
}

console.log('assetAttach.selfcheck: ok (#1355 attach points)');
