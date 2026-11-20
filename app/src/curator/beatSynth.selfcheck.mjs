// node src/curator/beatSynth.selfcheck.mjs
// #2389 (Persona Kernel P9, spec §4 Q9, Q10) — her own beats grow, and may be heard.
//   1. The library grows deterministically: the crate is kc-beat/1-valid; composePattern is a seeded variation INSIDE
//      a vibe (same seed + slot = same pattern); BEATS is untouched and the set picks exactly as before unless the
//      band is on (setLive's `grow`).
//   2. The audible layer: the pure score (voices, schedule) is tested without an AudioContext; the driver is off by
//      default, makes no AudioContext before a user gesture, is a no-op where there is none, yields the moment live
//      audio arrives, and writes nothing back (output only).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BEATS,
  BEAT_CRATE,
  BEAT_VERSION,
  LANES,
  STEPS,
  VIBES,
  composePattern,
  sanitizePattern,
  COMPOSE_STEPS,
} from './beatLibrary.js';
import { choosePattern, createSet } from './setLive.js';
import {
  VOICES,
  HIT_AMP,
  AUDIBLE_DEFAULTS,
  voiceAt,
  stepHits,
  stepBeat,
  scheduleWindow,
  secondsPerBeat,
} from './beatSynth.mjs';
import {
  audibleOn,
  audibleVolume,
  audibleTone,
  startAudibleBeats,
  LOOKAHEAD_BEATS,
  MASTER_GAIN,
} from './beatSynthLive.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ── 1. the library grows ──────────────────────────────────────────────────────────────────────────────────
ok('the crate: a bigger shelf, every pattern kc-beat/1-valid, ids unique across BEATS and the crate', () => {
  assert.equal(BEAT_VERSION, 'kc-beat/1');
  assert.ok(BEAT_CRATE.length >= 16, `${BEAT_CRATE.length}`);
  for (const b of BEAT_CRATE) {
    const c = sanitizePattern(b);
    assert.ok(c, b.id);
    assert.deepEqual(c.lanes, b.lanes);
  }
  const all = [...BEATS, ...BEAT_CRATE];
  assert.equal(new Set(all.map((b) => b.id)).size, all.length);
  for (const v of VIBES)
    assert.ok(
      BEAT_CRATE.some((b) => b.vibes.includes(v)),
      `the crate serves ${v}`,
    );
});

ok('BEATS is untouched (the silent default set): 16 patterns, the same ids in the same order', () => {
  assert.deepEqual(
    BEATS.map((b) => b.id),
    [
      'four-floor',
      'slow-four',
      'broken',
      'half-time',
      'shuffle',
      'pulse',
      'threes',
      'build',
      'drop',
      'tick',
      'two-step',
      'breaks',
      'clave',
      'dub',
      'eighths',
      'glitch',
    ],
  );
});

ok('composePattern: same seed + slot = the same pattern; a different seed or slot can differ', () => {
  for (const base of [...BEATS, ...BEAT_CRATE]) {
    const a = composePattern(base, 1234, 5);
    assert.deepEqual(a, composePattern(base, 1234, 5), base.id);
  }
  const variants = new Set();
  for (let seed = 0; seed < 40; seed++) variants.add(JSON.stringify(composePattern(BEATS[0], seed, 0).lanes));
  assert.ok(variants.size > 5, `seeds vary the composition (${variants.size})`);
  assert.notDeepEqual(composePattern(BEATS[2], 7, 0).lanes, composePattern(BEATS[2], 7, 1).lanes);
});

