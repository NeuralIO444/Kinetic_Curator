// dishLifePhase.selfcheck.mjs — DISH LIFE slice 3a (#1923): the idle-pickup phase.
//
//   A idle      wakes only after idleMs of no touch; a fresh page does not wake at once; empty stage never wakes
//   B touch     any source ends a running culture at once; audio only above its floor; junk sources ignored
//   C tempo     generation = floor(dt × gps) on the loop clock, bounded per tick, settling at maxGens
//   D off       disabled = no culture, no work; disabling mid-growth ends it
//   E replay    the recorded wake rebuilds the exact culture the live phase showed
//   F shed      governor levels trickle / hold the culture without changing which generation g looks like
//   G terrain   locked terrain is bedrock from wake and while growing
import assert from 'node:assert/strict';
import {
  createDishLifePhase,
  cultureAt,
  generationAt,
  IDLE_MS,
  GENS_PER_SEC,
  MAX_GENS,
  SHED_STEPS,
  AUDIO_TOUCH_LEVEL,
  TOUCH_SOURCES,
} from './dishLifePhase.mjs';
import { cultureHash, population } from './dishLife.mjs';

const mk = (x, y, scale = 5, alpha = 100) => ({ x, y, scale, alpha });
const ITEMS = [mk(250, 150), mk(500, 250), mk(750, 350), mk(300, 380), mk(700, 120)];
const CTX = { items: ITEMS, canvasW: 1000, canvasH: 500, cols: 40, rows: 20 };

// ---- A: idle
{
  const ph = createDishLifePhase();
  assert.equal(
    ph.tick(1_000_000, CTX).status,
    'asleep',
    'a freshly loaded page does not wake at once (the idle clock starts at the first tick)',
  );
  assert.equal(ph.tick(1_000_000 + IDLE_MS - 1, CTX).status, 'asleep', 'one ms short of idle: asleep');
  const w = ph.tick(1_000_000 + IDLE_MS, CTX);
  assert.equal(w.status, 'growing', 'idleMs of no touch: the culture wakes');
  assert.ok(w.culture && w.gen === 0, "it wakes at generation 0 — the performer's scene");
  assert.equal(ph.record.wakeMs, 1_000_000 + IDLE_MS, 'the wake moment is recorded');
  // a touch restarts the count
  const p2 = createDishLifePhase();
  p2.touch(0, 'pointer');
  assert.equal(p2.tick(IDLE_MS - 1, CTX).status, 'asleep');
  p2.touch(IDLE_MS - 1, 'key');
  assert.equal(p2.tick(2 * IDLE_MS - 2, CTX).status, 'asleep', 'the touch pushed the wake back');
  assert.equal(p2.tick(2 * IDLE_MS - 1, CTX).status, 'growing');
  // an empty stage, or no ctx, never wakes (nothing to seed from) and never throws
  const p3 = createDishLifePhase();
  p3.touch(0);
  assert.equal(p3.tick(10 * IDLE_MS, { ...CTX, items: [] }).status, 'asleep');
  assert.equal(p3.tick(10 * IDLE_MS, null).status, 'asleep');
  assert.equal(p3.tick(10 * IDLE_MS, undefined).culture, null);
  // a custom idle time is honoured
  const p4 = createDishLifePhase({ idleMs: 3000 });
  p4.touch(0);
  assert.equal(p4.tick(2999, CTX).status, 'asleep');
  assert.equal(p4.tick(3000, CTX).status, 'growing');
}

