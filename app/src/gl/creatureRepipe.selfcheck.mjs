// creatureRepipe.selfcheck.mjs — #2119 Motion Core P7, step 3.3: the re-pipe pin.
//
// Step 3.3 re-pipes expandCreatureInstances so posing flows through poseFigure (step 3.1) at the
// scene-contract seam, and Davis deals a motion source to every bone that carries none (spec §8, as
// ruled — §11 ruling 1: his palette is the kinemes the stage is already running). The contract of the
// step is parity: for every existing creature and beast fixture, the expansion is byte-identical to
// what the pre-re-pipe code produced, and a creature scene's contract hash does not move.
//
// The goldens in fixtures/creatureRepipe.expansions.json were generated from the PRE-RE-PIPE code
// (base c9eb09d2) by this very suite: CREATURE_REPIPE_EMIT=1 node src/gl/creatureRepipe.selfcheck.mjs
// Regenerate only with cause, and say so in the PR — a golden that moves silently is a behaviour
// change that was not reviewed. (The name is shared with the #1694 replay fixture beside it —
// creatureRepipe.kcperf, a recorded performance whose checkpoints creatureGate verifies; that file
// is a different pin and is never regenerated here.)
//
// Groups: the goldens (legacy call shape) · the same goldens through poseFigure (the re-pipe) ·
// the Davis deal (determinism, precedence, re-deal) · the mobile through the seam · the deal at
// the real contract.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import '../engine/motionCore/kinemeSources.js'; // the kineme sources register on import; poseFigure resolves them through the registry
import { poseFigure } from '../engine/motionCore/rigSources.js';
import {
  expandCreatureInstances,
  davisFitOf,
  sanitizeRig,
  dealBoneSource,
  kinShimmer,
  poseRig,
  gaitFor,
} from '../engine/creatureRig.js';
import { assembleCreature, creatureTile, mobileTile } from '../engine/creatureAssembler.js';
import { sourceRecord } from '../engine/creatureBreed.js';
import { beastTile } from '../engine/beastTile.js';
import { wildTypeMeasures } from '../engine/jansenMeasures.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { ASSETS } from '../data/assets/index.js';
import { libraryTraits } from '../data/assetDescriptor.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { buildSceneContract, serializeSceneContract } from './sceneContract.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const body = (id) => ASSETS.find((a) => a.id === id);
const inst = (asset, key, extra = {}) => ({
  asset,
  key,
  x: 300,
  y: 300,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  seedOffset: 0,
  ...extra,
});
// expansions are pinned through a JSON round-trip on BOTH sides: -0 and key order can never
// false-positive, and a NaN/Infinity in a live expansion fails loudly instead of pinning as null
const roundTrip = (v) => JSON.parse(JSON.stringify(v));
const assertFiniteDeep = (v, path = '$') => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}: finite`);
  else if (Array.isArray(v)) v.forEach((x, i) => assertFiniteDeep(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertFiniteDeep(x, `${path}.${k}`);
};

// ── the fixtures: the existing suites' own creatures and beasts, baked through the real doors ──
// the assembled creature (creatureRig.selfcheck's record): head + two limb chains + a knee
const creatureRecord = assembleCreature({
  assetId: 'org_blob_01',
  points: [
    { x: 50, y: 6, role: 'H' },
    { x: 12, y: 70, role: 'L' },
    { x: 88, y: 70, role: 'L' },
    { x: 80, y: 85 },
  ],
  seed: 1851,
});
const creatureTileRec = sanitizeOverlay([creatureTile(creatureRecord, body('org_blob_01'))])[0];
// the founder (figurePartKineme's tile): a sourceRecord founder on the squiggle, kin and all
const founderRec = sourceRecord(
  {
    kind: 'assembly',
    assetId: 'line_squiggle_03',
    points: [
      { x: 50, y: 5, role: 'H' },
      { x: 10, y: 60, role: 'L' },
      { x: 90, y: 60, role: 'L' },
    ],
    lookId: COMPOSITION_PRESETS[0].id,
    voiceId: VOICE_DECK[0].id,
  },
  11,
);
const founderTileRec = sanitizeOverlay([creatureTile(founderRec, body(founderRec.body))])[0];
// the beast (beastRig.selfcheck's animal): the wild-type Jansen linkage, baked as a tile
const beastTileRec = sanitizeOverlay([beastTile(wildTypeMeasures())])[0];

const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
const creatureScene = () => [
  ...STAGE.map((id, i) => inst(id, `s${i}`)),
  inst(creatureTileRec.id, 'C', { x: 300, y: 240, scaleX: 2, scaleY: 2, seedOffset: 3 }),
];
const founderScene = () => [inst(founderTileRec.id, 'F', { x: 300, y: 300, scaleX: 2, scaleY: 2, seedOffset: 3 })];
const BEAST_STAGE = ASSETS.map((a) => a.id)
  .filter((id) => libraryTraits(id))
  .slice(0, 9)
  .sort();
const beastScene = () => [...BEAST_STAGE.map((id, i) => inst(id, `s${i}`)), inst(beastTileRec.id, 'B')];
const overlayOf = (...recs) => new Map(recs.map((r) => [r.id, r]));

// ── the golden scenarios: expansions in the LEGACY call shape (no poseFigure, no palette) — the
// exact calls every pre-3.3 caller makes, so the pin covers the behaviour they all depend on ──
function goldenScenarios(extra = {}) {
  const cOver = overlayOf(creatureTileRec);
  const cFit = davisFitOf(cOver);
  const fOver = overlayOf(founderTileRec);
  const bOver = overlayOf(beastTileRec);
  const bFit = davisFitOf(bOver);
  const run = (scene, over, opts) => {
    const out = expandCreatureInstances(scene, over, { ...opts, ...extra });
    assertFiniteDeep(out);
    return roundTrip(out);
  };
  return {
    'creature-t0': run(creatureScene(), cOver, { seed: 7, t: 0, fitOf: cFit }),
    'creature-t0.9': run(creatureScene(), cOver, { seed: 7, t: 0.9, fitOf: cFit }),
    'creature-t1.7-vibe': run(creatureScene(), cOver, { seed: 7, t: 1.7, face: 'VIBE', fitOf: cFit }),
    'creature-frozen': run(creatureScene(), cOver, { seed: 7, t: 5, frozen: true, fitOf: cFit }),
    'creature-bloom': run(creatureScene(), cOver, { seed: 3, t: 0.9, davis: 'BLOOM', fitOf: cFit }),
    'creature-nofit': run(creatureScene(), cOver, { seed: 7, t: 0.9 }),
    'founder-solo-t0.4': run(founderScene(), fOver, { seed: 7, t: 0.4, fitOf: davisFitOf(fOver) }),
    'beast-t0': run(beastScene(), bOver, { seed: 7, t: 0, fitOf: bFit }),
    'beast-t0.9': run(beastScene(), bOver, { seed: 7, t: 0.9, fitOf: bFit }),
    'beast-t1.9': run(beastScene(), bOver, { seed: 7, t: 1.9, fitOf: bFit }),
    'beast-frozen': run(beastScene(), bOver, { seed: 7, t: 5, frozen: true, fitOf: bFit }),
    'beast-noroam': run(beastScene(), bOver, { seed: 7, t: 0.9, fitOf: bFit, beastRoam: false }),
    'beast-bare': run([inst(beastTileRec.id, 'B')], bOver, { seed: 7, t: 0.9, fitOf: bFit }),
  };
}

// ── a creature scene's contract: creature + beast + plain marks, no kineme assignments anywhere
// (the deal cannot fire — Davis's palette is empty — so the hash pins the re-pipe alone) ──
function contractScene() {
  const contract = buildSceneContract({
    doc: { seed: 7, kinemeTime: 0.9, customAssets: [creatureTileRec, beastTileRec] },
    resolvedLayers: [
      {
        id: 'L',
        isFx: false,
        items: [
          {
            assetId: creatureTileRec.id,
            x: 300,
            y: 240,
            scale: 2,
            rotation: 0,
            key: 'C',
            color: '#1b1b1b',
            accent: '#e8553a',
            alpha: 100,
            seedOffset: 3,
          },
          {
            assetId: beastTileRec.id,
            x: 620,
            y: 420,
            scale: 1.5,
            rotation: 0,
            key: 'B',
            color: '#1b1b1b',
            accent: '#e8553a',
            alpha: 100,
            seedOffset: 5,
          },
          {
            assetId: 'geo_hex_01',
            x: 120,
            y: 120,
            scale: 1,
            rotation: 15,
            key: 'M1',
            color: '#1b1b1b',
            accent: '#e8553a',
            alpha: 100,
            seedOffset: 1,
          },
          {
            assetId: 'org_petal_01',
            x: 800,
            y: 160,
            scale: 1,
            rotation: -10,
            key: 'M2',
            color: '#1b1b1b',
            accent: '#e8553a',
            alpha: 100,
            seedOffset: 2,
          },
        ],
      },
    ],
  });
  assertFiniteDeep(contract.instances);
  return {
    sha256: createHash('sha256').update(serializeSceneContract(contract)).digest('hex'),
    instances: contract.instances.length,
  };
}

const GOLDEN_PATH = fileURLToPath(new URL('./fixtures/creatureRepipe.expansions.json', import.meta.url));

if (process.env.CREATURE_REPIPE_EMIT) {
  writeFileSync(
    GOLDEN_PATH,
    JSON.stringify(
      {
        provenance:
          "Generated by creatureRepipe.selfcheck.mjs (CREATURE_REPIPE_EMIT=1) from the pre-re-pipe code at base c9eb09d2 — P7 step 3.3's pin. Regenerate only with cause, stated in the PR.",
        scenarios: goldenScenarios(),
        contract: contractScene(),
      },
      null,
      1,
    ) + '\n',
  );
  console.log('creatureRepipe: goldens written to fixtures/creatureRepipe.expansions.json');
} else {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  console.log('#2119 creatureRepipe — step 3.3: the re-pipe pin (goldens from the pre-re-pipe code)');

  ok('goldens: every existing creature and beast fixture expands byte-identically (legacy call shape)', () => {
    const live = goldenScenarios();
    assert.deepEqual(Object.keys(live).sort(), Object.keys(golden.scenarios).sort(), 'the scenario census');
    for (const [name, want] of Object.entries(golden.scenarios))
      assert.deepEqual(live[name], want, `${name}: the expansion is the pre-re-pipe expansion`);
  });

  ok('goldens: a creature scene’s contract hash is what it was before the re-pipe', () => {
    const live = contractScene();
    assert.equal(live.sha256, golden.contract.sha256, 'the contract hash stands');
    assert.equal(live.instances, golden.contract.instances, 'the instance census stands');
  });

  ok('the re-pipe: the same goldens, posed through poseFigure at the seam, are byte-identical', () => {
    const live = goldenScenarios({ poseFigure });
    for (const [name, want] of Object.entries(golden.scenarios))
      assert.deepEqual(live[name], want, `${name}: poseFigure poses what poseRig / poseLinkage posed`);
  });

  // ── the Davis deal ──────────────────────────────────────────────────────────────────────────
  const PALETTE3 = ['kineme:bob', 'kineme:pulse', 'kineme:rock'];
  ok('the deal: the dealer is a pure seeded pick over the palette, keyed on (seed, family hand, bone hand)', () => {
    assert.equal(dealBoneSource([], 7, 'user:x', 'h'), null, 'an empty palette deals nothing');
    assert.equal(dealBoneSource(null, 7, 'user:x', 'h'), null);
    for (const seed of [1, 7, 42])
      for (const hand of ['h', 'l0', 'l1'])
        assert.equal(
          dealBoneSource(PALETTE3, seed, 'user:x', hand),
          dealBoneSource(PALETTE3, seed, 'user:x', hand),
          'same key, same source',
        );
    assert.ok(PALETTE3.includes(dealBoneSource(PALETTE3, 7, 'user:x', 'h')), 'the pick is a palette member');
    const picks = new Set();
    for (let seed = 1; seed <= 60; seed++) picks.add(dealBoneSource(PALETTE3, seed, 'user:x', 'l0'));
    assert.ok(picks.size >= 2, `a new seed re-deals (saw ${[...picks].join(', ')})`);
  });

  // a creature with some bones recorded and some bare — the precedence stage
  const recordedRig = sanitizeRig({
    body: 'geo_circle_01',
    bones: [
      {
        id: 'h',
        role: 'head',
        chain: -1,
        parent: null,
        x: 50,
        y: 20,
        angle: -90,
        len: 14,
        motion: { source: 'kineme:rock' },
      },
      { id: 'l0.0', role: 'limb', chain: 0, parent: null, x: 35, y: 70, angle: 120, len: 18 },
      { id: 'l0.1', role: 'limb', chain: 0, parent: 'l0.0', x: 0, y: 0, angle: 24, len: 18 },
      {
        id: 'l1.0',
        role: 'limb',
        chain: 1,
        parent: null,
        x: 65,
        y: 70,
        angle: 60,
        len: 18,
        motion: { source: 'gait' },
      },
    ],
  });
  const recordedRec = { id: 'user:cr-recorded', category: 'creature', source: 'wetlab', rig: recordedRig };
  const recordedScene = () => [
    ...STAGE.map((id, i) => inst(id, `s${i}`)),
    inst(recordedRec.id, 'R', { x: 300, y: 240, scaleX: 2, scaleY: 2, seedOffset: 3 }),
  ];
  const partOf = (out, key) => out.find((i) => i.key === key);

  ok('the deal: deterministic at expansion, moves the bare bones, and is never stored back', () => {
    const over = overlayOf(recordedRec);
    const opts = { poseFigure, sourcePalette: PALETTE3, seed: 7, t: 1.7, fitOf: davisFitOf(over) };
    const a = expandCreatureInstances(recordedScene(), over, opts);
    const b = expandCreatureInstances(recordedScene(), over, opts);
    assert.deepEqual(roundTrip(a), roundTrip(b), 'same seed + stage → the same dealt expansion');
    const recordBefore = JSON.stringify(recordedRec);
    expandCreatureInstances(recordedScene(), over, opts);
    assert.equal(JSON.stringify(recordedRec), recordBefore, 'the deal is derived, never stored into the record');
    assert.ok(!('motion' in recordedRig.bones[1]), 'the sanitized rig itself gains no dealt entry');
  });

  ok('the deal: precedence — a recorded motion is never overridden by the deal', () => {
    const over = overlayOf(recordedRec);
    const base = { poseFigure, seed: 7, t: 1.7, fitOf: davisFitOf(over) };
    const dealt = expandCreatureInstances(recordedScene(), over, { ...base, sourcePalette: ['kineme:bob'] });
    const undealt = expandCreatureInstances(recordedScene(), over, base);
    // the head is a root on a recorded kineme:rock — the deal (bob, the whole palette) cannot touch it
    assert.deepEqual(partOf(dealt, 'R#h'), partOf(undealt, 'R#h'), 'the recorded head poses identically, dealt or not');
    // the l1.0 root is recorded 'gait' — likewise untouchable
    assert.deepEqual(partOf(dealt, 'R#l1.0'), partOf(undealt, 'R#l1.0'), 'the recorded gait bone poses identically');
    // the bare l0.0 root IS dealt: bob moves it off its native pose
    assert.notDeepEqual(partOf(dealt, 'R#l0.0'), partOf(undealt, 'R#l0.0'), 'the bare bone takes the dealt source');
    // and the recorded source is really rock, not the palette's bob: a head recorded bob poses elsewhere
    const bobRig = sanitizeRig({
      body: 'geo_circle_01',
      bones: recordedRig.bones.map((bb) => (bb.id === 'h' ? { ...bb, motion: { source: 'kineme:bob' } } : bb)),
    });
    const bobRec = { ...recordedRec, rig: bobRig };
    const bobOut = expandCreatureInstances(recordedScene(), overlayOf(bobRec), base);
    assert.notDeepEqual(partOf(bobOut, 'R#h'), partOf(undealt, 'R#h'), 'rock and bob pose the head differently');
  });

  ok('the deal: Lois still moves — his face chooses the gait for gait-sourced bones through the re-pipe', () => {
    const over = overlayOf(recordedRec);
    const at = (face) =>
      expandCreatureInstances(recordedScene(), over, { poseFigure, seed: 7, t: 1.3, face, fitOf: davisFitOf(over) });
    const nod = at('NOD');
    const burn = at('BURN');
    assert.notDeepEqual(partOf(burn, 'R#l1.0'), partOf(nod, 'R#l1.0'), 'the gait bone answers Lois’s face');
    // a foreign bone composes over the gait-shaped rest (step 3.1's composition: rest is poseRig at
    // t = 0 under the standing gait), so Lois's face re-bases the figure under it — but the kineme's
    // own delta from that rest is hers alone, identical under every face
    const deltaOf = (face) => {
      const posed = poseFigure(recordedRig, 1.3, { face, phase: 0.25, seedOffset: 3, tileKey: 'R' });
      const rest = poseRig(recordedRig, 0, gaitFor(face), 0.25);
      return posed[0].angle - rest[0].angle; // the head is bones[0]
    };
    assert.ok(Math.abs(deltaOf('NOD') - deltaOf('BURN')) < 1e-9, 'the kineme delta is face-independent');
    assert.ok(Math.abs(deltaOf('NOD')) > 0.5, 'and it is a real delta, not rest in disguise');
  });

  ok('the deal: a new seed re-deals at expansion; every copy of a figure is dealt the same sources', () => {
    const over = overlayOf(creatureTileRec);
    const sig = (seed) =>
      JSON.stringify(
        expandCreatureInstances(creatureScene(), over, {
          poseFigure,
          sourcePalette: PALETTE3,
          seed,
          t: 0.9,
          fitOf: davisFitOf(over),
        }).map((i) => [i.key, i.x, i.y, i.rotation]),
      );
    const sigs = new Set();
    for (let seed = 1; seed <= 30; seed++) sigs.add(sig(seed));
    assert.ok(sigs.size >= 2, 'a new seed re-deals the figure’s bones');
    // two copies of one tile, same key and seedOffset, different places on the stage: the deal key
    // carries no copy identity, so their bones take the same sources — the parts' rotations (a pure
    // function of the posed bone angles) agree exactly, translation aside
    const two = [
      ...STAGE.map((id, i) => inst(id, `s${i}`)),
      inst(creatureTileRec.id, 'C', { x: 200, y: 200, scaleX: 2, scaleY: 2, seedOffset: 3 }),
      inst(creatureTileRec.id, 'C', { x: 640, y: 480, scaleX: 2, scaleY: 2, seedOffset: 3 }),
    ];
    const out = expandCreatureInstances(two, over, {
      poseFigure,
      sourcePalette: PALETTE3,
      seed: 7,
      t: 0.9,
      fitOf: davisFitOf(over),
    });
    const parts = out.filter((i) => i.key.startsWith('C#'));
    assert.equal(parts.length, creatureTileRec.rig.bones.length * 2, 'both copies expand');
    const rots = parts.map((p) => p.rotation);
    assert.deepEqual(
      rots.slice(0, rots.length / 2),
      rots.slice(rots.length / 2),
      'copy two’s bones turn exactly as copy one’s — the same sources were dealt',
    );
  });

  ok('the deal: frozen never evaluates a source — dealt or recorded, a frozen figure is its rest pose', () => {
    const over = overlayOf(recordedRec);
    const frozenDealt = expandCreatureInstances(recordedScene(), over, {
      poseFigure,
      sourcePalette: PALETTE3,
      seed: 7,
      t: 5,
      frozen: true,
      fitOf: davisFitOf(over),
    });
    const frozenLegacy = expandCreatureInstances(recordedScene(), over, {
      seed: 7,
      t: 5,
      frozen: true,
      fitOf: davisFitOf(over),
    });
    assert.deepEqual(roundTrip(frozenDealt), roundTrip(frozenLegacy), 'frozen through the re-pipe = the rest pose');
  });

  // ── the mobile through the seam ─────────────────────────────────────────────────────────────
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
    ],
  };
  const mobileTileRec = sanitizeOverlay([mobileTile(MOBILE_RECORD, body('geo_circle_01'))])[0];
  const mobileScene = () => [
    ...STAGE.map((id, i) => inst(id, `s${i}`)),
    inst(mobileTileRec.id, 'M', { x: 400, y: 200, scaleX: 2, scaleY: 2, seedOffset: 3 }),
  ];
  const PART_FILL = 1.7; // creatureRig's own constant — pinned here on purpose: a part's box spans this much of its bone
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const radOf = (d) => (d * Math.PI) / 180;
  // one part as the expansion must place it, from a posed bone — placePart's math, restated
  const expectedPart = (it, p, asset, glow) => {
    const th = radOf(it.rotation);
    const co = Math.cos(th);
    const si = Math.sin(th);
    const flip = it.scaleX < 0 ? -1 : 1;
    const lx = ((p.x + p.tx) / 2 - 50) * it.scaleX;
    const ly = ((p.y + p.ty) / 2 - 50) * it.scaleY;
    const s = (p.len * PART_FILL) / 100;
    return {
      asset,
      key: `${it.key}#${p.id}`,
      x: r3(it.x + lx * co - ly * si),
      y: r3(it.y + lx * si + ly * co),
      scaleX: r3(Math.abs(it.scaleX) * s * flip),
      scaleY: r3(it.scaleY * s),
      rotation: r3(it.rotation + flip * (p.angle + 90)),
      opacity: r3(it.opacity * glow),
    };
  };
  const mobilePartsMatch = (out, it, posed, glow) => {
    const rig = sanitizeRig(mobileTileRec.rig);
    const pile = [...STAGE].sort();
    posed.forEach((p, i) => {
      const got = partOf(out, `${it.key}#${p.id}`);
      assert.ok(got, `${p.id}: a part was placed`);
      const want = expectedPart(it, p, got.asset, glow);
      for (const k of ['key', 'x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'])
        assert.equal(got[k], want[k], `${p.id}.${k}: the part rides its posed bone`);
      assert.equal(rig.bones[i].id, p.id, 'pose order is rig order');
    });
  };

  ok('the mobile through the seam: posed from its authored rest on its own sources — the tree path is retired', () => {
    const over = overlayOf(mobileTileRec);
    const it = mobileScene().at(-1);
    const t = 1.7;
    const out = expandCreatureInstances(mobileScene(), over, { poseFigure, seed: 7, t });
    const rig = sanitizeRig(mobileTileRec.rig);
    const posed = poseFigure(rig, t, { seedOffset: it.seedOffset, tileKey: it.key });
    mobilePartsMatch(out, it, posed, kinShimmer(mobileTileRec.id.replace(/^user:/, ''), t));
    const legacy = expandCreatureInstances(mobileScene(), over, { seed: 7, t });
    assert.notDeepEqual(
      roundTrip(out.filter((i) => i.key.startsWith('M#'))),
      roundTrip(legacy.filter((i) => i.key.startsWith('M#'))),
      'the seam’s mobile is not the gait-posed mobile of the old tree path',
    );
  });

  ok('the mobile through the seam: frozen is the authored hang, exactly', () => {
    const over = overlayOf(mobileTileRec);
    const it = mobileScene().at(-1);
    const out = expandCreatureInstances(mobileScene(), over, { poseFigure, seed: 7, t: 5, frozen: true });
    const rig = sanitizeRig(mobileTileRec.rig);
    // the authored hang, composed by hand: roots at their hang points, children on their parent's tip
    const posed = new Map();
    const rest = rig.bones.map((b) => {
      const p = b.parent ? posed.get(b.parent) : null;
      const x = p ? p.tx : b.x;
      const y = p ? p.ty : b.y;
      const angle = (p ? p.angle : 0) + b.angle;
      const o = {
        id: b.id,
        role: b.role,
        x,
        y,
        angle,
        len: b.len,
        tx: x + Math.cos(radOf(angle)) * b.len,
        ty: y + Math.sin(radOf(angle)) * b.len,
      };
      posed.set(b.id, o);
      return o;
    });
    mobilePartsMatch(out, it, rest, 1);
  });

  // ── the deal at the real contract ───────────────────────────────────────────────────────────
  const contractWith = (tile, doc = {}) =>
    buildSceneContract({
      doc: { seed: 7, kinemeTime: 0.9, customAssets: [tile], ...doc },
      resolvedLayers: [
        {
          id: 'L',
          isFx: false,
          items: [
            {
              assetId: tile.id,
              x: 300,
              y: 240,
              scale: 2,
              rotation: 0,
              key: 'C',
              color: '#1b1b1b',
              accent: '#e8553a',
              alpha: 100,
              seedOffset: 3,
            },
            {
              assetId: 'geo_hex_01',
              x: 120,
              y: 120,
              scale: 1,
              rotation: 15,
              key: 'M1',
              color: '#1b1b1b',
              accent: '#e8553a',
              alpha: 100,
              seedOffset: 1,
            },
            {
              assetId: 'org_petal_01',
              x: 800,
              y: 160,
              scale: 1,
              rotation: -10,
              key: 'M2',
              color: '#1b1b1b',
              accent: '#e8553a',
              alpha: 100,
              seedOffset: 2,
            },
          ],
        },
      ],
    });
  const cParts = (c) => c.instances.filter((i) => i.key.startsWith('C#')).map((i) => [i.key, i.x, i.y, i.rotation]);

  ok('the contract: a kineme running on the stage is dealt to the creature’s bare bones through the seam', () => {
    const running = contractWith(creatureTileRec, { assetKineme: { geo_hex_01: 'rock' } });
    const still = contractWith(creatureTileRec);
    assert.ok(
      running.kinemes?.some((e) => e.kind === 2 && e.period === 2.4),
      'the stage really is running rock (the osc table entry)',
    );
    assert.notDeepEqual(cParts(running), cParts(still), 'the dealt creature poses differently from the undealt one');
    assert.deepEqual(
      cParts(contractWith(creatureTileRec, { assetKineme: { geo_hex_01: 'rock' } })),
      cParts(running),
      'and the dealt contract is deterministic',
    );
  });

  ok('the contract: a fully recorded figure is untouchable — the deal passes it by', () => {
    const motion = Object.fromEntries(creatureTileRec.rig.bones.map((b) => [b.id, { source: 'kineme:bob' }]));
    const recordedTile = sanitizeOverlay([creatureTile({ ...creatureRecord, motion }, body('org_blob_01'))])[0];
    assert.ok(
      recordedTile.rig.bones.every((b) => b.motion?.source === 'kineme:bob'),
      'fixture: every bone recorded',
    );
    const running = contractWith(recordedTile, { assetKineme: { geo_hex_01: 'rock' } });
    const still = contractWith(recordedTile);
    assert.deepEqual(cParts(running), cParts(still), 'with every bone recorded, a running kineme changes nothing');
  });

  console.log(`creatureRepipe.selfcheck: ${n} groups passed`);
}
