// gait.selfcheck.mjs — #2328 (gait M2): the record, its door, the join tree, the evaluator, the store.
//
//   1. the door: a sane record keeps its content-hash id; unknown drivers are dropped, amounts clamped to each
//      driver's range; a record dishonest in shape or id is refused whole
//   2. the id is content: same gait same id, a changed amount changes it, key order does not
//   3. the bank: de-duplicated, capped at 64, a refused record changes nothing
//   4. the join tree: construct pieces hang off earlier pieces, role by depth; a plain asset is one root
//   5. the evaluator: same seed + gait + beat gives identical per-node amounts; the leaf lags the root by
//      depth × cascade; roles with no gait are exactly 0
//   6. the KINEME hard gate: amount 0 everywhere leaves the render byte-equal, with and without a rhythm pattern
//   7. the beat clock: the Queen's bpm when there is one, the default tempo otherwise
//   8. gaitRecords round-trips serialize → parse, a project without gaits saves as before, and the scene recipe
//      carries them
import assert from 'node:assert/strict';
import {
  GAIT_KIND,
  MAX_GAIT_RECORDS,
  GAIT_DEFAULT_BPM,
  canonicalJson,
  fnv64,
  gaitIdFor,
  sanitizeGait,
  sanitizeGaitRecords,
  bankGait,
  treeOf,
  evaluateGait,
  gaitBeatTime,
  driverAmountKey,
} from './gait.js';
import { KINEME_DRIVERS, evaluateKineme, applyKinemeDrivers } from './kineme.js';
import { assembleConstruct } from './constructAssembler.js';
import { constructRule } from './constructRules.js';
import { ASSETS } from '../data/assets/index.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const construct = assembleConstruct({ ...constructRule('bauhaus', (id) => byId.get(id)), seed: 2328 });

const gaitOf = (over = {}) => ({
  kind: GAIT_KIND,
  name: 'swiss-tick',
  canon: 'swiss',
  parent: null,
  roles: {
    root: { drivers: [{ id: 'drift', amount: 0.3 }], transport: { mode: 'still' } },
    inner: { drivers: [{ id: 'pulse', amount: 0.5 }] },
    leaf: { drivers: [{ id: 'breath', amount: 0.6 }], rhythm: 'THUMP' },
  },
  cascade: 0.125,
  release: { order: 'leaf-first', stagger: 0.25, scatter: 'drift' },
  rejoin: { ease: 'outBack', beats: 2, path: 'retrace' },
  ...over,
});

// 1 — the door.
{
  const g = sanitizeGait(gaitOf());
  assert.ok(g && /^gait:[0-9a-f]{16}$/.test(g.id), 'a sane record gets its content-hash id');
  assert.equal(g.kind, GAIT_KIND);
  assert.equal(
    JSON.stringify(sanitizeGait(clone(g))),
    JSON.stringify(g),
    'a sanitised record passes the door unchanged',
  );

  const withUnknown = sanitizeGait(
    gaitOf({
      roles: {
        root: {
          drivers: [
            { id: 'drift', amount: 0.3 },
            { id: 'no-such-driver', amount: 1 },
          ],
        },
      },
    }),
  );
  assert.deepEqual(
    withUnknown.roles.root.drivers.map((d) => d.id),
    ['drift'],
    'an unknown driver id is dropped, the record stands',
  );

  const loud = sanitizeGait(gaitOf({ roles: { root: { drivers: [{ id: 'drift', amount: 9 }] } } }));
  const range = KINEME_DRIVERS.find((d) => d.id === 'drift').amountRange;
  assert.equal(loud.roles.root.drivers[0].amount, range[1], 'an amount above the range is clamped to its top');
  const quiet = sanitizeGait(gaitOf({ roles: { root: { drivers: [{ id: 'drift', amount: -4 }] } } }));
  assert.equal(quiet.roles.root.drivers[0].amount, range[0], 'an amount below the range is clamped to its floor');

  const noRoles = sanitizeGait(gaitOf({ roles: { leaf: { drivers: [{ id: 'nope', amount: 1 }] } } }));
  assert.deepEqual(noRoles.roles, {}, 'a role that names nothing is an absent role (absent = still)');

  const bad = (name, over) => assert.equal(sanitizeGait(gaitOf(over)), null, name);
  bad('wrong kind', { kind: 'kc-gait/2' });
  bad('no name', { name: '  ' });
  bad('a name too long', { name: 'x'.repeat(49) });
  bad('a canon that is not an id', { canon: 'Not A Style!' });
  bad('a parent that is not a gait id', { parent: 'swiss-tick' });
  bad('a non-numeric cascade', { cascade: 'fast' });
  bad('a lying id', { id: 'gait:0000000000000000' });
  assert.equal(sanitizeGait(null), null);
  assert.equal(sanitizeGait([]), null);

  const odd = sanitizeGait(
    gaitOf({ release: { order: 'sideways', scatter: 'explode' }, rejoin: { ease: 'wobble', path: 'warp' } }),
  );
  assert.equal(odd.release.order, 'leaf-first', 'an unknown release order falls back');
  assert.equal(odd.release.scatter, 'drift', 'an unknown scatter falls back');
  assert.equal(odd.rejoin.ease, 'inOut', 'an unknown ease falls back');
  assert.equal(odd.rejoin.path, 'retrace', 'an unknown path falls back');
  ok('the door keeps sane records, drops unknown drivers, clamps amounts, refuses dishonest shapes and ids');
}

