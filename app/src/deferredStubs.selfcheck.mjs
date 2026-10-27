// deferredStubs.selfcheck.mjs — #608 DEFERRED stub.
// (#607's stage stub was un-deferred by its Phase B build — the real
// display/mirror modules carry their own selfchecks now; #617's learn stub was
// un-deferred by the MIDI learn build — midi/learn.mjs, covered by midi.selfcheck.mjs.)
// Acceptance: each stub exists, is INERT (returns a "deferred" result,
// changes no live state, opens nothing, publishes nothing), and carries the
// exact hardware/verification requirement in its result.
import assert from 'node:assert';
import {
  startSyphonPublish,
  publishSyphonFrame,
  stopSyphonPublish,
  syphonCapability,
} from './panels/pipeline/syphonDeferred.js';

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

console.log('deferred stubs: #608 inert + deferred — ok');