// ---- B: touch
{
  const grow = () => {
    const ph = createDishLifePhase();
    ph.touch(0);
    ph.tick(IDLE_MS, CTX);
    ph.tick(IDLE_MS + 1000, CTX);
    assert.equal(ph.status, 'growing');
    return ph;
  };
  for (const src of TOUCH_SOURCES) {
    const ph = grow();
    const r = ph.touch(IDLE_MS + 1100, src, 1);
    assert.equal(r.ended, true, `${src} ends a running culture`);
    assert.equal(ph.status, 'asleep');
    assert.equal(ph.tick(IDLE_MS + 1100, CTX).culture, null, 'no culture after a touch');
    assert.ok(r.record && r.record.wakeMs === IDLE_MS, 'the ended wake is handed back for the take');
    assert.equal(ph.endedCount, 1);
    assert.equal(ph.tick(IDLE_MS + 1100 + IDLE_MS - 1, CTX).status, 'asleep', 'and it needs a full idle again');
    assert.equal(ph.tick(IDLE_MS + 1100 + IDLE_MS, CTX).status, 'growing');
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
  ph.tick(IDLE_MS, CTX);
  assert.equal(ph.tick(IDLE_MS + 500, CTX).gen, 4, 'half a second at 8 gen/s = 4 generations');
  // a long stall catches up at most SHED_STEPS[0] generations per tick
  const stalled = ph.tick(IDLE_MS + 5000, CTX);
  assert.equal(stalled.gen, 4 + SHED_STEPS[0], 'a stalled frame resumes in bounded steps, not one burst');
  let t = IDLE_MS + 5000;
  while (ph.status === 'growing' && t < IDLE_MS + 60_000) ph.tick((t += 16), CTX);
  assert.equal(ph.status, 'settled', 'the arc ends: settled at maxGens');
  assert.equal(ph.tick(t + 1000, CTX).gen, MAX_GENS, 'and holds there');
  assert.ok(GENS_PER_SEC >= 6 && GENS_PER_SEC <= 10, 'the ruled tempo band (6–10 gen/s)');
}

// ---- D: off
{
  const off = createDishLifePhase({ enabled: false });
  off.touch(0);
  const v = off.tick(100 * IDLE_MS, CTX);
  assert.equal(v.status, 'asleep');
  assert.equal(v.culture, null, 'off means off: no culture is ever built');
  assert.equal(off.record, null);
  const on = createDishLifePhase();
  on.touch(0);
  on.tick(IDLE_MS, CTX);
  assert.equal(on.status, 'growing');
  on.setEnabled(false);
  assert.equal(on.status, 'asleep', 'disabling mid-growth ends the culture');
  assert.equal(on.tick(100 * IDLE_MS, CTX).culture, null);
  on.setEnabled(true);
  on.touch(100 * IDLE_MS);
  assert.equal(on.tick(101 * IDLE_MS, CTX).status, 'growing', 're-enabling restores the phase');
}

// ---- E: replay
{
  const ph = createDishLifePhase();
  ph.touch(0);
  ph.tick(IDLE_MS, CTX);
  let t = IDLE_MS;
  let live;
  for (let i = 0; i < 120; i++) live = ph.tick((t += 16), CTX);
  const rec = ph.record;
  const rebuilt = cultureAt(rec, ITEMS, t);
  assert.equal(rebuilt.gen, live.gen, 'same generation at the same loop time');
  assert.equal(cultureHash(rebuilt), cultureHash(live.culture), 'and the exact same culture');
  const later = cultureAt(rec, ITEMS, t + 2000);
  assert.ok(
    later.gen > rebuilt.gen && cultureHash(later) !== cultureHash(rebuilt),
    'a later time is a later generation',
  );
  assert.equal(cultureAt(rec, ITEMS, rec.wakeMs).gen, 0);
  // two phases fed the same inputs are the same culture
  const b = createDishLifePhase();
  b.touch(0);
  b.tick(IDLE_MS, CTX);
  let tb = IDLE_MS;
  let lb;
  for (let i = 0; i < 120; i++) lb = b.tick((tb += 16), CTX);
  assert.equal(cultureHash(lb.culture), cultureHash(live.culture), 'deterministic');
}

// ---- F: shed
{
  const mkGrowing = () => {
    const ph = createDishLifePhase();
    ph.touch(0);
    ph.tick(IDLE_MS, CTX);
    return ph;
  };
  const held = mkGrowing();
  const h = held.tick(IDLE_MS + 2000, { ...CTX, shed: 2 });
  assert.equal(h.gen, 0, 'shed 2 holds the culture where it is');
  const tr = mkGrowing();
  const a = tr.tick(IDLE_MS + 2000, { ...CTX, shed: 1 }).gen;
  const b2 = tr.tick(IDLE_MS + 2016, { ...CTX, shed: 1 }).gen;
  assert.deepEqual([a, b2], [1, 2], 'shed 1 trickles one generation per tick');
  const target = generationAt(IDLE_MS, IDLE_MS + 2032);
  const rel = tr.tick(IDLE_MS + 2032, { ...CTX, shed: 0 });
  assert.ok(rel.gen > b2 && rel.gen <= target, 'releasing the shed catches up toward the loop clock, never past it');
  while (tr.tick(IDLE_MS + 2032, CTX).gen < target) {
    /* bounded steps per tick until caught up */
  }
  // shed never changes which generation g looks like: a shed-trickled culture at generation g equals the replay of g
  assert.equal(
    cultureHash(tr.tick(IDLE_MS + 2032, CTX).culture),
    cultureHash(cultureAt(tr.record, ITEMS, IDLE_MS + 2032)),
    'shed changes timing, never content',
  );
  assert.ok(tr.tick(IDLE_MS + 2032, { ...CTX, shed: 99 }).culture, 'a junk shed level is clamped, not fatal');
  assert.equal(SHED_STEPS[2], 0);
}

// ---- G: terrain
{
  const rock = new Uint8Array(40 * 20);
  for (let i = 0; i < rock.length; i += 3) rock[i] = 1;
  const ph = createDishLifePhase();
  ph.touch(0);
  const v = ph.tick(IDLE_MS, { ...CTX, bedrock: rock });
  for (let i = 0; i < rock.length; i++)
    if (rock[i]) assert.equal(v.culture.cur[i], 0, 'a locked cell is never alive at wake');
  let t = IDLE_MS;
  for (let i = 0; i < 100; i++) ph.tick((t += 50), { ...CTX, bedrock: rock });
  for (let i = 0; i < rock.length; i++)
    if (rock[i])
      assert.equal(
        ph.tick(t, { ...CTX, bedrock: rock }).culture.cur[i],
        0,
        'colonies flow around terrain while growing',
      );
  // terrain locked after the wake kills what is under it at once
  const ph2 = createDishLifePhase();
  ph2.touch(0);
  const g = ph2.tick(IDLE_MS, CTX);
  const live = g.culture.cur.findIndex((s) => s === 1);
  assert.ok(live >= 0 && population(g.culture).alive > 0);
  const lock = new Uint8Array(40 * 20);
  lock[live] = 1;
  assert.equal(ph2.tick(IDLE_MS, { ...CTX, bedrock: lock }).culture.cur[live], 0, 'a newly locked cell dies at once');
}
console.log('dishLifePhase.selfcheck: ok');
