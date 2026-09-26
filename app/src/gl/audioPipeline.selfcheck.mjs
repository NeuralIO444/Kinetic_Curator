// audioPipeline.selfcheck.mjs — the deliberate two-stage audio envelope (#503).
//
// Decision (b), recorded here so nobody "fixes" it back: the mic envelope is
// shaped TWICE, on purpose, by two different followers with two different jobs.
//
//   Stage 1 — useAudioInput.js (mic path, rAF, wall-clock dt): shapes the raw
//   analyser bands with the USER's attack/decay/response knobs, then writes
//   the shaped result to the store as `audioBands`. Beat detection reads the
//   RAW rms here on purpose, so the clock keeps its snap regardless of the
//   follower's attack setting.
//
//   Stage 2 — liveLoop.mjs (GL clock, dt-correct): reads the store's
//   `audioBands` and shapes them AGAIN with processBallistics' defaults for
//   the scale/alpha/glow gestures. The GL clock's dt differs from the mic
//   rAF dt, so this stage owns its own smoothing; it is not a duplicate.
//
// Removing either stage changes the response character (feel) — that call is
// Matt's, not a cleanup. These checks pin the pipeline: the loop acts on the
// store's shaped bands (never raw), and the two-stage composition reproduces
// a recorded golden over a scripted envelope.
import assert from 'node:assert';
import { processBallistics, createBallisticsState } from './audioBallistics.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const approx = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Representative user knobs for stage 1 — deliberately distinct from the
// loop-stage defaults so the golden below proves the stages compose.
const HOOK_KNOBS = { attackMs: 60, releaseMs: 450, curve: 'logarithmic' };
const DT = 16.7;

// Scripted envelope: 60 frames — silence, ramp, hold, beat+drop, silence.
function scriptedEnvelope() {
  const frames = [];
  for (let i = 0; i < 60; i++) {
    let v = 0, beat = 0;
    if (i >= 10 && i < 20) v = (i - 9) / 10;
    else if (i >= 20 && i < 30) v = 1;
    else if (i === 30) { v = 1; beat = 1; }
    frames.push({ bass: v * 0.9, mid: v * 0.7, treble: v * 0.5, rms: v, beatPulse: beat });
  }
  return frames;
}

// Run the production pipeline: hook stage -> store bands -> loop stage.
function runPipeline(frames, hookKnobs) {
  const hookState = createBallisticsState();
  const loopState = createBallisticsState();
  const storeBands = [];
  const loopActed = [];
  for (const f of frames) {
    // Stage 1 (useAudioInput): user knobs, { bass, mid, treble, rms } only.
    const { beatPulse, ...micBands } = f;
    const shaped = processBallistics(hookState, micBands, DT, hookKnobs);
    storeBands.push(shaped);
    // Stage 2 (liveLoop): store bands back in, defaults; beatPulse joins raw.
    const loopIn = {
      rms: shaped.rms, bass: shaped.bass, mid: shaped.mid, treble: shaped.treble,
      beatPulse: f.beatPulse,
    };
    loopActed.push(processBallistics(loopState, loopIn, DT, {}));
  }
  return { storeBands, loopActed };
}

// Recorded golden — generated from the real functions; any stage removed or
// reordered breaks these values.
const GOLDEN = {
  15: {
    store: { bass: 0.950737829, mid: 0.939749926, treble: 0.923672815, rms: 0.955175288 },
    loop: { rms: 0.373303532, bass: 0.364791371, mid: 0.344912041, treble: 0.318861865, beatPulse: 0 },
  },
  25: {
    store: { bass: 0.997699826, mid: 0.993052141, treble: 0.988322014, rms: 0.999998872 },
    loop: { rms: 0.726182403, bass: 0.715407806, mid: 0.694844692, treble: 0.67437377, beatPulse: 0 },
  },
  32: {
    store: { bass: 0.979494192, mid: 0.978776114, treble: 0.978041041, rms: 0.979847108 },
    loop: { rms: 0.762860613, bass: 0.750761086, mid: 0.72833467, treble: 0.707537297, beatPulse: 0.002323525 },
  },
  45: {
    store: { bass: 0.976123436, mid: 0.976123431, treble: 0.976123427, rms: 0.976123438 },
    loop: { rms: 0.688006809, bass: 0.686169884, mid: 0.682983246, treble: 0.680258885, beatPulse: 0 },
  },
};

ok('pipeline reproduces the two-stage golden', () => {
  const { storeBands, loopActed } = runPipeline(scriptedEnvelope(), HOOK_KNOBS);
  for (const [i, g] of Object.entries(GOLDEN)) {
    for (const [k, v] of Object.entries(g.store)) {
      assert.ok(approx(storeBands[i][k], v), `frame ${i} store.${k}: ${storeBands[i][k]} != ${v}`);
    }
    for (const [k, v] of Object.entries(g.loop)) {
      assert.ok(approx(loopActed[i][k], v), `frame ${i} loop.${k}: ${loopActed[i][k]} != ${v}`);
    }
  }
});

ok('loop stage acts on the store bands, not raw', () => {
  // The loop's input IS the hook's output by construction (liveLoop reads
  // s.audioBands). Prove the composition matters: shaping the raw frame-15
  // bands directly with loop defaults gives a different answer than the
  // pipeline's loop stage — so the hook stage is load-bearing.
  const frames = scriptedEnvelope();
  const { loopActed } = runPipeline(frames, HOOK_KNOBS);
  const f = frames[15];
  const direct = processBallistics(createBallisticsState(), {
    rms: f.rms, bass: f.bass, mid: f.mid, treble: f.treble, beatPulse: 0,
  }, DT, {});
  assert.ok(
    Math.abs(direct.rms - loopActed[15].rms) > 0.1,
    `loop-on-raw (${direct.rms}) must differ from loop-on-shaped (${loopActed[15].rms})`
  );
});

ok('silence is exact zeros through both stages', () => {
  const silent = Array.from({ length: 30 }, () => ({ bass: 0, mid: 0, treble: 0, rms: 0, beatPulse: 0 }));
  const { storeBands, loopActed } = runPipeline(silent, HOOK_KNOBS);
  for (const s of storeBands) assert.deepEqual(s, { bass: 0, mid: 0, treble: 0, rms: 0 });
  for (const l of loopActed) assert.deepEqual(l, { rms: 0, bass: 0, mid: 0, treble: 0, beatPulse: 0 });
});

ok('pipeline is deterministic across runs', () => {
  const a = runPipeline(scriptedEnvelope(), HOOK_KNOBS);
  const b = runPipeline(scriptedEnvelope(), HOOK_KNOBS);
  assert.deepEqual(a.loopActed, b.loopActed, 'same script, same loop-acted values');
});

console.log(`\naudioPipeline: ${n} checks passed`);