// 2 — the id is content.
{
  const a = sanitizeGait(gaitOf());
  const b = sanitizeGait(gaitOf());
  assert.equal(a.id, b.id, 'same gait, same id');
  const reordered = sanitizeGait({
    ...gaitOf(),
    roles: { leaf: gaitOf().roles.leaf, inner: gaitOf().roles.inner, root: gaitOf().roles.root },
  });
  assert.equal(reordered.id, a.id, 'key order does not change the id');
  const nudged = sanitizeGait(gaitOf({ cascade: 0.25 }));
  assert.notEqual(nudged.id, a.id, 'a changed value changes the id');
  const renamed = sanitizeGait(gaitOf({ name: 'swiss-tock' }));
  assert.notEqual(renamed.id, a.id, 'a changed name changes the id');
  assert.equal(gaitIdFor(a), a.id, 'gaitIdFor ignores the id field itself');
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }), '{"a":[2,{"c":3,"d":4}],"b":1}');
  assert.equal(fnv64(''), 'cbf29ce484222325', 'FNV-1a 64 of the empty string is the offset basis');
  assert.equal(fnv64('a'), 'af63dc4c8601ec8c', 'FNV-1a 64 of "a" (the published test vector)');
  ok('the id is the FNV-64 of the canonical JSON: stable, key-order free, content sensitive');
}

// 3 — the bank.
{
  const g = gaitOf();
  let bank = [];
  bank = bankGait(bank, g);
  assert.equal(bank.length, 1);
  assert.equal(bankGait(bank, g), bank, 'banking the same gait again changes nothing (same list back)');
  assert.equal(bankGait(bank, { ...g, kind: 'nope' }), bank, 'a dishonest record changes nothing');
  for (let i = 0; i < MAX_GAIT_RECORDS + 10; i++)
    bank = bankGait(bank, gaitOf({ cascade: (i % 16) / 8, name: `g${i}` }));
  assert.equal(bank.length, MAX_GAIT_RECORDS, 'the bank is capped');
  assert.equal(bank[bank.length - 1].name, `g${MAX_GAIT_RECORDS + 9}`, 'the newest is kept, the oldest drop off');
  const list = sanitizeGaitRecords([g, g, { kind: 'x' }, gaitOf({ name: 'other' })]);
  assert.deepEqual(
    list.map((r) => r.name),
    ['swiss-tick', 'other'],
    'the list door de-duplicates and drops the dishonest',
  );
  assert.deepEqual(sanitizeGaitRecords('nope'), []);
  ok('the bank de-duplicates, caps at 64, keeps the newest, and a refused record changes nothing');
}

// 4 — the join tree.
const tree = treeOf('construct', construct);
{
  assert.equal(tree.nodes.length, construct.parts.length, 'one node per piece');
  assert.equal(tree.nodes[0].parent, null);
  assert.equal(tree.nodes[0].depth, 0);
  assert.equal(tree.nodes[0].role, 'root', 'piece 0 is the root');
  const index = new Map(tree.nodes.map((n, i) => [n.id, i]));
  tree.nodes.forEach((n, i) => {
    if (i === 0) return;
    assert.ok(index.has(n.parent) && index.get(n.parent) < i, `${n.id}: its parent is an earlier piece`);
    assert.equal(n.depth, tree.nodes[index.get(n.parent)].depth + 1, `${n.id}: depth is the parent's + 1`);
  });
  for (const n of tree.nodes) {
    const want = n.depth === 0 ? 'root' : n.depth === tree.maxDepth ? 'leaf' : 'inner';
    assert.equal(n.role, want, `${n.id}: role by depth`);
  }
  assert.ok(tree.maxDepth >= 1, 'a construct has depth');
  assert.equal(
    JSON.stringify(treeOf('construct', construct)),
    JSON.stringify(tree),
    'the tree is a pure function of the record',
  );
  const asset = treeOf('asset', { id: 'x' });
  assert.deepEqual(
    asset.nodes,
    [{ id: 'root', parent: null, depth: 0, role: 'root' }],
    'a plain asset is one root node',
  );
  assert.equal(treeOf('construct', { parts: [] }).nodes.length, 1, 'an empty construct degrades to one root');
  ok('construct pieces hang off earlier pieces, roles come from depth, a plain asset is one root');
}

