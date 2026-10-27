// #1459 — the audio detections on the bus: stamped with the musical clock, the registry says they are telemetry, and
// the app feeds them from the meter's band levels (not from a per-frame bus event).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, on } from './eventBus.js';
import { EVENT_REGISTRY } from './eventRegistry.js';
import { observeAudio, resetAudioEvents, getAudioTempo } from './audioLive.js';
import { observeClock, resetClock } from './clockLive.js';
import { BANDS } from '../gl/audioEvents.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const flat = (v) => Object.fromEntries(BANDS.map((k) => [k, v]));
const kick = (t) => {
  const ph = t % 500;
  const h = ph < 90 ? 1 - ph / 90 : 0;
  return { ...flat(0.06), sub: 0.06 + 0.8 * h, bass: 0.06 + 0.9 * h };
};

const got = [];
const offs = [
  Events.AUDIO_INPUT,
  Events.AUDIO_ONSET,
  Events.AUDIO_TEMPO,
  Events.AUDIO_ENERGY,
  Events.AUDIO_SILENCE_START,
  Events.AUDIO_SILENCE_END,
].map((e) => on(e, (p, m) => got.push([e, p, m])));

ok('a kick train publishes onsets and a tempo on the bus, each stamped with the musical clock', () => {
  resetClock();
  resetAudioEvents();
  got.length = 0;
  for (let t = 0; t <= 8000; t += 1000 / 60) {
    observeClock(t, 120);
    observeAudio(t, kick(t), 'device');
  }
  const onsets = got.filter((g) => g[0] === Events.AUDIO_ONSET);
  assert.ok(onsets.length >= 12, `onsets (${onsets.length})`);
  for (const [, p, m] of onsets) {
    assert.ok(p.strength > 0 && p.strength <= 1 && typeof p.band === 'string');
    assert.equal(m.cause, 'audio');
    assert.ok(
      Number.isInteger(m.bar) && Number.isInteger(m.beat) && m.beat >= 0 && m.beat < 4,
      'stamped with bar and beat',
    );
    assert.ok(m.phase >= 0 && m.phase <= 1);
  }
  const tempo = got.filter((g) => g[0] === Events.AUDIO_TEMPO).pop();
  assert.ok(tempo && Math.abs(tempo[1].bpm - 120) <= 3 && tempo[1].confidence >= 0.6);
  assert.equal(getAudioTempo(), tempo[1].bpm);
  assert.deepEqual(
    got.filter((g) => g[0] === Events.AUDIO_INPUT).map((g) => g[1].source),
    ['mic'],
  );
});

ok('a file source and then no audio are reported as input changes; silence starts and ends on the bus', () => {
  resetClock();
  resetAudioEvents();
  got.length = 0;
  let t = 0;
  for (; t < 500; t += 16.7) observeAudio(t, flat(0.3), 'file');
  for (; t < 3500; t += 16.7) observeAudio(t, flat(0), 'file');
  for (; t < 4200; t += 16.7) observeAudio(t, flat(0.4), 'file');
  observeAudio(t, null, 'device');
  assert.deepEqual(
    got.filter((g) => g[0] === Events.AUDIO_INPUT).map((g) => g[1].source),
    ['file', 'none'],
  );
  assert.equal(got.filter((g) => g[0] === Events.AUDIO_SILENCE_START).length, 1);
  const end = got.filter((g) => g[0] === Events.AUDIO_SILENCE_END);
  assert.equal(end.length, 1);
  assert.ok(end[0][1].ms >= 2000);
});

ok('the registry names who listens; the app feeds them from the meter levels in the one frame tap', () => {
  // onset and energy are read by the trio's conducting (#1483); input, tempo and the silences by the pace (#1460) and the trio;
  // input and the silences also open and close the dial lean's window (#1640) — tempo is not hers to hear
  for (const k of ['AUDIO_ONSET', 'AUDIO_ENERGY']) {
    assert.deepEqual(EVENT_REGISTRY[k].handler, ['curator/trioLive.js'], k);
  }
  assert.deepEqual(EVENT_REGISTRY.AUDIO_TEMPO.handler, ['curator/paceLive.js', 'curator/trioLive.js'], 'AUDIO_TEMPO');
  for (const k of ['AUDIO_INPUT', 'AUDIO_SILENCE_START', 'AUDIO_SILENCE_END']) {
    assert.deepEqual(
      EVENT_REGISTRY[k].handler,
      ['curator/paceLive.js', 'curator/trioLive.js', 'curator/leanLive.js'],
      k,
    );
  }
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(
    app,
    /setResolveFrameTap\(\(input, output\) => \{[\s\S]*?observeAudio\(input && input\.loopTimeMs, readMeterBandLevels\(\)/,
  );
  const live = readFileSync(new URL('./audioLive.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/Date\.now|performance\.now|setTimeout|setInterval|requestAnimationFrame/.test(live),
    'no wall clock in the driver',
  );
});

offs.forEach((off) => off());
console.log(`audioBus.selfcheck: ${n} checks passed`);
