// #1461 step 2 — playing a take back through the loop's resolver wrapper: the same frames as the take, held on pause,
// the same frames after a seek, personas muted, and not re-recorded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap, setResolveFrameTap } from './resolveTap.mjs';
import {
  createPerformanceRecorder,
  createHashChain,
  frameHash,
  verifyPerformance,
  packPerformance,
  unpackPerformance,
} from './performanceFile.mjs';
import {
  startPlayback,
  stopPlayback,
  seekPlayback,
  getPlayback,
  isPlaybackActive,
  overlayScene,
  SCENE_KEYS,
} from './playback.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const stable = {
  canvasW: 640,
  canvasH: 480,
  layers: [L('a')],
  activeLayerId: 'a',
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
  dishPins: [],
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'swarm', count: 60, particleCount: 80 },
};
const liveInput = (t, over = {}) => ({ ...stable, seed: 1, loopTimeMs: t, dtSec: 1 / 60, ...over });

/** Record a take of 130 frames (the take keeps up to its last checkpoint). */
async function record() {
  const rec = createPerformanceRecorder();
  const r = withResolveTap(createLiveResolver);
  setResolveTap((i) => rec.onInput(i));
  setResolveOutputTap((o) => rec.onOutput(o));
  const hashes = [];
  const chain = createHashChain();
  let t = 0;
  for (let f = 0; f < 130; f++) {
    t += 1000 / 60;
    const out = r.resolveLayers({ ...stable, seed: 4242, loopTimeMs: t, dtSec: 1 / 60, scaleMul: 1 + (f % 7) * 0.02 });
    hashes.push(frameHash(out));
    chain.push(out);
  }
  setResolveTap(null);
  setResolveOutputTap(null);
  r.dispose();
  return { perf: rec.finish(), hashes };
}
const { perf, hashes } = await record();

/** Play the take from a fresh wrapper, feeding it deliberately WRONG live inputs; returns each frame's output hash. */
function play(frames, { held = [] } = {}) {
  const r = withResolveTap(createLiveResolver);
  const out = [];
  for (let f = 0; f < frames; f++) {
    out.push(
      frameHash(
        r.resolveLayers(
          liveInput(99999 + f, {
            seed: 7,
            slowRender: held.includes(f),
            layoutParams: { ...stable.layoutParams, count: 5 },
          }),
        ),
      ),
    );
  }
  r.dispose();
  return out;
}

await ok('a take plays back to exactly the frames it recorded, whatever the live inputs say', () => {
  assert.equal(verifyPerformance(perf).ok, true, 'the take is sound');
  assert.equal(startPlayback(perf), true);
  assert.equal(isPlaybackActive(), true);
  const got = play(perf.frames);
  assert.deepEqual(got, hashes.slice(0, perf.frames), 'each frame equals the recorded frame');
  stopPlayback();
});

await ok('the cursor advances one frame per resolved frame, holds at the end, and says so', () => {
  startPlayback(perf);
  assert.equal(getPlayback().frame, 0);
  play(10);
  assert.equal(getPlayback().frame, 10);
  play(perf.frames + 20);
  assert.equal(getPlayback().ended, true);
  assert.equal(getPlayback().frame, perf.frames - 1);
  stopPlayback();
  assert.equal(getPlayback(), null);
});

await ok("the loop's own pause (slowRender) holds the cursor and the picture; it never skips a recorded frame", () => {
  startPlayback(perf);
  const held = [3, 4, 5, 6];
  const got = play(12, { held });
  assert.equal(getPlayback().frame, 12 - held.length, 'four held frames did not advance the take');
  // (a held frame is not presented by the loop at all; what matters is that the take carries on from the right frame)
  const straight = hashes;
  assert.equal(got[11], straight[7], 'after the hold it carries on from the same frame');
  stopPlayback();
});