ok('composePattern stays INSIDE the vibe: moods, tempo, swing, intensity, bed kept; the pulse is the pattern’s', () => {
  for (const base of [...BEATS, ...BEAT_CRATE])
    for (let seed = 0; seed < 12; seed++) {
      const c = composePattern(base, seed * 7919, seed);
      assert.ok(sanitizePattern(c), `${c.id} is kc-beat/1-valid`);
      for (const k of ['vibes', 'bpm', 'swing', 'intensity', 'bed']) assert.deepEqual(c[k], base[k], `${base.id}.${k}`);
      assert.equal(c.lanes.kick[0], base.lanes.kick[0], 'the downbeat is never touched');
      const hits = (s) => [...s].filter((x) => x !== '.').length;
      assert.ok(hits(c.lanes.kick) <= hits(base.lanes.kick), 'the kick never gains a hit');
      assert.ok(hits(c.lanes.bass) <= hits(base.lanes.bass), 'the bass never gains a hit');
      let changed = 0;
      for (const l of LANES) for (let i = 0; i < STEPS; i++) if (c.lanes[l][i] !== base.lanes[l][i]) changed++;
      assert.ok(changed <= COMPOSE_STEPS, `at most ${COMPOSE_STEPS} steps re-voiced (${changed})`);
    }
  assert.equal(composePattern({ id: 'Bad!' }, 1, 1).id, 'Bad!', 'an invalid base comes back as it was');
});

ok('the set: grow OFF (default) picks exactly as before; grow ON picks from the crate too and composes', () => {
  // the default pick is choosePattern over BEATS — the same function, the same arguments as before #2389
  const src = read('./setLive.js');
  assert.match(src, /grow = \(\) => false/);
  assert.match(src, /else current = choosePattern\(\{ vibes, bpm, seed: getSeed\(\), slot: s \}\);/);
  for (let seed = 1; seed < 30; seed++) {
    const vibes = ['drive'];
    const def = choosePattern({ vibes, bpm: 124, seed, slot: 2 });
    assert.ok(BEATS.includes(def));
    const grown = composePattern(
      choosePattern({ vibes, bpm: 124, seed, slot: 2, lib: [...BEATS, ...BEAT_CRATE] }),
      seed,
      2,
    );
    assert.ok(sanitizePattern(grown));
  }
  const set = createSet({
    getBpm: () => 120,
    getIdleMs: () => 0,
    getRealLevel: () => 0,
    getRoom: () => ({}),
    getBand: () => null,
    getSeed: () => 1,
  });
  assert.equal(set.pattern(), null, 'nothing playing yet');
});

// ── 2. the audible layer: the pure score ─
ok(
  "Matt's ruling (2026-11-19): quiet, tight, dry — a low master, short voices, no reverb; volume and tone are DEV flags",
  () => {
    assert.deepEqual(AUDIBLE_DEFAULTS, { volume: 0.2, tone: 0.5 });
    assert.equal(MASTER_GAIN, 0.2);
    assert.ok(MASTER_GAIN <= 0.25, 'quiet');
    for (const v of Object.values(VOICES)) assert.ok(v.decay <= 0.16, `tight (${v.decay}s)`);
    const both = (read('./beatSynth.mjs') + read('./beatSynthLive.js')).replace(/\/\/.*$|^\s*\*.*$/gm, '');
    assert.ok(!/createConvolver|createDelay|feedback|reverb/i.test(both), 'dry: no reverb, no delay, no feedback');
    // DEV flags: unset = the defaults; set = clamped; never rendered
    assert.equal(audibleVolume(), 0.2);
    assert.equal(audibleTone(), 0.5);
    globalThis.__KC_QUEEN_AUDIBLE_VOLUME = 0.05;
    globalThis.__KC_QUEEN_AUDIBLE_TONE = 7;
    try {
      assert.equal(audibleVolume(), 0.05);
      assert.equal(audibleTone(), 1);
    } finally {
      delete globalThis.__KC_QUEEN_AUDIBLE_VOLUME;
      delete globalThis.__KC_QUEEN_AUDIBLE_TONE;
    }
    assert.deepEqual(voiceAt('snare', 0.5), { ...VOICES.snare });
    assert.equal(voiceAt('snare', 1).cutoff, 3600);
    assert.equal(voiceAt('snare', 0).cutoff, 900);
    assert.equal(voiceAt('kick', 1), VOICES.kick, 'tone moves filters only');
    assert.equal(voiceAt('nope'), null);
  },
);

