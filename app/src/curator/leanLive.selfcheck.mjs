// #1640 — the dial lean, end to end on the bus: her validated lean + silence -> both dials eased once a phrase,
// her mark while they move, a hand on either dial releasing her, and the dials bit-identical without a lean.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit, on } from '../composition/eventBus.js';
import { startLean } from './leanLive.js';
import { PHRASE_BARS } from './paceLive.js';
import { getSwayMagnitude, SWAY_VISIBLE_THRESHOLD } from './swayView.mjs';
import { MIN_KEEPS } from './queenLean.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const keeps = Array.from({ length: MIN_KEEPS }, () => ({ stack: { l: [{ type: 'content' }] } }));

let wetness = 0;
let interval = 2000;
let ctx = { keeps, allowance: 1 };
const writes = [];
// the harness plays the wire: her steps (cause 'lean') land on the dials, exactly as wireEventBus lands them
const offWet = on(Events.LAYOUT_PARAM, (p, m) => { if (p && p.key === 'accumulationWetness') { writes.push({ kind: 'wet', value: p.value, cause: m ? m.cause : null }); if (m && m.cause === 'lean') wetness = p.value; } });
const offEvo = on(Events.DAVIS_EVOLVE, (p, m) => { if (p && p.interval !== undefined) { writes.push({ kind: 'evo', value: p.interval, cause: m ? m.cause : null }); if (m && m.cause === 'lean') interval = p.interval; } });
const stop = startLean({ getWetness: () => wetness, getEvolveInterval: () => interval, context: () => ctx });
const decide = (lean, persona = 'queen') => emit(Events.MIND_DECISION, { persona, bar: 0, backend: 'rules', seed: 0, invented: false, reply: { mood: 'still', lean } }, { cause: 'mind' });
const bar = (k) => emit(Events.CLOCK_BAR, { bar: k, bpm: 120 });
const silence = () => emit(Events.AUDIO_SILENCE_START, { ms: 6000 });
const reset = () => {
  writes.length = 0; wetness = 0; interval = 2000; ctx = { keeps, allowance: 1 };
  emit(Events.AUDIO_SILENCE_END, { ms: 6000 });
  emit(Events.AUDIO_INPUT, { source: 'mic' });
};
const hers = () => writes.filter((w) => w.cause === 'lean');

ok('in silence her lean moves BOTH dials once a phrase, in bounded steps, her mark showing while she does', () => {
  reset();
  decide({ wetness: 0.62, evolve: 1 });
  bar(PHRASE_BARS);
  assert.deepEqual(hers(), [], 'no silence yet: the dials are the artist\u2019s');
  silence();
  bar(1); bar(2); bar(3);
  assert.deepEqual(hers(), [], 'only on the phrase boundary');
  bar(PHRASE_BARS);
  assert.equal(hers().length, 2, 'one step per dial');
  assert.equal(hers()[0].value, 0.05, 'the wetness step is bounded');
  assert.equal(hers()[1].value, 1750, 'the evolve step is bounded');
  assert.ok(getSwayMagnitude() > SWAY_VISIBLE_THRESHOLD, 'her mark is showing while she moves them');
  for (let k = 2; k < 40; k++) bar(k * PHRASE_BARS);
  assert.ok(wetness >= 0.6 && wetness <= 0.62, `the wetness settles at her lean (${wetness})`);
  assert.ok(interval >= 200 && interval <= 300, `the evolve settles at her lean (${interval})`);
  bar(44 * PHRASE_BARS);
  assert.ok(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, 'the mark goes when she has arrived');
});

ok('a recorded lean replays exactly: the same events land on the same dial values', () => {
  const run = () => {
    reset();
    const seen = [];
    decide({ wetness: 0.62, evolve: 1 });
    silence();
    for (let k = 1; k <= 16; k++) bar(k * PHRASE_BARS);
    for (const w of hers()) seen.push(`${w.kind}:${w.value}`);
    return { seen, wetness, interval };
  };
  const a = run();
  const b = run();
  assert.deepEqual(b, a, 'two identical event sequences produce identical writes');
  assert.ok(a.seen.length > 4, 'the replay actually moved the dials');
});

