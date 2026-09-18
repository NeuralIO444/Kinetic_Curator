// node src/state/renderFault.selfcheck.mjs
//
// #266: the RENDER FAULT sticky flag. A deterministic per-frame fault (or a
// deterministic atlas-bake failure) sets it, and only an explicit clear —
// an honest recovery or a reload — removes it. Exercises the real slice, not
// a copy: createGlobalSlice is a plain (set) => ({...}) factory, so a tiny
// harness drives it without React or zustand.

import assert from 'node:assert';
import { createGlobalSlice } from './slices/globalSlice.js';

function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  state = { ...createGlobalSlice(set) };
  return { get: () => state };
}

// ── defaults: the pill must fail closed, never cry fault on boot ────────────
{
  const s = makeStore();
  assert.strictEqual(s.get().renderFault, false);
  assert.strictEqual(s.get().renderFaultReason, null);
}

// ── set(true) is sticky: sets the flag AND the diagnosis ────────────────────
{
  const s = makeStore();
  s.get().setRenderFault(true, 'frame fault: boom');
  assert.strictEqual(s.get().renderFault, true);
  assert.strictEqual(s.get().renderFaultReason, 'frame fault: boom');
}

// ── setting true again updates the diagnosis, stays sticky ──────────────────
{
  const s = makeStore();
  s.get().setRenderFault(true, 'frame fault: boom');
  s.get().setRenderFault(true, 'atlas bake failing: bad asset');
  assert.strictEqual(s.get().renderFault, true);
  assert.strictEqual(s.get().renderFaultReason, 'atlas bake failing: bad asset');
}

// ── clearing is explicit: false drops the flag AND the stale reason ─────────
{
  const s = makeStore();
  s.get().setRenderFault(true, 'frame fault: boom');
  s.get().setRenderFault(false);
  assert.strictEqual(s.get().renderFault, false);
  assert.strictEqual(s.get().renderFaultReason, null);
}

// ── default reason when none is given — never an empty tooltip ───────────────
{
  const s = makeStore();
  s.get().setRenderFault(true);
  assert.strictEqual(s.get().renderFault, true);
  assert.strictEqual(typeof s.get().renderFaultReason, 'string');
}

console.log('renderFault.selfcheck: OK');
