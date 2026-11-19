// node src/gl/liveResolve.gaitEase.selfcheck.mjs
// #2329 follow-up (Matt, 2026-11-18 18:53 PT, ruling 1) — the resolver end of "ease over 1 beat":
//   1. hard gate: no stamp, CONSTRUCTS off (stamp or not) — today's frames, and no `gaitBlend` key in the snapshot
//   2. a QUEEN swap (idle → performing) moves no piece further in its swap frame than a performing frame moves it
//   3. the drop to still: the pieces settle to rest over one beat, the last eased frame is the rest pose (to 0.01 px),
//      and the next frame is the construct's exact flat tile where the pieces rested
//   4. a take with swaps and a drop replays to every checkpoint; a take started mid-fade (snapshot) continues identically
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import { createPerformanceRecorder, verifyPerformance, createHashChain } from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS_CONSTRUCTS, HOUSE_CONSTRUCT_RECORDS } from '../data/assets/index.js';
import { canonGaits } from '../data/canon/gaits.js';
import { gaitInputStamp } from '../engine/gaitAssign.js';
import { constructPieceItems } from '../engine/constructStage.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TILE = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const G = canonGaits('organic');
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
  enabledAssets: { [TILE]: true, geo_circle_01: true },
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  scaleMul: 1,
  alphaBoost: 0,
  assetAttach: {},
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'grid',
    count: 8,
    scale: [0.9, 1.3],
    kinemeBreath: 0,
    kinemePulse: 0,
    kinemeDrift: 0,
  },
};
const FRAMES = 360;
const BEAT_FRAMES = 30; // one beat at 120 BPM, 60 fps
const ON = 30; // idle from here
const SWAP = 120; // performing from here
const DROP = 240; // still (no stamp) from here
const stampOf = (g) => gaitInputStamp({ [TILE]: { gaitId: g.id, by: 'queen', locked: false } }, 120);
const script = (f) => (f < ON ? null : f < SWAP ? stampOf(G.idle) : f < DROP ? stampOf(G.performing) : null);

function session({
  pieces = true,
  stampAt = script,
  record = false,
  from = 0,
  resolver: given = null,
  snapAt = -1,
} = {}) {
  const recorder = record ? createPerformanceRecorder() : null;
  const resolver = given || (record ? withResolveTap(createLiveResolver) : createLiveResolver());
  if (recorder) {
    setResolveTap((i) => recorder.onInput(i));
    setResolveOutputTap((o) => recorder.onOutput(o));
  }
  const chain = createHashChain();
  const hashes = [];
  const frames = [];
  const snaps = [];
  let kept = null;
  for (let f = from; f < FRAMES; f++) {
    const t = (f + 1) * (1000 / 60);
    const g = stampAt(f);
    const out = resolver.resolveLayers({
      ...STABLE,
      loopTimeMs: t,
      dtSec: 1 / 60,
      ...(pieces ? { constructPieces: true } : {}),
      ...(g ? { gaits: g } : {}),
    });
    chain.push(out);
    hashes.push(chain.value());
    frames.push(out.flatMap((e) => e.items || []));
    if (!record) {
      const s = resolver.snapshotState();
      snaps.push(s.gaitBlend || null);
      if (f === snapAt) kept = JSON.parse(JSON.stringify(s));
    }
  }
  if (recorder) {
    setResolveTap(null);
    setResolveOutputTap(null);
  }
  return { hashes, frames, snaps, kept, perf: recorder ? recorder.finish() : null };
}

const isPiece = (i) => typeof i.key === 'string' && i.key.includes('#p');
const piecesOf = (items) => new Map(items.filter(isPiece).map((i) => [i.key, i]));
/** The largest distance any piece moved between two frames (pieces present in both). */
function maxMove(a, b) {
  const A = piecesOf(a);
  let m = 0;
  for (const [k, p] of piecesOf(b)) {
    const q = A.get(k);
    if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y), Math.abs(p.scale - q.scale) * 100);
  }
  return m;
}

const rest = session({ stampAt: () => null });
const live = session();

