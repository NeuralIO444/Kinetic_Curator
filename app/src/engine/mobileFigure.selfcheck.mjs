// node src/engine/mobileFigure.selfcheck.mjs
//
// #2119 — Motion Core P7 step 3.2: the mobile as its own record kind (docs/design/figures-spec.md §4, §9;
// §11 rulings 5, 6, 7, 9). A figure with no gait and no linkage: sanitizeRig's second shape (one door for all
// rigs), a tile bake beside creatureTile, one authored fixture, poseFigure posing it from its authored rest,
// and the governor's collapsed rung dropping it from the stage entirely. The parity pins at the end prove the
// two-shape door changed nothing for the records that already exist: a creature rig, a beast rig and a raw
// tree rig sanitize byte-identically to before the mobile shape was taught.
import assert from 'node:assert/strict';
import './motionCore/kinemeSources.js'; // the kineme sources register on import; poseFigure resolves them through the registry
import { getMotionSource } from './motionCore/index.js';
import { poseFigure } from './motionCore/rigSources.js';
import { sanitizeRig, buildRig, expandCreatureInstances, creatureTileSvg, MAX_BONES } from './creatureRig.js';
import { mobileTile, isMobileTileId } from './creatureAssembler.js';
import { sanitizeMeasures } from './beastBuilder.js';
import { wildTypeMeasures } from './jansenMeasures.js';
import { kinemePhase } from '../data/kinemes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const rad = (d) => (d * Math.PI) / 180;

// ── THE FIXTURE — one authored mobile: a hub with three hanging chains, every joint on its own source.
// Roots carry their hang points on the hub (tile coords, the hub drawn centred); children carry 0, 0 and hang
// from their parent's tip, exactly the rig shape buildRig produces for creatures.
const MOBILE_RECORD = {
  body: 'geo_circle_01',
  bones: [
    {
      id: 'l0.0',
      role: 'limb',
      chain: 0,
      parent: null,
      x: 34,
      y: 58,
      angle: 96,
      len: 18,
      motion: { source: 'kineme:rock' },
    },
    {
      id: 'l0.1',
      role: 'limb',
      chain: 0,
      parent: 'l0.0',
      x: 0,
      y: 0,
      angle: -14,
      len: 13,
      motion: { source: 'kineme:bob' },
    },
    {
      id: 'l0.2',
      role: 'limb',
      chain: 0,
      parent: 'l0.1',
      x: 0,
      y: 0,
      angle: 10,
      len: 10,
      motion: { source: 'kineme:rock+bob', amount: 1.5 },
    },
    {
      id: 'l1.0',
      role: 'limb',
      chain: 1,
      parent: null,
      x: 66,
      y: 58,
      angle: 84,
      len: 18,
      motion: { source: 'kineme:bob' },
    },
    {
      id: 'l1.1',
      role: 'limb',
      chain: 1,
      parent: 'l1.0',
      x: 0,
      y: 0,
      angle: 16,
      len: 13,
      motion: { source: 'kineme:rock', amount: 0.5 },
    },
    {
      id: 'l2.0',
      role: 'limb',
      chain: 2,
      parent: null,
      x: 50,
      y: 64,
      angle: 90,
      len: 15,
      motion: { source: 'kineme:bend' },
    },
    {
      id: 'l2.1',
      role: 'limb',
      chain: 2,
      parent: 'l2.0',
      x: 0,
      y: 0,
      angle: -10,
      len: 11,
      motion: { source: 'kineme:bob', amount: 2 },
    },
  ],
};
const mobileRaw = (bones = MOBILE_RECORD.bones, body = MOBILE_RECORD.body) => ({ figure: 'mobile', body, bones });
const MOBILE_RIG = sanitizeRig(mobileRaw());
const OPTS = { seedOffset: 3, tileKey: 'user:mobile-fixture' };
const TIMES = [0, 0.8, 1.7, 3.1];

console.log('#2119 mobileFigure — the mobile record kind (step 3.2)');

ok('the door: a valid mobile survives whole — figure, hub and every sourced bone, round-trip idempotent', () => {
  assert.ok(MOBILE_RIG, 'the fixture sanitizes');
  assert.deepEqual(MOBILE_RIG, { figure: 'mobile', body: 'geo_circle_01', bones: MOBILE_RECORD.bones });
  assert.deepEqual(sanitizeRig(MOBILE_RIG), MOBILE_RIG, 'bake ≡ load: sanitizing the sanitized changes nothing');
  assert.deepEqual(sanitizeRig(mobileRaw()), MOBILE_RIG, 'deterministic');
});

