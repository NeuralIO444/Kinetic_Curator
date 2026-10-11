// node src/gl/performanceFile.selfcheck.mjs
// #1353 step 3 — THE PHASE 1 EXIT: record a live session through the real tap, write the file, read it back, replay
// it through a fresh resolver, and every checkpoint matches the live run.
import assert from 'node:assert/strict';
import { createLiveResolver } from './liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from './resolveTap.mjs';
import {
  createPerformanceRecorder, verifyPerformance, checkPerformance, packPerformance, unpackPerformance, frameHash, createHashChain,
  PerformanceFileError, PERFORMANCE_FORMAT, PERFORMANCE_VERSION, CHECKPOINT_EVERY, MACHINE_KEYS,
} from './performanceFile.mjs';
import { KERNEL_VERSION } from '../engine/kernel/version.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { defaultPattern } from '../state/patternTrack.js';

// 1. the frame hash and the chain: exact, sensitive, and every frame counts
{
  const mk = (x = 1.5, y = -0) => [{ id: 'l', items: [{ x, y, tint: '#fff' }], f32: new Float32Array([1, 2]) }];
  assert.equal(frameHash(mk()), frameHash(mk()), 'the same output hashes the same');
  assert.match(frameHash(mk()), /^[0-9a-f]{16}$/);
  assert.notEqual(frameHash(mk()), frameHash(mk(1.5000000000000002)), 'one ulp changes it');
  assert.notEqual(frameHash(mk()), frameHash(mk(1.5, 0)), '-0 is not 0');
  assert.notEqual(frameHash([1, [2, 3]]), frameHash([[1, 2], 3]), 'structure is part of the hash');
  assert.notEqual(frameHash({ a: 'bc' }), frameHash({ ab: 'c' }), 'keys and values do not run together');
  assert.notEqual(frameHash([NaN]), frameHash([0]), 'NaN is a value');
  // the chain: one differing frame ANYWHERE changes every later value
  const run = (alter) => { const c = createHashChain(); for (let f = 0; f < 50; f++) c.push(mk(f === alter ? 9 : f)); return c.value(); };
  assert.equal(run(-1), run(-1));
  for (const f of [0, 17, 49]) assert.notEqual(run(f), run(-1), `a change at frame ${f} changes the chain`);
  const order = (seq) => { const c = createHashChain(); for (const v of seq) c.push(mk(v)); return c.value(); };
  assert.notEqual(order([1, 2]), order([2, 1]), 'frame order is part of the chain');
}

// ── a live session, driven exactly as liveLoop drives it: one tapped resolver, the recorder on both taps ─────────
const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
// counts above the 'performance' tier's caps (180 nodes / 100 particles), so the governor's shedding is real here
const lp = (over = {}) => ({ ...DEFAULT_LAYOUT_PARAMS, count: 300, particleCount: 150, ...over });
const snap = (seed, over = {}) => ({ seed, paletteId: 'bone', paletteOverrides: null, layoutParams: lp(over), caGrid: null, enabledAssets: null });

