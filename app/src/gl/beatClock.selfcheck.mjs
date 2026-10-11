// beatClock.selfcheck.mjs — BEAT master clock (#950): BPM sanitize, 2-beat
// durations, the glitch ceiling, tap-tempo math.
import assert from 'node:assert';
import {
  BEAT_DEFAULT_BPM,
  BEAT_MIN_BPM,
  BEAT_MAX_BPM,
  BEAT_PRESETS,
  BEAT_GLITCH_CEILING_S,
  sanitizeBeatBpm,
  beatSeconds,
  beatIsHardCut,
  tapBpm,
  metroIntervalMs,
  metroRunning,
  beatDotLive,
} from './beatClock.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

ok('sanitize: finite clamps to [30, 300], garbage → 120', () => {
  assert.equal(sanitizeBeatBpm(120), 120);
  assert.equal(sanitizeBeatBpm(60), 60);
  assert.equal(sanitizeBeatBpm(10), BEAT_MIN_BPM);
  assert.equal(sanitizeBeatBpm(500), BEAT_MAX_BPM);
  assert.equal(sanitizeBeatBpm(NaN), BEAT_DEFAULT_BPM);
  assert.equal(sanitizeBeatBpm(undefined), BEAT_DEFAULT_BPM);
  assert.equal(sanitizeBeatBpm('fast'), BEAT_DEFAULT_BPM);
});

ok('beatSeconds: morphs are 2 beats', () => {
  assert.ok(approx(beatSeconds(120), 1.0), '120 → 1s');
  assert.ok(approx(beatSeconds(60), 2.0), '60 → 2s, slow luxury');
  assert.ok(approx(beatSeconds(180), 2 / 3), '180 → 0.67s, frenetic');
  assert.ok(approx(beatSeconds(210), 120 / 210), '210 → 0.57s');
});

ok('glitch ceiling: sub-0.75s cuts, 160 BPM still morphs', () => {
  assert.equal(BEAT_GLITCH_CEILING_S, 0.75);
  assert.equal(beatIsHardCut(beatSeconds(120)), false);
  assert.equal(beatIsHardCut(beatSeconds(160)), false, '160 lands exactly on the ceiling');
  assert.equal(beatIsHardCut(beatSeconds(161)), true, 'past ~160 falls through');
  assert.equal(beatIsHardCut(beatSeconds(210)), true);
  assert.equal(beatIsHardCut(0), true);
  assert.equal(beatIsHardCut(NaN), false, 'non-finite never cuts by accident');
});

ok('presets are the six from the issue', () => {
  assert.deepEqual([...BEAT_PRESETS], [60, 90, 120, 150, 180, 210]);
});

ok('tapBpm: four taps at 500ms → 120 BPM', () => {
  const t0 = 1000000;
  const taps = [t0, t0 + 500, t0 + 1000, t0 + 1500];
  assert.ok(approx(tapBpm(taps), 120, 0.5), `got ${tapBpm(taps)}`);
});

ok('tapBpm: two taps still read a tempo', () => {
  const t0 = 2000000;
  assert.ok(approx(tapBpm([t0, t0 + 1000]), 60, 0.5));
});

ok('tapBpm: a pause restarts the feel', () => {
  const t0 = 3000000;
  // Two slow taps, long pause, then four quick ones — the quick run wins.
  const taps = [t0, t0 + 2000, t0 + 6000, t0 + 6500, t0 + 7000, t0 + 7500];
  assert.ok(approx(tapBpm(taps), 120, 0.5), `got ${tapBpm(taps)}`);
});

ok('tapBpm: needs at least 2 taps', () => {
  assert.equal(tapBpm([]), null);
  assert.equal(tapBpm([1000]), null);
  assert.equal(tapBpm(null), null);
});

// ── the metro pulse (#1144): honest beat when there is no audio ──
ok('metro: the interval is the dialed tempo (120 BPM = 500 ms), always inside the sanitized 30..300 BPM range', async () => {
  assert.equal(metroIntervalMs(120), 500); assert.equal(metroIntervalMs(60), 1000); assert.equal(metroIntervalMs(30), 2000); assert.equal(metroIntervalMs(300), 200);
  for (const bad of [NaN, 0, -5, 1e9, 'x', null, undefined]) { const ms = metroIntervalMs(bad); assert.ok(Number.isFinite(ms) && ms >= 200 && ms <= 2000, `${bad} -> ${ms}`); }
});

ok('metro: it fires only when the artist turned it on, the instrument runs, and audio is NOT the beat (audio always wins)', () => {
  assert.equal(metroRunning({ beatMetro: true, audioEnabled: false, running: true }), true);
  assert.equal(metroRunning({ beatMetro: false, audioEnabled: false, running: true }), false, 'off when the switch is off');
  assert.equal(metroRunning({ beatMetro: true, audioEnabled: true, running: true }), false, 'audio wins');
  assert.equal(metroRunning({ beatMetro: true, audioEnabled: false, running: false }), false, 'paused');
  assert.equal(metroRunning(), false); assert.equal(metroRunning({}), false);
});

ok('the dot may flash only while a real beat drives the stage: the metro or live audio (KC-1 DS rule 3: no performed liveness)', () => {
  assert.equal(beatDotLive({ beatMetro: false, audioEnabled: false }), false);
  assert.equal(beatDotLive({ beatMetro: true, audioEnabled: false }), true);
  assert.equal(beatDotLive({ beatMetro: false, audioEnabled: true }), true);
  assert.equal(beatDotLive(), false);
});

console.log(`beatClock.selfcheck: OK (${n} checks)`);

// #1144: the metro pulse is ON by default (Matt, 2026-10-11): a quiet room still breathes at the dialed tempo.
// The store default is the one place that says so; audio on always wins (metroRunning, above).
{
  const { useStore } = await import('../state/store.js');
  assert.equal(useStore.getInitialState().beatMetro, true, 'beatMetro defaults on');
  console.log('beatClock.selfcheck: metro pulse defaults on');
}