ok('the door: a bone with no valid source drops, and its subtree drops with it', () => {
  const drop = (id, mutate) =>
    sanitizeRig(mobileRaw(MOBILE_RECORD.bones.map((b) => (b.id === id ? mutate(b) : b)))).bones.map((b) => b.id);
  // l0.1 loses its source → l0.1 and its child l0.2 are gone; the rest of the mobile stands
  assert.deepEqual(
    drop('l0.1', (b) => ({ ...b, motion: undefined })),
    ['l0.0', 'l1.0', 'l1.1', 'l2.0', 'l2.1'],
  );
  // the native sources of other skeletons are invalid on a mobile
  assert.deepEqual(
    drop('l1.0', (b) => ({ ...b, motion: { source: 'gait' } })),
    ['l0.0', 'l0.1', 'l0.2', 'l2.0', 'l2.1'],
  );
  assert.deepEqual(
    drop('l2.0', (b) => ({ ...b, motion: { source: 'linkage' } })),
    ['l0.0', 'l0.1', 'l0.2', 'l1.0', 'l1.1'],
  );
  // an unknown kineme id drops the same way
  assert.deepEqual(
    drop('l2.1', (b) => ({ ...b, motion: { source: 'kineme:nope' } })),
    ['l0.0', 'l0.1', 'l0.2', 'l1.0', 'l1.1', 'l2.0'],
  );
  // the head grammar is not a mobile bone (ruling 5): an 'h' bone drops, its would-be subtree too
  const withHead = sanitizeRig(
    mobileRaw([
      {
        id: 'h',
        role: 'head',
        chain: -1,
        parent: null,
        x: 50,
        y: 30,
        angle: -90,
        len: 10,
        motion: { source: 'kineme:rock' },
      },
      ...MOBILE_RECORD.bones,
    ]),
  );
  assert.equal(withHead.bones.length, MOBILE_RECORD.bones.length);
  assert.ok(withHead.bones.every((b) => b.role === 'limb'));
  // a mobile whose bones all drop is null; a mobile with no bone list is null — never a tree rig through the back door
  assert.equal(sanitizeRig(mobileRaw(MOBILE_RECORD.bones.map((b) => ({ ...b, motion: undefined })))), null);
  assert.equal(sanitizeRig({ figure: 'mobile', body: 'geo_circle_01' }), null);
  assert.equal(sanitizeRig({ figure: 'mobile', body: 'geo_circle_01', bones: 'nope' }), null);
});

ok('the door: a phrase bone is lawful and survives (ruling 8) — it poses once P6 registers the sources', () => {
  const rig = sanitizeRig(
    mobileRaw(MOBILE_RECORD.bones.map((b) => (b.id === 'l2.0' ? { ...b, motion: { source: 'phrase:sway' } } : b))),
  );
  assert.equal(rig.bones.find((b) => b.id === 'l2.0').motion.source, 'phrase:sway');
});

ok(`the door: bones slice at MAX_BONES = ${MAX_BONES}, parents first`, () => {
  const bones = [];
  for (let c = 0; c < 10; c++)
    bones.push({
      id: `l${c}.0`,
      role: 'limb',
      chain: c,
      parent: null,
      x: 20 + c * 6,
      y: 40,
      angle: 90,
      len: 18,
      motion: { source: 'kineme:rock' },
    });
  for (let c = 0; c < 3; c++)
    bones.push({
      id: `l${c}.1`,
      role: 'limb',
      chain: c,
      parent: `l${c}.0`,
      x: 0,
      y: 0,
      angle: 8,
      len: 12,
      motion: { source: 'kineme:bob' },
    });
  const rig = sanitizeRig(mobileRaw(bones));
  assert.equal(rig.bones.length, MAX_BONES);
  assert.deepEqual(
    rig.bones.map((b) => b.id),
    bones.slice(0, MAX_BONES).map((b) => b.id),
  );
});

