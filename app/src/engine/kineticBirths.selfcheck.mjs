// kineticBirths.selfcheck.mjs — #2037: KINETIC births — the deal can breed.
//
// The issue's six rulings + the pre-made-hand amendment, one check each:
//   gate       no roll under 3 parents: a press against a smaller population does not roll at all
//   rate       the chance is the named constant KINETIC_BIRTH_RATE = 1/8 (pinned), and the seeded
//              stream honours it statistically over thousands of recorded seeds
//   cultivate  the gate: stillborns never reach the stage — not from the hand, not from the spot
//   hand       the pre-made hand: pre-bred + pre-cultivated on the population, pure in its inputs;
//              the trio's scores order it and only order it (permuting scores permutes the order,
//              the set never changes, a zero-scored top still births); an empty or stale hand falls
//              back to breeding on the spot under the same gate
//   freeze     divergent-freeze parents decline safely through the standing door: no child, no crash
//   stage      a viable child is born ON STAGE through a real KINETIC press: tile enabled, record
//              unbanked, carrying its cultivation note and its ancestry
//   bank       banking only on a kept take: the take's births section names the child, and only the
//              keep path (bankStageBirths, the bank's own door) moves it into the bank + overlay
//   replay     determinism: the same recorded conversation (seed + press sequence) births the
//              identical child across fresh store runs, and the child's frames are identical across
//              fresh resolvers and across snapshot/restore
import assert from 'node:assert/strict';
import {
  KINETIC_BIRTH_RATE,
  KINETIC_BIRTH_HAND_SIZE,
  birthRoll,
  birthFingerprint,
  deriveBirthHand,
  orderBirthHand,
  breedOnTheSpot,
  resolveBirthPress,
  poolWithBirths,
} from './kineticBirths.mjs';
import { breedCreature, sourceRecord, handEditRecord, MUTATION_RATE, BREED_PARENTS } from './creatureBreed.js';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  creatureTile,
  creatureTileId,
  skeletonFounder,
} from './creatureAssembler.js';
import { birthPopulation, noteBirthPopulation, resetBirthHand } from '../curator/birthLive.mjs';
import { createBirthRecorder, setBirthTap, noteBirth, birthRecordsFromSection } from '../curator/birthRecord.mjs';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { ASSETS } from '../data/assets/index.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const bytes = (v) => JSON.stringify(v);
const LOOKS = COMPOSITION_PRESETS.map((p) => p.id);
const VOICES = VOICE_DECK.map((v) => v.id);
const findAsset = (id) => ASSETS.find((a) => a.id === id) || null;

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
    'org_blob_02',
    [
      { x: 50, y: 10, role: 'H' },
      { x: 30, y: 80, role: 'L' },
      { x: 70, y: 80, role: 'L' },
    ],
  ],
];
const parentRecords = (seed, count = 4) =>
  [0, 1, 2, 3]
    .slice(0, count)
    .map((i) =>
      sourceRecord(
        { kind: 'assembly', assetId: SHAPES[i][0], points: SHAPES[i][1], lookId: LOOKS[i * 2], voiceId: VOICES[i] },
        seed,
      ),
    );
const popOf = (records, seed, extra = {}) => ({
  seed,
  sources: records.map((r) => ({ key: `cr:${r.id}`, src: { kind: 'creature', record: r } })),
  presentIds: records.map((r) => r.id),
  assetsById: new Map(ASSETS.map((a) => [a.id, a])),
  lookId: LOOKS[0],
  voiceId: VOICES[0],
  ...extra,
});
/** The first press (from 1) whose birth die hits under this seed — the recorded conversation's own scan. */
const firstHitPress = (seed, pop) => {
  for (let press = 1; press <= 256; press++) if (birthRoll(seed, press) < KINETIC_BIRTH_RATE) return press;
  return -1;
};

// ── the constant + the rate ─────────────────────────────────────────────
ok('rate: the chance is a named constant, 1 in 8, beside the mutation precedent', () => {
  assert.equal(KINETIC_BIRTH_RATE, 1 / 8);
  assert.equal(MUTATION_RATE, 1 / 8, "breeding's own 1-in-8 precedent stands untouched");
  assert.ok(
    Number.isInteger(KINETIC_BIRTH_HAND_SIZE) && KINETIC_BIRTH_HAND_SIZE >= 1,
    'the hand size is a named constant',
  );
  assert.equal(BREED_PARENTS, 3, 'the triad law the gate counts by');
});