function session(frames, opts = {}) {
  // the store keeps objects stable between edits; build the stream the same way
  const stable = {
    canvasW: 1000, canvasH: 700,
    layers: [L('lyr-a'), L('lyr-b', { patch: { mode: 'field', to: 'lyr-a', strength: 1 } }), L('fx', { type: 'fx' }), L('p', { type: 'pattern', pattern: defaultPattern('QUILT', 7) })],
    activeLayerId: 'lyr-a', layerSnapshots: { 'lyr-b': snap(999, { mode: 'poisson', count: 24 }) }, seed: 1234, seedOffsets: null,
    paletteId: 'bone', paletteOverrides: null, userPalettes: [], caGrid: null, enabledAssets: null, assetWeightOverrides: {},
    customAssets: [], lockedParams: {}, batchPaused: false, focusSwap: false, perfClampOverride: null, scaleMul: 1,
    alphaBoost: 0, effectiveScaleY: undefined, phraseWrapGen: 0, reducedMotion: false,
  };
  let params = lp({ mode: 'swarm', behave: 'scatter' });
  const recorder = createPerformanceRecorder(opts);
  const resolver = withResolveTap(createLiveResolver);
  setResolveTap((i) => recorder.onInput(i));
  setResolveOutputTap((o) => recorder.onOutput(o));
  const liveChain = createHashChain(); // an independent chain over the frames the session actually produced
  const liveHashes = [];
  let t = 0;
  for (let f = 0; f < frames; f++) {
    const dt = DT_MS[f % DT_MS.length];
    t += dt;
    if (f === 90) params = { ...params, count: 320 }; // the artist moves a slider
    if (f === 200) params = { ...params, mode: 'gaussian' }; // and changes mode
    const out = resolver.resolveLayers({
      ...stable,
      layoutParams: params,
      seed: f > 300 ? 77 : 1234,
      // audio breathes every frame; the attractor comes and goes
      effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)],
      effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100],
      attractor: f % 40 < 20 ? { x: 400 + (f % 7), y: 300, strength: 1 } : null,
      // this machine's governor sheds detail for a while
      quality: f > 100 && f < 200 ? 'performance' : 'balanced', perfTier1: f > 110 && f < 190, assetThin: f > 115 && f < 185,
      slowRender: f > 250 && f < 256,
      loopTimeMs: t, dtSec: dt / 1000,
    });
    liveChain.push(out);
    liveHashes.push(liveChain.value());
  }
  setResolveTap(null);
  setResolveOutputTap(null);
  resolver.dispose();
  return { perf: recorder.finish(), liveHashes, recorder };
}

// 2. THE EXIT: export → import → replay → the frame hashes match the live run
{
  const { perf, liveHashes } = session(400);
  assert.equal(perf.format, PERFORMANCE_FORMAT);
  assert.equal(perf.version, PERFORMANCE_VERSION);
  assert.equal(perf.kernelVersion, KERNEL_VERSION);
  assert.equal(perf.frames, 361, 'the take ends on its last checkpoint (frame 360), so every frame in it is verifiable');
  assert.equal(perf.checkpoints.length, 7);
  for (const c of perf.checkpoints) assert.equal(c.hash, liveHashes[c.frame], `checkpoint ${c.frame} is the live run's chain over every frame so far`);

  const bytes = await packPerformance(perf); // export: this is the file
  assert.ok(bytes instanceof Uint8Array && bytes[0] === 0x1f && bytes[1] === 0x8b, 'gzip bytes');
  const back = await unpackPerformance(bytes); // import: nothing but the bytes crossed
  assert.deepEqual(back, JSON.parse(JSON.stringify(perf)), 'the file round-trips');

  const v = verifyPerformance(back); // replay through a fresh resolver
  assert.deepEqual(v, { ok: true, frames: 361, checked: 7, firstMismatchFrame: null, kernelMismatch: false },
    'replay lands on every checkpoint of the live run');
  console.log(`performanceFile: EXIT MET — a ${perf.frames}-frame live session exports to ${bytes.length} bytes, imports, and replays to all ${v.checked} checkpoints`);
}

// 3. it is the recorded machine state that makes verification exact, and the file says which keys those are
{
  const { perf } = session(200);
  assert.deepEqual(perf.machineKeys, [...MACHINE_KEYS]);
  for (const k of ['quality', 'perfTier1', 'assetThin', 'slowRender']) assert.ok(perf.machineKeys.includes(k));
  // a "stronger machine" that never sheds detail produces different frames: so verification must use the note
  const stronger = JSON.parse(JSON.stringify(perf));
  for (const step of stronger.inputs.steps) {
    if (!step.k) continue;
    if ('quality' in step.k) step.k.quality = 'high';
    if ('perfTier1' in step.k) step.k.perfTier1 = false;
    if ('assetThin' in step.k) step.k.assetThin = false;
  }
  const v = verifyPerformance(stronger);
  assert.equal(v.ok, false, 'per-machine detail really changes the frames (which is the point of playing on a stronger machine)');
  assert.equal(v.firstMismatchFrame, 120, 'and the difference shows at the first checkpoint inside the stretch where the governor shed detail');
}

