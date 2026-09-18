// node src/state/watchdog.selfcheck.mjs
//
// #107 §4: two-tier watchdog. tripWatchdog is tier 2 — the hard stop (FPS ~0
// sustained, or a critical render-error) — one set() call that pauses
// running/evolve and does not undo itself. Exercises the real slice, not a
// copy: createGlobalSlice is a plain (set) => ({...}) factory, so a tiny
// harness drives it without React or zustand.

import assert from 'node:assert';
import { createGlobalSlice } from './slices/globalSlice.js';

function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  // evolveMode lives in davisSlice in the real store, not globalSlice — seed
  // it here so tripWatchdog's cross-slice write has something to flip.
  state = { ...createGlobalSlice(set), evolveMode: true };
  return { get: () => state };
}

// ── defaults ────────────────────────────────────────────────────────────
{
  const s = makeStore();
  assert.strictEqual(s.get().slowRender, false);
  assert.strictEqual(s.get().perfTier1, false);
  assert.strictEqual(s.get().watchdogTripGen, 0);
  assert.strictEqual(s.get().lastWatchdogReason, null);
  assert.strictEqual(s.get().running, true, 'running defaults true');
}

// ── one trip sets every field, increments gen by exactly 1 ────────────────
{
  const s = makeStore();
  s.get().tripWatchdog('fps-critical');
  assert.strictEqual(s.get().slowRender, true, 'slowRender set true');
  assert.strictEqual(s.get().perfTier1, true, 'perfTier1 set true');
  assert.strictEqual(s.get().running, false, 'running set false');
  assert.strictEqual(s.get().evolveMode, false, 'evolveMode set false');
  assert.strictEqual(s.get().watchdogTripGen, 1, 'gen incremented once');
  assert.strictEqual(s.get().lastWatchdogReason, 'fps-critical');
}

// ── a second trip increments again and records the NEW reason — the
// operator needs to know what is causing the CURRENT freeze ───────────────
{
  const s = makeStore();
  s.get().tripWatchdog('fps-critical');
  s.get().tripWatchdog('render-error (Shell)');
  assert.strictEqual(s.get().watchdogTripGen, 2, 'gen increments exactly once per call');
  assert.strictEqual(s.get().lastWatchdogReason, 'render-error (Shell)');
  // Still tripped — a second call while already tripped does not un-trip it.
  assert.strictEqual(s.get().running, false);
  assert.strictEqual(s.get().evolveMode, false);
}

console.log('watchdog.selfcheck: OK (#107 §4 two-tier watchdog)');

// #264 — manual resume contract: setRunning(true) (Space/RUN) after a
// watchdog hard stop clears the stop outright — slowRender, its source,
// and the badge's reason — so the badge can return to clean.
{
  const s = makeStore();
  assert.strictEqual(s.get().qualityShedFrom, null, 'qualityShedFrom defaults null');
  s.get().tripWatchdog('fps-critical');
  s.get().setRunning(true);
  assert.strictEqual(s.get().running, true, 'resumed');
  assert.strictEqual(s.get().slowRender, false, 'manual resume clears slowRender');
  assert.strictEqual(s.get().slowRenderSource, null, 'manual resume clears the source');
  assert.strictEqual(s.get().lastWatchdogReason, null, 'manual resume clears the badge reason');
}

// Pausing (running=false) never clears a watchdog stop.
{
  const s = makeStore();
  s.get().tripWatchdog('fps-critical');
  s.get().setRunning(false);
  assert.strictEqual(s.get().slowRender, true, 'pause keeps the stop');
  assert.strictEqual(s.get().slowRenderSource, 'watchdog');
  assert.strictEqual(s.get().lastWatchdogReason, 'fps-critical');
}

// A plain resume with no watchdog trip is untouched — and the cut-6 soft
// freeze is NOT cleared here (it auto-clears on FPS recovery in the hook).
{
  const s = makeStore();
  s.get().setRunning(false);
  s.get().setRunning(true);
  assert.strictEqual(s.get().slowRender, false);
  assert.strictEqual(s.get().lastWatchdogReason, null);
  s.get().setSlowRender(true, 'cut6');
  s.get().setRunning(true);
  assert.strictEqual(s.get().slowRender, true, 'soft freeze survives manual resume');
  assert.strictEqual(s.get().slowRenderSource, 'cut6');
}

console.log('watchdog.selfcheck: OK (#264 manual resume)');
