// node src/engine/creatureGait.selfcheck.mjs
// #2475 — creature and beast tiles on the live stage wear the QUEEN's gait picks, recorded in the take and replayed
// exactly (Matt's M5 scope ruling, 2026-11-18 19:56 PT: "the QUEEN picks for every wearer … same rules as constructs").
//
//   wearers    a wet-lab creature and a beast tile are wearers (a mobile, a plain asset are not); their Canon style is
//              the creature body's (the beast: swiss, the CULTURE Strandbeest's); the targets follow the pool switch
//   picks      the QUEEN picks for them per phrase among their own Canon defaults, through the same queenPicks
//   lock       a user lock wins: a locked creature is never re-picked, and the store locks a creature on its style's
//              `still` when nothing stands
//   applied    a creature or a beast tile wearing a moving gait has its parts moved by the gait (root = body / beam,
//              by depth); the body's own pose composes UNDER it; the foot trace never moves; frozen rests
//   gate       no worn map, a map without this tile, a still gait → the very same contract (hash-identical)
//   seam       the resolver's fold step for THIS input reaches the contract (roomContractFields); a swap eases over one
//              beat; an input the fold did not step (a CULTURE stamp, CONSTRUCTS off) reads as no pick
//   recorded   every applied pick of a creature lands in the take's GAIT_ASSIGN section, and the stamp rides the input
//   replay     a take with creature picks replays the creature parts byte-identical — linear, and after a seek
//   old take   a take without creature picks (no section, no creature stamp) replays with no picks, even right after a
//              live session that wore them
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  creatureGaitKind,
  creatureGaitStyle,
  creatureGaitStyleOf,
  creatureGaitTargets,
  gaitContractFields,
  wearCreatureGait,
  beastBoneParent,
  LIVE_GAIT_FALLBACK_STYLES,
  BEAST_BAR_PARENT,
} from './creatureGait.mjs';
import { CULTURE_GAIT_STYLES } from './cultureGait.mjs';
import { assembleCreature, creatureTile } from './creatureAssembler.js';
import { beastTile, dealBeastMeasures } from './beastTile.js';
import { BEAM_ID } from './beastRig.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract, serializeSceneContract } from '../gl/sceneContract.js';
import { canonGaits, canonGaitById } from '../data/canon/gaits.js';
import { queenPicks, applyGaitAssign, gaitInputStamp } from './gaitAssign.js';
import { createGaitBlend } from './gaitBlend.js';
import { roomContractFields } from '../curator/roomCodes.js';
import { createGaitRecorder, setGaitTap, checkGaitRecord, gaitAssignmentsAt } from '../curator/gaitRecord.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap, lastResolvedInput } from '../gl/resolveTap.mjs';
import { createPerformanceRecorder, verifyPerformance } from '../gl/performanceFile.mjs';
import { startPlayback, stopPlayback, seekPlayback } from '../gl/playback.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { useStore } from '../state/store.js';