// 4. tampering is caught, at the first checkpoint after it
{
  const { perf } = session(300);
  const forged = JSON.parse(JSON.stringify(perf));
  const i = forged.inputs.steps.findIndex((s, f) => f > 70 && f % CHECKPOINT_EVERY !== 0 && s.k && Array.isArray(s.k.effectiveScale));
  forged.inputs.steps[i].k.effectiveScale[1] += 0.01;
  const v = verifyPerformance(forged);
  assert.equal(v.ok, false);
  assert.equal(v.firstMismatchFrame, Math.ceil(i / CHECKPOINT_EVERY) * CHECKPOINT_EVERY, 'named at the first checkpoint at or after the edit');
  assert.ok(i % CHECKPOINT_EVERY !== 0, 'the edited frame was BETWEEN checkpoints: a one-frame change cannot hide (the chain covers every frame)');
}

// 5. fail-closed: nothing malformed is ever called a performance
{
  const { perf } = session(130);
  const bad = (mut, re) => assert.throws(() => checkPerformance(mut), (e) => e instanceof PerformanceFileError && re.test(e.message));
  bad(null, /not a performance/);
  bad({ ...perf, format: 'kc-session-log' }, /unknown format/);
  bad({ ...perf, version: 1 }, /unsupported version/);
  bad({ ...perf, frames: 0 }, /frames/);
  bad({ ...perf, checkpoints: [] }, /no checkpoints/);
  bad({ ...perf, checkpoints: [{ frame: 99999, hash: 'x' }] }, /inside the take/);
  bad({ ...perf, frames: perf.frames + 1 }, /header says/);
  bad({ ...perf, inputs: { version: 9, steps: [] } }, /input log/);
  await assert.rejects(() => unpackPerformance(new Uint8Array([1, 2, 3, 4])), PerformanceFileError, 'garbage bytes');
  const notJson = await new Response(new Blob(['{nope']).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  await assert.rejects(() => unpackPerformance(new Uint8Array(notJson)), /not valid JSON/);
  assert.equal(verifyPerformance({ ...perf, kernelVersion: 'kernel.v0' }).kernelMismatch, true, 'another kernel version is flagged, not hidden');
  assert.throws(() => createPerformanceRecorder().finish(), /nothing recorded/);
}

// 6. a long take stops honestly, and what it kept still verifies
{
  const { perf, recorder } = session(300, { maxFrames: 150 });
  assert.equal(recorder.truncated, true);
  assert.equal(perf.truncated, true, 'the file says it was cut');
  assert.equal(perf.frames, 121, 'kept up to the last checkpoint inside the limit');
  assert.equal(verifyPerformance(perf).ok, true);
}

// 7. honest size: one minute of a store-like session with audio breathing every frame
{
  const { perf } = session(3601);
  const bytes = await packPerformance(perf);
  const raw = JSON.stringify(perf).length;
  const kib = bytes.length / 1024;
  console.log(`  [info] 1 minute (${perf.frames} frames): ${kib.toFixed(0)} KiB gzipped (${(raw / 1024).toFixed(0)} KiB of JSON, ${(raw / bytes.length).toFixed(1)}x)`);
  assert.ok(kib < 300, `a minute stays under 300 KiB gzipped (got ${kib.toFixed(0)})`);
  assert.equal(verifyPerformance(await unpackPerformance(bytes)).ok, true, 'and a full minute replays to every checkpoint');
}

console.log('performanceFile.selfcheck: ok (#1353 step 3)');
