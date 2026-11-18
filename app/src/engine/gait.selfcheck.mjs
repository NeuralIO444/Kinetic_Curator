// node src/engine/gait.selfcheck.mjs
// #2328 (GAIT M2; docs/design/gait-spec.md §2–§3): the gait record, its sanitizer and content id, the door and the
// bank, the join-tree adapter (constructs + plain assets), the beat clock and the evaluator. Nothing on stage reads a
// gait in this slice; these checks pin the pure half.
import assert from 'node:assert/strict';
import {
  GAIT_KIND,
  MAX_GAIT_RECORDS,
  GAIT_DEFAULT_BPM,
  GAIT_CASCADE_MAX,
  sanitizeGait,
  sanitizeGaitRecords,
  bankGaitRecord,
  gaitIdFor,
  canonicalJson,
  treeOf,
  roleOfDepth,
  gaitBeatTime,
  gaitPhase,
  evaluateGait,
} from './gait.js';
import { getKinemeDriver, applyKinemeDrivers } from './kineme.js';
import { houseConstructs } from './constructHouse.js';
import { constructRule } from './constructRules.js';
import { ASSETS } from '../data/assets/index.js';
import { STRING_CHANNEL_GROUPS } from './kernel/rng.js';
import { serializeProject, parseProject, DOC_FIELD_CLASS } from '../state/projectDocument.js';
import { SCENE_BLOCK_KEYS } from '../state/recipeSceneKeys.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const SPEC_EXAMPLE = {
  kind: GAIT_KIND,
  name: 'swiss-tick',
  canon: 'swiss',
  parent: null,
  roles: {
    root: { drivers: [{ id: 'rock', amount: 0.3 }], transport: { mode: 'still' } },
    inner: { drivers: [{ id: 'pulse', amount: 0.5 }] },
    leaf: { drivers: [{ id: 'brush-wobble', amount: 0.6 }], rhythm: 'THUMP' },
  },
  cascade: 0.125,
  release: { order: 'leaf-first', stagger: 0.25, scatter: 'drift' },
  rejoin: { ease: 'outBack', beats: 2, path: 'retrace' },
};

ok('the spec example sanitizes: an unregistered driver (rock) is dropped, the registered ones kept', () => {
  const g = sanitizeGait(SPEC_EXAMPLE);
  assert.ok(g);
  assert.match(g.id, /^gait:[0-9a-f]{16}$/);
  assert.deepEqual(g.roles.root.drivers, [], 'rock is not a registered driver (ruling 8)');
  assert.deepEqual(g.roles.root.transport, { mode: 'still' });
  assert.deepEqual(g.roles.inner.drivers, [{ id: 'pulse', amount: 0.5 }]);
  assert.deepEqual(g.roles.leaf, { drivers: [{ id: 'brush-wobble', amount: 0.6 }], rhythm: 'THUMP' });
  assert.equal(g.cascade, 0.125);
  assert.deepEqual(g.release, { order: 'leaf-first', stagger: 0.25, scatter: 'drift' });
  assert.deepEqual(g.rejoin, { ease: 'outBack', beats: 2, path: 'retrace' });
});

ok('amounts clamp to each driver range; junk structure defaults; not-a-gait is refused', () => {
  const g = sanitizeGait({
    ...SPEC_EXAMPLE,
    roles: {
      root: {
        drivers: [
          { id: 'breath', amount: 7 },
          { id: 'breath', amount: 0.1 },
          { id: 'drift', amount: NaN },
        ],
      },
    },
    cascade: 99,
    release: { order: 'sideways', stagger: -3, scatter: 'explode' },
    rejoin: { ease: 'bounce', beats: 1e9, path: 'teleport' },
  });
  const hi = getKinemeDriver('breath').amountRange[1];
  assert.deepEqual(g.roles.root.drivers, [{ id: 'breath', amount: hi }], 'clamped; the duplicate and the NaN dropped');
  assert.equal(g.cascade, GAIT_CASCADE_MAX);
  assert.deepEqual(g.release, { order: 'leaf-first', stagger: 0, scatter: 'drift' });
  assert.equal(g.rejoin.ease, 'linear');
  assert.equal(g.rejoin.path, 'retrace');
  assert.equal(g.rejoin.beats, 16);
  for (const bad of [null, [], {}, { ...SPEC_EXAMPLE, kind: 'kc-gait/2' }, { ...SPEC_EXAMPLE, name: '  ' }])
    assert.equal(sanitizeGait(bad), null);
});