ok('rate: the seeded stream honours 1-in-8 over thousands of recorded seeds', () => {
  let hits = 0;
  const N = 8000;
  for (let seed = 1; seed <= N; seed++) if (birthRoll(seed, 1) < KINETIC_BIRTH_RATE) hits++;
  const frac = hits / N;
  assert.ok(frac > 0.1 && frac < 0.155, `press-1 hit fraction ${frac} is ~1/8`);
  // and down a single recorded conversation: the presses of one seed hit at the same rate
  let h2 = 0;
  const M = 4000;
  for (let press = 1; press <= M; press++) if (birthRoll(0xa17e9b21, press) < KINETIC_BIRTH_RATE) h2++;
  const frac2 = h2 / M;
  assert.ok(frac2 > 0.1 && frac2 < 0.155, `per-press hit fraction ${frac2} is ~1/8`);
});

// ── the gate: no roll under 3 parents ───────────────────────────────────
ok('gate: under 3 parents the press does not roll at all', () => {
  for (const count of [0, 1, 2]) {
    const pop = popOf(parentRecords(99, Math.max(count, 1)).slice(0, count), 99);
    for (let press = 1; press <= 64; press++) {
      const res = resolveBirthPress({ pop, press, hand: null });
      assert.equal(res.rolled, false, `${count} parents: no roll`);
      assert.equal(res.reason, 'parents');
    }
  }
});

// ── the hand ────────────────────────────────────────────────────────────
ok('hand: pre-bred and pre-cultivated — every candidate viable, noted, with ancestry', () => {
  const pop = popOf(parentRecords(1234), 1234);
  const hand = deriveBirthHand(pop);
  assert.ok(
    hand.candidates.length >= 1 && hand.candidates.length <= KINETIC_BIRTH_HAND_SIZE,
    'the hand holds up to the named size',
  );
  for (const c of hand.candidates) {
    assert.equal(c.record.cultivated && c.record.cultivated.outcome, 'viable', 'pre-cultivated through the gate');
    assert.ok(sanitizeCreatureRecord(c.record), 'the candidate passes the door');
    assert.ok(Array.isArray(c.record.ancestry) && c.record.ancestry.length >= 3, 'ancestry written at birth (#2030)');
    assert.deepEqual(
      [...c.record.lineage.parents].sort(),
      c.record.ancestry
        .slice(0, 3)
        .map((e) => e.id)
        .sort(),
      'the triad law: exactly the three parents',
    );
  }
});

ok('hand: a pure function of the population — same population in, identical hand out', () => {
  const pop = popOf(parentRecords(1234), 1234);
  assert.equal(bytes(deriveBirthHand(pop)), bytes(deriveBirthHand(pop)));
  assert.equal(birthFingerprint(pop), deriveBirthHand(pop).fingerprint);
});

ok('hand: trio scores order and only order — permuting scores permutes the order, never the set', () => {
  const pop = popOf(parentRecords(1234), 1234);
  const recs = deriveBirthHand(pop).candidates.map((c) => c.record);
  assert.ok(recs.length >= 2, 'the fixture hand holds more than one candidate');
  const byReal = orderBirthHand(recs, { lookId: LOOKS[0], voiceId: VOICES[0] });
  assert.deepEqual(byReal.map((c) => c.record.id).sort(), recs.map((r) => r.id).sort(), 'the same set, reordered');
  for (let i = 1; i < byReal.length; i++)
    assert.ok(byReal[i - 1].scores.total >= byReal[i].scores.total, 'standing order is score order');
  // an injected scorer demanding the exact reverse of the standing order must get it — order
  // follows scores alone, and the set still never changes
  const desired = byReal.map((c) => c.record.id).reverse();
  const flipped = orderBirthHand(recs, {}, (r) => ({
    lois: 0,
    davis: 0,
    te: 0,
    total: desired.length - desired.indexOf(r.id),
  }));
  assert.deepEqual(
    flipped.map((c) => c.record.id),
    desired,
    'scores permute the order',
  );
});

ok('hand: scores never gate — a zero-scored top of hand still births when the dice call', () => {
  const pop = popOf(parentRecords(1234), 1234);
  const press = firstHitPress(pop.seed, pop);
  assert.ok(press > 0, 'the fixture seed has a hitting press');
  const only = deriveBirthHand(pop).candidates[0].record;
  const hand = {
    fingerprint: birthFingerprint(pop),
    candidates: [{ record: only, scores: { lois: 0, davis: 0, te: 0, total: 0 } }],
  };
  const res = resolveBirthPress({ pop, press, hand });
  assert.equal(res.outcome, 'born');
  assert.equal(res.via, 'hand');
  assert.equal(res.record.id, only.id, 'the ranked-last child births: ranking is not a gate');
});

