// node src/state/playUndoStage.selfcheck.mjs
// #2479 — the PLAY sequence must never empty the stage, and Undo must restore
// what a morph took away. Filed from the 2026-11-24 stress session (A1): the
// stage read 0 nodes after a PLAY + flurry sequence and one Undo did not
// restore it. The defect did not reproduce on the current tree (store-level
// sweep of every layout mode, plus a live-browser run through the shipped
// agent bridge); this suite pins the invariant so the mechanism cannot arrive
// silently later: it drives the REAL store through the issue's exact control
// sequence — hits, queue morphs, STOP, TIME evolves on SEED / PALETTE / ALL,
// source BEAT, morph OFF, phrase ON with METRO + EUCLID wraps, and voice-mix
// commits (the session's standing-mix ingredient) — counting nodes through
// the REAL live resolver after every step, in every layout mode.
import assert from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};

const { useStore } = await import('./store.js');
const { createLiveResolver } = await import('../gl/liveResolve.mjs');
const { DEFAULT_LAYOUT_PARAMS, MODE_IDS } = await import('../data/layout-modes.js');
const { captureFavorite } = await import('./slices/davisSlice.js');
const { FLAGSHIP_VOICES } = await import('../data/voices.js');

const S = () => useStore.getState();
const resolver = createLiveResolver();
let clock = 0;

// Count placements through the real resolver, the way the loop does — a few
// frames per read so growth modes get their per-frame ticks.
function nodeCount(frames = 8) {
  const s = S();
  let n = 0;
  for (let i = 0; i < frames; i++) {
    clock += 100;
    const out = resolver.resolveLayers({
      canvasW: 1000,
      canvasH: 700,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      layerSnapshots: s.layerSnapshots || {},
      seed: s.seed,
      seedOffsets: s.seedOffsets,
      paletteId: s.paletteId,
      paletteOverrides: s.paletteOverrides,
      userPalettes: s.userPalettes || [],
      caGrid: s.caGrid,
      enabledAssets: s.enabledAssets,
      assetWeightOverrides: {},
      customAssets: s.customAssets || [],
      lockedParams: s.lockedParams || {},
      batchPaused: false,
      focusSwap: false,
      perfClampOverride: null,
      scaleMul: 1,
      alphaBoost: 0,
      phraseWrapGen: s.phraseWrapGen || 0,
      reducedMotion: false,
      quality: 'balanced',
      perfTier1: false,
      assetThin: false,
      slowRender: false,
      effectiveScale: s.layoutParams?.scale || [0.5, 1.5],
      effectiveAlpha: s.layoutParams?.alpha || [20, 100],
      assetAttach: {},
      attractor: null,
      dishPins: [],
      layoutParams: s.layoutParams,
      loopTimeMs: clock,
      dtSec: 1 / 60,
    });
    n = out.reduce((acc, e) => acc + (Array.isArray(e.items) ? e.items.length : 0), 0);
  }
  return n;
}

function expectNodes(label, min = 1) {
  const n = nodeCount();
  assert.ok(n >= min, `${label}: stage holds ${n} nodes, expected >= ${min}`);
  return n;
}

// The morph driver's own lerp shape, driven to completion (the browser hook
// rides rAF; the store-level equivalent steps the same easing to t=1 and
// finishes through the store's own finishMorph).
function runMorphToEnd() {
  const s = S();
  if (!s.morphing || !s.morphFrom || !s.morphTo) return;
  const { morphFrom, morphTo } = s;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpValue = (from, to, t) => {
    if (Array.isArray(from) && Array.isArray(to)) {
      const len = Math.max(from.length, to.length);
      const out = [];
      for (let i = 0; i < len; i++) {
        const a = from[i] ?? from[from.length - 1] ?? 0;
        const b = to[i] ?? to[to.length - 1] ?? 0;
        out.push(+lerp(a, b, t).toFixed(3));
      }
      return out;
    }
    if (typeof from === 'number' && typeof to === 'number') return +lerp(from, to, t).toFixed(3);
    return to;
  };
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const next = { ...S().layoutParams };
    for (const key of Object.keys(morphTo)) {
      if (key in morphFrom) {
        next[key] = lerpValue(morphFrom[key], morphTo[key], e);
        if (['count', 'jitter', 'density', 'zTiers', 'displacement', 'particleCount'].includes(key)) {
          if (typeof next[key] === 'number') next[key] = Math.round(next[key]);
        }
      }
    }
    S().setLayoutParams(next);
  }
  S().finishMorph();
}

const bootEnabledAssets = S().enabledAssets;

function resetStage(mode) {
  useStore.setState({
    favorites: [],
    keeps: [],
    keepStage: [],
    historyUndoStack: [],
    historyRedoStack: [],
    voiceMix: null,
    morphing: false,
    morphFrom: null,
    morphTo: null,
    enabledAssets: bootEnabledAssets,
    phraseEnabled: false,
    queuePlaying: false,
  });
  S().setLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode, count: 184 });
  useStore.setState({ seed: 4242, paletteId: 'garnet' });
}

