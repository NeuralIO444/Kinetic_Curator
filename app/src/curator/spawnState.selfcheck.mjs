// node src/curator/spawnState.selfcheck.mjs
// #1694 slice 1 — the re-homed spawn channel: (1) the OLD wiring (App's tap driving the formationLive /
// spawnLive facades) and the NEW wiring (a spawn state observing through the resolver's path) produce
// IDENTICAL decision sequences on identical frames — the repipe changed where the channel lives, not
// what it decides; (2) the channel rides the resolver snapshot: a creature-bearing session snapshotted
// mid-flight continues identically in a fresh resolver, decisions included; (3) a pre-repipe snapshot
// (no `spawn` key) still restores and replays its recorded inputs identically; (4) malformed spawn
// snapshots are refused, fail-closed.
import assert from 'node:assert/strict';
import { createCreatureSpawnState } from './spawnState.js';
import {
  observeFormation,
  resetFormation,
  getFormedPins,
  getLimbPairs,
  getPinTraits,
  getDishHosted,
  getDishPressures,
} from './formationLive.js';
import { observeSpawn, resetSpawn, getSpawnHomes } from './spawnLive.js';
import { fertilityField } from './formation.js';
import { BAND_NORMAL } from './stress.js';
import { createLiveResolver, getLastSpawnDecisions, checkResolverSnapshot } from '../gl/liveResolve.mjs';
import { createHashChain } from '../gl/performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

const W = 1000;
const H = 700;
const J = (v) => JSON.parse(JSON.stringify(v));

// ── 1. old wiring ≡ new wiring, decision for decision ────────────────────────────────────────────────
{
  // two fertile crowds on the seed-1234 field (found the way formation.selfcheck finds its pins)
  const f = fertilityField(1234, null, W, H);
  const fertile = [];
  for (let x = 100; x < 900 && fertile.length < 2; x += 10)
    for (let y = 100; y < 600 && fertile.length < 2; y += 10) {
      if (f.at(x, y) > 0.62 && fertile.every((p) => Math.hypot(p.x - x, p.y - y) > 300)) fertile.push({ x, y });
    }
  assert.equal(fertile.length, 2, 'fixture: two far-apart fertile patches');
  const crowd = (p) => Array.from({ length: 30 }, (_, i) => ({ x: p.x + (i % 6), y: p.y + Math.floor(i / 6) }));
  const output = [{ items: [...crowd(fertile[0]), ...crowd(fertile[1])] }];
  const countAt = (fr) => (fr < 100 ? 1 : 2);
  const FRAMES = 210;

  // (a) the OLD wiring: a frame tap driving the facades, decisions read back through the getters
  resetFormation();
  resetSpawn();
  const seqA = [];
  let pinsA = [];
  for (let fr = 0; fr < FRAMES; fr++) {
    const input = { dishPins: pinsA, canvasW: W, canvasH: H, seed: 1234, seedOffsets: null };
    observeFormation(input, output, () => BAND_NORMAL);
    const homes = observeSpawn(input, output, { count: countAt(fr), formed: getFormedPins(), band: BAND_NORMAL });
    if (homes) pinsA = homes;
    seqA.push(
      J({
        dishPins: getSpawnHomes(),
        dishFormed: getFormedPins(),
        dishLimbs: getLimbPairs(),
        dishTraits: getPinTraits(),
        dishHosted: getDishHosted(),
        dishPressure: getDishPressures(),
      }),
    );
  }

  // (b) the NEW wiring: one spawn state observing whole frames, count and band on the input
  const state = createCreatureSpawnState();
  const seqB = [];
  let pinsB = [];
  for (let fr = 0; fr < FRAMES; fr++) {
    const input = {
      dishPins: pinsB,
      canvasW: W,
      canvasH: H,
      seed: 1234,
      seedOffsets: null,
      creatureCount: countAt(fr),
      band: BAND_NORMAL,
    };
    const d = state.observe(input, output);
    if (d.homesChanged) pinsB = d.dishPins;
    seqB.push(
      J({
        dishPins: d.dishPins,
        dishFormed: d.dishFormed,
        dishLimbs: d.dishLimbs,
        dishTraits: d.dishTraits,
        dishHosted: d.dishHosted,
        dishPressure: d.dishPressure,
      }),
    );
  }

  assert.deepEqual(seqB, seqA, 'the resolver path decides exactly what the tap channel decided, frame for frame');
  // and the equivalence is not vacuous: the session formed moths, stamped traits, grew wings, hosted the dish creature
  assert.ok(
    seqA.some((d) => d.dishFormed.some(Boolean)),
    'pins formed',
  );
  assert.ok(
    seqA.some((d) => d.dishTraits.some(Boolean)),
    'Davis stamped a birth',
  );
  assert.ok(
    seqA.some((d) => d.dishLimbs.some((n) => n >= 2)),
    'a second pair of wings grew',
  );
  assert.ok(
    seqA.some((d) => d.dishHosted.some(Boolean)),
    'the dish creature was hosted',
  );
  resetFormation();
  resetSpawn();
  console.log('spawnState: old tap wiring and resolver wiring decide identically over 210 frames');
}