ok('hand: an empty hand falls back to breeding on the spot, under the same gate', () => {
  const pop = popOf(parentRecords(1234), 1234);
  const press = firstHitPress(pop.seed, pop);
  const empty = { fingerprint: birthFingerprint(pop), candidates: [] };
  const res = resolveBirthPress({ pop, press, hand: empty });
  assert.equal(res.via, 'spot');
  assert.equal(res.outcome, 'born', 'the spot breed produced a viable child');
  assert.ok(res.record.cultivated && res.record.cultivated.outcome === 'viable');
});

ok('hand: a stale hand (another population’s fingerprint) is not used — the press breeds on the spot', () => {
  const popA = popOf(parentRecords(1234), 1234);
  const popB = popOf(parentRecords(4321), 4321);
  const handA = deriveBirthHand(popA);
  assert.notEqual(handA.fingerprint, birthFingerprint(popB));
  const press = firstHitPress(popB.seed, popB);
  const res = resolveBirthPress({ pop: popB, press, hand: handA });
  assert.equal(res.via, 'spot', 'the stale hand was passed by');
});

// ── the cultivate gate ──────────────────────────────────────────────────
ok('cultivate: stillborns die in the hand — a population whose bodies cannot be drawn fills no hand', () => {
  const ghost = popOf(parentRecords(1234), 1234, { assetsById: new Map() });
  const hand = deriveBirthHand(ghost);
  assert.equal(hand.candidates.length, 0, 'no viable candidates');
  assert.ok(hand.stillborns > 0, 'the stillborns are on the record');
});

ok('cultivate: the spot fallback is gated too — a called birth that reads stillborn never appears', () => {
  const ghost = popOf(parentRecords(1234), 1234, { assetsById: new Map() });
  const press = firstHitPress(ghost.seed, ghost);
  const res = resolveBirthPress({ pop: ghost, press, hand: null });
  assert.equal(res.rolled, true, 'the dice called');
  assert.equal(res.outcome, 'stillborn');
  assert.equal(res.record, undefined, 'no child reaches the stage');
  assert.equal(breedOnTheSpot(ghost, press).outcome, 'stillborn');
});

// ── the merge law: divergent freezes decline safely ─────────────────────
ok('freeze: divergent-freeze parents decline safely — no child, no crash, and the control breeds', () => {
  const trio = parentRecords(7, 3);
  const childA = breedCreature(trio, 42);
  const edited = handEditRecord(trio[0], { action: 'mutate', family: 'LOOK', id: 'look' }, { seed: 99 }).record;
  assert.ok(edited && edited.id === trio[0].id && edited.look !== trio[0].look, 'the parent was edited in place');
  const childB = breedCreature([edited, trio[1], trio[2]], 1);
  const childC = breedCreature(trio, 1001);
  assert.ok(childA && childB && childC, 'both lines bred while their freezes agreed internally');
  const divergent = popOf([childA, childB, childC], 555);
  const hand = deriveBirthHand(divergent);
  assert.equal(hand.candidates.length, 0, 'every triad of the divergent lines declines');
  const press = firstHitPress(555, divergent);
  const res = resolveBirthPress({ pop: divergent, press, hand });
  assert.equal(res.outcome, 'declined', 'the press records the decline and births nothing');
  // control: the same three children without the edit breed on
  const cleanB = breedCreature(trio, 1);
  const control = popOf([childA, cleanB, childC], 555);
  assert.ok(deriveBirthHand(control).candidates.length >= 1, 'the undiverged lines fill a hand');
});

// ── the store: births through real presses ──────────────────────────────
const stageStore = (seed, { parents = 3, voice = VOICES[0] } = {}) => {
  const records = parentRecords(seed, parents);
  const tiles = records.map((r) => creatureTile(r, findAsset(r.body), skeletonFounder(r, records)));
  const enabledAssets = {};
  for (const t of tiles) enabledAssets[t.id] = true;
  resetBirthHand();
  useStore.setState({
    seed,
    creatureRecords: records,
    customAssets: tiles,
    enabledAssets,
    stageBirths: [],
    kineticBirthPress: 0,
    kineticVoiceId: voice,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, composition: LOOKS[0] },
  });
  return records;
};
const pressUntilBirth = (max = 96) => {
  for (let i = 0; i < max; i++) {
    S().kineticCuratorPass();
    if (S().stageBirths.length) return S().stageBirths[S().stageBirths.length - 1];
  }
  return null;
};

