// creatureKin.selfcheck.mjs — #1947 (ruling 4 of #1848): the lineage shimmer. "A creature on stage dresses for the
// room — the stage's Look/Voice win — while its lineage still shimmers through: what it wears is the room's, who it is
// related to stays visible."
//
//   founder    a bred creature's family is the founder its skeleton descends from — walked through generations;
//              a missing ancestor ends the walk at the nearest known one; a founder is its own family
//   resemble   on one stage a child wears exactly its skeleton-founder's parts; a founder's deal is unchanged
//   shimmer    kin breathe in unison, strangers do not; the dip is subtle (≤ SHIMMER_DEPTH); it moves over time
//   shed       the freeze and reduced motion still it (full opacity); the collapse drops the parts
//   door       only a creature tile keeps a family, and only a well-formed one; a founder's tile carries none
//   store      banking a child stamps its family; re-banking an older child (no family) refreshes its tile
import assert from 'node:assert/strict';
import { assembleCreature, creatureTile, creatureTileId, skeletonFounder } from './creatureAssembler.js';
import { breedCreature, sourceRecord } from './creatureBreed.js';
import { kinShimmer, sanitizeKin, SHIMMER_DEPTH } from './creatureRig.js';
import { ASSETS } from '../data/assets/index.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { useStore } from '../state/store.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const LOOKS = COMPOSITION_PRESETS.map((p) => p.id);
const VOICES = VOICE_DECK.map((v) => v.id);
const body = (id) => ASSETS.find((a) => a.id === id);
const SHAPES = [
  [
    'org_blob_01',
    [
      { x: 50, y: 5, role: 'H' },
      { x: 10, y: 60, role: 'L' },
      { x: 90, y: 60, role: 'L' },
    ],
  ],
  [
    'geo_tri_02',
    [
      { x: 20, y: 90, role: 'L' },
      { x: 80, y: 90, role: 'L' },
    ],
  ],
  [
    'flora_flower_01',
    [
      { x: 50, y: 50, role: 'H' },
      { x: 5, y: 50, role: 'L' },
      { x: 95, y: 50, role: 'L' },
      { x: 50, y: 95, role: 'L' },
    ],
  ],
  [
    'geo_hex_01',
    [
      { x: 50, y: 10, role: 'H' },
      { x: 15, y: 80, role: 'L' },
    ],
  ],
];
const founders = SHAPES.map(([id, pts], i) =>
  sourceRecord({ kind: 'assembly', assetId: id, points: pts, lookId: LOOKS[i], voiceId: VOICES[i] }, 11),
);
const skeletonSource = (rec) => /:(cr-[0-9a-f]{8})$/.exec(rec.genome.find((g) => g.id === 'limbs').source)[1];
// a child, and a grandchild whose skeleton runs back through the child
const child = breedCreature(founders.slice(0, 3), 5);
let grand = null;
for (let s = 0; s < 400 && !grand; s++) {
  const g = breedCreature([child, founders[3], founders[0]], s);
  if (skeletonSource(g) === child.id) grand = g;
}
const bank = [...founders, child, grand];
const tileOf = (rec) => creatureTile(rec, body(rec.body), skeletonFounder(rec, bank));

ok('founder: a family is walked down the skeleton line; a founder is its own; a lost ancestor ends the walk', () => {
  for (const f of founders) assert.equal(skeletonFounder(f, bank), f.id, 'a founder is its own family');
  assert.equal(skeletonFounder(child, bank), skeletonSource(child), 'a child: the parent its skeleton came from');
  assert.ok(grand, 'fixture: a grandchild whose skeleton comes through the child');
  assert.equal(skeletonFounder(grand, bank), skeletonFounder(child, bank), 'a grandchild: back to the same founder');
  assert.equal(skeletonFounder(grand, [grand]), child.id, 'the child gone from the bank: the nearest known ancestor');
  const loop = { ...child, lineage: { ...child.lineage }, id: 'cr-00000001' };
  assert.ok(skeletonFounder(loop, [loop]), 'never hangs');
});

// a stage: one founder, its child, an unrelated founder, and five ordinary shapes for Davis to deal from
const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
const fam = skeletonFounder(child, bank);
const famRec = founders.find((f) => f.id === fam);
const stranger = founders.find((f) => f.id !== fam && f.limbs.length);
const tiles = sanitizeOverlay([tileOf(famRec), tileOf(child), tileOf(stranger)]);
const at = (rec, key, x) => ({ assetId: creatureTileId(rec.id), x, y: 300, scale: 2, rotation: 0, key });
const items = [
  at(famRec, 'F', 150),
  at(child, 'C', 450),
  at(stranger, 'X', 750),
  ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 150, y: 560, scale: 0.6, rotation: 0, key: `s${i}` })),
].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
const contract = (doc = {}, overlay = tiles) =>
  buildSceneContract({
    doc: { seed: 7, customAssets: overlay, ...doc },
    resolvedLayers: [{ id: 'L', isFx: false, items }],
  });
const partsOf = (c, key) => c.instances.filter((i) => i.key.startsWith(`${key}#`));

