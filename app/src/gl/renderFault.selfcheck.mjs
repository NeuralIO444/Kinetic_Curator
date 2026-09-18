// node src/gl/renderFault.selfcheck.mjs
//
// #266: the RENDER FAULT tracker is pure — failures are only a fault when
// they're deterministic (consecutive), and clearing requires a sustained
// run of clean presents, never one good frame.

import assert from 'node:assert';
import {
  createRenderFaultTracker,
  RENDER_FAULT_FAILS,
  RENDER_FAULT_RECOVERY,
  frameFaultReason,
  bakeFaultReason,
} from './renderFault.mjs';

function makeTracker() {
  const calls = [];
  const t = createRenderFaultTracker((on, reason) => calls.push({ on, reason }));
  return { t, calls };
}

// ── idle: not active, no notifications ─────────────────────────────────────
{
  const { t, calls } = makeTracker();
  assert.strictEqual(t.isActive(), false);
  assert.deepStrictEqual(calls, []);
}

// ── a single transient failure never trips the fault ────────────────────────
{
  const { t, calls } = makeTracker();
  t.noteFrameFailure(frameFaultReason(new Error('blip')));
  assert.strictEqual(t.isActive(), false, 'one failure is not a fault');
  t.noteCleanPresent();
  assert.strictEqual(t.isActive(), false);
  assert.deepStrictEqual(calls, []);
}

// ── FAILS consecutive failures trip it, once, with the diagnosis ────────────
{
  const { t, calls } = makeTracker();
  for (let i = 0; i < RENDER_FAULT_FAILS - 1; i++) {
    t.noteFrameFailure(frameFaultReason(new Error('x')));
  }
  assert.strictEqual(t.isActive(), false, 'below threshold');
  t.noteFrameFailure(frameFaultReason(new Error('boom')));
  assert.strictEqual(t.isActive(), true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].on, true);
  assert.match(calls[0].reason, /frame fault: boom/);
  // further failures don't re-notify
  t.noteFrameFailure(frameFaultReason(new Error('still broken')));
  assert.strictEqual(calls.length, 1, 'notify fires once per transition');
}

// ── a clean frame between failures resets the consecutive count ──────────────
{
  const { t } = makeTracker();
  for (let i = 0; i < RENDER_FAULT_FAILS - 1; i++) t.noteFrameFailure('f');
  t.noteCleanPresent();
  for (let i = 0; i < RENDER_FAULT_FAILS - 1; i++) t.noteFrameFailure('f');
  assert.strictEqual(t.isActive(), false, 'interrupted streak never trips');
}

// ── external (bake) fault: sticky, trips via its own threshold call ─────────
{
  const { t, calls } = makeTracker();
  t.noteExternalFault(bakeFaultReason(new Error('unrasterizable')));
  assert.strictEqual(t.isActive(), true);
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].reason, /atlas bake failing: unrasterizable/);
  t.noteExternalFault(bakeFaultReason(new Error('again')));
  assert.strictEqual(calls.length, 1, 'external fault also notifies once');
}

// ── clearing is honest: RECOVERY consecutive clean presents, not one ─────────
{
  const { t, calls } = makeTracker();
  for (let i = 0; i < RENDER_FAULT_FAILS; i++) t.noteFrameFailure('f');
  assert.strictEqual(t.isActive(), true);
  for (let i = 0; i < RENDER_FAULT_RECOVERY - 1; i++) t.noteCleanPresent();
  assert.strictEqual(t.isActive(), true, 'one good frame does not clear');
  assert.strictEqual(calls.length, 1);
  t.noteCleanPresent();
  assert.strictEqual(t.isActive(), false);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].on, false);
  assert.strictEqual(calls[1].reason, null);
}

// ── a failure after partial recovery restarts the clean run ─────────────────
{
  const { t } = makeTracker();
  for (let i = 0; i < RENDER_FAULT_FAILS; i++) t.noteFrameFailure('f');
  for (let i = 0; i < 10; i++) t.noteCleanPresent();
  t.noteFrameFailure('relapse');
  for (let i = 0; i < RENDER_FAULT_RECOVERY - 1; i++) t.noteCleanPresent();
  assert.strictEqual(t.isActive(), true, 'relapse resets the recovery run');
}

// ── reason label truncation keeps the tooltip one line ───────────────────────
{
  const long = new Error('x'.repeat(500));
  assert.ok(frameFaultReason(long).length < 200);
}

console.log('renderFault.selfcheck: OK');