let n = 0;
// KC_ONLY=<prefix> runs only the checks whose name starts with it (the mutation probes isolate one law at a time)
const only = process.env.KC_ONLY || null;
const ok = (name, fn) => {
  if (only && !name.startsWith(only)) return;
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const sha = (s) => createHash('sha256').update(s).digest('hex');

// ── the wearers ──
const body = ASSETS.find((a) => a.id === 'org_blob_01');
const record = assembleCreature({
  assetId: body.id,
  points: [
    { x: 50, y: 6, role: 'H' },
    { x: 12, y: 70, role: 'L' },
    { x: 88, y: 70, role: 'L' },
    { x: 80, y: 85 },
  ],
  seed: 2475,
});
const [CR] = sanitizeOverlay([creatureTile(record, body)]);
const [BE] = sanitizeOverlay([beastTile(dealBeastMeasures(7, 0))]);
const POOL = [CR, BE];
const styleOf = creatureGaitStyleOf(POOL, ASSETS);
const CR_STYLE = styleOf(CR.id);
const BE_STYLE = styleOf(BE.id);
const perf = (style) => canonGaits(style).performing;

ok('wearers: a creature and a beast tile wear; a mobile and a plain asset do not; styles by body / beast', () => {
  assert.equal(creatureGaitKind(CR), 'creature');
  assert.equal(creatureGaitKind(BE), 'beast');
  assert.equal(creatureGaitKind({ ...CR, rig: { ...CR.rig, figure: 'mobile' } }), null, 'a mobile is not a wearer');
  assert.equal(creatureGaitKind(body), null);
  assert.equal(CR_STYLE, styleOf(CR.id));
  assert.ok(canonGaits(CR_STYLE), 'the creature has Canon defaults');
  assert.equal(BE_STYLE, 'swiss');
  assert.equal(
    creatureGaitStyle(CR, () => null),
    LIVE_GAIT_FALLBACK_STYLES.creature,
    'no body found: the fallback',
  );
  assert.equal(LIVE_GAIT_FALLBACK_STYLES.creature, CULTURE_GAIT_STYLES.dish, 'one taste call with the dish');
  assert.equal(LIVE_GAIT_FALLBACK_STYLES.beast, CULTURE_GAIT_STYLES.strandbeest);
  assert.equal(styleOf(body.id), null, 'a plain asset has no wearer style');
  assert.deepEqual(creatureGaitTargets([body, ...POOL], null), [BE.id, CR.id].sort(), 'all placeable: both');
  assert.deepEqual(creatureGaitTargets(POOL, { [CR.id]: true }), [CR.id], 'the pool switch rules');
  assert.deepEqual(creatureGaitTargets(null), []);
  // the beast's tree: crank and frame off the beam; each bar off the bar it pivots on, on its own leg
  assert.equal(beastBoneParent(BEAM_ID), null);
  assert.equal(beastBoneParent('0:crank'), BEAM_ID);
  assert.equal(beastBoneParent('2:j'), '2:crank');
  assert.equal(BEAST_BAR_PARENT.get('h'), 'f');
});

ok('picks: the QUEEN picks the creature and the beast among their own Canon defaults, per phrase', () => {
  const targets = creatureGaitTargets(POOL, null);
  const picks = queenPicks({ assignments: {}, targets, styleOf, energy: 'high' });
  assert.deepEqual(
    picks.map((e) => [e.target, e.gaitId, e.by]),
    [
      [BE.id, perf(BE_STYLE).id, 'queen'],
      [CR.id, perf(CR_STYLE).id, 'queen'],
    ].sort(),
  );
  let map = {};
  for (const e of picks) map = applyGaitAssign(map, e).assignments;
  assert.deepEqual(queenPicks({ assignments: map, targets, styleOf, energy: 'high' }), [], 'no change, no pick');
  const quieter = queenPicks({ assignments: map, targets, styleOf, energy: 'low' });
  assert.deepEqual(
    quieter.map((e) => e.gaitId).sort(),
    [canonGaits(BE_STYLE).idle.id, canonGaits(CR_STYLE).idle.id].sort(),
  );
});

ok('lock: a locked creature is never re-picked; the store locks a creature on its style’s still', () => {
  const locked = { [CR.id]: { gaitId: canonGaits(CR_STYLE).idle.id, by: 'user', locked: true } };
  const picks = queenPicks({ assignments: locked, targets: [CR.id, BE.id], styleOf, energy: 'high' });
  assert.deepEqual(
    picks.map((e) => e.target),
    [BE.id],
    'the lock is skipped',
  );
  assert.equal(applyGaitAssign(locked, { target: CR.id, gaitId: perf(CR_STYLE).id, by: 'queen' }).reason, 'locked');
  const S = useStore.getState;
  useStore.setState({ customAssets: [CR, BE], gaitAssignments: {} });
  const r = S().lockGait(BE.id);
  assert.equal(r.applied, true, JSON.stringify(r));
  assert.deepEqual(S().gaitAssignments[BE.id], { gaitId: canonGaits(BE_STYLE).still.id, by: 'user', locked: true });
  assert.equal(
    S().assignGait({ target: BE.id, gaitId: perf(BE_STYLE).id, by: 'queen', locked: false }).reason,
    'locked',
  );
  useStore.setState({ gaitAssignments: {}, customAssets: [] });
});

// ── the contract ──
const STAGE = ['geo_tri_02', 'org_petal_01', 'flora_flower_01', 'line_squiggle_03', 'geo_hex_01'];
const items = () =>
  [
    { assetId: CR.id, x: 260, y: 260, scale: 3, rotation: 0, key: 'c' },
    { assetId: BE.id, x: 640, y: 300, scale: 3, rotation: 0, key: 'b' },
    ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 150, y: 520, scale: 0.6, rotation: 0, key: `s${i}` })),
  ].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