ok('with no lean the dials are bit-identical: an empty lean, another persona\u2019s lean, no decision at all', () => {
  reset();
  decide({}); // the rules answer: a lean key set, nothing in it
  silence();
  for (let k = 1; k <= 8; k++) bar(k * PHRASE_BARS);
  assert.deepEqual(hers(), [], 'an empty lean moves nothing');
  assert.equal(wetness, 0); assert.equal(interval, 2000);
  reset();
  decide({ wetness: 0.9, evolve: 1 }, 'davis');
  silence();
  for (let k = 1; k <= 8; k++) bar(k * PHRASE_BARS);
  assert.deepEqual(hers(), [], 'only her decisions lean the dials');
  reset();
  silence();
  for (let k = 1; k <= 8; k++) bar(k * PHRASE_BARS);
  assert.deepEqual(hers(), [], 'no decision, no lean');
});

ok('a hand on EITHER dial releases her from BOTH, until the silence ends or the input changes', () => {
  reset();
  decide({ wetness: 0.62, evolve: 1 });
  silence();
  bar(PHRASE_BARS);
  assert.equal(hers().length, 2, 'she is leaning');
  emit(Events.LAYOUT_PARAM, { key: 'accumulationWetness', value: 0.3 }); // the artist's hand: no opts
  wetness = 0.3;
  assert.ok(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, 'the mark goes at once');
  bar(2 * PHRASE_BARS); bar(3 * PHRASE_BARS);
  assert.equal(hers().length, 2, 'no further step on either dial while the artist holds them');
  // the window closing and a fresh silence re-arms her
  emit(Events.AUDIO_SILENCE_END, { ms: 9000 });
  silence();
  bar(4 * PHRASE_BARS);
  assert.equal(hers().length, 4, 'a new silence lets her lean again');
  emit(Events.DAVIS_EVOLVE, { interval: 4000 }); // the artist's other hand: no opts
  interval = 4000;
  bar(5 * PHRASE_BARS); bar(6 * PHRASE_BARS);
  assert.equal(hers().length, 4, 'the evolve hand releases the wetness too');
  // an unrelated layout write is not a hand on her dials
  emit(Events.AUDIO_INPUT, { source: 'file' });
  decide({ wetness: 0.62, evolve: 1 });
  silence();
  emit(Events.LAYOUT_PARAM, { key: 'density', value: 40 });
  bar(7 * PHRASE_BARS);
  assert.ok(hers().length > 4, 'other controls do not release her');
});

ok('she is idle when she should be: no hand from the room, too few keeps, the window closed', () => {
  reset(); ctx = { keeps, allowance: 0 };
  decide({ wetness: 0.62, evolve: 1 }); silence(); bar(PHRASE_BARS);
  assert.deepEqual(hers(), [], 'a room that gives her no hand');
  reset(); ctx = { keeps: keeps.slice(0, MIN_KEEPS - 1), allowance: 1 };
  decide({ wetness: 0.62, evolve: 1 }); silence(); bar(PHRASE_BARS);
  assert.deepEqual(hers(), [], 'fewer than the keep gate');
  reset();
  decide({ wetness: 0.62, evolve: 1 }); silence(); bar(PHRASE_BARS);
  const moved = hers().length;
  emit(Events.AUDIO_SILENCE_END, { ms: 9000 });
  bar(2 * PHRASE_BARS);
  assert.equal(hers().length, moved, 'the music is back: her window is closed');
});

ok('her steps are the only things she writes: the two dial events with cause lean, no clock, no die', () => {
  const src = readFileSync(new URL('./leanLive.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.deepEqual([...src.matchAll(/emit\(Events\.(\w+)/g)].map((m) => m[1]), ['LAYOUT_PARAM', 'DAVIS_EVOLVE']);
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|Math\.random/.test(src), 'no wall clock, no randomness');
});

ok('stopping the lean unhooks it and clears the mark', () => {
  reset();
  decide({ wetness: 0.62, evolve: 1 });
  silence();
  bar(PHRASE_BARS);
  assert.ok(getSwayMagnitude() > SWAY_VISIBLE_THRESHOLD);
  stop();
  assert.ok(getSwayMagnitude() <= SWAY_VISIBLE_THRESHOLD, 'the mark goes with her');
  const before = hers().length;
  bar(2 * PHRASE_BARS);
  assert.equal(hers().length, before);
  offWet(); offEvo();
});

console.log(`leanLive.selfcheck: ${n} checks passed`);
