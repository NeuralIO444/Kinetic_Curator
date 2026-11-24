// node src/curator/cultureRoomLive.selfcheck.mjs
// CULTURE Phase 5, slice C — the live-audio → room bridge, pinned from both ends.
//   1. gate OFF (every value but exactly true): the shell subscribes to NOTHING; bus events reach no world
//   2. gate ON: the shell subscribes exactly the room's events; each event lands in the world's room door; readings
//      that are not readings are ignored; the cleanup undoes every subscription
//   3. the real bus, end to end: energy, silence, a new input, the loop clock's tempo — and after cleanup, nothing
//   4. citizens wear their gaits on the beat: a world fed by the bridge gets the QUEEN's picks; with no audio, still;
//      the clock's tempo sets the gait clock's rate
//   5. the source: the bridge starts only after the gate's refusal, and stops in the cleanup
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startCultureRoom, CULTURE_ROOM_EVENTS } from './cultureRoomLive.js';
import { runCultureShell } from '../hooks/useCultureWorld.js';
import { emit, Events } from '../composition/eventBus.js';
import {
  standingCultureWorld,
  setStandingCultureWorld,
  createCultureWorld,
  stepCultureWorld,
} from '../engine/cultureWorld.mjs';
import { castCultureTake } from '../engine/cultureWorld.mjs';
import { CULTURE_TAKE_SHEET } from '../engine/cultureLab.mjs';
import { GAIT_DEFAULT_BPM } from '../engine/gait.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
/** A fake frame host with a recording bus door. */
function host() {
  const h = { requests: 0, pending: null, subs: [], offs: 0 };
  h.requestAnimationFrame = (f) => {
    h.requests++;
    h.pending = f;
    return h.requests;
  };
  h.cancelAnimationFrame = () => {};
  h.listen = (ev, fn) => {
    const sub = { ev, fn, live: true };
    h.subs.push(sub);
    return () => {
      sub.live = false;
      h.offs++;
    };
  };
  h.fire = (ev, p) => {
    for (const s of h.subs) if (s.live && s.ev === ev) s.fn(p);
  };
  return h;
}
const NO_ROOM = { energy: null, silent: 0, bpm: GAIT_DEFAULT_BPM };

// 1 — gate OFF.
{
  for (const off of [false, undefined, null, 0, 1, 'true', {}]) {
    const h = host();
    runCultureShell(off, 7, h);
    assert.equal(h.subs.length, 0, `gate ${JSON.stringify(off)}: nothing subscribes`);
    assert.equal(standingCultureWorld(), null);
  }
  // and the real bus with the gate off: events go nowhere (there is no world for them to reach)
  runCultureShell(false, 7, host());
  emit(Events.AUDIO_ENERGY, { level: 'high' });
  emit(Events.CLOCK_BEAT, { bar: 0, beat: 0, bpm: 90 });
  assert.equal(standingCultureWorld(), null);
  ok('gate OFF: the shell subscribes to nothing, for every value but exactly true; bus events reach no world');
}

// 2 — gate ON, a recording bus.
{
  const h = host();
  const cleanup = runCultureShell(true, 7, h);
  const w = standingCultureWorld();
  assert.deepEqual(
    h.subs.map((s) => s.ev),
    [...CULTURE_ROOM_EVENTS],
    'exactly the room events',
  );
  assert.deepEqual(
    [...CULTURE_ROOM_EVENTS],
    ['audio:energy', 'audio:silenceStart', 'audio:silenceEnd', 'audio:input', 'clock:beat', 'clock:bar'],
  );
  assert.deepEqual(w.gait.room, NO_ROOM, 'born with no reading: still');
  h.fire('audio:energy', { level: 'mid' });
  assert.equal(w.gait.room.energy, 'mid');
  h.fire('audio:energy', { level: 'loud' });
  h.fire('audio:energy', null);
  assert.equal(w.gait.room.energy, 'mid', 'a level that is not a level is ignored');
  h.fire('audio:silenceStart', { ms: 2100 });
  assert.equal(w.gait.room.silent, 1);
  h.fire('audio:silenceEnd', { ms: 400 });
  assert.equal(w.gait.room.silent, 0);
  h.fire('clock:beat', { bar: 1, beat: 2, bpm: 96 });
  assert.equal(w.gait.room.bpm, 96);
  h.fire('clock:bar', { bar: 2, bpm: 140 });
  assert.equal(w.gait.room.bpm, 140);
  for (const bad of [10, 900, NaN, '120', null, undefined]) h.fire('clock:beat', { bpm: bad });
  assert.equal(w.gait.room.bpm, 140, 'a tempo outside the door, or not a number, is ignored — never forced in');
  h.fire('audio:input', { source: 'file' });
  assert.deepEqual(w.gait.room, { energy: null, silent: 0, bpm: 140 }, 'a new piece forgets the old reading');
  cleanup();
  assert.equal(h.offs, CULTURE_ROOM_EVENTS.length, 'the cleanup undoes every subscription');
  h.fire('audio:energy', { level: 'high' });
  assert.equal(w.gait.room.energy, null, 'after cleanup nothing lands');
  ok(
    'gate ON: exactly the room events; each lands through the room door; junk ignored; cleanup undoes every subscription',
  );
}