// 5 — the evaluator.
const gait = sanitizeGait(gaitOf());
{
  const a = evaluateGait(null, gait, tree, 3.5, 7);
  const b = evaluateGait(null, gait, tree, 3.5, 7);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed + gait + beat time → identical per-node amounts');
  const c = evaluateGait(null, gait, tree, 3.5, 8);
  assert.notEqual(JSON.stringify(a), JSON.stringify(c), 'a different seed moves the phases');

  // leaf phase lags root by depth × cascade: the seed part is per node, so compare against the same node's own
  // phase with the cascade off
  const flat = evaluateGait(null, { ...gait, cascade: 0 }, tree, 3.5, 7);
  a.nodes.forEach((n, i) => {
    const lag = n.phase - flat.nodes[i].phase;
    assert.ok(Math.abs(lag - n.depth * gait.cascade) < 1e-12, `${n.id}: phase lags by depth × cascade (${lag})`);
  });
  const leaf = a.nodes.find((n) => n.role === 'leaf');
  assert.ok(
    leaf.depth * gait.cascade > 0 && leaf.phase - flat.nodes[a.nodes.indexOf(leaf)].phase > 0,
    'the leaf lags the root',
  );

  const root = a.nodes.find((n) => n.role === 'root');
  assert.equal(root.amounts.drift, 0.3, 'the root carries the root role');
  assert.equal(root.amounts.pulse, 0, '…and none of the inner role');
  const inner = a.nodes.find((n) => n.role === 'inner');
  if (inner) assert.equal(inner.amounts.pulse, 0.5, 'the inner carries the inner role');
  assert.equal(leaf.rhythm, 'THUMP', 'the leaf keeps its rhythm pattern');

  // no gait / absent roles: exactly 0
  const none = evaluateGait(null, null, tree, 3.5, 7);
  assert.equal(none.any, false, 'no gait → nothing moves');
  const keys = KINEME_DRIVERS.map((d) => driverAmountKey(d.id));
  for (const n of none.nodes)
    for (const k of keys) assert.equal(n.amounts[k], 0, `${n.id}.${k} is exactly 0 with no gait`);
  assert.deepEqual(
    keys,
    ['breath', 'drift', 'pulse', 'brushWobble', 'paletteBreath'],
    'driver ids map to the ctx.amounts keys',
  );

  // the soa write: slot → node
  const n = 6;
  const soa = { n, gaitNode: Int32Array.from([0, 1, 1, 2, 0, 99]) };
  const written = evaluateGait(soa, gait, tree, 3.5, 7);
  for (let slot = 0; slot < n; slot++) {
    const node = written.nodes[soa.gaitNode[slot]];
    for (const k of keys) assert.equal(soa.gaitAmounts[k][slot], node ? node.amounts[k] : 0, `slot ${slot}.${k}`);
  }
  const first = soa.gaitAmounts.drift;
  evaluateGait(soa, gait, tree, 4.5, 7);
  assert.equal(soa.gaitAmounts.drift, first, 'the scratch arrays are reused frame to frame');
  ok(
    'the evaluator is pure and seeded, the cascade is depth × cascade beats, no gait is exactly 0, the soa gets per-slot amounts',
  );
}

