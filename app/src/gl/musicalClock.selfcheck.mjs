// #1458 — musical time on the loop clock: bars, beats, phase, tempo continuity, restart, determinism, purity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMusicalClock, BEATS_PER_BAR, MAX_TICKS_PER_ADVANCE } from './musicalClock.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const run = (steps, per) => { const c = createMusicalClock(per ? { beatsPerBar: per } : {}); return steps.map(([t, b]) => c.advance(t, b)); };

ok('120 BPM: a beat every 500 ms, a bar every 4 beats, phase runs 0..1 inside the beat', () => {
  const c = createMusicalClock();
  assert.deepEqual(c.advance(0, 120).ticks, [], 'arming ticks nothing');
  let r = c.advance(250, 120);
  assert.equal(r.phase, 0.5); assert.equal(r.beat, 0); assert.deepEqual(r.ticks, []);
  r = c.advance(500, 120);
  assert.deepEqual(r.ticks, [{ type: 'beat', bar: 0, beat: 1, bpm: 120 }]);
  r = c.advance(2000, 120); // beats 2, 3 and then 4 = the next bar's downbeat
  assert.deepEqual(r.ticks.map((t) => `${t.type}:${t.bar}.${t.beat}`), ['beat:0.2', 'beat:0.3', 'beat:1.0', 'bar:1.0']);
  assert.equal(r.bar, 1); assert.equal(r.beat, 0); assert.equal(r.phase, 0);
});

ok('a bar tick always follows the beat tick that starts it, and only then', () => {
  const rs = run(Array.from({ length: 41 }, (_, i) => [i * 100, 120]));
  const all = rs.flatMap((r) => r.ticks);
  const bars = all.filter((t) => t.type === 'bar');
  assert.ok(bars.length >= 2);
  for (const b of bars) assert.equal(b.beat, 0);
  for (let i = 0; i < all.length; i++) if (all[i].type === 'bar') assert.deepEqual([all[i - 1].type, all[i - 1].bar], ['beat', all[i].bar]);
});

ok('a tempo change bends the future and never jumps the past: beats do not skip or repeat', () => {
  const steps = [];
  for (let t = 0; t <= 4000; t += 50) steps.push([t, t < 2000 ? 90 : 160]);
  const beats = run(steps).flatMap((r) => r.ticks).filter((t) => t.type === 'beat').map((t) => t.bar * 4 + t.beat);
  assert.deepEqual(beats, beats.map((_, i) => i + 1), 'consecutive whole beats, in order, none missing');
  // 2 s at 90 = 3 beats, then 2 s at 160 = 5.33 beats: 8 beats by the end
  assert.equal(beats.length, 8);
});

ok('paused (the loop clock holds still) ticks nothing; a clock that goes back restarts the bars', () => {
  const c = createMusicalClock();
  c.advance(1000, 120); c.advance(1500, 120);
  assert.deepEqual(c.advance(1500, 120).ticks, [], 'no time, no ticks');
  const r = c.advance(200, 120); // REC restarted the scene
  assert.equal(r.restarted, true);
  assert.deepEqual([r.bar, r.beat, r.pos], [0, 0, 0]);
  assert.deepEqual(c.advance(700, 120).ticks.map((t) => t.type), ['beat'], 'and it counts again from the restart');
});

ok('a stalled tab cannot flood the bus; the BPM is clamped; junk input is ignored', () => {
  const c = createMusicalClock();
  c.advance(0, 120);
  const r = c.advance(600000, 120); // ten minutes in one step
  assert.ok(r.ticks.length <= MAX_TICKS_PER_ADVANCE + 2, `ticks capped (${r.ticks.length})`);
  assert.ok(createMusicalClock().advance(0, 99999).bpm <= 300);
  assert.ok(createMusicalClock().advance(0, NaN).bpm >= 30);
  const j = createMusicalClock(); j.advance(0, 120);
  assert.deepEqual(j.advance('x', 120).ticks, []); assert.deepEqual(j.advance(undefined, 120).ticks, []);
});

ok('other time signatures: 3 beats a bar', () => {
  const rs = run(Array.from({ length: 13 }, (_, i) => [i * 500, 120]), 3);
  const bars = rs.flatMap((r) => r.ticks).filter((t) => t.type === 'bar').map((t) => t.bar);
  assert.deepEqual(bars, [1, 2, 3, 4], '6 s at 120 BPM is 12 beats = four 3-beat bars');
  assert.equal(BEATS_PER_BAR, 4);
});

ok('deterministic: the same (loop ms, bpm) sequence gives the same ticks, byte for byte', () => {
  const seq = Array.from({ length: 300 }, (_, i) => [i * 16.7, 90 + (i % 60)]);
  assert.equal(JSON.stringify(run(seq)), JSON.stringify(run(seq)));
});

ok('pure: no wall clock, no timers, no DOM', () => {
  const src = readFileSync(new URL('./musicalClock.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|requestAnimationFrame|AudioContext|Math\.random|document|window/.test(src));
});

console.log(`musicalClock.selfcheck: ${n} checks passed`);