await ok('seek: a fresh resolver catches up silently, and the next frames equal the take from that frame', () => {
  startPlayback(perf);
  const r = withResolveTap(createLiveResolver);
  for (let f = 0; f < 5; f++) r.resolveLayers(liveInput(f)); // play a little first
  seekPlayback(90);
  assert.equal(getPlayback().frame, 90);
  const next = [];
  for (let f = 0; f < 5; f++) next.push(frameHash(r.resolveLayers(liveInput(1000 + f))));
  assert.deepEqual(next, hashes.slice(90, 95), "frames 90..94 are the take's frames 90..94");
  seekPlayback(0);
  assert.equal(frameHash(r.resolveLayers(liveInput(5))), hashes[0], 'back to the start');
  r.dispose();
  stopPlayback();
});

await ok('the personas are muted and the take is not re-recorded while it plays', () => {
  let frameTaps = 0;
  let inputTaps = 0;
  let outputTaps = 0;
  setResolveFrameTap(() => {
    frameTaps++;
  });
  setResolveTap(() => {
    inputTaps++;
  });
  setResolveOutputTap(() => {
    outputTaps++;
  });
  startPlayback(perf);
  play(5);
  assert.deepEqual([frameTaps, inputTaps, outputTaps], [0, 0, 0], 'no frame tap, no recorder tap');
  stopPlayback();
  play(3); // live again
  assert.deepEqual([frameTaps, inputTaps, outputTaps], [3, 3, 3], 'and all three are back the moment it stops');
  setResolveFrameTap(null);
  setResolveTap(null);
  setResolveOutputTap(null);
});

await ok(
  'the recorded scene is laid over the store view while it plays; identity otherwise; junk is refused',
  async () => {
    const state = { layers: [L('live')], paletteId: 'other', seed: 1, running: true, beatBpm: 100 };
    assert.equal(overlayScene(state), state, 'identity when not playing');
    startPlayback(perf);
    const v = overlayScene(state);
    assert.equal(v.paletteId, 'bone');
    assert.equal(v.seed, 4242);
    assert.deepEqual(
      v.layers.map((l) => l.id),
      ['a'],
    );
    assert.equal(v.running, true, "the artist's run / pause stays theirs");
    assert.equal(v.beatBpm, 100, 'anything the take does not define is left alone');
    assert.ok(SCENE_KEYS.includes('layers') && !SCENE_KEYS.includes('running'));
    stopPlayback();
    assert.equal(startPlayback({ nope: 1 }), false);
    assert.equal(startPlayback(null), false);
    assert.equal(isPlaybackActive(), false);
    // a take survives its own file
    const back = await unpackPerformance(await packPerformance(perf));
    assert.equal(startPlayback(back), true);
    stopPlayback();
  },
);

await ok(
  'wired: the resolver wrapper substitutes the input; the canvas overlays the scene; the button loads and stops',
  () => {
    const tap = readFileSync(new URL('./resolveTap.mjs', import.meta.url), 'utf8');
    assert.match(tap, /const pb = playbackStep\(liveInput\);/);
    assert.match(tap, /if \(!pb\) tapResolveInput\(input\);/);
    assert.match(tap, /frameListener !== null && !pb/);
    const canvas = readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8');
    assert.match(canvas, /getState: \(\) => overlayScene\(useStore\.getState\(\)\)/);
    const btn = readFileSync(new URL('../components/PerformanceButton.jsx', import.meta.url), 'utf8');
    assert.match(btn, /startPlayback\(perf\)/);
    assert.match(btn, /stopPlayback\(\)/);
    const loop = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
    assert.ok(!/playback/i.test(loop), 'the one-writer live loop is untouched');
    // REC and take live beside STOP, in the performing bar (not the thin status line)
    const bar = readFileSync(new URL('../components/MasterBar.jsx', import.meta.url), 'utf8');
    assert.match(bar, /<div className="master-right">\s*<PerformanceButton \/>\s*<button className="run-btn"/);
    assert.ok(
      !/<PerformanceButton \/>/.test(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')),
      'no longer in the status line',
    );
    assert.match(btn, /perf-dot/);
    const css = readFileSync(new URL('../styles/layout.css', import.meta.url), 'utf8');
    assert.match(css, /\.perf-btn \.perf-dot \{ color: var\(--kc-red\); \}/);
    assert.match(css, /\.perf-btn \{[^}]*text-transform: uppercase;/, 'caps like STOP');
  },
);

console.log(`playback.selfcheck: ${n} checks passed`);