const contract = (doc = {}) =>
  buildSceneContract({
    doc: { seed: 7, customAssets: POOL, kinemeTime: 0.6, ...doc },
    resolvedLayers: [{ id: 'L', isFx: false, items: items() }],
  });
const wornOf = (entries, driverSec = 1.3) => ({
  worn: new Map(entries.map(([id, g]) => [id, { gait: g, bpm: 120 }])),
  driverSec,
  canvasW: 1000,
  canvasH: 700,
});
const partsOf = (c, key) => c.instances.filter((i) => i.key === key || i.key.startsWith(`${key}#`));
const plain = contract();
const plainHash = sha(serializeSceneContract(plain));

ok('gate: no worn map, a map without these tiles, a still gait, a frozen frame → the very same contract', () => {
  assert.equal(sha(serializeSceneContract(contract({ gaitWorn: null }))), plainHash);
  const other = wornOf([['construct:none', perf('organic')]]);
  assert.equal(sha(serializeSceneContract(contract({ gaitWorn: other }))), plainHash);
  const still = wornOf([
    [CR.id, canonGaits(CR_STYLE).still],
    [BE.id, canonGaits(BE_STYLE).still],
  ]);
  assert.equal(sha(serializeSceneContract(contract({ gaitWorn: still }))), plainHash, 'still moves nothing');
  const frozenPlain = sha(serializeSceneContract(contract({ reducedMotion: true })));
  const frozenWorn = contract({
    reducedMotion: true,
    gaitWorn: wornOf([
      [CR.id, perf(CR_STYLE)],
      [BE.id, perf(BE_STYLE)],
    ]),
  });
  assert.equal(sha(serializeSceneContract(frozenWorn)), frozenPlain, 'frozen: the rest pose, no gait');
});

ok('applied: a creature wearing a moving gait has its body and parts moved; the beast its beam and bars', () => {
  const g = contract({
    gaitWorn: wornOf([
      [CR.id, perf(CR_STYLE)],
      [BE.id, perf(BE_STYLE)],
    ]),
  });
  for (const key of ['c', 'b']) {
    const a = partsOf(plain, key);
    const b = partsOf(g, key);
    assert.equal(a.length, b.length, `${key}: the same parts (the gait moves, never deals)`);
    assert.deepEqual(
      b.map((i) => [i.key, i.asset, i.rotation, i.tint]),
      a.map((i) => [i.key, i.asset, i.rotation, i.tint]),
      'same parts, same deal, same turn: only place and size move',
    );
    const moved = b.filter((p, i) => p.x !== a[i].x || p.y !== a[i].y || p.scaleX !== a[i].scaleX);
    assert.ok(moved.length >= a.length - 1, `${key}: the gait moves the parts (${moved.length}/${a.length})`);
  }
  // the body (the root) moves too: the gait carries the whole animal
  const bodyA = plain.instances.find((i) => i.key === 'c');
  const bodyB = g.instances.find((i) => i.key === 'c');
  assert.ok(bodyA.x !== bodyB.x || bodyA.y !== bodyB.y || bodyA.scaleX !== bodyB.scaleX, 'the body moves as root');
  // the body is the ROOT: under a root-only drift every part rides the body by exactly the body's move
  const drift = { roles: { root: { drivers: [{ id: 'drift', amount: 0.5 }] } }, cascade: 0 };
  const d = contract({ gaitWorn: wornOf([[CR.id, drift]]) });
  const mv = (key) => {
    const p = plain.instances.find((i) => i.key === key);
    const q = d.instances.find((i) => i.key === key);
    return [q.x - p.x, q.y - p.y];
  };
  const root = mv('c');
  assert.ok(Math.hypot(...root) > 0.5, 'the body wanders');
  for (const p of partsOf(plain, 'c').filter((i) => i.key !== 'c')) {
    const m = mv(p.key);
    assert.ok(Math.abs(m[0] - root[0]) < 2e-3 && Math.abs(m[1] - root[1]) < 2e-3, `${p.key} rides the body`);
  }
  // the stage's own shapes never move
  for (let i = 0; i < STAGE.length; i++)
    assert.deepEqual(
      g.instances.find((x) => x.key === `s${i}`),
      plain.instances.find((x) => x.key === `s${i}`),
    );
  // the foot trace is ground: it never wears the gait
  const tr = (c) => c.instances.filter((i) => i.key.includes('#trace'));
  assert.deepEqual(tr(g), tr(plain));
  // only the picked tile moves
  const onlyBeast = contract({ gaitWorn: wornOf([[BE.id, perf(BE_STYLE)]]) });
  assert.deepEqual(partsOf(onlyBeast, 'c'), partsOf(plain, 'c'), 'an unpicked creature poses as before');
});

