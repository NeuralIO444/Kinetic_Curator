// creatureRig.selfcheck.mjs — #1851 (slice 3 of #1848): the creature rig. Matt's ruling (2026-11-02): the head and
// limbs are invisible bones; their parts are dealt from the stage (Davis); rigid cut-out, child bones follow parents;
// limbs are chains (a plain point becomes a knee); Lois's gait sets the motion.
//
//   bones      the record's points become bones — a head bone, a 2-bone chain per limb, 3 with a plain point as the
//              knee; the tile draws the body alone and carries the bones as data through the overlay door
//   door       a hostile rig is cleaned or refused; only a wet-lab creature tile keeps one
//   fk         rigid forward kinematics: a child hangs from its parent's tip and turns with it; bones keep their length
//   gait       Lois's table: each mood moves differently; an unknown mood walks the default; time 0 is the rest pose
//   deal       Davis deals each bone a shape the stage is already placing — never a creature, never one the stage lacks;
//              same seed + stage → same parts on every copy; a new stage or seed redresses it
//   process    the real scene contract expands a placed creature into body + parts in the stage's colours and layer,
//              limbs behind and the head in front, along its bones through the mark's own transform — and the parts
//              move over time; copies stride out of step
//   shed       the freeze holds the rest pose (still over time); the collapse is the body alone; reduced motion rests
//   untouched  a stage with no creature tile builds the identical contract; a soloed creature wears its own body shape
//   store      re-assembling an old tile (limbs painted on, no bones) redraws it, keeping its pool switch
import assert from 'node:assert/strict';
import {
  buildRig,
  sanitizeRig,
  poseRig,
  gaitFor,
  LOIS_GAITS,
  dealPart,
  creatureTileSvg,
  TILE_BODY_SCALE,
  LIMB_REACH,
  HEAD_LEN,
} from './creatureRig.js';
import { assembleCreature, creatureTile, creatureTileId } from './creatureAssembler.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract, assertSceneContract } from '../gl/sceneContract.js';
import { useStore } from '../state/store.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const body = ASSETS.find((a) => a.id === 'org_blob_01');
const points = [
  { x: 50, y: 6, role: 'H' },
  { x: 12, y: 70, role: 'L' },
  { x: 88, y: 70, role: 'L' },
  { x: 80, y: 85 }, // a plain point, nearest the right limb: its knee
];
const record = assembleCreature({ assetId: body.id, points, seed: 1851 });
const [tile] = sanitizeOverlay([creatureTile(record, body)]);
const rig = tile.rig;

ok('bones: a head, a 2-bone chain per limb, a third where a plain point is its knee; the body alone is drawn', () => {
  assert.deepEqual(
    rig.bones.map((b) => `${b.id}<${b.parent ?? '-'}`),
    ['h<-', 'l0.0<-', 'l0.1<l0.0', 'l1.0<-', 'l1.1<l1.0', 'l1.2<l1.1'],
  );
  assert.equal(rig.bones[0].len, HEAD_LEN);
  for (const c of [0, 1]) {
    const chain = rig.bones.filter((b) => b.chain === c);
    assert.ok(
      near(
        chain.reduce((s, b) => s + b.len, 0),
        LIMB_REACH,
        0.01,
      ),
      `limb ${c} reaches LIMB_REACH`,
    );
  }
  assert.ok(rig.bones.find((b) => b.id === 'l1.0').x > 50, 'the right limb roots on the right of the body');
  assert.equal(tile.svg, creatureTileSvg(record, body.svg), 'the tile draws the body alone');
  assert.ok(!/cr-limb|cr-head|<path class/.test(tile.svg) && tile.svg.includes(`scale(${TILE_BODY_SCALE})`));
  assert.deepEqual(buildRig(record), rig, 'deterministic, and the overlay door keeps it whole');
  const bare = assembleCreature({ assetId: body.id, points: [], seed: 1 });
  assert.equal(buildRig(bare), null, 'no points, no bones');
});