ok('the bake: mobileTile wraps the hub drawing and rides the sanitized rig as data', () => {
  const hub = { svg: '<circle cx="50" cy="50" r="30"/>', weight: 'heavy' };
  const tile = mobileTile(MOBILE_RECORD, hub);
  assert.ok(tile, 'the fixture bakes');
  assert.ok(isMobileTileId(tile.id), `tile id grammar: ${tile.id}`);
  assert.equal(tile.category, 'creature');
  assert.equal(tile.source, 'wetlab');
  assert.equal(tile.compound, true);
  assert.equal(tile.weight, 'heavy');
  assert.deepEqual(tile.tags, ['creature', 'wetlab', 'mobile', 'geo_circle_01']);
  assert.equal(tile.svg, creatureTileSvg(MOBILE_RECORD, hub.svg), 'the hub drawing through the creature wrap');
  assert.deepEqual(tile.rig, MOBILE_RIG, 'the baked rig is the door’s own output');
  assert.deepEqual(sanitizeRig(tile.rig), tile.rig, 'the baked tile survives the load door unchanged');
  // deterministic: the same mobile takes the same tile; a changed mobile takes another
  assert.deepEqual(mobileTile(MOBILE_RECORD, hub), tile);
  const changed = mobileTile(
    { ...MOBILE_RECORD, bones: MOBILE_RECORD.bones.map((b) => (b.id === 'l0.0' ? { ...b, angle: 90 } : b)) },
    hub,
  );
  assert.notEqual(changed.id, tile.id);
  // no tile without a drawable hub, and none without a valid bone
  assert.equal(mobileTile(MOBILE_RECORD, null), null);
  assert.equal(mobileTile(MOBILE_RECORD, {}), null);
  assert.equal(
    mobileTile(
      {
        body: 'geo_circle_01',
        bones: [{ id: 'l0.0', role: 'limb', chain: 0, parent: null, x: 1, y: 1, angle: 90, len: 10 }],
      },
      hub,
    ),
    null,
  );
});

// one bone's delta, recomputed straight from the registry source at the part's own phase (ruling 2)
const srcDelta = (bone, t) => {
  const src = getMotionSource(bone.motion.source);
  assert.ok(src, `registered: ${bone.motion.source}`);
  const d = src.evaluate(
    { key: bone.id, seedOffset: OPTS.seedOffset, phase01: kinemePhase(OPTS.seedOffset, `${OPTS.tileKey}#${bone.id}`) },
    t,
    {},
  );
  const amt = bone.motion.amount ?? 1;
  return { dRot: (d.dRot || 0) * amt, dx: (d.dx || 0) * amt, dy: (d.dy || 0) * amt };
};
// the authored hang, composed by hand: roots at their hang points, children on their parent's tip
const authoredRest = (rig) => {
  const posed = new Map();
  return rig.bones.map((b) => {
    const p = b.parent ? posed.get(b.parent) : null;
    const x = p ? p.tx : b.x;
    const y = p ? p.ty : b.y;
    const angle = (p ? p.angle : 0) + b.angle;
    const out = { id: b.id, x, y, angle, tx: x + Math.cos(rad(angle)) * b.len, ty: y + Math.sin(rad(angle)) * b.len };
    posed.set(b.id, out);
    return out;
  });
};

ok('the pose: every bone rides its own source at its own phase, composed from the authored rest', () => {
  for (const t of TIMES) {
    const posed = poseFigure(MOBILE_RIG, t, OPTS);
    const byId = new Map(posed.map((p) => [p.id, p]));
    MOBILE_RIG.bones.forEach((b, i) => {
      const p = posed[i];
      const d = srcDelta(b, t);
      const parent = b.parent ? byId.get(b.parent) : null;
      if (parent) {
        assert.ok(Object.is(p.x, parent.tx) && Object.is(p.y, parent.ty), `${b.id} @${t}: joint is the parent's tip`);
        assert.ok(near(p.angle, parent.angle + b.angle + d.dRot), `${b.id} @${t}: angle = parent + authored + delta`);
      } else {
        assert.ok(near(p.x, b.x + d.dx) && near(p.y, b.y + d.dy), `${b.id} @${t}: root joint = hang point + offset`);
        assert.ok(near(p.angle, b.angle + d.dRot), `${b.id} @${t}: root angle = authored + delta`);
      }
      assert.ok(near(p.tx, p.x + Math.cos(rad(p.angle)) * b.len) && near(p.ty, p.y + Math.sin(rad(p.angle)) * b.len));
      assert.equal(p.len, b.len);
    });
  }
  // the motion is real, not a rest pose in disguise: bones sit at different angles at different times
  const a = poseFigure(MOBILE_RIG, 0.8, OPTS);
  const b = poseFigure(MOBILE_RIG, 1.7, OPTS);
  assert.ok(
    a.some((p, i) => Math.abs(p.angle - b[i].angle) > 1),
    'at least one bone swings > 1° between t=0.8 and t=1.7',
  );
  // a rotation-only root (bend) never leaves its hang point; a bob child adds no angle of its own
  for (const t of TIMES) {
    const posed = poseFigure(MOBILE_RIG, t, OPTS);
    const byId = new Map(posed.map((p) => [p.id, p]));
    assert.ok(Object.is(byId.get('l2.0').x, 50) && Object.is(byId.get('l2.0').y, 64), 'bend root joint pinned');
    assert.ok(near(byId.get('l0.1').angle - byId.get('l0.0').angle, -14), 'bob child keeps its authored local angle');
  }
  assert.deepEqual(poseFigure(MOBILE_RIG, 1.7, OPTS), b, 'deterministic: same record, seed and time → same pose');
});

