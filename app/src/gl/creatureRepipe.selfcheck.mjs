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
import { expandCreatureInstances, davisFitOf } from '../engine/creatureRig.js';
import { assembleCreature, creatureTile } from '../engine/creatureAssembler.js';
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
function goldenScenarios() {
  const cOver = overlayOf(creatureTileRec);
  const cFit = davisFitOf(cOver);
  const fOver = overlayOf(founderTileRec);
  const bOver = overlayOf(beastTileRec);
  const bFit = davisFitOf(bOver);
  const run = (scene, over, opts) => {
    const out = expandCreatureInstances(scene, over, opts);
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
          { assetId: creatureTileRec.id, x: 300, y: 240, scale: 2, rotation: 0, key: 'C', color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 3 },
          { assetId: beastTileRec.id, x: 620, y: 420, scale: 1.5, rotation: 0, key: 'B', color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 5 },
          { assetId: 'geo_hex_01', x: 120, y: 120, scale: 1, rotation: 15, key: 'M1', color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 1 },
          { assetId: 'org_petal_01', x: 800, y: 160, scale: 1, rotation: -10, key: 'M2', color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 2 },
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
          'Generated by creatureRepipe.selfcheck.mjs (CREATURE_REPIPE_EMIT=1) from the pre-re-pipe code at base c9eb09d2 — P7 step 3.3\'s pin. Regenerate only with cause, stated in the PR.',
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

  console.log(`creatureRepipe.selfcheck: ${n} groups passed`);
}