ok('resemble: a child wears its skeleton-founder’s parts on the same stage; a founder’s deal is unchanged', () => {
  const c = contract({ kinemeTime: 0.4 });
  const parts = (key) => partsOf(c, key).map((p) => `${p.key.split('#')[1]}=${p.asset}`);
  assert.deepEqual(parts('C'), parts('F'), 'the child is dressed like its founder');
  assert.notDeepEqual(parts('X'), parts('F'), 'a stranger is dressed its own way');
  // a founder's deal is exactly what it was before families existed (its hand is its own tile id)
  const bare = sanitizeOverlay(tiles.map(({ kin, ...t }) => t));
  const before = contract({ kinemeTime: 0.4 }, bare);
  assert.deepEqual(
    parts('F'),
    partsOf(before, 'F').map((p) => `${p.key.split('#')[1]}=${p.asset}`),
  );
  assert.notDeepEqual(
    parts('C'),
    partsOf(before, 'C').map((p) => `${p.key.split('#')[1]}=${p.asset}`),
    'without its family the child would be dressed by its own hand',
  );
});

ok('shimmer: kin breathe in unison, strangers do not; subtle; it moves', () => {
  const glow = (c, key) => partsOf(c, key)[0].opacity;
  let differs = 0;
  for (const t of [0.2, 0.9, 1.7, 2.4, 3.3]) {
    const c = contract({ kinemeTime: t });
    assert.equal(glow(c, 'C'), glow(c, 'F'), `t=${t}: kin in unison`);
    if (glow(c, 'X') !== glow(c, 'F')) differs++;
    for (const k of ['F', 'C', 'X']) {
      const v = glow(c, k);
      assert.ok(v <= 1 && v >= 1 - SHIMMER_DEPTH - 1e-9, `t=${t}: ${k} stays subtle (${v})`);
    }
    assert.ok(
      c.instances.filter((i) => !i.key.includes('#')).every((i) => i.opacity === 1),
      'bodies and the stage keep their own opacity',
    );
  }
  assert.ok(differs >= 4, 'strangers keep their own rhythm');
  assert.ok(SHIMMER_DEPTH > 0 && SHIMMER_DEPTH <= 0.15, 'ruling 4: subtle — the dip is pinned small');
  const series = [0, 0.5, 1, 1.5, 2].map((t) => kinShimmer(fam, t));
  assert.ok(new Set(series).size >= 4, 'it moves over time');
});

ok('shed: the freeze and reduced motion still it at full opacity; the collapse drops the parts', () => {
  for (const doc of [{ perfTier1: true, quality: 'performance' }, { reducedMotion: true }]) {
    for (const t of [0.3, 1.9]) {
      const c = contract({ kinemeTime: t, ...doc });
      assert.ok(
        ['F', 'C', 'X'].every((k) => partsOf(c, k).every((p) => p.opacity === 1)),
        'still, full',
      );
    }
  }
  const collapsed = contract({ kinemeTime: 0.3, perfTier1: true, quality: 'performance', assetThin: true });
  assert.equal(partsOf(collapsed, 'C').length, 0);
});

ok('door: only a creature tile keeps a family, only a well-formed one; a founder’s tile carries none', () => {
  assert.equal(sanitizeKin('cr-0000abcd'), 'cr-0000abcd');
  for (const bad of ['user:cr-0000abcd', 'cr-XYZ', '<x>', 7, null]) assert.equal(sanitizeKin(bad), null);
  const t = tileOf(child);
  assert.equal(t.kin, fam);
  assert.deepEqual(sanitizeOverlay([t])[0], t, 'the door keeps a child’s family');
  assert.ok(!('kin' in tileOf(famRec)), 'a founder carries none (its tile is byte-identical to before)');
  assert.ok(!('kin' in sanitizeOverlay([{ ...t, kin: 'cr-bad' }])[0]), 'a malformed family is dropped');
  const imp = { id: 'user:x', category: 'organic', source: 'overlay', svg: body('org_blob_01').svg, kin: fam };
  assert.ok(!('kin' in sanitizeOverlay([imp])[0]), 'an import never carries a family');
});

ok('store: banking a child stamps its family; an older child’s tile (no family) is refreshed on re-banking', () => {
  useStore.setState({
    seed: 11,
    creatureRecords: [],
    customAssets: [],
    creatureBreedNote: null,
    creatureAssembleNote: null,
  });
  for (const [id, pts] of SHAPES.slice(0, 3)) S().assembleCreature(id, pts);
  const [a, b, c] = S().creatureRecords;
  S().breedCreature([a, b, c].map((r) => ({ kind: 'creature', id: r.id })));
  assert.equal(S().creatureBreedNote.status, 'banked');
  const kid = S().creatureRecords.at(-1);
  const tileId = creatureTileId(kid.id);
  const kidTile = () => S().customAssets.find((t) => t.id === tileId);
  assert.equal(kidTile().kin, skeletonFounder(kid, S().creatureRecords), 'stamped at banking');
  // a tile banked before families existed: breeding the same trio again refreshes it, keeping its pool switch
  const { kin, ...older } = kidTile();
  useStore.setState({
    customAssets: S().customAssets.map((t) => (t.id === tileId ? older : t)),
    enabledAssets: { ...S().enabledAssets, [tileId]: true },
  });
  S().breedCreature([a, b, c].map((r) => ({ kind: 'creature', id: r.id })));
  assert.equal(S().creatureBreedNote.status, 'redrawn');
  assert.ok(kidTile().kin, 'refreshed');
  assert.equal(S().enabledAssets[tileId], true, 'the pool switch stays');
});

console.log(`creatureKin.selfcheck: ${n} checks passed`);
