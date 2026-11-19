// node src/data/canon/gaits.selfcheck.mjs
// #2329 follow-up — the pre-M4 gait id alias. #2405 (M4) added each style's release/rejoin to the Canon defaults, and a
// gait id is the content hash of its record, so every Canon id changed. A take or document written between #2402 and
// #2405 names a gait by its OLD id; PRE_M4_GAIT_IDS maps each one to the same style and kind now.
//   1. the data: one row per Canon style × kind, every old id distinct from every current id
//   2. each old id IS the pre-M4 record of that style and kind: the current record with M4's release/rejoin taken out,
//      through the same gait door, hashes to exactly that id (so the alias names the same gait, not a guess)
//   3. every door that reads a gait id resolves an old one: canonGaitById, the GAIT_ASSIGN door, the input stamp, a
//      take's GAIT_ASSIGN rows, a document's saved locks
import assert from 'node:assert/strict';
import { CANON_GAITS, CANON_GAIT_KINDS, PRE_M4_GAIT_IDS, canonGaitById, canonicalGaitId } from './gaits.js';
import { CANON_STYLE_IDS } from './styles.js';
import { sanitizeGait } from '../../engine/gait.js';
import { sanitizeGaitAssign, gaitsOfStamp, sanitizeGaitLocks, applyGaitAssign } from '../../engine/gaitAssign.js';
import { gaitAssignmentsAt } from '../../curator/gaitRecord.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const current = new Set();
for (const set of Object.values(CANON_GAITS)) for (const g of Object.values(set)) current.add(g.id);

ok('one alias row per Canon style × kind; every old id is distinct and none is a current id', () => {
  assert.equal(PRE_M4_GAIT_IDS.length, CANON_STYLE_IDS.length * CANON_GAIT_KINDS.length);
  const seen = new Set();
  for (const [old, style, kind] of PRE_M4_GAIT_IDS) {
    assert.match(old, /^gait:[0-9a-f]{16}$/);
    assert.ok(!seen.has(old), `${old} once`);
    seen.add(old);
    assert.ok(!current.has(old), `${old} is not a current id`);
    assert.ok(CANON_GAITS[style] && CANON_GAITS[style][kind], `${style}/${kind} exists`);
  }
  const pairs = new Set(PRE_M4_GAIT_IDS.map(([, s, k]) => `${s}/${k}`));
  assert.equal(pairs.size, PRE_M4_GAIT_IDS.length, 'each style × kind once');
});

ok('each old id is the pre-M4 record of the same style and kind (M4’s release/rejoin taken out, same door)', () => {
  for (const [old, style, kind] of PRE_M4_GAIT_IDS) {
    const now = CANON_GAITS[style][kind];
    const pre = { ...now };
    delete pre.id;
    delete pre.release;
    delete pre.rejoin;
    const g = sanitizeGait(pre);
    assert.equal(g.id, old, `${style}/${kind}: the pre-M4 record hashes to the aliased id`);
    assert.equal(g.canon, now.canon);
    assert.equal(g.name, now.name, `${style}/${kind}: the same name (${now.name})`);
    assert.deepEqual(g.roles, now.roles, 'the same drivers and amounts');
    assert.equal(g.cascade, now.cascade);
  }
});

ok('every id door resolves an old id to the same style and kind now', () => {
  for (const [old, style, kind] of PRE_M4_GAIT_IDS) {
    const now = CANON_GAITS[style][kind];
    assert.equal(canonGaitById(old), now, 'canonGaitById');
    assert.equal(canonicalGaitId(old), now.id, 'canonicalGaitId');
    assert.equal(canonicalGaitId(now.id), now.id, 'a current id is itself');
    assert.equal(sanitizeGaitAssign({ target: 't', gaitId: old, by: 'queen' }).gaitId, now.id, 'GAIT_ASSIGN');
    const stamp = gaitsOfStamp({ bpm: 120, a: [['t', old]] });
    if (kind === 'still') assert.equal(stamp, null, 'still never rides a stamp');
    else assert.equal(stamp.get('t'), now, 'an old-id input stamp still moves the same gait');
    assert.deepEqual(sanitizeGaitLocks({ t: old }), { t: now.id }, 'a saved lock');
  }
  assert.equal(canonGaitById('gait:0123456789abcdef'), null, 'an unknown id is still unknown');
  // a take's GAIT_ASSIGN rows written with old ids fold to the current ids
  const [old] = PRE_M4_GAIT_IDS.find(([, s, k]) => s === 'swiss' && k === 'performing');
  const section = { version: 1, events: [[3, 'cn', old, 'user', 1]] };
  assert.deepEqual(gaitAssignmentsAt(section, 10), {
    cn: { gaitId: CANON_GAITS.swiss.performing.id, by: 'user', locked: true },
  });
  // re-assigning the same gait under its old id is a no-op, not a swap
  const m = { cn: { gaitId: CANON_GAITS.swiss.performing.id, by: 'queen', locked: false } };
  assert.equal(applyGaitAssign(m, { target: 'cn', gaitId: old, by: 'queen' }).reason, 'same');
});

console.log(`gaits.selfcheck: ${n} checks ok`);