ok('stage: the population read names exactly the standing sources — creatures on stage, never the stage itself', () => {
  const records = stageStore(1234);
  const pop = birthPopulation(S());
  assert.deepEqual(
    pop.sources.map((s) => s.key),
    records.map((r) => `cr:${r.id}`),
    'the three on-stage creatures, in canonical order',
  );
  // one creature swept off stage: the population shrinks by exactly that creature
  useStore.setState({ enabledAssets: { ...S().enabledAssets, [creatureTileId(records[0].id)]: false } });
  assert.equal(birthPopulation(S()).sources.length, 2, 'an off-stage creature is not a parent');
});

ok('stage: a KINETIC press births a viable child on stage — tile on, unbanked, noted, ancestored', () => {
  const records = stageStore(1234);
  noteBirthPopulation(S()); // the live loop's standing hand, as the loop would hold it
  const born = pressUntilBirth();
  assert.ok(born, 'a birth landed within 96 presses at 1-in-8');
  const st = S();
  assert.equal(st.enabledAssets[born.tile.id], true, 'the child stands enabled on the stage');
  assert.ok(!st.creatureRecords.some((r) => r.id === born.record.id), 'unbanked: not in the bank');
  assert.ok(!st.customAssets.some((a) => a.id === born.tile.id), 'unbanked: its tile is not in the overlay');
  assert.equal(born.record.cultivated.outcome, 'viable', 'the gate’s note rides the record');
  assert.ok(born.record.ancestry.length >= 3, 'ancestry written at birth');
  assert.ok(
    born.record.lineage.parents.every(
      (id) => records.some((r) => r.id === id) || st.stageBirths.some((b) => b.record.id === id),
    ),
    'the parents are the standing population’s creatures',
  );
});

ok('stage: an unkept child leaves no trace in a saved project', () => {
  stageStore(1234);
  noteBirthPopulation(S());
  const born = pressUntilBirth();
  assert.ok(born, 'fixture birth landed');
  const round = parseProject(serializeProject(S()));
  assert.ok(round.ok, 'the document parses');
  const back = round.doc;
  assert.ok(!(back.creatureRecords || []).some((r) => r.id === born.record.id), 'no record in the document');
  assert.ok(!(back.customAssets || []).some((a) => a.id === born.tile.id), 'no tile in the document');
  assert.ok(!bytes(back.enabledAssets || {}).includes(born.tile.id), 'the dangling enable is collapsed at load');
  assert.ok(!('stageBirths' in back), 'stageBirths is never serialized');
});

ok('stage: a press with too few parents writes nothing birth-shaped', () => {
  stageStore(777, { parents: 1, voice: null }); // one creature, no room voice → assemblies unavailable
  const before = {
    records: bytes(S().creatureRecords),
    overlay: bytes(S().customAssets),
    births: bytes(S().stageBirths),
  };
  for (let i = 0; i < 8; i++) S().kineticCuratorPass();
  assert.equal(S().kineticBirthPress, 8, 'the press counter still advances (it is the stream’s place)');
  assert.equal(bytes(S().creatureRecords), before.records);
  assert.equal(bytes(S().customAssets), before.overlay);
  assert.equal(bytes(S().stageBirths), before.births);
  assert.ok(
    !Object.keys(S().enabledAssets).some((id) => id.startsWith('user:cr-') && !before.overlay.includes(id)),
    'no birth tile appeared in the enabled set',
  );
});

// ── banking: only on a kept take ────────────────────────────────────────
ok('bank: the take records the birth, and only the keep banks it — through the bank’s own door', () => {
  stageStore(1234);
  noteBirthPopulation(S());
  // a take runs: the recorder hears the presses through the tap
  const rec = createBirthRecorder({ getFrame: () => 0 });
  setBirthTap((e) => rec.update(e));
  const born = pressUntilBirth();
  setBirthTap(null);
  assert.ok(born, 'a birth landed during the take');
  const section = rec.finish();
  const named = birthRecordsFromSection(section);
  assert.deepEqual(
    named.map((r) => r.id),
    [born.record.id],
    'the take names exactly the child born in it',
  );
  // before any keep: still unbanked
  assert.ok(!S().creatureRecords.some((r) => r.id === born.record.id), 'not banked by being recorded');
  // the keep
  S().bankStageBirths(named);
  const st = S();
  assert.ok(
    st.creatureRecords.some((r) => r.id === born.record.id),
    'banked on the keep',
  );
  assert.ok(
    st.customAssets.some((a) => a.id === born.tile.id),
    'its standing tile moved into the overlay',
  );
  assert.equal(st.stageBirths.length, 0, 'the stage-birth entry left with the banking');
  assert.equal(st.creatureBirthNote.status, 'banked');
  // and now the document keeps it, whole
  const round = parseProject(serializeProject(st));
  assert.ok(round.ok, 'the document parses');
  assert.ok(
    (round.doc.creatureRecords || []).some((r) => r.id === born.record.id),
    'the banked child survives save/load',
  );
});