ok('applied: by depth — a parent’s motion carries its children; the pose composes under the gait', () => {
  // a one-node gait test of the composition: a drift-only root carries a child exactly by the root's move
  const nodes = [
    { inst: { asset: 'a', x: 100, y: 100, scaleX: 1, scaleY: 1 }, id: 'r', parent: null },
    { inst: { asset: 'b', x: 140, y: 100, scaleX: 1, scaleY: 1 }, id: 'k', parent: 'r' },
  ];
  const drift = {
    roles: { root: { drivers: [{ id: 'drift', amount: 0.5 }] } },
    cascade: 0,
  };
  const out = wearCreatureGait(nodes, { asset: 'T', key: 'x' }, wornOf([['T', drift]], 2.2), 7);
  assert.ok(out, 'the gait moves the root');
  const d0 = [out[0].x - 100, out[0].y - 100];
  const d1 = [out[1].x - 140, out[1].y - 100];
  assert.ok(Math.hypot(...d0) > 0.5, 'the root wanders');
  assert.ok(Math.abs(d0[0] - d1[0]) < 2e-3 && Math.abs(d0[1] - d1[1]) < 2e-3, 'the child rides its root');
  // children listed before their parent are composed parent-first all the same
  const rev = wearCreatureGait([nodes[1], nodes[0]], { asset: 'T', key: 'x' }, wornOf([['T', drift]], 2.2), 7);
  assert.deepEqual([rev[1], rev[0]], out);
  // the pose composes UNDER: the gait's move is laid over each part's posed place (a later Lois pose → the same delta)
  const later = contract({ kinemeTime: 1.4 });
  const laterG = contract({ kinemeTime: 1.4, gaitWorn: wornOf([[CR.id, drift]]) });
  const nowG = contract({ gaitWorn: wornOf([[CR.id, drift]]) });
  const delta = (a, b, key) => {
    const p = a.instances.find((i) => i.key === key);
    const q = b.instances.find((i) => i.key === key);
    return [q.x - p.x, q.y - p.y];
  };
  const dNow = delta(plain, nowG, 'c#h');
  const dLater = delta(later, laterG, 'c#h');
  assert.ok(Math.abs(dNow[0] - dLater[0]) < 2e-3 && Math.abs(dNow[1] - dLater[1]) < 2e-3, 'the walk is under it');
});

// ── the seam: the resolver's fold → the contract ──
ok('seam: only the fold step for THIS input is read; a swap eases over one beat; CONSTRUCTS off reads none', () => {
  const blend = createGaitBlend();
  const stamp = gaitInputStamp({ [CR.id]: { gaitId: perf(CR_STYLE).id } }, 120);
  const input = { constructPieces: true, gaits: stamp, customAssets: POOL, canvasW: 1000, canvasH: 700 };
  assert.deepEqual(gaitContractFields(input), {}, 'the fold has not stepped this stamp: nothing');
  blend.step(stamp, 4);
  const f = gaitContractFields(input).gaitWorn;
  assert.ok(f && f.worn.has(CR.id) && !f.worn.has(BE.id));
  assert.equal(f.driverSec, 4);
  // the swap's first frame wears the fade's start (still → performing at u = 0: every amount 0)
  const amt = (gw) => gw.worn.get(CR.id).gait.roles.inner.drivers.find((d) => d.id === 'breath').amount;
  assert.equal(amt(f), 0, 'the swap starts from where the pose was');
  blend.step(stamp, 4.25); // half a beat at 120 BPM
  const mid = amt(gaitContractFields(input).gaitWorn);
  const full = perf(CR_STYLE).roles.inner.drivers.find((d) => d.id === 'breath').amount;
  assert.ok(mid > 0 && mid < full, `mid-fade: ${mid} of ${full}`);
  blend.step(stamp, 4.6);
  assert.equal(gaitContractFields(input).gaitWorn.worn.get(CR.id).gait, canonGaitById(perf(CR_STYLE).id), 'home');
  assert.deepEqual(gaitContractFields({ ...input, constructPieces: undefined }), {}, 'CONSTRUCTS off: none');
  // a CULTURE fold's stamp (a fresh object) is never the frame input's
  const culture = createGaitBlend();
  const cs = gaitInputStamp({ [CR.id]: { gaitId: perf(CR_STYLE).id } }, 120);
  culture.step(cs, 9);
  assert.equal(gaitContractFields(input).gaitWorn.driverSec, 4.6, 'the stage reads its own step');
  // the room's contract fields carry it, beside the codes
  assert.ok(roomContractFields(input).gaitWorn);
  assert.deepEqual(roomContractFields({ room: { lois: 'NOD' } }), { loisFace: 'NOD' });
});