ok('the id is the content: same gait same id, any change a new id, a forged id is never kept', () => {
  const a = sanitizeGait(SPEC_EXAMPLE);
  const b = sanitizeGait(JSON.parse(JSON.stringify(SPEC_EXAMPLE)));
  assert.equal(a.id, b.id);
  assert.equal(sanitizeGait({ ...SPEC_EXAMPLE, cascade: 0.25 }).id === a.id, false);
  assert.equal(sanitizeGait({ ...SPEC_EXAMPLE, id: 'gait:0000000000000000' }).id, a.id, 'recomputed');
  assert.equal(gaitIdFor(a), a.id, 'stable over its own output');
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
  assert.deepEqual(sanitizeGait(a), a, 'idempotent');
});

ok('the door and the bank: de-duplicated, capped at 64 (newest kept), a bad record skipped', () => {
  const many = Array.from({ length: MAX_GAIT_RECORDS + 6 }, (_, i) => ({ ...SPEC_EXAMPLE, name: `g${i}` }));
  const list = sanitizeGaitRecords([...many, many[0], { kind: 'nope' }]);
  assert.equal(list.length, MAX_GAIT_RECORDS);
  assert.equal(list.at(-1).name, `g${MAX_GAIT_RECORDS + 5}`);
  assert.deepEqual(sanitizeGaitRecords('x'), []);
  const bank = bankGaitRecord([], SPEC_EXAMPLE);
  assert.equal(bank.length, 1);
  assert.equal(bankGaitRecord(bank, SPEC_EXAMPLE), bank, 'already banked: the same list');
  assert.equal(bankGaitRecord(bank, { kind: 'nope' }), bank);
});

ok('the gait channel is registered (the #1238 rule) on the noise stream', () => {
  assert.equal(STRING_CHANNEL_GROUPS.gait, 'noise');
  assert.equal(gaitPhase(7), gaitPhase(7));
  assert.ok(gaitPhase(7) >= 0 && gaitPhase(7) < 1);
});

// The house set: real construct records against the real catalogue.
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const house = houseConstructs((id) => byId.get(id));
const pointsFor = (style) => {
  const rule = constructRule(style, (id) => byId.get(id));
  const m = new Map(rule.vocabulary.map((v) => [v.id, v.points]));
  return (id) => m.get(id);
};

ok('treeOf: a plain asset is one root; an unknown kind or a construct without points is null', () => {
  assert.deepEqual(treeOf('asset', { id: 'x' }), { nodes: [{ id: 0, parent: -1, depth: 0 }], maxDepth: 0 });
  assert.equal(treeOf('beast', {}), null, 'adapters for other kinds are M5');
  assert.equal(treeOf('construct', house[0]), null, 'no pointsOf');
  assert.deepEqual(
    [0, 1, 2, 3].map((d) => roleOfDepth(d, 3)),
    ['root', 'inner', 'inner', 'leaf'],
  );
  assert.equal(roleOfDepth(0, 0), 'root');
});

ok(
  'treeOf derives every house construct a real join tree: each parent is earlier, every piece placed at a join',
  () => {
    assert.ok(house.length >= 30, 'the house set is there');
    let deep = 0;
    for (const rec of house) {
      const tree = treeOf('construct', rec, { pointsOf: pointsFor(rec.style) });
      assert.ok(tree, rec.id);
      assert.equal(tree.nodes.length, rec.parts.length);
      assert.deepEqual(tree.nodes[0], { id: 0, parent: -1, depth: 0 });
      for (let i = 1; i < tree.nodes.length; i++) {
        const { parent, depth } = tree.nodes[i];
        assert.ok(parent >= 0 && parent < i, `${rec.id} piece ${i}: parent earlier`);
        assert.equal(depth, tree.nodes[parent].depth + 1);
      }
      assert.equal(tree.maxDepth, Math.max(...tree.nodes.map((x) => x.depth)));
      if (tree.maxDepth >= 2) deep++;
    }
    assert.ok(deep > house.length / 2, 'most constructs have an inner layer (a tree, not a star)');
  },
);

ok('the beat clock: the QUEEN beat position wins, then the tempo, then the default BPM', () => {
  assert.equal(gaitBeatTime({ beatPos: 12.5, bpm: 90, driverSec: 100 }), 12.5);
  assert.equal(gaitBeatTime({ bpm: 90, driverSec: 2 }), 3);
  assert.equal(gaitBeatTime({ driverSec: 2 }), 2 * (GAIT_DEFAULT_BPM / 60));
  assert.equal(gaitBeatTime({ bpm: -5, driverSec: 1 }), GAIT_DEFAULT_BPM / 60);
  assert.equal(gaitBeatTime(), 0);
});

