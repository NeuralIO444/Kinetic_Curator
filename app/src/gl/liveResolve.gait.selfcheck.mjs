// node src/gl/liveResolve.gait.selfcheck.mjs
// #2329 (GAIT M3) — the resolver end: the loop's `input.gaits` stamp moves a construct's pieces, and only then.
//   1. hard gate: no stamp, a still-only stamp, and the CONSTRUCTS switch off all hash the same, frame for frame
//   2. a take whose QUEEN swaps gaits mid-take (none → performing → idle → still) deals pieces only while a gait moves,
//      replays to every checkpoint, and two runs of it are hash-identical
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import { createPerformanceRecorder, verifyPerformance, createHashChain } from './performanceFile.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS_CONSTRUCTS } from '../data/assets/index.js';
import { canonGaits } from '../data/canon/gaits.js';
import { gaitInputStamp, applyGaitAssign, queenPicks } from '../engine/gaitAssign.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const TILE = ASSETS_CONSTRUCTS.find((a) => a.style === 'organic').id;
const L = { id: 'lyr-a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 };
// The scene: house constructs on stage. The kineme drivers are off here so the hashes pin the gait alone; the last
// check runs the house defaults (breath on), which constructStage deals within STRETCH_TOLERANCE (review of #2402).
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
const FRAMES = 480;

/** One session: `stampAt(f)` gives frame f's `gaits` stamp (or null: no key). */
function session({ pieces = true, stampAt = () => null, record = false, layoutParams = null } = {}) {
  const recorder = record ? createPerformanceRecorder() : null;
  const resolver = record ? withResolveTap(createLiveResolver) : createLiveResolver();
  if (recorder) {
    setResolveTap((i) => recorder.onInput(i));
    setResolveOutputTap((o) => recorder.onOutput(o));
  }
  const chain = createHashChain();
  const hashes = [];
  const pieceCounts = [];
  let t = 0;
  for (let f = 0; f < FRAMES; f++) {
    t += 1000 / 60;
    const g = stampAt(f);
    const input = {
      ...STABLE,
      ...(layoutParams ? { layoutParams } : {}),
      loopTimeMs: t,
      dtSec: 1 / 60,
      ...(pieces ? { constructPieces: true } : {}),
      ...(g ? { gaits: g } : {}),
    };
    const out = resolver.resolveLayers(input);
    chain.push(out);
    hashes.push(chain.value());
    const items = out.flatMap((e) => e.items || []);
    pieceCounts.push(items.filter((i) => typeof i.key === 'string' && i.key.includes('#p')).length);
  }
  if (recorder) {
    setResolveTap(null);
    setResolveOutputTap(null);
  }
  resolver.dispose();
  return { hashes, pieceCounts, perf: recorder ? recorder.finish() : null };
}

const rest = session();

ok('hard gate: no stamp = a still-only stamp = the switch off, every frame, same hash', () => {
  assert.ok(
    rest.pieceCounts.every((c) => c === 0),
    'at rest every construct is its tile',
  );
  const still = session({ stampAt: () => ({ bpm: 120, a: [[TILE, canonGaits('organic').still.id]] }) });
  assert.deepEqual(still.hashes, rest.hashes);
  const off = session({
    pieces: false,
    stampAt: () => gaitInputStamp({ [TILE]: { gaitId: canonGaits('organic').performing.id } }),
  });
  assert.deepEqual(off.hashes, rest.hashes, 'CONSTRUCTS off: a stamp alone moves nothing');
});

// the QUEEN, phrase by phrase, as the loop would stamp her picks: none → performing → idle → still
const ROOM = ['low', 'high', 'mid', 'low'];
const PHRASE_FRAMES = FRAMES / ROOM.length;
const swaps = (() => {
  let map = {};
  const stamps = [];
  for (const energy of ROOM) {
    for (const e of queenPicks({ assignments: map, targets: [TILE], styleOf: () => 'organic', energy }))
      map = applyGaitAssign(map, e).assignments;
    stamps.push(gaitInputStamp(map, 120));
  }
  return stamps;
})();
const swapAt = (f) => swaps[Math.floor(f / PHRASE_FRAMES)];

ok('the QUEEN’s swaps deal pieces only while a gait moves; still frames hash like rest', () => {
  assert.equal(swaps[0], null);
  assert.ok(swaps[1] && swaps[2]);
  assert.equal(swaps[3], null, 'back to still: no stamp');
  const s = session({ stampAt: swapAt });
  for (let f = 0; f < FRAMES; f++) {
    const moving = !!swapAt(f);
    assert.equal(s.pieceCounts[f] > 0, moving, `frame ${f}: pieces iff a gait moves`);
  }
  for (let f = 0; f < PHRASE_FRAMES; f++) assert.equal(s.hashes[f], rest.hashes[f], 'phrase 1 is today');
  assert.notEqual(s.hashes[PHRASE_FRAMES + 30], rest.hashes[PHRASE_FRAMES + 30]);
});

ok('a take with QUEEN swaps replays to every checkpoint, and two runs are hash-identical', () => {
  const a = session({ stampAt: swapAt, record: true });
  const b = session({ stampAt: swapAt, record: true });
  assert.deepEqual(a.hashes, b.hashes, 'two live runs');
  assert.deepEqual(a.perf.checkpoints, b.perf.checkpoints, 'two takes, the same checkpoints');
  for (const c of a.perf.checkpoints) assert.equal(c.hash, a.hashes[c.frame]);
  const v = verifyPerformance(JSON.parse(JSON.stringify(a.perf)));
  assert.equal(v.ok, true, JSON.stringify(v));
  // and the replay of the file twice
  const v2 = verifyPerformance(JSON.parse(JSON.stringify(b.perf)));
  assert.equal(v2.ok, true);
  assert.equal(v.checked, v2.checked);
  // a forged pick (performing where the take had idle) is caught
  const forged = JSON.parse(JSON.stringify(a.perf));
  const step = forged.inputs.steps.find((st) => st.k && st.k.gaits && st.k.gaits.a);
  assert.ok(step, 'the stamp is in the take');
  step.k.gaits = {
    bpm: 120,
    a: [
      [
        TILE,
        canonGaits('organic').idle.id === step.k.gaits.a[0][1]
          ? canonGaits('organic').performing.id
          : canonGaits('organic').idle.id,
      ],
    ],
  };
  assert.equal(verifyPerformance(forged).ok, false, 'a swapped gait in the take is caught');
});

ok('review of #2402: under the house defaults (breath on) a performing construct deals as pieces', () => {
  const lp = { ...STABLE.layoutParams };
  delete lp.kinemeBreath;
  delete lp.kinemePulse;
  delete lp.kinemeDrift;
  const live = session({
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, ...lp, kinemeBreath: DEFAULT_LAYOUT_PARAMS.kinemeBreath },
    stampAt: () => gaitInputStamp({ [TILE]: { gaitId: canonGaits('organic').performing.id } }, 120),
  });
  assert.ok(DEFAULT_LAYOUT_PARAMS.kinemeBreath > 0, 'the house breath is on');
  assert.ok(
    live.pieceCounts.some((c) => c >= 12),
    'pieces appear on stage',
  );
});

console.log(`liveResolve.gait.selfcheck: ${n} checks ok`);