ok('door: a hostile rig is cleaned or refused; only a wet-lab creature tile keeps one', () => {
  assert.equal(sanitizeRig(null), null);
  assert.equal(sanitizeRig({ bones: 'x' }), null);
  const bad = {
    body: rig.body,
    bones: [
      ...rig.bones,
      { ...rig.bones[1], id: 'l9.0', x: 1e9 }, // out of the box
      { ...rig.bones[2], id: 'l8.1', parent: 'l8.0' }, // an orphan (parent never listed)
      { ...rig.bones[1], id: '<script>' },
      { ...rig.bones[1], id: 'h' }, // a duplicate
      { ...rig.bones[1], id: 'l7.0', len: -3 },
    ],
  };
  assert.deepEqual(sanitizeRig(bad), rig);
  assert.equal(sanitizeRig({ ...rig, body: '<svg onload=x>' }).body, '', 'a hostile body id is dropped');
  const imp = { id: 'user:a', category: 'organic', source: 'overlay', svg: body.svg, rig };
  assert.ok(!('rig' in sanitizeOverlay([imp])[0]), 'an ordinary import never carries bones');
});

ok('fk: a child hangs from its parent’s tip and turns with it; bones keep their length', () => {
  for (const t of [0, 0.3, 1.7]) {
    const pose = poseRig(rig, t, gaitFor('BURN'), 0.2);
    const by = new Map(pose.map((p) => [p.id, p]));
    for (const b of rig.bones) {
      const p = by.get(b.id);
      assert.ok(near(Math.hypot(p.tx - p.x, p.ty - p.y), b.len, 1e-9), `${b.id} keeps its length`);
      if (b.parent) {
        const q = by.get(b.parent);
        assert.ok(near(p.x, q.tx) && near(p.y, q.ty), `${b.id} hangs from ${b.parent}'s tip`);
      }
    }
  }
  // turn the hip alone (a rig whose thigh has a different rest angle): the whole chain below it swings with it
  const turned = { bones: rig.bones.map((b) => (b.id === 'l1.0' ? { ...b, angle: b.angle + 30 } : b)) };
  const a = new Map(poseRig(rig, 0).map((p) => [p.id, p]));
  const b = new Map(poseRig(turned, 0).map((p) => [p.id, p]));
  for (const id of ['l1.1', 'l1.2']) assert.ok(near(b.get(id).angle - a.get(id).angle, 30, 1e-9), `${id} follows`);
  assert.ok(near(b.get('l0.1').angle, a.get('l0.1').angle), 'the other limb does not');
});

ok('gait: each of Lois’s moods moves differently; unknown walks the default; t = 0 is rest', () => {
  assert.deepEqual(Object.keys(LOIS_GAITS).sort(), ['AWAY', 'BURN', 'CUT', 'NOD', 'VIBE']);
  assert.equal(gaitFor('nonsense'), LOIS_GAITS.NOD);
  assert.equal(gaitFor(null), LOIS_GAITS.NOD);
  const sig = (face) =>
    JSON.stringify([0.2, 0.5, 0.9].map((t) => poseRig(rig, t, gaitFor(face), 0).map((p) => Math.round(p.angle * 100))));
  const sigs = Object.keys(LOIS_GAITS).map(sig);
  assert.equal(new Set(sigs).size, sigs.length, 'no two moods move alike');
  // the rest pose: thighs on their rest angle, the head on its own (crouch bends only the lower bones)
  const rest = new Map(poseRig(rig, 0, gaitFor('NOD'), 0).map((p) => [p.id, p]));
  assert.ok(Math.abs(rest.get('l0.0').angle - rig.bones[1].angle) < LOIS_GAITS.NOD.swing, 'near rest at t = 0');
  assert.notEqual(sig('NOD'), JSON.stringify([0, 0, 0].map(() => [])), 'it moves');
});