ok('the pose: amount 0 hangs the authored rest exactly, at any time', () => {
  const still = sanitizeRig(mobileRaw(MOBILE_RECORD.bones.map((b) => ({ ...b, motion: { ...b.motion, amount: 0 } }))));
  const rest = authoredRest(still);
  for (const t of TIMES) {
    const posed = poseFigure(still, t, OPTS);
    posed.forEach((p, i) => {
      assert.ok(
        near(p.x, rest[i].x) && near(p.y, rest[i].y) && near(p.angle, rest[i].angle),
        `${p.id} @${t}: amount 0 = the authored hang`,
      );
    });
  }
});

ok('the pose: a phrase bone hangs at its authored rest until P6 — its subtree composes from it, siblings move', () => {
  const rig = sanitizeRig(
    mobileRaw(MOBILE_RECORD.bones.map((b) => (b.id === 'l2.0' ? { ...b, motion: { source: 'phrase:sway' } } : b))),
  );
  const rest = authoredRest(rig);
  const restById = new Map(rest.map((p) => [p.id, p]));
  let siblingSwing = 0;
  for (const t of [0.8, 1.7]) {
    const posed = poseFigure(rig, t, OPTS);
    const byId = new Map(posed.map((p) => [p.id, p]));
    const phr = byId.get('l2.0');
    assert.ok(near(phr.x, 50) && near(phr.y, 64) && near(phr.angle, 90), `phrase bone at authored rest @${t}`);
    const child = byId.get('l2.1');
    assert.ok(
      Object.is(child.x, phr.tx) && Object.is(child.y, phr.ty),
      'the phrase bone’s child hangs from its rest tip',
    );
    siblingSwing = Math.max(siblingSwing, Math.abs(byId.get('l0.0').angle - restById.get('l0.0').angle));
  }
  assert.ok(siblingSwing > 0.5, 'the kineme siblings still move around the waiting phrase bone');
});

ok('collapse (ruling 7): a collapsed mobile leaves the stage entirely — creatures keep their body', () => {
  const hub = { svg: '<circle cx="50" cy="50" r="30"/>', weight: 'medium' };
  const tile = mobileTile(MOBILE_RECORD, hub);
  const creatureRigRaw = {
    body: 'geo_square_01',
    bones: [
      { id: 'h', role: 'head', chain: -1, parent: null, x: 50, y: 20, angle: -90, len: 14 },
      { id: 'l0.0', role: 'limb', chain: 0, parent: null, x: 35, y: 70, angle: 120, len: 30 },
    ],
  };
  const overlayById = new Map([
    [tile.id, tile],
    ['user:cr-12345678', { id: 'user:cr-12345678', category: 'creature', source: 'wetlab', rig: creatureRigRaw }],
  ]);
  const inst = (asset, key) => ({
    asset,
    key,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    seedOffset: 0,
  });
  const instances = [
    inst('geo_circle_01', 'a'),
    inst(tile.id, 'm'),
    inst('user:cr-12345678', 'c'),
    inst('geo_square_01', 'b'),
  ];
  const out = expandCreatureInstances(instances, overlayById, { collapsed: true, seed: 1, t: 0 });
  assert.equal(out.length, 3, 'the mobile tile is gone; everything else stays');
  assert.ok(!out.some((it) => it.asset === tile.id), 'no hub remains');
  assert.ok(
    out[0] === instances[0] && out[1] === instances[2] && out[2] === instances[3],
    'survivors are the same instances, in order — the creature keeps its body (its unexpanded tile)',
  );
  // with no mobile placed, collapse returns the very array that came in (a mobileless scene is untouched)
  const plain = [inst('geo_circle_01', 'a'), inst('user:cr-12345678', 'c')];
  assert.equal(expandCreatureInstances(plain, overlayById, { collapsed: true, seed: 1, t: 0 }), plain);
});

