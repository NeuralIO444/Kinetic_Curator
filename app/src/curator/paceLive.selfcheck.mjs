// #1460 — the pace, end to end on the bus: audio tempo + the clock's phrase -> an eased BEAT BPM, her mark while it
// moves, the artist's BPM always winning, and silence about it everywhere else.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit, on } from '../composition/eventBus.js';
import { startPace, PHRASE_BARS } from './paceLive.js';
import { getSwayMagnitude, SWAY_VISIBLE_THRESHOLD, setPaceMagnitude } from './swayView.mjs';
import { MIN_KEEPS } from './queenLean.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const keeps = Array.from({ length: MIN_KEEPS }, () => ({ stack: { l: [{ type: 'content' }] } }));

let bpm = 100;
let ctx = { keeps, allowance: 1 };
const log = [];
const offLog = on(Events.BEAT_BPM, (p, m) => { log.push({ bpm: p.bpm, cause: m ? m.cause : null }); if (m && m.cause === 'lean') bpm = p.bpm; });
const stop = startPace({ getBpm: () => bpm, context: () => ctx });
const tempo = (b, c = 0.9) => emit(Events.AUDIO_TEMPO, { bpm: b, confidence: c });
const bar = (k) => emit(Events.CLOCK_BAR, { bar: k, bpm });
const reset = () => { log.length = 0; bpm = 100; ctx = { keeps, allowance: 1 }; emit(Events.AUDIO_INPUT, { source: 'mic' }); };

ok('a confident tempo is eased toward once a phrase, in small steps, and her mark shows while she does', () => {
  reset();
  tempo(130);
  bar(1); bar(2); bar(3);
  assert.deepEqual(log, [], 'only on the phrase boundary');
  bar(PHRASE_BARS);
  assert.equal(log.length, 1);
  assert.equal(log[0].cause, 'lean');
  assert.ok(log[0].bpm > 100 && log[0].bpm <= 103.01, `one bounded step (${log[0].bpm})`);
  assert.ok(getSwayMagnitude() > SWAY_VISIBLE_THRESHOLD, 'her mark is showing while she moves it');
  for (let k = 2; k < 30; k++) bar(k * PHRASE_BARS);
  assert.ok(bpm >= 128 && bpm <= 130, `it settles at the music (${bpm})`);
  bar(40 * PHRASE_BARS);
  assert.equal(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, true, 'the mark goes when she has arrived');
});

ok('a BPM the artist sets silences her, and she stays silent until a new piece begins', () => {
  reset();
  tempo(130);
  bar(PHRASE_BARS);
  const moved = log.length;
  assert.equal(moved, 1);
  emit(Events.BEAT_BPM, { bpm: 90 }); // the artist's tap / preset / MIDI: no opts
  bpm = 90;
  assert.equal(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, true, 'the mark goes at once');
  bar(2 * PHRASE_BARS); bar(3 * PHRASE_BARS);
  assert.equal(log.filter((l) => l.cause === 'lean').length, moved, 'no further step while the artist holds the tempo');
  emit(Events.AUDIO_SILENCE_END, { ms: 4000 }); // a new passage
  tempo(130);
  bar(4 * PHRASE_BARS);
  assert.ok(log.filter((l) => l.cause === 'lean').length > moved, 'a new piece lets her ease again');
});

ok('she is idle when she should be: doubtful tempo, no hand, too few keeps, silence, no tempo yet', () => {
  reset(); tempo(130, 0.4); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'a doubtful tempo');
  reset(); ctx = { keeps, allowance: 0 }; tempo(130); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'a room that gives her no hand');
  reset(); ctx = { keeps: keeps.slice(0, MIN_KEEPS - 1), allowance: 1 }; tempo(130); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'fewer than the keep gate');
  reset(); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'no tempo heard yet');
  reset(); tempo(130); emit(Events.AUDIO_SILENCE_START, { ms: 2000 }); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'the music stopped: nothing to follow');
  reset(); tempo(100); bar(PHRASE_BARS);
  assert.equal(log.length, 0, 'already at the music');
});

ok('her step is the only thing she writes: BEAT_BPM with cause lean, and she never touches the metro or anything else', () => {
  reset(); tempo(150); bar(PHRASE_BARS);
  assert.ok(log.every((l) => l.cause === 'lean' || l.cause === null));
  const src = readFileSync(new URL('./paceLive.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.deepEqual([...src.matchAll(/emit\(Events\.(\w+)/g)].map((m) => m[1]), ['BEAT_BPM']);
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval/.test(src), 'no wall clock');
});

ok('stopping the pace unhooks it and clears the mark', () => {
  reset(); tempo(130); bar(PHRASE_BARS);
  setPaceMagnitude(0.8);
  stop();
  assert.equal(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, true);
  const before = log.length;
  tempo(140); bar(2 * PHRASE_BARS);
  assert.equal(log.length, before);
  offLog();
});

console.log(`paceLive.selfcheck: ${n} checks passed`);
