// node src/state/recallWhilePaused.selfcheck.mjs
// #2486 — a Hit recall made while PERF PAUSED must land in full and survive
// resume. Filed from the 2026-11-24 stress session (A8): while the watchdog
// stop stood, clicking Hit 1 opened its details but the stage never restored.
//
// Verdict this suite pins (the store-side half of the finding, proven on the
// base tree): the shape is (c) — recallFavorite writes the hit's whole state
// synchronously, paused or not (the dispatch pipe coalesces only layout/audio
// streams; RECALL_FAVORITE is a discrete action), the real resolver resolves
// the hit's stage from that state while still paused, and setRunning(true)
// neither restores a pre-pause snapshot nor discards the recall. The missing
// link is presentation only: the live loop's tick returns before every
// present call while paused (gl/liveLoop.mjs — buildFrame's `paused:
// !s.running`, tick's Spine-B early return), so the canvas holds the last
// presented frame until resume. That gate is a one-writer file; the seam
// spec lives in STAGING-REPORT-2486.md.
//
// This suite exists so the store half can never be "fixed" wrong: gating,
// deferring, or dropping a recall while paused would be silent data loss,
// and any of those turns this suite red.
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
const { DEFAULT_LAYOUT_PARAMS } = await import('../data/layout-modes.js');
const { captureFavorite } = await import('./slices/davisSlice.js');

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

const bootEnabledAssets = S().enabledAssets;

function setStage(seed, paletteId, count, enabledAssets) {
  S().setLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count });
  useStore.setState({ seed, paletteId, enabledAssets });
}

// The hit under test: its own seed, palette, count — and a cast two assets
// narrower than the boot pool, so the recall's enabledAssets write is
// observable, not just its seed/palette/layout writes.
const bootOn = Object.keys(bootEnabledAssets || {}).filter((k) => bootEnabledAssets[k]);
assert.ok(bootOn.length > 2, 'boot pool has assets to narrow');
const narrowedCast = { ...bootEnabledAssets, [bootOn[0]]: false, [bootOn[1]]: false };
setStage(20202, 'cyanotype', 120, narrowedCast);
const favB = captureFavorite(S(), S().paletteId);
assert.ok(favB.config.assets.length > 0, 'hit carries a cast');
assert.ok(!favB.config.assets.includes(bootOn[0]) && !favB.config.assets.includes(bootOn[1]), 'hit cast is narrowed');
const hitNodes = nodeCount();
assert.ok(hitNodes > 0, `hit resolves a live stage (${hitNodes} nodes)`);

// What a landed recall must produce, field for field (the davisSlice recall
// contract: keep stack, seed, stream offsets, layout, palette, cast).
function assertLanded(label) {
  const s = S();
  assert.strictEqual(s.seed, favB.seed, `${label}: seed is the hit's`);
  assert.strictEqual(s.paletteId, favB.config.palette.id, `${label}: palette is the hit's`);
  assert.strictEqual(s.layoutParams.count, favB.config.layout.count, `${label}: layout count is the hit's`);
  assert.strictEqual(s.layoutParams.mode, favB.config.layout.mode, `${label}: layout mode is the hit's`);
  assert.deepStrictEqual(
    s.enabledAssets,
    Object.fromEntries(favB.config.assets.map((id) => [id, true])),
    `${label}: enabledAssets is exactly the hit's cast`,
  );
  const n = nodeCount();
  assert.strictEqual(n, hitNodes, `${label}: resolver resolves the hit's stage (${n} nodes)`);
}

// ── Control: a LIVE recall lands in full.
setStage(10101, 'hydra', 300, bootEnabledAssets);
S().recallFavorite(favB);
assertLanded('live recall');

// ── The A8 act: the watchdog stop stands (PERF PAUSED), then the recall.
setStage(10101, 'hydra', 300, bootEnabledAssets);
S().tripWatchdog('fps-critical');
assert.strictEqual(S().running, false, 'watchdog stop: running is false');
assert.strictEqual(S().slowRender, true, 'watchdog stop: slowRender stands');
assert.strictEqual(S().slowRenderSource, 'watchdog', 'watchdog stop: source is the watchdog');
S().recallFavorite(favB);
assertLanded('paused recall');
// A recall is a scene change, never a resume: the stop must stand exactly
// as the watchdog left it (the #264 resume contract belongs to RUN/Space).
assert.strictEqual(S().running, false, 'paused recall: the stop still stands');
assert.strictEqual(S().slowRender, true, 'paused recall: slowRender still stands');
assert.strictEqual(S().slowRenderSource, 'watchdog', 'paused recall: the stop is still the watchdog’s');

// ── Resume the way RUN does: the recalled state is what presents — nothing
// restored over it, nothing discarded.
S().setRunning(true);
assert.strictEqual(S().running, true, 'resume: running again');
assertLanded('after resume');

console.log(
  `recallWhilePaused.selfcheck: OK (live recall lands, paused recall lands in full + stop untouched, recalled state survives resume; hit resolves ${hitNodes} nodes)`,
);