ok(
  'hard gate: no stamp, and CONSTRUCTS off with or without a stamp, are today’s frames; no fold in the snapshot',
  () => {
    const off = session({ pieces: false });
    assert.deepEqual(off.hashes, rest.hashes, 'CONSTRUCTS off: the stamps move nothing');
    assert.ok(rest.snaps.every((s) => s === null) && off.snaps.every((s) => s === null), 'no gaitBlend key');
    for (let f = 0; f < ON; f++) assert.equal(live.hashes[f], rest.hashes[f], `frame ${f}: before any gait, today`);
  },
);

ok('a swap moves no piece further in a frame than a performing frame does (no one-frame snap)', () => {
  let steady = 0;
  for (let f = SWAP + BEAT_FRAMES + 1; f < DROP; f++)
    steady = Math.max(steady, maxMove(live.frames[f - 1], live.frames[f]));
  assert.ok(steady > 0, 'performing moves the pieces');
  for (const at of [ON + 1, SWAP, SWAP + 1]) {
    const m = maxMove(live.frames[at - 1], live.frames[at]);
    assert.ok(m <= steady * 1.25, `frame ${at}: moved ${m.toFixed(3)} vs a performing frame's ${steady.toFixed(3)}`);
  }
  let fadeMax = 0;
  for (let f = SWAP; f < SWAP + BEAT_FRAMES; f++)
    fadeMax = Math.max(fadeMax, maxMove(live.frames[f - 1], live.frames[f]));
  assert.ok(fadeMax <= steady * 1.25, `the whole fade: ${fadeMax.toFixed(3)} per frame at most`);
  assert.ok(live.snaps[SWAP + 5] && Object.keys(live.snaps[SWAP + 5].f).length === 1, 'the fade rides the snapshot');
});

ok('the drop to still eases home over one beat, ends at the rest pose, and the next frame is the exact tile', () => {
  for (let f = DROP; f < DROP + BEAT_FRAMES; f++) assert.ok(live.frames[f].some(isPiece), `frame ${f}: still easing`);
  const home = DROP + BEAT_FRAMES;
  for (let f = home; f < FRAMES; f++) {
    assert.ok(!live.frames[f].some(isPiece), `frame ${f}: the flat tile again`);
    assert.equal(live.snaps[f], null, `frame ${f}: the fold is empty`);
  }
  // the rest pose: the tiles of the home frame, dealt as pieces with no gait (the pinned rest pose = the tile)
  const tiles = live.frames[home].filter((i) => i.assetId === TILE);
  assert.ok(tiles.length > 0);
  const restPieces = piecesOf(
    constructPieceItems(tiles, {
      enabled: true,
      recordOf: (id) => HOUSE_CONSTRUCT_RECORDS.get(id) || null,
      moving: () => true,
    }),
  );
  const last = piecesOf(live.frames[home - 1]);
  assert.equal(last.size, restPieces.size, 'the same pieces');
  let worst = 0;
  for (const [k, p] of restPieces) {
    const q = last.get(k);
    assert.ok(q, k);
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y), Math.abs(p.scale - q.scale) * 100);
  }
  assert.ok(worst < 0.01, `the last eased frame is the rest pose (${worst} px off)`);
  // and the tile stands exactly where it stood before any gait: the swap back never pops
  assert.equal(live.hashes[FRAMES - 1] === rest.hashes[FRAMES - 1], false, 'the chain remembers the take');
  const before = rest.frames[home].filter((i) => i.assetId === TILE);
  assert.deepEqual(
    tiles.map((i) => [i.key, i.x, i.y, i.scale, i.rotation]),
    before.map((i) => [i.key, i.x, i.y, i.scale, i.rotation]),
  );
});

ok('a take with swaps and the drop replays to every checkpoint; a take restored mid-fade continues identically', () => {
  const a = session({ record: true });
  assert.deepEqual(a.hashes, live.hashes, 'the recording session is the live session');
  const v = verifyPerformance(JSON.parse(JSON.stringify(a.perf)));
  assert.equal(v.ok, true, JSON.stringify(v));
  for (const at of [SWAP + 9, DROP + 11]) {
    const src = session({ snapAt: at });
    const r = createLiveResolver();
    assert.equal(r.restoreState(src.kept), true, 'the snapshot restores');
    const cont = session({ from: at + 1, resolver: r });
    for (let f = at + 1; f < FRAMES; f++)
      assert.deepEqual(cont.frames[f - at - 1], src.frames[f], `restored at ${at}: frame ${f} identical`);
  }
});

console.log(`liveResolve.gaitEase.selfcheck: ${n} checks ok`);