// 3 — the real bus, end to end.
{
  const cleanup = runCultureShell(true, 9, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  const w = standingCultureWorld();
  emit(Events.AUDIO_ENERGY, { level: 'high' });
  emit(Events.CLOCK_BEAT, { bar: 0, beat: 1, bpm: 110 });
  assert.deepEqual(w.gait.room, { energy: 'high', silent: 0, bpm: 110 });
  emit(Events.AUDIO_SILENCE_START, { ms: 2500 });
  assert.equal(w.gait.room.silent, 1);
  cleanup();
  emit(Events.AUDIO_SILENCE_END, { ms: 10 });
  emit(Events.AUDIO_ENERGY, { level: 'low' });
  assert.deepEqual(w.gait.room, { energy: 'high', silent: 1, bpm: 110 }, 'unsubscribed: the bus no longer reaches it');
  assert.equal(standingCultureWorld(), null);
  ok('the real bus: energy, silence and the loop clock’s tempo reach the gated world; after cleanup, nothing');
}

// 4 — citizens wear their gaits on the beat.
{
  const fed = (events) => {
    const w = createCultureWorld({ seed: 7 });
    castCultureTake(w, CULTURE_TAKE_SHEET);
    const h = host();
    const stop = startCultureRoom(w, { listen: h.listen });
    for (const [ev, p] of events) h.fire(ev, p);
    for (let s = 0; s < 120 * 9; s++) stepCultureWorld(w);
    stop();
    return w;
  };
  const quiet = fed([]);
  assert.equal(quiet.gait.log.length, 0, 'no audio: no picks — still');
  assert.ok(Object.keys(quiet.gait.out).length === 0, 'nobody wears a gait');
  const loud = fed([
    ['audio:energy', { level: 'high' }],
    ['clock:beat', { bpm: 120 }],
  ]);
  assert.ok(
    loud.gait.log.length >= loud.citizens.list.filter((c) => c.alive).length,
    'the QUEEN picks for every wearer',
  );
  assert.ok(loud.gait.log.every((e) => e.by === 'queen'));
  const fast = fed([
    ['audio:energy', { level: 'high' }],
    ['clock:beat', { bpm: 180 }],
  ]);
  assert.ok(Math.abs(fast.gait.beats / loud.gait.beats - 1.5) < 1e-9, 'the clock’s tempo is the gait clock’s rate');
  ok(
    'citizens wear their gaits on the beat: no audio is still; the room’s energy gets the QUEEN’s picks; tempo sets the clock',
  );
}

// 5 — the source.
{
  const src = readFileSync(new URL('../hooks/useCultureWorld.js', import.meta.url), 'utf8');
  const refuse = src.indexOf('if (on !== true)');
  const start = src.indexOf('startCultureRoom(world');
  assert.ok(refuse > 0 && start > refuse, 'the bridge starts only after the gate’s refusal');
  assert.equal((src.match(/startCultureRoom\(/g) || []).length, 1, 'one start');
  assert.match(src, /stopRoom\(\);/, 'and stops in the cleanup');
  setStandingCultureWorld(null);
  ok('the source: the bridge starts only past the gate, once, and stops in the cleanup');
}

console.log(`cultureRoomLive.selfcheck: ${checks}/5 groups OK`);
