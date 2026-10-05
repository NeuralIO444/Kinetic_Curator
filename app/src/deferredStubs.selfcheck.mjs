// deferredStubs.selfcheck.mjs — #608 / #617 DEFERRED stubs.
// (#607's stage stub was un-deferred by its Phase B build — the real
// display/mirror modules carry their own selfchecks now.)
// Acceptance: each stub exists, is INERT (returns a "deferred" result,
// changes no live state, opens nothing, publishes nothing), and carries the
// exact hardware/verification requirement in its result.
import assert from 'node:assert';
import { startSyphonPublish, publishSyphonFrame, stopSyphonPublish, syphonCapability } from './panels/pipeline/syphonDeferred.js';
import { createLearnState, armLearn, cancelLearn, learnMessage, isLearnArmed } from './midi/learnDeferred.mjs';

// ── #608 syphon stub: inert, deferred ─────────────────────────────────────
{
  const r = startSyphonPublish('kc');
  assert.strictEqual(r.ok, false, 'syphon: nothing publishes while deferred');
  assert.strictEqual(r.deferred, true, 'syphon: result is marked deferred');
  assert.match(r.reason, /DEFERRED \(#608\)/, 'syphon: reason names the issue');
  assert.match(r.reason, /receiver/i, 'syphon: names the missing verification');
}
{
  const r = publishSyphonFrame();
  assert.strictEqual(r.ok, false, 'syphon: frame publish is a no-op while deferred');
  assert.strictEqual(r.deferred, true);
}
{
  const r = stopSyphonPublish();
  assert.strictEqual(r.ok, true, 'syphon: stop is safe/idempotent while deferred');
  assert.strictEqual(r.deferred, true);
}
{
  const r = syphonCapability();
  assert.strictEqual(r.available, false, 'syphon: honestly unavailable in this runtime');
}

// ── #617 learn stub: inert, deferred ──────────────────────────────────────
{
  const s0 = createLearnState();
  assert.strictEqual(isLearnArmed(s0), false, 'learn: starts disarmed');
  const s1 = armLearn(s0, 'evolve.toggle');
  assert.strictEqual(isLearnArmed(s1), true, 'learn: arms a real target');
  assert.strictEqual(s0.armed, null, 'learn: arm returns new state, does not mutate');
  const sBad = armLearn(s0, 'not.a.target');
  assert.strictEqual(sBad, s0, 'learn: unknown target is refused (same state back)');
  const claimed = learnMessage(s1, { type: 'cc', channel: 1, number: 7, value: 64 });
  assert.strictEqual(claimed.claimed, true, 'learn: message claimed while armed');
  assert.strictEqual(claimed.targetId, 'evolve.toggle');
  assert.ok(claimed.key, 'learn: produces a bind key');
  const unclaimed = learnMessage(s0, { type: 'cc', channel: 1, number: 7, value: 64 });
  assert.strictEqual(unclaimed.claimed, false, 'learn: nothing claimed while disarmed');
  const s2 = cancelLearn(s1);
  assert.strictEqual(isLearnArmed(s2), false, 'learn: cancel disarms');
}

console.log('deferred stubs: #608/#617 inert + deferred — ok');