// 6 — the KINEME hard gate.
{
  const mkSoa = (n) => ({
    n,
    index: Array.from({ length: n }, (_, k) => k * 7 + 1),
    scale: new Float64Array(n).fill(1),
    x: Float64Array.from({ length: n }, (_, k) => k * 3.5),
    y: Float64Array.from({ length: n }, (_, k) => k * 1.25),
  });
  const keys = KINEME_DRIVERS.map((d) => driverAmountKey(d.id));
  const zero = sanitizeGait(
    gaitOf({
      roles: {
        root: { drivers: KINEME_DRIVERS.map((d) => ({ id: d.id, amount: 0 })) },
        inner: { drivers: [{ id: 'pulse', amount: 0 }], rhythm: 'THUMP' },
        leaf: { drivers: [{ id: 'breath', amount: 0 }], rhythm: 'SWELL' },
      },
    }),
  );
  const ev = evaluateGait(null, zero, tree, 5.25, 11);
  assert.equal(ev.any, false, 'a gait with every amount 0 is not live — even with THUMP and SWELL set');
  for (const node of ev.nodes) {
    for (const k of keys)
      assert.equal(node.amounts[k], 0, `${node.id}.${k}: THUMP/SWELL never invent motion from amount 0`);
    const ctx = {
      seed: 11,
      driverSec: 4.5,
      boilStep: 36,
      amounts: node.amounts,
      canvasW: 1000,
      canvasH: 700,
      anchored: false,
    };
    const soa = mkSoa(24);
    const before = { scale: soa.scale.slice(), x: soa.x.slice(), y: soa.y.slice() };
    assert.equal(evaluateKineme(soa, ctx).active, false, `${node.id}: the drivers report inactive`);
    assert.equal(applyKinemeDrivers(soa, ctx), null, `${node.id}: the applier skips the soa`);
    assert.deepEqual([...soa.scale], [...before.scale], `${node.id}: scale byte-equal`);
    assert.deepEqual([...soa.x], [...before.x], `${node.id}: x byte-equal`);
    assert.deepEqual([...soa.y], [...before.y], `${node.id}: y byte-equal`);
  }
  // and a live amount does move something, so the gate above is not vacuous
  const live = evaluateGait(null, gait, tree, 5.25, 11).nodes[0];
  const soa = mkSoa(24);
  const ctx = {
    seed: 11,
    driverSec: 4.5,
    boilStep: 36,
    amounts: live.amounts,
    canvasW: 1000,
    canvasH: 700,
    anchored: false,
  };
  assert.equal(evaluateKineme(soa, ctx).active, true, 'a live amount runs the drivers');
  ok(
    'amount 0 everywhere leaves the render byte-equal to today (THUMP and SWELL included); a live amount does move it',
  );
}

// 7 — the beat clock.
{
  assert.equal(gaitBeatTime({ driverSec: 2, bpm: 90 }), 3, "the Queen's tempo sets the beat: 2 s at 90 bpm = 3 beats");
  assert.equal(gaitBeatTime({ driverSec: 2 }), (2 * GAIT_DEFAULT_BPM) / 60, 'no tempo → the default bpm');
  assert.equal(gaitBeatTime({ driverSec: 2, bpm: 0 }), (2 * GAIT_DEFAULT_BPM) / 60, 'a zero tempo is no tempo');
  assert.equal(gaitBeatTime({ bpm: 90 }), 0, 'no clock reads beat 0');
  assert.equal(gaitBeatTime(), 0);
  ok("the beat clock follows the Queen's bpm, falls back to the default tempo, and never returns NaN");
}

// 8 — the store and the document.
{
  const S = () => useStore.getState();
  const g = sanitizeGait(gaitOf());
  const before = serializeProject(S());
  assert.equal('gaitRecords' in before, false, 'a project with no gaits writes no field — it exports as before');

  S().bankGaitRecord(g);
  assert.equal(S().gaitRecords.length, 1);
  S().bankGaitRecord(g);
  assert.equal(S().gaitRecords.length, 1, 'banking the same gait twice is one');
  S().bankGaitRecord({ ...g, kind: 'nope' });
  assert.equal(S().gaitRecords.length, 1, 'a dishonest record never reaches the bank');

  const doc = serializeProject(S());
  assert.deepEqual(doc.gaitRecords, [g], 'the document carries the gait');
  const parsed = parseProject(JSON.parse(JSON.stringify(doc)));
  assert.ok(parsed.ok, 'the saved project parses');
  assert.equal(
    JSON.stringify(parsed.doc.gaitRecords),
    JSON.stringify([g]),
    'gaitRecords round-trips serialize → parse',
  );
  useStore.setState({ gaitRecords: [] });
  S().applyProject(parsed.doc);
  assert.equal(JSON.stringify(S().gaitRecords), JSON.stringify([g]), 'a reloaded project stands its gaits back up');
  assert.equal(JSON.stringify(serializeProject(S())), JSON.stringify(doc), 'byte-stable through save and load');

  const tampered = clone(doc);
  tampered.gaitRecords[0].cascade = 'x';
  tampered.gaitRecords.push({ kind: 'junk' });
  assert.deepEqual(parseProject(tampered).doc.gaitRecords, [], 'a hand-edited document is re-validated at the door');

  S().bankGaitRecord(sanitizeGait(gaitOf({ name: 'second' })));
  assert.equal(S().gaitRecords.length, 2);
  ok('gaitRecords: absent when empty, banked through the door, round-trips through the project document');
}

console.log(`gait.selfcheck: OK (${checks} checks)`);
