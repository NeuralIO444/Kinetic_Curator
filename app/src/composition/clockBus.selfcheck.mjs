// #1458 / #1457 — the clock on the bus: clock:beat and clock:bar events, the opt-in envelope, quantised emit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Events, emit, on, emitOn, PENDING_CAP, clearPending } from './eventBus.js';
import { observeClock, resetClock, getMusicalTime } from './clockLive.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const drive = (from, to, step, bpm = 120) => { for (let t = from; t <= to; t += step) observeClock(t, bpm); };
const log = [];
on(Events.CLOCK_BEAT, (p, m) => log.push(['beat', p, m]));
on(Events.CLOCK_BAR, (p, m) => log.push(['bar', p, m]));

ok('beats and bars are published once each, in order, stamped with the clock', () => {
  resetClock(); log.length = 0;
  drive(0, 2000, 20); // 4 beats: the 5th (beat 4) is the next downbeat
  const beats = log.filter((l) => l[0] === 'beat');
  assert.deepEqual(beats.map((l) => [l[1].bar, l[1].beat]), [[0, 1], [0, 2], [0, 3], [1, 0]]);
  const bars = log.filter((l) => l[0] === 'bar');
  assert.deepEqual(bars.map((l) => l[1].bar), [1]);
  for (const l of log) {
    assert.equal(l[2].cause, 'clock');
    assert.ok(Number.isInteger(l[2].seq) && l[2].seq > 0);
    assert.ok(l[2].loopMs >= 0 && l[2].bpm === 120);
  }
  const seqs = log.map((l) => l[2].seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'seq only goes up');
});

ok('the envelope is OPT-IN: a plain emit hands listeners no meta, so every existing listener is untouched', () => {
  let got = 'unset';
  const off = on('probe:event', (p, m) => { got = [p, m]; });
  emit('probe:event', { a: 1 });
  assert.deepEqual(got, [{ a: 1 }, undefined]);
  emit('probe:event', { a: 2 }, { cause: 'test' });
  assert.equal(got[1].cause, 'test'); assert.equal(got[1].event, 'probe:event');
  off();
});

ok('emitOn("beat") lands on the next beat, emitOn("bar") on the next downbeat, in queue order, stamped with that tick', () => {
  resetClock(); clearPending();
  const seen = [];
  const off = on('probe:q', (p, m) => seen.push([p.id, m.bar, m.beat, m.quantized]));
  drive(0, 600, 100); // beat 1 has fired at 500
  emitOn('bar', 'probe:q', { id: 'davis-asset' }, { cause: 'davis' });
  emitOn('beat', 'probe:q', { id: 'critic-a' }, { cause: 'lois' });
  emitOn('beat', 'probe:q', { id: 'critic-b' }, { cause: 'lois' });
  assert.deepEqual(seen, [], 'nothing lands before a tick');
  drive(700, 1000, 100); // beat 2 at 1000
  assert.deepEqual(seen, [['critic-a', 0, 2, 'beat'], ['critic-b', 0, 2, 'beat']], 'beat-quantised land on the next beat');
  drive(1100, 2000, 100); // downbeat of bar 1 at 2000
  assert.deepEqual(seen[2], ['davis-asset', 1, 0, 'bar'], 'the bar-quantised one waits for the downbeat');
  assert.equal(emitOn('nope', 'probe:q', {}), false, 'an unknown unit queues nothing');
  off();
});

ok('a stopped clock cannot grow the queue without bound; a restarted scene drops what was waiting', () => {
  resetClock(); clearPending();
  for (let i = 0; i < PENDING_CAP + 20; i++) emitOn('bar', 'probe:cap', { i });
  let count = 0; const off = on('probe:cap', () => { count++; });
  drive(0, 2000, 100);
  assert.equal(count, PENDING_CAP, 'capped at PENDING_CAP, oldest dropped');
  emitOn('bar', 'probe:cap', { i: 'x' });
  observeClock(100, 120); // the loop clock went back (2000 -> 100): REC restarted the scene
  drive(100, 2100, 100);
  assert.equal(count, PENDING_CAP, 'the waiting emit was dropped by the restart, not delivered into the new take');
  off();
});

ok('the phase is readable every frame without a bus event', () => {
  resetClock();
  drive(0, 250, 50);
  const t = getMusicalTime();
  assert.equal(t.bar, 0); assert.equal(t.beat, 0); assert.ok(Math.abs(t.phase - 0.5) < 1e-9);
});

ok('pure of wall clocks (the #807 law): the driver and the clock read only the loop time they are given', () => {
  for (const f of ['./clockLive.js', '../gl/musicalClock.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|AudioContext/.test(src), f);
  }
});

console.log(`clockBus.selfcheck: ${n} checks passed`);