const soaOf = (count) => {
  const soa = { n: count, index: new Int32Array(count), x: new Float64Array(count), y: new Float64Array(count) };
  soa.scale = new Float64Array(count).fill(1);
  for (let k = 0; k < count; k++) {
    soa.index[k] = k;
    soa.x[k] = 10 * k;
    soa.y[k] = 5 * k;
  }
  return soa;
};

ok('evaluateGait: same seed + gait + beat time gives identical per-node amounts and beats', () => {
  const rec = house.find((r) => treeOf('construct', r, { pointsOf: pointsFor(r.style) }).maxDepth >= 2);
  const tree = treeOf('construct', rec, { pointsOf: pointsFor(rec.style) });
  const gait = sanitizeGait({
    ...SPEC_EXAMPLE,
    roles: {
      root: { drivers: [{ id: 'breath', amount: 0.2 }] },
      inner: { drivers: [{ id: 'pulse', amount: 0.5 }] },
      leaf: { drivers: [{ id: 'drift', amount: 0.4 }] },
    },
  });
  const soa = soaOf(tree.nodes.length);
  const a = evaluateGait(soa, gait, tree, 7.25, 42);
  const b = evaluateGait(soa, gait, tree, 7.25, 42);
  assert.equal(a.active, true);
  assert.deepEqual(a, b);
  for (let k = 0; k < tree.nodes.length; k++) {
    const role = roleOfDepth(tree.nodes[k].depth, tree.maxDepth);
    assert.equal(a.amounts.breath[k], role === 'root' ? 0.2 : 0);
    assert.equal(a.amounts.pulse[k], role === 'inner' ? 0.5 : 0);
    assert.equal(a.amounts.drift[k], role === 'leaf' ? 0.4 : 0);
  }
  assert.notDeepEqual(evaluateGait(soa, gait, tree, 7.25, 43).beat, a.beat, 'another wearer, another phase');
});

ok('the cascade: a leaf lags the root by exactly depth × cascade beats', () => {
  const rec = house.find((r) => treeOf('construct', r, { pointsOf: pointsFor(r.style) }).maxDepth >= 2);
  const tree = treeOf('construct', rec, { pointsOf: pointsFor(rec.style) });
  const gait = sanitizeGait({
    ...SPEC_EXAMPLE,
    cascade: 0.125,
    roles: { leaf: { drivers: [{ id: 'pulse', amount: 1 }] } },
  });
  const out = evaluateGait(soaOf(tree.nodes.length), gait, tree, 3, 9);
  for (let k = 0; k < tree.nodes.length; k++)
    assert.ok(Math.abs(out.beat[0] - out.beat[k] - tree.nodes[k].depth * 0.125) < 1e-12, `node ${k}`);
});

ok('the hard gate: amount 0 everywhere is not active, writes nothing, and leaves the marks as they were', () => {
  const tree = treeOf('asset', {});
  const soa = soaOf(1);
  const before = JSON.stringify([...soa.x, ...soa.y, ...soa.scale]);
  const zero = sanitizeGait({ ...SPEC_EXAMPLE, roles: { root: { drivers: [{ id: 'breath', amount: 0 }] } } });
  const out = evaluateGait(soa, zero, tree, 5, 1);
  assert.deepEqual(out, { active: false, amounts: {}, beat: null });
  assert.equal(JSON.stringify([...soa.x, ...soa.y, ...soa.scale]), before);
  // and the drivers, fed those (zero) amounts, are the identity: today's render exactly
  assert.equal(applyKinemeDrivers(soa, { driverSec: 1, seed: 1, amounts: {} }), null);
  assert.equal(JSON.stringify([...soa.x, ...soa.y, ...soa.scale]), before);
  // a tree that does not line up with the marks is a malformed call
  assert.equal(evaluateGait(soaOf(2), zero, tree, 5, 1), null);
});

ok('gaitRecords is a scene field and round-trips through serialize → parse; none = the file it always was', () => {
  assert.equal(DOC_FIELD_CLASS.gaitRecords, 'scene');
  assert.ok(SCENE_BLOCK_KEYS.includes('gaitRecords'), 'share links carry gaits (R1 classes it scene)');
  const g = sanitizeGait(SPEC_EXAMPLE);
  const doc = serializeProject({ gaitRecords: [g, { kind: 'junk' }] });
  assert.deepEqual(doc.gaitRecords, [g]);
  const back = parseProject(JSON.parse(JSON.stringify(doc)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.doc.gaitRecords, [g]);
  assert.equal('gaitRecords' in serializeProject({ gaitRecords: [] }), false);
});

console.log(`gait.selfcheck: ${n} checks passed`);