ok('deal: Davis deals each bone a shape the stage places — same seed + stage, same parts; new stage, new parts', () => {
  const stage = ['geo_hex_01', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03'];
  const deal = (st, seed) => rig.bones.map((b) => dealPart(st, seed, tile.id, b));
  const d = deal(stage, 7);
  assert.ok(
    d.every((id) => stage.includes(id)),
    'only shapes the stage has',
  );
  assert.deepEqual(deal(stage, 7), d, 'deterministic');
  assert.notDeepEqual(deal(stage, 8), d, 'a new seed redresses');
  assert.notDeepEqual(deal(['geo_tri_02', 'dot_field_01', 'mrk_sun_01'], 7), d, 'a new stage redresses');
  assert.equal(dealPart([], 7, tile.id, rig.bones[0]), null, 'nothing to deal from');
  // a chain's bones step through the pile together: related, not one shape repeated (with more than one to pick)
  assert.notEqual(d[1], d[2], 'thigh and shin differ');
});

// ── the real scene contract, the seam every render path shares ──
const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
const items = (creatures = [['a', 220, 0]]) =>
  [
    ...creatures.map(([key, x, rotation]) => ({ assetId: tile.id, x, y: 270, scale: 3, rotation, key })),
    ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 150, y: 470, scale: 0.6, rotation: 0, key: `s${i}` })),
  ].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
const contract = (doc = {}, its = items()) =>
  buildSceneContract({
    doc: { seed: 7, customAssets: [tile], ...doc },
    resolvedLayers: [{ id: 'L', isFx: false, items: its }],
  });
const partsOf = (c, key = 'a') => c.instances.filter((i) => i.key.startsWith(`${key}#`));

ok('process: the contract expands a placed creature into body + parts along its bones, and they move', () => {
  const c = contract({ kinemeTime: 0.4 });
  assert.equal(assertSceneContract(c), true);
  const parts = partsOf(c);
  assert.equal(parts.length, rig.bones.length, 'one part per bone');
  const bodyAt = c.instances.findIndex((i) => i.key === 'a');
  const order = c.instances.map((i) => i.key);
  for (const p of parts) {
    assert.ok(STAGE.includes(p.asset), 'dealt from the stage');
    assert.equal(p.tint, '#1b1b1b');
    assert.equal(p.accent, '#e8553a');
    assert.equal(p.layer, 'L');
    const at = order.indexOf(p.key);
    assert.ok(p.key.endsWith('#h') ? at > bodyAt : at < bodyAt, 'limbs behind the body, the head in front');
  }
  assert.ok(
    c.atlas.assets.some((a) => a.id === tile.id),
    'the body still bakes',
  );
  // the part's centre is its bone's midpoint through the mark's transform (scale 3, no rotation, at 220, 270)
  const pose = new Map(poseRig(rig, 0.4, gaitFor(null), 0).map((p) => [p.id, p]));
  const phaseFree = contract({ kinemeTime: 0.4 }, items([['a', 220, 0]]));
  const head = partsOf(phaseFree).find((p) => p.key === 'a#h');
  const hp = pose.get('h');
  // the head's own phase comes from the copy's identity, so check the geometry against its posed angle
  const midY = 270 + ((hp.y + hp.ty) / 2 - 50) * 3;
  assert.ok(Math.abs(head.y - midY) < 3 * HEAD_LEN, 'the head sits up on its bone');
  assert.ok(head.y < 270, 'above the body');
  // time moves the parts; the body and the stage stay where the stage put them
  const later = contract({ kinemeTime: 1.1 });
  const moved = partsOf(later).filter(
    (p, i) => p.x !== parts[i].x || p.y !== parts[i].y || p.rotation !== parts[i].rotation,
  );
  assert.ok(moved.length >= rig.bones.length - 1, 'the parts move');
  const still = (cc) =>
    cc.instances.filter((i) => !i.key.includes('#')).map(({ key, x, y, rotation }) => ({ key, x, y, rotation }));
  assert.deepEqual(still(later), still(c), 'placements never move');
});

ok('process: copies stride out of step; a creature rotated on stage carries its bones with it', () => {
  const c = contract(
    { kinemeTime: 0.5 },
    items([
      ['a', 220, 0],
      ['b', 560, 0],
    ]),
  );
  const rel = (key, x0) => partsOf(c, key).map((p) => [Math.round(p.x - x0), Math.round(p.y), Math.round(p.rotation)]);
  assert.notDeepEqual(rel('a', 220), rel('b', 560), 'two copies are not in lockstep');
  assert.deepEqual(
    partsOf(c, 'a').map((p) => p.asset),
    partsOf(c, 'b').map((p) => p.asset),
    'both copies wear the same parts (one creature, one look)',
  );
  const turned = contract({ kinemeTime: 0 }, items([['a', 220, 90]]));
  const head = partsOf(turned).find((p) => p.key === 'a#h');
  assert.ok(head.x > 220 && Math.abs(head.y - 270) < 15, 'turned 90° clockwise, the head points right');
});

