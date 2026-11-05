// dishLifePhase.selfcheck.mjs — DISH LIFE slice 3a/3c (#1923): the idle-pickup clock.
//
//   A idle      wakes only after idleMs of no touch; a fresh page does not wake at once; empty stage never wakes
//   B touch     any source ends a running culture at once; audio only above its floor; junk sources ignored
//   C tempo     generation target = floor(dt × gps) on the loop clock, settling at maxGens
//   D off       disabled = no wake, no work; disabling mid-growth ends it
import assert from 'node:assert/strict';
import {
  createDishLifePhase,
  generationAt,
  IDLE_MS,
  GENS_PER_SEC,
  MAX_GENS,
  AUDIO_TOUCH_LEVEL,
  TOUCH_SOURCES,
} from './dishLifePhase.mjs';

// ---- A: idle
{
  const ph = createDishLifePhase();
  assert.equal(
    ph.tick(1_000_000).status,
    'asleep',
    'a freshly loaded page does not wake at once (the idle clock starts at the first tick)',
  );
  assert.equal(ph.tick(1_000_000 + IDLE_MS - 1).status, 'asleep', 'one ms short of idle: asleep');
  const w = ph.tick(1_000_000 + IDLE_MS);
  assert.equal(w.status, 'growing', 'idleMs of no touch: the culture wakes');
  assert.equal(w.wakeMs, 1_000_000 + IDLE_MS, 'the wake moment is the stamp the loop records');
  assert.equal(w.gen, 0, "it wakes at generation 0 — the performer's scene");
  const p2 = createDishLifePhase();
  p2.touch(0, 'pointer');
  assert.equal(p2.tick(IDLE_MS - 1).status, 'asleep');
  p2.touch(IDLE_MS - 1, 'key');
  assert.equal(p2.tick(2 * IDLE_MS - 2).status, 'asleep', 'the touch pushed the wake back');
  assert.equal(p2.tick(2 * IDLE_MS - 1).status, 'growing');
  const p3 = createDishLifePhase();
  p3.touch(0);
  assert.equal(p3.tick(10 * IDLE_MS, { hasMarks: false }).status, 'asleep', 'an empty stage never wakes');
  assert.equal(p3.tick(10 * IDLE_MS, { hasMarks: false }).wakeMs, null);
  assert.equal(p3.tick(10 * IDLE_MS).status, 'growing', 'and wakes as soon as there is something to seed from');
  const p4 = createDishLifePhase({ idleMs: 3000 });
  p4.touch(0);
  assert.equal(p4.tick(2999).status, 'asleep');
  assert.equal(p4.tick(3000).status, 'growing');
}

// ---- B: touch
{
  const grow = () => {
    const ph = createDishLifePhase();
    ph.touch(0);
    ph.tick(IDLE_MS);
    ph.tick(IDLE_MS + 1000);
    assert.equal(ph.status, 'growing');
    return ph;
  };
  for (const src of TOUCH_SOURCES) {
    const ph = grow();
    const r = ph.touch(IDLE_MS + 1100, src, 1);
    assert.equal(r.ended, true, `${src} ends a running culture`);
    assert.equal(r.wakeMs, IDLE_MS, 'the ended wake is handed back for the take');
    assert.equal(ph.status, 'asleep');
    assert.equal(ph.wakeMs, null);
    assert.equal(ph.endedCount, 1);
    assert.equal(ph.tick(IDLE_MS + 1100 + IDLE_MS - 1).status, 'asleep', 'and it needs a full idle again');
    assert.equal(ph.tick(IDLE_MS + 1100 + IDLE_MS).status, 'growing');
  }
  const quiet = grow();
  assert.equal(quiet.touch(IDLE_MS + 1100, 'audio', AUDIO_TOUCH_LEVEL / 2).ended, false, 'a quiet room is not a touch');
  assert.equal(quiet.status, 'growing');
  assert.equal(quiet.touch(IDLE_MS + 1100, 'audio', AUDIO_TOUCH_LEVEL).ended, true, 'audio at its floor is');
  const junk = grow();
  for (const s of ['wheel', '', null, 42])
    assert.equal(junk.touch(IDLE_MS + 1100, s).ignored, true, 'unknown sources are ignored');
  assert.equal(junk.status, 'growing');
}

// ---- C: tempo
{
  assert.equal(generationAt(1000, 1000), 0);
  assert.equal(generationAt(1000, 500), 0, 'before the wake is generation 0');
  assert.equal(generationAt(0, 1000, 8), 8);
  assert.equal(generationAt(0, 1124, 8), 8, 'floor, not round');
  assert.equal(generationAt(0, 1125, 8), 9);
  assert.equal(generationAt(0, 1e9, 8, 60), 60, 'capped at maxGens');
  const ph = createDishLifePhase();
  ph.touch(0);
  ph.tick(IDLE_MS);
  assert.equal(ph.tick(IDLE_MS + 500).gen, 4, 'half a second at 8 gen/s = 4 generations');
  assert.equal(ph.tick(IDLE_MS + 5000).gen, 40);
  const end = ph.tick(IDLE_MS + 60_000);
  assert.deepEqual([end.status, end.gen], ['settled', MAX_GENS], 'the arc ends: settled at maxGens');
  assert.equal(ph.tick(IDLE_MS + 90_000).gen, MAX_GENS, 'and holds there');
  assert.ok(GENS_PER_SEC >= 6 && GENS_PER_SEC <= 10, 'the ruled tempo band (6–10 gen/s)');
  const slow = createDishLifePhase({ gps: 2 });
  slow.touch(0);
  slow.tick(IDLE_MS);
  assert.equal(slow.tick(IDLE_MS + 3000).gen, 6, 'a custom tempo is honoured');
}

// ---- D: off
{
  const off = createDishLifePhase({ enabled: false });
  off.touch(0);
  const v = off.tick(100 * IDLE_MS);
  assert.deepEqual([v.status, v.wakeMs, v.gen], ['asleep', null, 0], 'off means off: it never wakes');
  const on = createDishLifePhase();
  on.touch(0);
  on.tick(IDLE_MS);
  assert.equal(on.status, 'growing');
  on.setEnabled(false);
  assert.equal(on.status, 'asleep', 'disabling mid-growth ends the culture');
  assert.equal(on.tick(100 * IDLE_MS).wakeMs, null);
  on.setEnabled(true);
  on.touch(100 * IDLE_MS);
  assert.equal(on.tick(101 * IDLE_MS).status, 'growing', 're-enabling restores the phase');
}
console.log('dishLifePhase.selfcheck: ok');