ok('parity: existing records sanitize byte-identically through the two-shape door', () => {
  // a raw tree rig with valid and invalid motion entries — the exact JSON the door produced before step 3.2
  const tree = {
    body: 'geo_square_01',
    bones: [
      { id: 'h', role: 'head', chain: -1, parent: null, x: 50, y: 20, angle: -90, len: 14, motion: { source: 'gait' } },
      {
        id: 'l0.0',
        role: 'limb',
        chain: 0,
        parent: null,
        x: 35,
        y: 70,
        angle: 120,
        len: 30,
        motion: { source: 'linkage' },
      },
      {
        id: 'l0.1',
        role: 'limb',
        chain: 0,
        parent: 'l0.0',
        x: 0,
        y: 0,
        angle: 20,
        len: 24,
        motion: { source: 'kineme:nope' },
      },
      {
        id: 'l1.0',
        role: 'limb',
        chain: 1,
        parent: null,
        x: 65,
        y: 70,
        angle: 60,
        len: 30,
        motion: { source: 'kineme:rock', amount: -3 },
      },
    ],
  };
  assert.equal(
    JSON.stringify(sanitizeRig(tree)),
    '{"body":"geo_square_01","bones":[{"id":"h","role":"head","chain":-1,"parent":null,"x":50,"y":20,"angle":-90,"len":14,"motion":{"source":"gait"}},{"id":"l0.0","role":"limb","chain":0,"parent":null,"x":35,"y":70,"angle":120,"len":30},{"id":"l0.1","role":"limb","chain":0,"parent":"l0.0","x":0,"y":0,"angle":20,"len":24},{"id":"l1.0","role":"limb","chain":1,"parent":null,"x":65,"y":70,"angle":60,"len":30,"motion":{"source":"kineme:rock","amount":0}}]}',
    'a tree rig gains no figure key and loses nothing',
  );
  // a beast: the linkage branch is untouched — same keys, same motion map (frame clamped 7 → 2, the beam’s
  // 'linkage' kept, a bar’s 'gait' and an unknown bar name dropped)
  const beast = sanitizeRig({
    body: '',
    bones: [],
    linkage: { measures: sanitizeMeasures(wildTypeMeasures()), phase: 0.25 },
    motion: {
      frame: { source: 'kineme:bob', amount: 7 },
      crank: { source: 'gait' },
      beam: { source: 'linkage' },
      nope: { source: 'kineme:rock' },
    },
  });
  assert.deepEqual(Object.keys(beast), ['body', 'bones', 'linkage', 'motion']);
  assert.deepEqual(beast.motion, { frame: { source: 'kineme:bob', amount: 2 }, beam: { source: 'linkage' } });
  assert.deepEqual(beast.bones, []);
  // the assembled-creature path: buildRig’s motion bake + the door, exactly as step 3.1 left it
  const built = sanitizeRig(
    buildRig({
      body: 'geo_circle_01',
      head: { x: 50, y: 12 },
      limbs: [
        { x: 18, y: 78 },
        { x: 82, y: 78 },
      ],
      joints: [{ x: 30, y: 88 }],
      motion: {
        h: { source: 'kineme:rock', amount: 1.5 },
        'l0.1': { source: 'phrase:sway' },
        'l9.9': { source: 'kineme:bob' },
      },
    }),
  );
  assert.deepEqual(
    built.bones.map((b) => [b.id, b.motion || null]),
    [
      ['h', { source: 'kineme:rock', amount: 1.5 }],
      ['l0.0', null],
      ['l0.1', { source: 'phrase:sway' }],
      ['l0.2', null],
      ['l1.0', null],
      ['l1.1', null],
    ],
  );
  assert.ok(!('figure' in built), 'a creature rig carries no figure marker');
});

console.log(`mobileFigure.selfcheck: ${n} groups passed`);