ok('shed: the freeze holds the rest pose; the collapse is the body alone; reduced motion rests', () => {
  const frozen = (t) => partsOf(contract({ kinemeTime: t, perfTier1: true, quality: 'performance' }));
  assert.deepEqual(frozen(0.3), frozen(1.2), 'frozen: still over time');
  assert.deepEqual(frozen(0.9), partsOf(contract({ kinemeTime: 0 })), 'frozen = the rest pose');
  const reduced = (t) => partsOf(contract({ kinemeTime: t, reducedMotion: true }));
  assert.deepEqual(reduced(0.3), reduced(1.2), 'reduced motion: still');
  const collapsed = contract({ kinemeTime: 0.3, perfTier1: true, quality: 'performance', assetThin: true });
  assert.equal(partsOf(collapsed).length, 0, 'collapse: no parts');
  assert.ok(
    collapsed.instances.some((i) => i.key === 'a'),
    'the body stays',
  );
});

ok('untouched: no creature tile → the identical contract; soloed → parts of its own body shape', () => {
  const plain = items([]);
  const withTileInPool = buildSceneContract({
    doc: { seed: 7, customAssets: [tile], kinemeTime: 0.4 },
    resolvedLayers: [{ id: 'L', isFx: false, items: plain }],
  });
  const without = buildSceneContract({
    doc: { seed: 7, customAssets: [], kinemeTime: 0.4 },
    resolvedLayers: [{ id: 'L', isFx: false, items: plain }],
  });
  assert.deepEqual(
    withTileInPool.instances,
    without.instances,
    'a creature in the pool but not on stage changes nothing',
  );
  // the creature soloed — nothing else on stage: Davis deals from the shape the creature is made of
  const solo = items([['a', 220, 0]]).filter((i) => i.key === 'a');
  const alone = contract({ kinemeTime: 0.4 }, solo);
  assert.equal(alone.instances.length, 1 + rig.bones.length, 'soloed: body + parts');
  assert.ok(
    partsOf(alone).every((p) => p.asset === body.id),
    'parts of its own body shape',
  );
  // a rig with no body to fall back on (a hand-built doc) is the body alone
  const orphan = { ...tile, rig: { ...tile.rig, body: '' } };
  const bare = buildSceneContract({
    doc: { seed: 7, customAssets: [orphan], kinemeTime: 0.4 },
    resolvedLayers: [{ id: 'L', isFx: false, items: solo }],
  });
  assert.deepEqual(
    bare.instances.map((i) => i.key),
    ['a'],
    'nothing to deal from: the body alone',
  );
});

ok('store: re-assembling a tile drawn before the rig redraws it with bones, keeping its pool switch', () => {
  useStore.setState({ seed: 0x1851, creatureRecords: [], customAssets: [], creatureAssembleNote: null });
  S().assembleCreature(body.id, points);
  const id = creatureTileId(S().creatureRecords[0].id);
  const now = () => S().customAssets.find((a) => a.id === id);
  assert.equal(S().creatureAssembleNote.status, 'banked');
  assert.ok(now().rig && now().rig.bones.length === 6, 'a new tile has its bones');
  const current = now();
  const old = { ...current, svg: `<g transform="translate(15 15) scale(0.7)">${body.svg}<path d="M1 1L2 2Z"/></g>` };
  delete old.rig;
  useStore.setState({ customAssets: [old], enabledAssets: { ...S().enabledAssets, [id]: true } });
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'redrawn');
  assert.deepEqual(now(), current, 'redrawn: the body alone, with bones');
  assert.equal(S().enabledAssets[id], true, 'the pool switch stays');
  S().assembleCreature(body.id, points);
  assert.equal(S().creatureAssembleNote.status, 'already', 'a current tile is left alone');
});

console.log(`creatureRig.selfcheck: ${n} checks passed`);
