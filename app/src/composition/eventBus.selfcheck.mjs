// node src/composition/eventBus.selfcheck.mjs
//
// #1641 — the quantized queue's cap drops are counted. The cap is
// right (a stopped clock must not grow a queue without bound); the
// drops used to leave no trace even in the bus's own record. The
// counter is backstage data for the DEV/census surface, reset by
// clearPending like everything else a fresh take clears.
import assert from 'node:assert/strict';
import { emitOn, releaseTick, clearPending, droppedPastCap, PENDING_CAP, on, Events } from './eventBus.js';

let checks = 0;
const ok = (name) => { checks += 1; console.log(`  [ok] ${name}`); };

clearPending();

// ── under the cap: nothing drops, the tick releases all ──
{
  for (let i = 0; i < PENDING_CAP; i++) assert.equal(emitOn('beat', Events.DAVIS_FAVORITE, { i }), true);
  assert.equal(droppedPastCap(), 0, 'a full-but-legal queue drops nothing');
  assert.equal(releaseTick('beat'), PENDING_CAP);
  ok('under the cap nothing drops');
}

// ── past the cap: the oldest go, the count says how many ──
{
  const seen = [];
  const off = on(Events.DAVIS_FAVORITE, (p) => seen.push(p.i));
  for (let i = 0; i < PENDING_CAP + 6; i++) emitOn('bar', Events.DAVIS_FAVORITE, { i });
  assert.equal(droppedPastCap(), 6, 'six events past the cap, six counted drops');
  assert.equal(releaseTick('bar'), PENDING_CAP, 'the queue still holds exactly the cap');
  assert.equal(seen[0], 6, 'the six oldest are the ones that went');
  assert.equal(seen.length, PENDING_CAP);
  off();
  ok('drops past the cap are counted, oldest first');
}

// ── a fresh take resets the count; an unknown unit drops nothing ──
{
  clearPending();
  assert.equal(droppedPastCap(), 0, 'clearPending starts a fresh count');
  assert.equal(emitOn('bogus', Events.DAVIS_FAVORITE, {}), false, 'unknown unit refused');
  assert.equal(droppedPastCap(), 0, 'a refused emit is not a drop');
  ok('the count resets with a fresh take');
}

console.log(`eventBus.selfcheck: ${checks} checks passed`);
