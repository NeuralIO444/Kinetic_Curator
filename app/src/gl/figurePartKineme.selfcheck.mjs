// figurePartKineme.selfcheck.mjs — #2119 Motion Core P7, step 1: pin what already works.
//
// Phase 0's question: does a creature or beast PART receive its asset kineme and its region
// kinemes? The answer on current main is YES, by ordering: buildSceneContract expands creature
// rigs into ordinary instances FIRST (gl/sceneContract.js, expandCreatureInstances) and only
// then runs the kineme pass and the region-kineme pass over the already-expanded list. A part
// (key `<body key>#<bone id>`) is an ordinary instance by then, so it takes its OWN asset's
// kineme at its OWN phase — kinemePhase(inst.seedOffset, inst.key) — never the body's.
//
// This suite pins that behaviour on sceneContract OUTPUT so P7 step 3 (figures re-piped
// through poseFigure) cannot silently break the ordering. Zero behaviour change: the pins
// describe the contract exactly as it is built today.
//
// Region kinemes resolve per ASSET over the same expanded list: the contract carries them as
// regionAnim.assets[assetId] = { regionId: slot }, slots into the same kineme table. A part
// "carries" its region kinemes by being an instance of that asset — the solo-creature case
// below proves the entry exists because of parts alone (no ordinary instance of the asset
// is on stage).
import assert from 'node:assert/strict';
import { buildSceneContract, serializeSceneContract, assertSceneContract } from './sceneContract.js';
import { sourceRecord } from '../engine/creatureBreed.js';
import { creatureTile } from '../engine/creatureAssembler.js';
import { dealBeastMeasures, beastTile } from '../engine/beastTile.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { ASSETS } from '../data/assets/index.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { KINEME_KINDS, getKineme, kinemePhase } from '../data/kinemes.js';
import { regionsForAsset, regionAssignmentFor, bendSlicesFor, REGION_TAG_CAP } from '../data/regionKinemes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const body = (id) => ASSETS.find((a) => a.id === id);
const tableEntry = (kid) => {
  const k = getKineme(kid);
  return { kind: KINEME_KINDS[k.kind], period: k.period, amp: k.amp };
};
// a founder creature: one head point, two limb points (head bone + two 2-bone chains = 5 parts)
const POINTS = [
  { x: 50, y: 5, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
];
const founderTile = (bodyId) => {
  const rec = sourceRecord(
    { kind: 'assembly', assetId: bodyId, points: POINTS, lookId: COMPOSITION_PRESETS[0].id, voiceId: VOICE_DECK[0].id },
    11,
  );
  assert.ok(rec, `fixture: a founder on ${bodyId}`);
  return sanitizeOverlay([creatureTile(rec, body(rec.body))])[0];
};
// a solo stage: the creature tile alone, so Davis deals every part from the creature's own body shape
const soloContract = (tile, doc = {}) =>
  buildSceneContract({
    doc: { seed: 7, customAssets: [tile], kinemeTime: 0.4, ...doc },
    resolvedLayers: [
      {
        id: 'L',
        isFx: false,
        items: [
          {
            assetId: tile.id,
            x: 300,
            y: 300,
            scale: 2,
            rotation: 0,
            key: 'C',
            color: '#1b1b1b',
            accent: '#e8553a',
            alpha: 100,
            seedOffset: 3,
          },
        ],
      },
    ],
  });
const partsOf = (c, key = 'C') => c.instances.filter((i) => i.key.startsWith(`${key}#`));

// line_squiggle_03: baked regions with a family-default assignment (rm-000000-4-4 -> bend)
const SQUIGGLE = 'line_squiggle_03';
const squiggleTile = founderTile(SQUIGGLE);
const squiggle = soloContract(squiggleTile, { assetKineme: { [SQUIGGLE]: 'pulse' } });

ok('part kineme: a part whose asset has an assetKineme entry carries that kineme slot', () => {
  const parts = partsOf(squiggle);
  assert.equal(parts.length, squiggleTile.rig.bones.length, 'one instance per bone');
  assert.ok(
    parts.every((p) => p.asset === SQUIGGLE),
    'solo: every part wears the body shape',
  );
  const slot = parts[0].kineme;
  assert.ok(Number.isInteger(slot) && slot >= 1, 'the part carries a 1-based table slot');
  assert.ok(
    parts.every((p) => p.kineme === slot),
    'every part of the asset shares the slot',
  );
  assert.deepEqual(squiggle.kinemes[slot - 1], tableEntry('pulse'), 'the slot is the asset’s own kineme');
});

ok('part phase: the phase is the part’s own — kinemePhase(seedOffset, part key), not the body’s', () => {
  const parts = partsOf(squiggle);
  for (const p of parts) {
    assert.equal(p.seedOffset, 3, 'the part inherits the body mark’s seed offset');
    assert.equal(p.kinemePhase, kinemePhase(p.seedOffset, p.key), `${p.key}: phase from its own key`);
  }
  assert.equal(new Set(parts.map((p) => p.kinemePhase)).size, parts.length, 'each bone its own phase');
  const bodyInst = squiggle.instances.find((i) => i.key === 'C');
  assert.equal(bodyInst.kineme, undefined, 'the tile mark itself has no assetKineme entry');
  assert.equal(bodyInst.kinemePhase, undefined);
  assert.ok(
    parts.every((p) => p.kinemePhase !== kinemePhase(3, 'C')),
    'no part rides the body key’s phase',
  );
});

ok('no entry, no kineme: a part whose asset has no assetKineme entry carries neither field', () => {
  const blobTile = founderTile('org_blob_01');
  const c = soloContract(blobTile, { assetKineme: { geo_hex_01: 'rock' } }); // an asset that is not on stage
  const parts = partsOf(c);
  assert.equal(parts.length, blobTile.rig.bones.length);
  assert.ok(parts.every((p) => p.asset === 'org_blob_01'));
  for (const p of parts) {
    assert.equal(p.kineme, undefined, `${p.key}: no kineme`);
    assert.equal(p.kinemePhase, undefined, `${p.key}: no phase`);
  }
  assert.equal(c.kinemes, undefined, 'nothing moves: no table rides the contract');
});

ok('region kinemes: a part’s asset regions ride regionAnim, keyed by asset, into the same table', () => {
  // the solo stage holds NO ordinary squiggle instance — the region entry exists because of parts alone
  assert.ok(
    squiggle.instances.filter((i) => i.asset === SQUIGGLE).every((i) => i.key.includes('#')),
    'every squiggle instance is a part',
  );
  const ra = squiggle.regionAnim;
  assert.ok(ra, 'regionAnim rides the contract');
  assert.equal(ra.budget, REGION_TAG_CAP, 'the default budget (no governor state in the doc)');
  const assignment = regionAssignmentFor(SQUIGGLE, undefined, undefined);
  assert.ok(assignment, 'fixture: the squiggle carries a family-default assignment');
  assert.deepEqual(Object.keys(ra.assets), [SQUIGGLE], 'one asset entry: the part’s asset');
  assert.deepEqual(Object.keys(ra.assets[SQUIGGLE]), Object.keys(assignment), 'the assigned regions');
  for (const [regionId, kid] of Object.entries(assignment)) {
    const slot = ra.assets[SQUIGGLE][regionId];
    assert.ok(Number.isInteger(slot) && slot >= 1, `${regionId}: selected within budget`);
    assert.deepEqual(squiggle.kinemes[slot - 1], tableEntry(kid), `${regionId}: the slot is its kineme (${kid})`);
  }
  // the bend on a stroke region subdivides: the slice count rides regionAnim.bend
  const record = regionsForAsset(SQUIGGLE)[0];
  assert.equal(ra.bend[SQUIGGLE][record.id], bendSlicesFor(record), 'bend slices for the stroke region');
});

ok('region negative: regions without an assignment emit no regionAnim', () => {
  assert.ok(regionsForAsset('org_blob_01'), 'fixture: the blob has baked regions');
  assert.equal(regionAssignmentFor('org_blob_01', undefined, undefined), null, 'fixture: but no assignment');
  const blobTile = founderTile('org_blob_01');
  const c = soloContract(blobTile, {});
  assert.ok(partsOf(c).length > 0, 'parts are on stage');
  assert.equal(c.regionAnim, undefined, 'no assignment anywhere: no regionAnim key');
});

ok('beast parts: the linkage’s bars take their asset kineme the same way', () => {
  const m0 = dealBeastMeasures(7, 0);
  const tile = beastTile(m0);
  const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
  const items = [
    { assetId: tile.id, x: 300, y: 270, scale: 3, rotation: 0, key: 'b' },
    ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 150, y: 470, scale: 0.6, rotation: 0, key: `s${i}` })),
  ].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
  const c = buildSceneContract({
    doc: {
      seed: 7,
      customAssets: [tile],
      kinemeTime: 0.4,
      assetKineme: Object.fromEntries(STAGE.map((id) => [id, 'rock'])),
    },
    resolvedLayers: [{ id: 'L', isFx: false, items }],
  });
  const parts = c.instances.filter((i) => i.key.startsWith('b#'));
  assert.equal(parts.length, 1 + m0.legCount * 12, 'beam + 12 bars on every leg');
  const slot = parts[0].kineme;
  assert.ok(Number.isInteger(slot) && slot >= 1, 'a beast part carries a table slot');
  assert.deepEqual(c.kinemes[slot - 1], tableEntry('rock'), 'the slot is the dealt asset’s kineme');
  for (const p of parts) {
    assert.equal(p.kineme, slot, `${p.key}: the rock slot`);
    assert.equal(p.kinemePhase, kinemePhase(p.seedOffset, p.key), `${p.key}: phase from its own key`);
  }
  assert.ok(new Set(parts.map((p) => p.kinemePhase)).size > 1, 'the bars do not move in lockstep');
});

ok('determinism: the same doc builds a byte-identical contract twice', () => {
  const a = serializeSceneContract(soloContract(founderTile(SQUIGGLE), { assetKineme: { [SQUIGGLE]: 'pulse' } }));
  const b = serializeSceneContract(soloContract(founderTile(SQUIGGLE), { assetKineme: { [SQUIGGLE]: 'pulse' } }));
  assert.equal(a, b);
  assert.doesNotThrow(() => assertSceneContract(squiggle), 'the creature contract validates');
});

console.log(`figurePartKineme.selfcheck: OK (${n} cases)`);
