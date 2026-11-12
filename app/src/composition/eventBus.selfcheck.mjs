// node src/composition/eventBus.selfcheck.mjs
//
// #1641 — the quantized queue's cap drops are counted. The cap is
// right (a stopped clock must not grow a queue without bound); the
// drops used to leave no trace even in the bus's own record. The
// counter is backstage data for the DEV/census surface, reset by
// clearPending like everything else a fresh take clears.
import assert from 'node:assert/strict';
import {
  emit,
  emitOn,
  once,
  releaseTick,
  clearPending,
  droppedPastCap,
  PENDING_CAP,
  on,
  setStampProvider,
  Events,
} from './eventBus.js';

let checks = 0;
const ok = (name) => {
  checks += 1;
  console.log(`  [ok] ${name}`);
};

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

// ── #2101: once() hands over the meta envelope and can be cancelled ──
{
  const E = Events.DAVIS_FAVORITE;
  let got;
  once(E, (p, m) => (got = { p, m }));
  emit(E, { x: 1 }, { cause: 'test' });
  assert.deepEqual(got.p, { x: 1 }, 'the payload still arrives');
  assert.ok(got.m, 'a once listener receives the meta envelope');
  assert.equal(got.m.event, E);
  assert.equal(got.m.cause, 'test');
  assert.equal(typeof got.m.seq, 'number');
  ok('once() receives (payload, meta) like on()');
}
{
  const E = Events.DAVIS_FAVORITE;
  let calls = 0;
  const cancel = once(E, () => (calls += 1));
  assert.equal(typeof cancel, 'function', 'once returns an unsubscribe');
  cancel();
  emit(E, {}, { cause: 'test' });
  assert.equal(calls, 0, 'a cancelled once never fires');
  let fired = 0;
  once(E, () => (fired += 1));
  emit(E, {});
  emit(E, {});
  assert.equal(fired, 1, 'an uncancelled once still fires exactly once');
  ok('once() returns an unsubscribe that prevents the call');
}

// ── #2101: the envelope's identity fields win over a stamp provider ──
{
  const E = Events.DAVIS_FAVORITE;
  setStampProvider(() => ({ seq: 999, event: 'forged', cause: 'forged', bar: 7 }));
  let m;
  const off = on(E, (_p, meta) => (m = meta));
  emit(E, {}, { cause: 'real' });
  off();
  setStampProvider(null);
  assert.notEqual(m.seq, 999, 'a stamp cannot overwrite seq');
  assert.equal(m.event, E, 'a stamp cannot overwrite event');
  assert.equal(m.cause, 'real', 'a stamp cannot overwrite cause');
  assert.equal(m.bar, 7, 'the musical stamp still rides the envelope');
  ok('stamp provider cannot overwrite seq / event / cause');
}

console.log(`eventBus.selfcheck: ${checks} checks passed`);