// ── the take: recorded, replayed ──
const L = { id: 'lyr-a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
const STABLE = {
  canvasW: 1000,
  canvasH: 700,
  layers: [L],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 7,
  paletteId: 'bone',
  userPalettes: [],
  enabledAssets: { [CR.id]: true, [BE.id]: true, geo_tri_02: true, org_petal_01: true },
  assetWeightOverrides: {},
  customAssets: POOL,
  lockedParams: {},
  scaleMul: 1,
  alphaBoost: 0,
  assetAttach: {},
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'grid', count: 8, kinemeBreath: 0, kinemePulse: 0, kinemeDrift: 0 },
};
// a take ends on its last checkpoint (every 60 frames): 241 frames keep the whole drop to still (frames 180..210)
const FRAMES = 241;
// the QUEEN's picks over the take, phrase by phrase: silence, high, mid, silence (the creatures swap and ease)
const ROOM = [{ silent: true }, { energy: 'high' }, { energy: 'mid' }, { silent: true }];
const PHRASE = 60;
const picksLog = [];
const stamps = (() => {
  let map = {};
  const out = [];
  ROOM.forEach((room, ph) => {
    for (const e of queenPicks({ assignments: map, targets: creatureGaitTargets(POOL, null), styleOf, ...room })) {
      const r = applyGaitAssign(map, e);
      map = r.assignments;
      if (r.applied) picksLog.push({ frame: ph * PHRASE, e: { target: e.target, ...map[e.target] } });
    }
    out.push(gaitInputStamp(map, 120));
  });
  return out;
})();
const stampAt = (f) => stamps[Math.min(ROOM.length - 1, Math.floor(f / PHRASE))];
/** The creature tiles' contract instances for the frame just resolved (the loop's own doc read, through the seam). */
function creatureFrame(out, f, { plain = false } = {}) {
  const fields = plain ? {} : roomContractFields(lastResolvedInput()); // plain: the contract with no gait read at all
  const c = buildSceneContract({
    doc: { seed: 7, customAssets: POOL, kinemeTime: f / 60, ...fields },
    resolvedLayers: out,
  });
  return sha(JSON.stringify(c.instances.filter((i) => isCreaturePart(i))));
}
const creatureKeys = new Set();
const isCreaturePart = (i) => [...creatureKeys].some((k) => i.key === k || i.key.startsWith(`${k}#`));

function liveTake({ withGaits = true, record = true, frames = FRAMES } = {}) {
  const recorder = record ? createPerformanceRecorder() : null;
  const resolver = withResolveTap(createLiveResolver);
  if (recorder) {
    setResolveTap((i) => recorder.onInput(i));
    setResolveOutputTap((o) => recorder.onOutput(o));
  }
  const gaitRec = createGaitRecorder({ getFrame: () => frame });
  setGaitTap((e) => gaitRec.update(e));
  let frame = 0;
  const hashes = [];
  let t = 0;
  for (frame = 0; frame < frames; frame++) {
    for (const p of picksLog) if (withGaits && p.frame === frame) useStore.getState().assignGait(p.e);
    t += 1000 / 60;
    const g = withGaits ? stampAt(frame) : null;
    const out = resolver.resolveLayers({
      ...STABLE,
      loopTimeMs: t,
      dtSec: 1 / 60,
      constructPieces: true,
      ...(g ? { gaits: g } : {}),
    });
    if (frame === 0)
      for (const e of out)
        for (const it of e.items || []) if (it.assetId === CR.id || it.assetId === BE.id) creatureKeys.add(it.key);
    hashes.push(creatureFrame(out, frame));
  }
  setGaitTap(null);
  setResolveTap(null);
  setResolveOutputTap(null);
  resolver.dispose();
  return { hashes, perf: recorder ? { ...recorder.finish(), gaits: gaitRec.finish() } : null };
}

