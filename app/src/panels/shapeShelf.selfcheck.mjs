// shapeShelf.selfcheck.mjs — #2280: the WetLab SHAPE rung's shelf, saved in the project (spec §12.6).
//
//   sanitize   junk, unknown styles and off-vocabulary assets dropped; duplicates once; never past the cap
//   keep       kept | already | shelf-full | nobody; a full shelf refuses rather than evicting; pure
//   drop       by key; an unknown key changes nothing
//   store      keepDealtShape and dropShelfShape write the shelf and the note; keeping never touches the stage
//   document   the shelf round-trips through serialize → parse → applyProject; an old document loads empty;
//              an empty shelf writes nothing; the watcher sees a shelf change
import assert from 'node:assert/strict';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { PROJECT_STATE_KEYS } from '../state/projectWatch.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { shapeKey } from '../deal/shapeAdapter.mjs';
import { SHAPE_SHELF_CAP, sanitizeShapeShelf, keepShape, dropShape } from './shapeShelf.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const ALL = CONSTRUCT_STYLE_IDS.flatMap((style) => constructVocabularyIds(style).map((asset) => ({ style, asset })));
const A = ALL[0];
const B = ALL[1];

ok('there are enough shapes in the vocabularies to test the cap honestly', () => {
  assert.ok(ALL.length >= 3);
  assert.equal(SHAPE_SHELF_CAP, 64);
});

ok('sanitize keeps real shapes once, in order, and drops junk', () => {
  for (const junk of [null, undefined, 'x', 4, {}, { a: 1 }]) assert.deepEqual(sanitizeShapeShelf(junk), []);
  const shelf = sanitizeShapeShelf([
    A,
    null,
    { style: 'nope', asset: A.asset },
    { style: A.style, asset: 'not-in-style' },
    { ...A, extra: 'dropped' },
    B,
  ]);
  assert.deepEqual(shelf, [A, B]);
  assert.deepEqual(Object.keys(shelf[0]), ['style', 'asset'], 'only the two fields survive');
});

ok('sanitize never returns more than the cap', () => {
  // the vocabularies hold fewer than 64 distinct shapes, so a cap breach can only come from bad dedupe; build the
  // longest honest list and check it is kept whole and in order
  const shelf = sanitizeShapeShelf([...ALL, ...ALL]);
  assert.equal(shelf.length, Math.min(ALL.length, SHAPE_SHELF_CAP));
  assert.deepEqual(shelf, ALL.slice(0, SHAPE_SHELF_CAP));
});

ok('keep: kept, then already; nobody for junk; pure', () => {
  const empty = [];
  const one = keepShape(empty, A);
  assert.deepEqual(one.note, { key: shapeKey(A), status: 'kept' });
  assert.deepEqual(one.shelf, [A]);
  assert.deepEqual(empty, [], 'the input is not changed');
  const again = keepShape(one.shelf, { ...A });
  assert.equal(again.note.status, 'already');
  assert.equal(again.shelf, one.shelf, 'the same array when nothing changed');
  const junk = keepShape(one.shelf, { style: 'nope', asset: 'x' });
  assert.deepEqual(junk.note, { key: null, status: 'nobody' });
  assert.equal(junk.shelf, one.shelf);
});

ok('a full shelf refuses rather than evicting', () => {
  assert.ok(ALL.length < SHAPE_SHELF_CAP, `${ALL.length} shapes exist; the cap of ${SHAPE_SHELF_CAP} is headroom`);
  const two = [A, B];
  const r = keepShape(two, ALL[2], 2);
  assert.deepEqual(r.note, { key: shapeKey(ALL[2]), status: 'shelf-full' });
  assert.equal(r.shelf, two, 'nothing evicted, nothing added');
  assert.equal(keepShape(two, A, 2).note.status, 'already', 'a shape already on a full shelf is still already');
  assert.equal(sanitizeShapeShelf([...ALL], 2).length, 2, 'the sanitizer honours the cap');
});

ok('drop removes by key; an unknown key changes nothing', () => {
  const shelf = [A, B];
  assert.deepEqual(dropShape(shelf, shapeKey(A)), [B]);
  assert.equal(dropShape(shelf, 'shape:nope:x'), shelf);
  assert.deepEqual(dropShape(null, shapeKey(A)), null);
});

ok('the store: keepDealtShape writes the shelf and the note; it never touches the stage', () => {
  useStore.setState({ shapeShelf: [], shapeShelfNote: null, enabledAssets: {}, customAssets: [] });
  const before = useStore.getState();
  before.keepDealtShape(A);
  let s = useStore.getState();
  assert.deepEqual(s.shapeShelf, [A]);
  assert.deepEqual(s.shapeShelfNote, { key: shapeKey(A), status: 'kept' });
  assert.deepEqual(s.enabledAssets, {}, 'keeping does not turn the shape on');
  assert.deepEqual(s.customAssets, [], 'keeping does not add a pool tile');
  s.keepDealtShape(A);
  s = useStore.getState();
  assert.equal(s.shapeShelfNote.status, 'already');
  s.keepDealtShape({ style: 'nope' });
  assert.equal(useStore.getState().shapeShelfNote.status, 'nobody');
  useStore.getState().dropShelfShape(shapeKey(A));
  assert.deepEqual(useStore.getState().shapeShelf, []);
});

ok('the document: the shelf round-trips, an empty one writes nothing, an old document loads empty', () => {
  const doc = serializeProject({ seed: 7, shapeShelf: [A, B, { junk: true }] });
  assert.deepEqual(doc.shapeShelf, [A, B]);
  const parsed = parseProject(doc);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.doc.shapeShelf, [A, B]);
  assert.equal('shapeShelf' in serializeProject({ seed: 7, shapeShelf: [] }), false, 'empty shelf: no field');
  assert.equal('shapeShelf' in serializeProject({ seed: 7 }), false);
  assert.deepEqual(parseProject(serializeProject({ seed: 7 })).doc.shapeShelf, []);
  const garbled = parseProject({ ...serializeProject({ seed: 7 }), shapeShelf: 'not a list' });
  assert.deepEqual(garbled.doc.shapeShelf, [], 'a garbled shelf loads empty');
});

ok('applyProject installs the shelf, and a document without one empties it', () => {
  useStore.setState({ shapeShelf: [A] });
  const parsed = parseProject(serializeProject({ seed: 7, shapeShelf: [B] }));
  useStore.getState().applyProject(parsed.doc);
  assert.deepEqual(useStore.getState().shapeShelf, [B]);
  const bare = parseProject(serializeProject({ seed: 7 }));
  useStore.getState().applyProject(bare.doc);
  assert.deepEqual(useStore.getState().shapeShelf, []);
});

ok('the project watcher counts a shelf change as a project change', () => {
  assert.ok(PROJECT_STATE_KEYS.includes('shapeShelf'));
});

console.log(`shapeShelf selfcheck: ${n} ok`);