ok('bank: nothing banks without a take’s word — empty sections and foreign records change nothing', () => {
  stageStore(1234);
  noteBirthPopulation(S());
  const born = pressUntilBirth();
  assert.ok(born, 'fixture birth landed');
  const before = bytes({ r: S().creatureRecords, c: S().customAssets, b: S().stageBirths });
  S().bankStageBirths([]);
  S().bankStageBirths(birthRecordsFromSection({ version: 1, events: [] }));
  assert.equal(
    bytes({ r: S().creatureRecords, c: S().customAssets, b: S().stageBirths }),
    before,
    'an empty keep banks nothing',
  );
  // a record that is not a standing stage birth cannot be smuggled into the bank through this door
  const foreign = assembleCreature({
    assetId: SHAPES[3][0],
    points: SHAPES[3][1],
    seed: 5,
    lookId: LOOKS[2],
    voiceId: VOICES[2],
  });
  S().bankStageBirths([foreign]);
  assert.ok(!S().creatureRecords.some((r) => r.id === foreign.id), 'a foreign record is refused');
  assert.equal(bytes({ r: S().creatureRecords, c: S().customAssets, b: S().stageBirths }), before);
});

ok('bank: a loaded project starts a new performance — unbanked children leave with the old one', () => {
  stageStore(1234);
  noteBirthPopulation(S());
  assert.ok(pressUntilBirth(), 'fixture birth landed');
  S().applyProject(serializeProject(S()));
  assert.deepEqual(S().stageBirths, [], 'stage births cleared at load');
});

// ── replay determinism ──────────────────────────────────────────────────
ok('replay: the same recorded conversation births the identical child across fresh runs', () => {
  const run = () => {
    stageStore(20250);
    noteBirthPopulation(S());
    const born = pressUntilBirth();
    return born ? bytes(born.record) : null;
  };
  const a = run();
  const b = run();
  assert.ok(a, 'the fixture conversation births');
  assert.equal(a, b, 'identical child, byte for byte');
});

ok('replay: the child’s frames are identical across fresh resolvers and across snapshot/restore', () => {
  stageStore(1234);
  noteBirthPopulation(S());
  const born = pressUntilBirth();
  assert.ok(born, 'fixture birth landed');
  const input = (t) => ({
    canvasW: 1000,
    canvasH: 700,
    layers: [{ id: 'lyr-a', name: 'lyr-a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seed: 4242,
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    caGrid: null,
    enabledAssets: { [born.tile.id]: true, org_blob_01: true, geo_tri_02: true },
    assetWeightOverrides: {},
    customAssets: poolWithBirths([], S().stageBirths),
    lockedParams: {},
    batchPaused: false,
    focusSwap: false,
    perfClampOverride: null,
    scaleMul: 1,
    alphaBoost: 0,
    phraseWrapGen: 0,
    reducedMotion: false,
    quality: 'balanced',
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    assetAttach: {},
    attractor: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 120, particleCount: 60 },
    loopTimeMs: t,
    dtSec: 1 / 60,
    creatureCount: 0,
  });
  const runFrames = (resolver, from, to) => {
    const out = [];
    for (let f = from; f < to; f++) out.push(bytes(resolver.resolveLayers(input(f * 16.7))));
    return out;
  };
  const r1 = createLiveResolver();
  const framesA = runFrames(r1, 0, 60);
  const r2 = createLiveResolver();
  assert.deepEqual(runFrames(r2, 0, 60), framesA, 'two fresh resolvers, identical frames');
  // the child is really placed, not just present in the pool
  const placed = framesA.some((f) => f.includes(born.tile.id));
  assert.ok(placed, 'the stage-born child is placed by the resolver');
  // snapshot mid-run, restore into a fresh resolver, continue: identical continuation
  const snap = r1.snapshotState();
  const r3 = createLiveResolver();
  assert.ok(r3.restoreState(snap), 'the snapshot restores');
  assert.deepEqual(runFrames(r3, 60, 90), runFrames(r1, 60, 90), 'the restored resolver continues identically');
  r1.dispose();
  r2.dispose();
  r3.dispose();
});

console.log(`kineticBirths.selfcheck: ${n} checks passed`);
