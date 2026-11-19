// node src/state/gaitLocks.selfcheck.mjs
// #2329 follow-up (Matt, 2026-11-18 18:53 PT, ruling 3) — gait locks are saved with the project, as a SCENE field, so
// they travel with recipes. Only the user's locks are saved; the QUEEN's picks stay session-only.
//   1. the document: no locks writes no key (an older file is unchanged); a QUEEN pick is never written; a lock is
//      `gaitLocks: { target: gaitId }`, classed scene, carried in a v3 recipe's scene block, watched by the autosave
//   2. it round-trips: serialize → parse → load stands the lock back up (locked, by the user)
//   3. a load applies the doc's locks and clears the rest; a doc without locks clears them; a QUEEN pick never
//      survives a load; an older recipe that does not speak for locks keeps the user's own
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { serializeProject, parseProject, DOC_FIELD_CLASS, sceneOf } from './projectDocument.js';
import { SCENE_BLOCK_KEYS, pickSceneBlock } from './recipeSceneKeys.js';
import { PROJECT_STATE_KEYS, projectDirty } from './projectWatch.mjs';
import { sceneFieldsFor } from './sceneApply.js';
import { canonGaits } from '../data/canon/gaits.js';
import { ASSETS_CONSTRUCTS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const st = () => useStore.getState();
const A = ASSETS_CONSTRUCTS.find((a) => a.style === 'swiss').id;
const B = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const fresh = () => useStore.setState(useStore.getInitialState(), true);
const roundTrip = (doc) => {
  const p = parseProject(JSON.parse(JSON.stringify(doc)));
  assert.equal(p.ok, true, p.error);
  return p.doc;
};

ok('the document: no locks, no key; a QUEEN pick is never saved; a lock is a scene field, carried and watched', () => {
  fresh();
  const plain = serializeProject(st());
  assert.equal('gaitLocks' in plain, false, 'no locks: the file is what it always was');
  st().assignGait({ target: A, gaitId: canonGaits('swiss').performing.id, by: 'queen' });
  assert.equal('gaitLocks' in serializeProject(st()), false, 'a QUEEN pick is session-only');
  assert.deepEqual(serializeProject(st()), plain, 'the same document with a pick standing');
  st().assignGait({ target: B, gaitId: canonGaits('organic').idle.id, by: 'user', locked: true });
  const doc = serializeProject(st());
  assert.deepEqual(doc.gaitLocks, { [B]: canonGaits('organic').idle.id });
  assert.equal(DOC_FIELD_CLASS.gaitLocks, 'scene');
  assert.ok(SCENE_BLOCK_KEYS.includes('gaitLocks'), 'a v3 recipe carries it');
  assert.deepEqual(pickSceneBlock(sceneOf(st())).gaitLocks, doc.gaitLocks);
  assert.ok(PROJECT_STATE_KEYS.includes('gaitAssignments'));
  const before = st();
  st().lockGait(A, true);
  assert.equal(projectDirty(st(), before), true, 'a lock wakes the autosave');
  // an unlocked user pick is not a lock
  fresh();
  st().assignGait({ target: A, gaitId: canonGaits('swiss').idle.id, by: 'user', locked: false });
  assert.equal('gaitLocks' in serializeProject(st()), false);
});

ok('round trip: serialize → parse → load stands the lock back up; an old file parses to none', () => {
  fresh();
  st().assignGait({ target: B, gaitId: canonGaits('organic').performing.id, by: 'user', locked: true });
  st().assignGait({ target: A, gaitId: canonGaits('swiss').idle.id, by: 'queen' });
  const doc = roundTrip(serializeProject(st()));
  assert.deepEqual(doc.gaitLocks, { [B]: canonGaits('organic').performing.id });
  fresh();
  st().applyProject(doc);
  assert.deepEqual(st().gaitAssignments, {
    [B]: { gaitId: canonGaits('organic').performing.id, by: 'user', locked: true },
  });
  const old = serializeProject((fresh(), st()));
  assert.deepEqual(roundTrip(old).gaitLocks, {}, 'a file without locks parses to none');
  // hostile values are dropped at the door
  assert.deepEqual(
    roundTrip({ ...old, gaitLocks: { [A]: 'nope', '': canonGaits('swiss').idle.id, [B]: 7 } }).gaitLocks,
    {},
  );
});

ok('a load applies the doc’s locks and clears the rest; a doc without locks clears them; picks never survive', () => {
  fresh();
  const withLock = (() => {
    st().assignGait({ target: B, gaitId: canonGaits('organic').idle.id, by: 'user', locked: true });
    return roundTrip(serializeProject(st()));
  })();
  const without = roundTrip(serializeProject((fresh(), st())));
  // a session with its own lock and a pick, then a load
  st().assignGait({ target: A, gaitId: canonGaits('swiss').performing.id, by: 'user', locked: true });
  st().assignGait({ target: B, gaitId: canonGaits('organic').performing.id, by: 'queen' });
  st().applyProject(withLock);
  assert.deepEqual(Object.keys(st().gaitAssignments), [B], 'the doc’s lock, and nothing of the old session');
  assert.equal(st().gaitAssignments[B].locked, true);
  st().applyProject(without);
  assert.deepEqual(st().gaitAssignments, {}, 'a doc without locks clears them');
  // a v3 recipe (replaceAll) speaks for every scene key: without locks, it clears them
  st().assignGait({ target: A, gaitId: canonGaits('swiss').idle.id, by: 'user', locked: true });
  st().applyScene({ ...sceneOf(st()), gaitLocks: undefined }, { replaceAll: true });
  assert.deepEqual(st().gaitAssignments, {}, 'a whole-scene recipe without locks clears them');
  st().applyScene({ gaitLocks: withLock.gaitLocks }, { replaceAll: false });
  assert.equal(st().gaitAssignments[B].locked, true, 'a recipe that carries locks lands them');
  // an older recipe that does not speak for locks keeps the user's own and drops the QUEEN's picks
  st().assignGait({ target: A, gaitId: canonGaits('swiss').performing.id, by: 'queen' });
  const f = sceneFieldsFor({ seed: 3 }, st());
  assert.deepEqual(Object.keys(f.gaitAssignments), [B]);
  st().applyScene({ seed: 3 });
  assert.deepEqual(Object.keys(st().gaitAssignments), [B], 'the lock stays; the pick is a claim on the old scene');
});

console.log(`gaitLocks.selfcheck: ${n} checks ok`);