// ── 2 + 3. the channel rides the resolver snapshot; pre-repipe snapshots stay valid ──────────────────
{
  const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
  const stable = {
    canvasW: W,
    canvasH: H,
    layers: [L('lyr-a')],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
    seedOffsets: null,
    paletteId: 'bone',
    paletteOverrides: null,
    userPalettes: [],
    caGrid: null,
    enabledAssets: null,
    assetWeightOverrides: {},
    customAssets: [],
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
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 380, particleCount: 150 },
  };
  const FRAMES = 210;
  const SNAP_AT = 150;
  const inputs = [];
  const live = createLiveResolver();
  let pins = [];
  let snap = null;
  let snapChainSeed = null;
  let contChain = null;
  const liveHashes = [];
  const liveDecisions = [];
  const chain = createHashChain();
  let t = 0;
  for (let fr = 0; fr < FRAMES; fr++) {
    t += 16.7;
    const d = fr === 0 ? null : liveDecisions[fr - 1];
    const input = {
      ...stable,
      seed: 4242,
      loopTimeMs: t,
      dtSec: 1 / 60,
      band: BAND_NORMAL,
      smoothed: 0.5,
      creatureCount: 2,
      dishPins: pins,
      dishFormed: d ? d.dishFormed : [],
      dishLimbs: d ? d.dishLimbs : [],
      dishTraits: d ? d.dishTraits : [],
      dishHosted: d ? d.dishHosted : [],
      dishPressure: d ? d.dishPressure : [],
    };
    inputs.push(input);
    const out = live.resolveLayers(input);
    chain.push(out);
    const nd = getLastSpawnDecisions();
    liveDecisions.push(nd);
    if (nd.homesChanged) pins = nd.dishPins;
    if (fr === SNAP_AT - 1) {
      snap = J(live.snapshotState());
      snapChainSeed = chain.value();
      contChain = createHashChain(snapChainSeed);
    }
    if (fr >= SNAP_AT) {
      contChain.push(out);
      liveHashes.push(contChain.value());
    }
  }
  live.dispose();
  assert.ok(snap && snap.spawn, 'the snapshot carries the spawn channel');
  assert.equal(checkResolverSnapshot(snap), true, 'the snapshot passes the structural check');
  assert.ok(liveDecisions[SNAP_AT].dishFormed.some(Boolean), 'creatures are up by the snapshot frame');

  // snapshot → restore → snapshot is byte-stable (the round-trip law #1367's probe enforces)
  const probe = createLiveResolver();
  assert.equal(probe.restoreState(J(snap)), true);
  assert.deepEqual(J(probe.snapshotState()), snap, 'the spawn state round-trips exactly');
  probe.dispose();

  // the continuation: a fresh resolver restored at the snapshot frame replays the SAME recorded inputs
  // to the SAME outputs — and its spawn channel makes the SAME decisions, frame for frame.
  const restored = createLiveResolver();
  assert.equal(restored.restoreState(J(snap)), true);
  const rc = createHashChain(snapChainSeed);
  for (let fr = SNAP_AT; fr < FRAMES; fr++) {
    const out = restored.resolveLayers(inputs[fr]);
    rc.push(out);
    assert.equal(rc.value(), liveHashes[fr - SNAP_AT], `continuation output at frame ${fr}`);
    assert.deepEqual(J(getLastSpawnDecisions()), J(liveDecisions[fr]), `continuation decision at frame ${fr}`);
  }
  restored.dispose();

  // a PRE-REPIPE snapshot (the same object with the spawn key absent) restores, and the recorded inputs
  // still replay to identical outputs — the decisions are in the take, never recomputed.
  const legacySnap = J(snap);
  delete legacySnap.spawn;
  assert.equal(checkResolverSnapshot(legacySnap), true, 'a snapshot without spawn is structurally valid');
  const legacy = createLiveResolver();
  assert.equal(legacy.restoreState(legacySnap), true, 'a pre-repipe snapshot restores');
  const lc = createHashChain(snapChainSeed);
  for (let fr = SNAP_AT; fr < FRAMES; fr++) {
    const out = legacy.resolveLayers(inputs[fr]);
    lc.push(out);
    assert.equal(lc.value(), liveHashes[fr - SNAP_AT], `legacy-snapshot output at frame ${fr}`);
  }
  legacy.dispose();
  console.log(
    'spawnState: mid-session snapshot continues identically (outputs + decisions); pre-repipe snapshots stay valid',
  );
}

// ── 4. fail-closed ───────────────────────────────────────────────────────────────────────────────────
{
  const state = createCreatureSpawnState();
  assert.equal(state.restoreState(null), false);
  assert.equal(state.restoreState({ v: 2 }), false);
  assert.equal(
    state.restoreState({ v: 1, formation: { v: 1, slots: [{ x: 'x' }] } }),
    false,
    'a malformed tracker payload is refused',
  );
  const good = J(state.snapshotState());
  assert.equal(state.restoreState(good), true, 'a fresh channel snapshot restores');
  const badHomes = J(state.snapshotState());
  badHomes.homes = [{ x: 1, y: 2, age: 'old' }];
  assert.equal(state.restoreState(badHomes), false, 'a malformed home is refused');
  assert.equal(checkResolverSnapshot({ v: 1, spawn: 42 }), false, 'the structural check refuses a non-object spawn');
  console.log('spawnState: malformed snapshots refused, fail-closed');
}

console.log('spawnState.selfcheck: ok (#1694 slice 1, the re-homed spawn channel)');