function replay(perf, { seekTo = null } = {}) {
  assert.equal(startPlayback(JSON.parse(JSON.stringify(perf))), true);
  const resolver = withResolveTap(createLiveResolver);
  const hashes = [];
  const plainHashes = [];
  const from = seekTo ?? 0;
  if (seekTo !== null) seekPlayback(seekTo);
  for (let f = from; f < FRAMES; f++) {
    const out = resolver.resolveLayers({ ...STABLE, loopTimeMs: 0, dtSec: 1 / 60 }); // the live input is ignored
    hashes[f] = creatureFrame(out, f);
    plainHashes[f] = creatureFrame(out, f, { plain: true });
  }
  resolver.dispose();
  stopPlayback();
  return { hashes, plain: plainHashes };
}

useStore.setState({ gaitAssignments: {}, customAssets: POOL });
const live = liveTake();
const bare = liveTake({ withGaits: false, record: true });

ok(
  'recorded: every creature and beast pick lands in the take’s GAIT_ASSIGN section, and the stamp rides the input',
  () => {
    assert.ok(creatureKeys.size >= 2, `the resolver placed the creature and the beast (${[...creatureKeys]})`);
    const rec = checkGaitRecord(live.perf.gaits);
    assert.ok(rec, 'a well-formed section');
    const targets = new Set(rec.events.map((r) => r[1]));
    assert.ok(targets.has(CR.id) && targets.has(BE.id), 'both wearers are in the log');
    assert.equal(rec.events.length, picksLog.length, 'one row per applied pick');
    assert.deepEqual(gaitAssignmentsAt(live.perf.gaits, PHRASE)[CR.id].gaitId, perf(CR_STYLE).id);
    assert.ok(JSON.stringify(live.perf.inputs).includes(CR.id), 'the creature’s stamp is in the take’s input log');
    // the picks moved the creatures while they stood (and left them as they were in the silent first phrase)
    for (let f = 0; f < PHRASE; f++) assert.equal(live.hashes[f], bare.hashes[f], `frame ${f}: silence, no gait`);
    assert.ok(
      live.hashes.slice(PHRASE + 31, 2 * PHRASE).some((h, i) => h !== bare.hashes[PHRASE + 31 + i]),
      'worn',
    );
    // the drop to still eases over one beat (30 frames at 120 BPM / 60 fps), then the creatures pose exactly as before
    assert.notEqual(live.hashes[3 * PHRASE + 10], bare.hashes[3 * PHRASE + 10], 'still easing home');
    for (let f = 3 * PHRASE + 31; f < FRAMES; f++) assert.equal(live.hashes[f], bare.hashes[f], `frame ${f}: home`);
    // and the take's own resolver checkpoints verify (the creatures' stamp is an honest recorded input)
    assert.equal(verifyPerformance(JSON.parse(JSON.stringify(live.perf))).ok, true);
    useStore.setState({ gaitAssignments: {} });
  },
);

ok('replay: the take replays the creature and beast parts byte-identical, linear and after a seek', () => {
  const r = replay(live.perf).hashes;
  assert.equal(live.perf.frames, FRAMES, 'the whole take is in the file');
  assert.deepEqual(r, live.hashes, 'linear playback');
  const seekTo = PHRASE + 20; // mid-phrase, mid-wear
  const s = replay(live.perf, { seekTo }).hashes;
  assert.deepEqual(s.slice(seekTo), live.hashes.slice(seekTo), 'a seek lands on the recorded pose');
});

ok('old take: a take without creature picks replays with none — even right after a session that wore them', () => {
  // the live session above left the fold's readouts standing; an older take (no creature stamp, no gaits section)
  const old = { ...bare.perf };
  delete old.gaits;
  liveTake({ withGaits: true, record: false, frames: 2 * PHRASE }); // stops mid-wear: a pick stands right now
  const r = replay(old);
  assert.deepEqual(r.hashes, r.plain, 'no picks: every frame is the contract with no gait read at all');
  assert.deepEqual(r.hashes, bare.hashes, 'and exactly as recorded');
  assert.deepEqual(gaitAssignmentsAt(undefined, 10), {}, 'a missing section stands up no assignment');
  assert.equal(checkGaitRecord(undefined), null);
});

console.log(`creatureGait.selfcheck: ${n} checks ok`);