// ─────────────────────────────────────────────────────────────────
ok('the four voices are synthesis recipes (oscillators and filtered noise) — no samples, no recordings', () => {
  assert.deepEqual(Object.keys(VOICES), ['kick', 'snare', 'hat', 'bass']);
  assert.deepEqual(Object.keys(VOICES), [...LANES]);
  for (const v of Object.values(VOICES)) {
    assert.ok(['sine', 'triangle', 'noise'].includes(v.source));
    assert.ok(v.decay > 0 && v.decay < 1 && v.gain > 0 && v.gain <= 1);
  }
  const both = read('./beatSynth.mjs') + read('./beatSynthLive.js');
  assert.ok(!/\.(wav|mp3|ogg|flac|aiff)\b|decodeAudioData|fetch\(|new Audio\(/.test(both), 'nothing loaded');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(both.replace(/\/\/.*$/gm, '')), 'no die, no wall clock');
});

ok('the score: four on the floor schedules its hits on the right beats, swing delays the odd sixteenths', () => {
  const ff = BEATS.find((b) => b.id === 'four-floor');
  const win = scheduleWindow(ff, 0, 4);
  assert.deepEqual(
    win.filter((h) => h.voice === 'kick').map((h) => h.beat),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    win.filter((h) => h.voice === 'snare').map((h) => h.beat),
    [1, 3],
  );
  assert.ok(win.filter((h) => h.voice === 'hat').every((h) => h.amp === HIT_AMP.o));
  assert.deepEqual(stepHits(ff, 0), [{ voice: 'kick', amp: 1 }]);
  assert.equal(stepBeat(1, 0.33), (1 + 0.33) / 4);
  assert.equal(stepBeat(2, 0.33), 0.5);
  assert.deepEqual(
    scheduleWindow(ff, 3.9, 4.1).map((h) => h.voice),
    ['kick'],
    'the next bar’s downbeat',
  );
  assert.deepEqual(scheduleWindow(ff, 2, 2), [], 'an empty window');
  assert.deepEqual(scheduleWindow(null, 0, 4), []);
  assert.deepEqual(scheduleWindow(ff, 0, 4), win, 'pure: the same window, the same hits');
  assert.equal(secondsPerBeat(120), 0.5);
  assert.equal(secondsPerBeat('x'), 0.5);
});

// ── the driver, with fakes ────────────────────────────────────────────────────────────────────────────────
function fakeContext() {
  const log = { strikes: 0, created: 0, disconnected: 0 };
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({
    connect() {},
    disconnect() {
      log.disconnected++;
    },
  });
  const ctx = {
    log,
    currentTime: 10,
    sampleRate: 1000,
    state: 'suspended',
    destination: node(),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), type: '' }),
    createOscillator: () => ({
      ...node(),
      frequency: param(),
      type: '',
      start() {
        log.strikes++;
      },
      stop() {},
    }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start() {
        log.strikes++;
      },
      stop() {},
    }),
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return ctx;
}
function fakeTarget() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (e, f) => (handlers[e] = f),
    removeEventListener: (e) => delete handlers[e],
    press: () => handlers.pointerdown && handlers.pointerdown(),
  };
}
function fakeTimer() {
  const t = { fn: null, set: 0 };
  t.setTimer = (fn) => ((t.fn = fn), ++t.set);
  t.clearTimer = () => (t.fn = null);
  t.run = () => t.fn && t.fn();
  return t;
}
const FF = BEATS.find((b) => b.id === 'four-floor');