// The issue's sequence, verbatim at the store level: 5 hits, PLAY with morph
// on, advance to HIT 2/5, morph completes; STOP + queue TIME; evolve TIME on
// SEED, then PALETTE, then ALL; source BEAT; morph OFF; phrase ON, METRO
// clock, EUCLID figure armed; phrase wraps past a full 32-beat length.
function runIssueSequence(mode) {
  resetStage(mode);
  expectNodes(`${mode}: setup stage`);

  for (const sd of [111, 222, 333, 444, 555]) {
    useStore.setState({ seed: sd });
    S().setLayoutParams({ ...S().layoutParams, count: 120 + (sd % 80) });
    S().addFavorite(captureFavorite(S(), S().paletteId));
  }
  useStore.setState({ seed: 4242 });
  S().setLayoutParams({ ...S().layoutParams, count: 184 });
  expectNodes(`${mode}: 5 hits captured`);

  S().setMorphEvolve(true);
  S().setEvolveInterval(10000);
  S().setMorphDurationMs(4000);
  S().setPhraseLength(32);
  S().setQueueSecondsPerHit(60);
  S().setEvolveSource('beat');
  S().setEvolveTarget('layout');
  S().setEvolveMode(true);
  S().setQueuePlaying(true);
  S().morphToFavorite(S().favorites[0]);
  expectNodes(`${mode}: PLAY fires hit 1 (morph)`);
  S().setQueueIndex(1);
  S().morphToFavorite(S().favorites[1]);
  expectNodes(`${mode}: advance to HIT 2/5 (morphing)`);
  runMorphToEnd();
  expectNodes(`${mode}: morph to hit 2 complete`);

  S().setQueuePlaying(false);
  S().setQueueSource('time');
  S().setEvolveSource('time');
  S().setEvolveTarget('seed');
  S().triggerEvolve('time');
  expectNodes(`${mode}: TIME evolve on SEED`);
  S().setEvolveTarget('palette');
  S().triggerEvolve('time');
  expectNodes(`${mode}: TIME evolve on PALETTE`);
  S().setEvolveTarget('all');
  S().triggerEvolve('time');
  expectNodes(`${mode}: TIME evolve on ALL`);
  S().setEvolveSource('beat');
  S().triggerEvolve('beat');
  expectNodes(`${mode}: BEAT evolve on ALL`);
  S().setMorphEvolve(false);
  S().setPhraseEnabled(true);
  S().setPhraseClock('metro');
  S().setEuclid({ steps: 8, beats: 5 });
  for (let i = 0; i < 40; i++) S().tickPhraseBeat();
  expectNodes(`${mode}: phrase wrapped past 32 beats (METRO + EUCLID)`);
}

for (const mode of MODE_IDS) runIssueSequence(mode);

// ── voice-mix commits (the session's standing-mix ingredient, finding B19):
// every flagship voice, committed from a standing mix, must leave a live
// pool; so must an 'all'-assets user voice committing over the small boot
// map.
resetStage('random');
expectNodes('voice segment: setup');
for (const v of FLAGSHIP_VOICES) {
  S().loadVoice(v.id);
  if (S().voiceMix) S().commitVoiceMix();
  const ea = S().enabledAssets;
  assert.ok(ea === null || Object.values(ea).some(Boolean), `voice ${v.id}: commit left an all-off asset pool`);
  expectNodes(`voice ${v.id}: committed`);
}
useStore.setState({
  userVoices: [
    {
      id: 'u-all',
      name: 'ALL POOL',
      state: {
        palette: null,
        params: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 150 },
        assets: 'all',
        blendSeconds: 2,
      },
    },
  ],
});
S().loadVoice('u-all');
if (S().voiceMix) S().commitVoiceMix();
expectNodes("user voice with assets 'all': committed over the boot map");

// ── Undo restores what a morph took away: morph hit 1 -> hit 2 (different
// counts), finish, then ONE undo returns the pre-morph layout and a live
// stage — the exact pair the issue says failed.
resetStage('random');
S().setLayoutParams({ ...S().layoutParams, count: 150 });
S().addFavorite(captureFavorite(S(), S().paletteId));
useStore.setState({ seed: 999 });
S().setLayoutParams({ ...S().layoutParams, count: 260 });
S().addFavorite(captureFavorite(S(), S().paletteId));
S().recallFavorite(S().favorites[0]);
const preMorphCount = S().layoutParams.count;
const preMorphNodes = expectNodes('undo segment: pre-morph stage');
S().setMorphEvolve(true);
S().morphToFavorite(S().favorites[1]);
runMorphToEnd();
assert.notStrictEqual(S().layoutParams.count, preMorphCount, 'undo segment: morph actually changed the layout count');
expectNodes('undo segment: post-morph stage');
S().undo();
assert.strictEqual(
  S().layoutParams.count,
  preMorphCount,
  `undo segment: one undo restored count ${preMorphCount} (got ${S().layoutParams.count})`,
);
const restored = expectNodes('undo segment: stage after one undo');
assert.ok(
  restored >= Math.floor(preMorphNodes * 0.5),
  `undo segment: restored stage holds ${restored} nodes vs pre-morph ${preMorphNodes}`,
);

// Undo all the way down the sequence stack: the stage must never pass
// through 0 on the way back either.
resetStage('random');
runIssueSequence('random');
let guard = 0;
while (S().historyUndoStack.length && guard++ < 40) {
  S().undo();
  expectNodes(`undo-all: after undo #${guard}`);
}

console.log(
  `playUndoStage.selfcheck: OK (${MODE_IDS.length} modes x issue sequence, ${FLAGSHIP_VOICES.length} voice commits, morph-undo restore)`,
);
