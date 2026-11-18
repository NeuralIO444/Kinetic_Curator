// node src/engine/gaitAssign.selfcheck.mjs
// #2329 (GAIT M3) — the pure half: the Canon default gaits as data, GAIT_ASSIGN and the lock rule, the QUEEN's picker,
// the frame-input stamp, and the stage options that pose a moving construct's pieces.
import assert from 'node:assert/strict';
import { CANON_GAITS, CANON_GAIT_KINDS, CANON_GAIT_CAPS, canonGaits, canonGaitById } from '../data/canon/gaits.js';
import { CANON_STYLE_IDS } from '../data/canon/styles.js';
import { sanitizeGait, evaluateGait, GAIT_ROLES } from './gait.js';
import { getKinemeDriver } from './kineme.js';
import {
  sanitizeGaitAssign,
  applyGaitAssign,
  queenGaitKind,
  queenPicks,
  gaitInputStamp,
  gaitsOfStamp,
  gaitMoves,
  restGaitIdFor,
} from './gaitAssign.js';
import { gaitStageOptions, poseConstruct } from './gaitStage.js';
import { constructPieceItems } from './constructStage.js';
import { expandConstructPieces, pieceMark } from './constructPieces.js';
import { ASSETS_CONSTRUCTS, HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const SRC = await import('node:fs').then((fs) =>
  ['./gaitAssign.js', './gaitStage.js', '../data/canon/gaits.js']
    .map((p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8'))
    .join('\n'),
);

ok('three default gaits per Canon style, each through the gait door unchanged, ids unique', () => {
  assert.deepEqual(Object.keys(CANON_GAITS), [...CANON_STYLE_IDS]);
  const ids = new Set();
  for (const style of CANON_STYLE_IDS) {
    const set = canonGaits(style);
    assert.deepEqual(Object.keys(set), [...CANON_GAIT_KINDS]);
    for (const kind of CANON_GAIT_KINDS) {
      const g = set[kind];
      assert.deepEqual(sanitizeGait(g), g, `${style}/${kind} is exactly what the door makes`);
      assert.equal(g.canon, style);
      assert.equal(g.name, `${style}-${kind}`);
      assert.ok(!ids.has(g.id));
      ids.add(g.id);
      assert.equal(canonGaitById(g.id), g);
    }
  }
  assert.equal(canonGaits('nope'), null);
  assert.equal(canonGaitById('gait:0000000000000000'), null);
});

ok('registered drivers only; still is all-zero (the hard gate); idle < performing; performing within the caps', () => {
  for (const style of CANON_STYLE_IDS) {
    const { still, idle, performing } = canonGaits(style);
    for (const g of [still, idle, performing])
      for (const role of GAIT_ROLES)
        for (const d of g.roles[role]?.drivers || []) assert.ok(getKinemeDriver(d.id), `${d.id} is registered`);
    assert.equal(gaitMoves(still), false, `${style}-still moves nothing`);
    for (const r of Object.values(still.roles)) for (const d of r.drivers) assert.equal(d.amount, 0);
    assert.equal(gaitMoves(idle), true);
    assert.equal(gaitMoves(performing), true);
    for (const role of GAIT_ROLES) {
      const p = performing.roles[role].drivers;
      const i = idle.roles[role].drivers;
      p.forEach((d, k) => {
        assert.ok(i[k].amount <= d.amount, `${style} ${role} ${d.id}: idle ≤ performing`);
        assert.ok(d.amount <= CANON_GAIT_CAPS[d.id] + 1e-9, `${style} ${role} ${d.id} ≤ cap`);
      });
      // drift only on the root: a wandering leaf would leave its join
      if (role !== 'root') assert.ok(!p.some((d) => d.id === 'drift'));
    }
    // the evaluator agrees: still is inactive on any tree
    const tree = { nodes: [0, 1, 2].map((k) => ({ id: k, parent: k - 1, depth: k })), maxDepth: 2 };
    assert.equal(evaluateGait({ n: 3 }, still, tree, 3.25, 7).active, false);
    assert.equal(evaluateGait({ n: 3 }, performing, tree, 3.25, 7).active, true);
  }
});

const SW = canonGaits('swiss');
ok('GAIT_ASSIGN door: shape, by, and only the user can lock', () => {
  assert.equal(sanitizeGaitAssign(null), null);
  assert.equal(sanitizeGaitAssign({ target: 'a', gaitId: 'x', by: 'queen' }), null);
  assert.equal(sanitizeGaitAssign({ target: 'a', gaitId: SW.idle.id, by: 'lois' }), null);
  assert.equal(sanitizeGaitAssign({ target: '', gaitId: SW.idle.id, by: 'queen' }), null);
  assert.deepEqual(sanitizeGaitAssign({ target: 'a', gaitId: SW.idle.id, by: 'queen', locked: true }), {
    target: 'a',
    gaitId: SW.idle.id,
    by: 'queen',
    locked: false,
  });
  assert.equal(sanitizeGaitAssign({ target: 'a', gaitId: SW.idle.id, by: 'user', locked: true }).locked, true);
});

ok('apply: new map on change, SAME map on no-op or refusal; a lock refuses queen and davis, never the user', () => {
  const m0 = {};
  const r1 = applyGaitAssign(m0, { target: 'a', gaitId: SW.idle.id, by: 'queen' });
  assert.equal(r1.applied, true);
  assert.notEqual(r1.assignments, m0);
  assert.deepEqual(m0, {}, 'never mutated');
  const r2 = applyGaitAssign(r1.assignments, { target: 'a', gaitId: SW.idle.id, by: 'queen' });
  assert.equal(r2.reason, 'same');
  assert.equal(r2.assignments, r1.assignments);
  const locked = applyGaitAssign(r1.assignments, { target: 'a', gaitId: SW.idle.id, by: 'user', locked: true });
  assert.equal(locked.applied, true);
  for (const by of ['queen', 'davis']) {
    const r = applyGaitAssign(locked.assignments, { target: 'a', gaitId: SW.performing.id, by });
    assert.equal(r.reason, 'locked');
    assert.equal(r.assignments, locked.assignments);
  }
  const moved = applyGaitAssign(locked.assignments, {
    target: 'a',
    gaitId: SW.performing.id,
    by: 'user',
    locked: true,
  });
  assert.equal(moved.applied, true, 'the user may move a lock');
  const freed = applyGaitAssign(moved.assignments, { target: 'a', gaitId: SW.performing.id, by: 'user' });
  assert.equal(freed.assignments.a.locked, false);
  assert.equal(applyGaitAssign(m0, { bad: 1 }).reason, 'invalid');
  assert.equal(restGaitIdFor('swiss'), SW.still.id);
  assert.equal(restGaitIdFor(null), null);
});

ok('the QUEEN: energy → kind; picks only what changed, skips locks and styleless targets, in sorted order', () => {
  assert.equal(queenGaitKind({}), 'still');
  assert.equal(queenGaitKind({ energy: 'low' }), 'still');
  assert.equal(queenGaitKind({ energy: 'mid' }), 'idle');
  assert.equal(queenGaitKind({ energy: 'high' }), 'performing');
  assert.equal(queenGaitKind({ energy: 'high', silent: true }), 'still');
  const styleOf = (t) => ({ b: 'swiss', a: 'organic', c: 'techno' })[t] ?? null;
  assert.deepEqual(queenPicks({ targets: ['a', 'b'], styleOf, energy: 'low' }), [], 'unassigned already rests');
  const picks = queenPicks({ targets: ['b', 'a', 'z', 'b'], styleOf, energy: 'high' });
  assert.deepEqual(picks, [
    { target: 'a', gaitId: canonGaits('organic').performing.id, by: 'queen', locked: false },
    { target: 'b', gaitId: SW.performing.id, by: 'queen', locked: false },
  ]);
  const assignments = {
    a: { gaitId: canonGaits('organic').performing.id, by: 'queen', locked: false },
    b: { gaitId: SW.idle.id, by: 'user', locked: true },
    c: { gaitId: canonGaits('techno').performing.id, by: 'queen', locked: false },
  };
  assert.deepEqual(queenPicks({ assignments, targets: ['a', 'b', 'c'], styleOf, energy: 'high' }), []);
  assert.deepEqual(
    queenPicks({ assignments, targets: ['a', 'b', 'c'], styleOf, energy: 'low' }).map((e) => e.target),
    ['a', 'c'],
    'the locked b is never re-picked',
  );
  assert.deepEqual(
    queenPicks({
      assignments,
      targets: ['a'],
      styleOf: () => {
        throw new Error('x');
      },
      energy: 'high',
    }),
    [],
  );
});

ok(
  'the input stamp: null when nothing moves (no key on the input); sorted moving Canon gaits + tempo otherwise',
  () => {
    assert.equal(gaitInputStamp({}), null);
    assert.equal(gaitInputStamp(null), null);
    assert.equal(
      gaitInputStamp({ a: { gaitId: SW.still.id, by: 'queen', locked: false } }),
      null,
      'still is not stamped',
    );
    assert.equal(gaitInputStamp({ a: { gaitId: 'gait:0123456789abcdef', by: 'user', locked: true } }), null);
    const s = gaitInputStamp(
      {
        z: { gaitId: SW.performing.id, by: 'queen', locked: false },
        a: { gaitId: SW.idle.id, by: 'user', locked: true },
        m: { gaitId: SW.still.id, by: 'queen', locked: false },
      },
      96,
    );
    assert.deepEqual(s, {
      bpm: 96,
      a: [
        ['a', SW.idle.id],
        ['z', SW.performing.id],
      ],
    });
    assert.equal(gaitInputStamp({ a: { gaitId: SW.idle.id } }, null).bpm, 120, 'no tempo: the default BPM');
    const back = gaitsOfStamp(JSON.parse(JSON.stringify(s)));
    assert.equal(back.get('z'), SW.performing);
    assert.equal(gaitsOfStamp({ bpm: 120, a: [['a', SW.still.id]] }), null);
    assert.equal(gaitStageOptions(null), null);
    assert.equal(gaitStageOptions({ bpm: 120, a: [] }), null);
  },
);

// the stage: a house construct on stage, the CONSTRUCTS switch on
const tileId = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const other = ASSETS_CONSTRUCTS.find((a) => a.style === 'swiss').id;
const recordOf = (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null;
const item = (assetId, k) => ({
  assetId,
  x: 400 + 100 * k,
  y: 300,
  scale: 2,
  scaleY: 2,
  rotation: 15,
  alpha: 90,
  key: `m${k}`,
});
const frame = { driverSec: 3.7, seed: 4242, canvasW: 1000, canvasH: 700 };
const stamp = (id, g) => ({ bpm: 120, a: [[id, g.id]] });

ok('hard gate at the stage: no options, or a still-only stamp, is the SAME array', () => {
  const items = [item(tileId, 0), item(other, 1)];
  assert.equal(constructPieceItems(items, { enabled: true, recordOf }), items);
  const still = gaitStageOptions(stamp(tileId, canonGaits('organic').still), frame);
  assert.equal(still, null);
  assert.equal(constructPieceItems(items, { enabled: true, recordOf, ...(still || {}) }), items);
});

ok('a moving gait deals ONLY its wearer as pieces, and moves them; same frame → same pieces, bit for bit', () => {
  const items = [item(tileId, 0), item(other, 1)];
  const opts = gaitStageOptions(stamp(tileId, canonGaits('organic').performing), frame);
  assert.equal(opts.moving(items[0]), true);
  assert.equal(opts.moving(items[1]), false, 'the other construct rests as its tile');
  const out = constructPieceItems(items, { enabled: true, recordOf, ...opts });
  const nPieces = recordOf(tileId).parts.length;
  assert.equal(out.length, nPieces + 1);
  assert.equal(out[nPieces], items[1], 'the resting tile is the same object');
  const rest = constructPieceItems(items, { enabled: true, recordOf, moving: opts.moving });
  let moved = 0;
  for (let k = 0; k < nPieces; k++) if (out[k].x !== rest[k].x || out[k].scale !== rest[k].scale) moved++;
  assert.ok(moved === nPieces, `every piece of a performing organic construct moves (${moved}/${nPieces})`);
  const again = constructPieceItems(items, {
    enabled: true,
    recordOf,
    ...gaitStageOptions(stamp(tileId, canonGaits('organic').performing), frame),
  });
  assert.deepEqual(again, out);
});

ok('the parent transform: a root that drifts carries every piece by the same offset (the joins hold)', () => {
  const rec = recordOf(tileId);
  const place = { centre: { x: 500, y: 300 }, rot: 0, unit: 2 };
  const { pieces } = expandConstructPieces(rec, place);
  const marks = pieces.map(pieceMark);
  const driftOnly = sanitizeGait({
    kind: 'kc-gait/1',
    name: 'root-drift',
    roles: { root: { drivers: [{ id: 'drift', amount: 1 }] } },
  });
  const posed = poseConstruct(marks, pieces, driftOnly, { ...frame, beatTime: 5.3, bpm: 120, wearerSeed: 9, slot: 0 });
  const dx = posed[0].x - marks[0].x;
  const dy = posed[0].y - marks[0].y;
  assert.ok(Math.hypot(dx, dy) > 0.5, 'the root moved');
  for (let k = 0; k < marks.length; k++) {
    assert.ok(Math.abs(posed[k].x - marks[k].x - dx) < 1e-9 && Math.abs(posed[k].y - marks[k].y - dy) < 1e-9);
    assert.equal(posed[k].scale, marks[k].scale);
  }
  // a breathing root scales the whole shape about the root's centre: every piece's offset from it scales alike
  const breathRoot = sanitizeGait({
    kind: 'kc-gait/1',
    name: 'root-breath',
    roles: { root: { drivers: [{ id: 'breath', amount: 1 }] } },
  });
  const b = poseConstruct(marks, pieces, breathRoot, { ...frame, beatTime: 2.1, bpm: 120, wearerSeed: 9, slot: 0 });
  const s = b[0].scale / marks[0].scale;
  assert.ok(Math.abs(s - 1) > 1e-4);
  for (let k = 1; k < marks.length; k++) {
    assert.ok(Math.abs(b[k].scale / marks[k].scale - s) < 1e-12);
    assert.ok(Math.abs(b[k].x - b[0].x - s * (marks[k].x - marks[0].x)) < 1e-9);
  }
  // a gait that moves only leaves leaves the root exactly at rest
  const leafOnly = sanitizeGait({
    kind: 'kc-gait/1',
    name: 'leaf',
    roles: { leaf: { drivers: [{ id: 'pulse', amount: 1 }] } },
  });
  const l = poseConstruct(marks, pieces, leafOnly, { ...frame, beatTime: 2.1, bpm: 120, wearerSeed: 9, slot: 0 });
  assert.deepEqual(l[0], marks[0]);
});

ok('pure: no wall clock, no Math.random', () => {
  assert.ok(!/Date\.now|Math\.random|performance\.now/.test(SRC));
});

console.log(`gaitAssign.selfcheck: ${n} checks ok`);