ok(
  'off by default: the flag is unset, and off the driver makes no context and starts no clock — even on a press',
  () => {
    assert.equal(audibleOn(), false);
    assert.notEqual(globalThis.__KC_QUEEN_AUDIBLE, true);
    let made = 0;
    const target = fakeTarget();
    const timer = fakeTimer();
    const stop = startAudibleBeats({
      getPattern: () => FF,
      getMix: () => 1,
      getTime: () => ({ pos: 0, bpm: 120 }),
      makeContext: () => (made++, fakeContext()),
      target,
      setTimer: timer.setTimer,
      clearTimer: timer.clearTimer,
    });
    target.press();
    assert.equal(made, 0);
    assert.equal(timer.set, 0, 'no clock wakes while off');
    stop();
  },
);

ok('no autoplay: on, nothing is made or played until a user gesture; then it plays the set’s pattern', () => {
  const ctx = fakeContext();
  let made = 0;
  const target = fakeTarget();
  const timer = fakeTimer();
  let pos = 0;
  const stop = startAudibleBeats({
    getPattern: () => FF,
    getMix: () => 0.8,
    getTime: () => ({ pos, bpm: 120 }),
    enabled: () => true,
    makeContext: () => (made++, ctx),
    target,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  assert.equal(made, 0, 'no context before a gesture');
  assert.equal(timer.set, 0);
  target.press();
  assert.equal(made, 1);
  assert.equal(timer.set, 1);
  for (let i = 0; i < 16; i++) {
    timer.run();
    pos += LOOKAHEAD_BEATS;
  }
  assert.ok(ctx.log.strikes >= 8, `it played (${ctx.log.strikes} voices struck)`);
  target.press();
  assert.equal(made, 1, 'one context');
  stop();
  assert.deepEqual(Object.keys(target.handlers), [], 'listeners removed');
});

ok('she yields the moment live audio arrives: the master is cut, nothing more is struck', () => {
  const ctx = fakeContext();
  const target = fakeTarget();
  const timer = fakeTimer();
  let live = false;
  let pos = 0;
  const stop = startAudibleBeats({
    getPattern: () => FF,
    getMix: () => 1,
    getTime: () => ({ pos, bpm: 120 }),
    isLiveAudio: () => live,
    enabled: () => true,
    makeContext: () => ctx,
    target,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  target.press();
  timer.run();
  pos += 1;
  timer.run();
  const before = ctx.log.strikes;
  assert.ok(before > 0);
  live = true;
  timer.run();
  assert.ok(ctx.log.disconnected >= 1, 'the master was disconnected on that tick');
  for (let i = 0; i < 8; i++) {
    pos += 0.5;
    timer.run();
  }
  assert.equal(ctx.log.strikes, before, 'silent while live audio is on');
  stop();
});

ok('safe without an AudioContext (sandbox, node): a press is a no-op, nothing throws', () => {
  const target = fakeTarget();
  const timer = fakeTimer();
  const stop = startAudibleBeats({
    getPattern: () => FF,
    getMix: () => 1,
    getTime: () => ({ pos: 0, bpm: 120 }),
    enabled: () => true,
    target,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  }); // the default makeContext: node has no AudioContext
  assert.doesNotThrow(() => target.press());
  assert.equal(timer.set, 0);
  stop();
  assert.doesNotThrow(() => startAudibleBeats({ target: null })());
});

ok('output only: the driver imports the score and nothing else; the flag is never saved in a project', () => {
  const live = read('./beatSynthLive.js');
  const imports = [...live.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./beatSynth.mjs']);
  assert.ok(!/useStore|eventBus|sourceFeed|emit\(|dispatch|setItem/.test(live.replace(/\/\/.*$/gm, '')));
  const app = read('../App.jsx');
  assert.match(app, /startAudibleBeats\(\{\s*getPattern: set\.pattern,/);
  for (const f of ['../state/store.js', '../state/bundle.js', '../state/history.js'])
    assert.ok(!read(f).includes('KC_QUEEN_AUDIBLE'), `${f} never saves the flag`);
});

console.log(`beatSynth.selfcheck: ${n} checks passed`);
