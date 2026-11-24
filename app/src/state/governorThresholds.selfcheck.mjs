// node src/state/governorThresholds.selfcheck.mjs
//
// #2482 — the governor threshold pair's law, pinned at three levels:
// the pure clamps (governorThresholds.mjs), the real slice setters
// (driven headlessly, the watchdog.selfcheck harness pattern), and the
// GOV TUNE panel's source contract (draft-commit field + visible clamp
// note, never the old per-keystroke write-through).
//
// The defect, from the stress session: recover sat at 120 on a 60 fps
// screen — settable because the setters capped at an absolute 120, and
// unfixable by typing because every keystroke went through the clamp
// (over shed 20, "25" became 21 on the first digit, then 215 → 120).

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  GOVERNOR_FPS_ABSOLUTE_MAX,
  GOVERNOR_MIN_GAP_FPS,
  effectiveMaxFps,
  clampShedFps,
  clampRecoverFps,
  reconcileThresholdPair,
  clampNoteFor,
} from './governorThresholds.mjs';
import { createGlobalSlice } from './slices/globalSlice.js';

// ── effectiveMaxFps ─────────────────────────────────────────────────
assert.strictEqual(effectiveMaxFps(null), 120, 'no measurement → the absolute cap binds');
assert.strictEqual(effectiveMaxFps(undefined), 120, 'undefined measurement → absolute cap');
assert.strictEqual(effectiveMaxFps(60), 60, 'a measured 60 binds at 60');
assert.strictEqual(effectiveMaxFps(144), 120, 'a fast screen is still capped by the pair domain');
assert.strictEqual(effectiveMaxFps(1), 120, 'a sub-lawful measurement is no measurement');
assert.strictEqual(effectiveMaxFps('abc'), 120, 'garbage measurement → absolute cap');

// ── clampRecoverFps ─────────────────────────────────────────────────
{
  // The trap value itself: 120 requested on a 60Hz screen, shed at 20.
  const out = clampRecoverFps(120, { shedFps: 20, displayMaxFps: 60, current: 30 });
  assert.strictEqual(out.value, 60, 'recover clamps to the screen max');
  assert.strictEqual(out.clamped, true);
  assert.strictEqual(out.reason, 'screen');
  // The value the stress session could not type: 25 over shed 20 is lawful.
  const typed = clampRecoverFps(25, { shedFps: 20, displayMaxFps: 60, current: 120 });
  assert.strictEqual(typed.value, 25, 'a lawful typed value takes exactly');
  assert.strictEqual(typed.clamped, false);
  // The gap floor: recover must sit above shed.
  const gap = clampRecoverFps(15, { shedFps: 20, displayMaxFps: 60, current: 30 });
  assert.strictEqual(gap.value, 20 + GOVERNOR_MIN_GAP_FPS, 'recover floors at shed + gap');
  assert.strictEqual(gap.reason, 'gap');
  // No measurement yet: only the absolute cap binds.
  const early = clampRecoverFps(150, { shedFps: 20, displayMaxFps: null, current: 30 });
  assert.strictEqual(early.value, GOVERNOR_FPS_ABSOLUTE_MAX, 'pre-measurement, the absolute cap binds');
  assert.strictEqual(early.reason, 'range');
  // Garbage keeps the current value — the setters' long-standing contract.
  assert.strictEqual(clampRecoverFps('abc', { shedFps: 20, displayMaxFps: 60, current: 30 }).value, 30);
  assert.strictEqual(clampRecoverFps(0, { shedFps: 20, displayMaxFps: 60, current: 30 }).value, 30);
  assert.strictEqual(clampRecoverFps('', { shedFps: 20, displayMaxFps: 60, current: 30 }).value, 30);
}

// ── clampShedFps ────────────────────────────────────────────────────
{
  const gap = clampShedFps(35, { recoverFps: 30, displayMaxFps: 60, current: 28 });
  assert.strictEqual(gap.value, 29, 'shed ceilings at recover − gap');
  assert.strictEqual(gap.reason, 'gap');
  const ok = clampShedFps(20, { recoverFps: 30, displayMaxFps: 60, current: 28 });
  assert.strictEqual(ok.value, 20, 'a lawful shed takes exactly');
  assert.strictEqual(ok.clamped, false);
  // Degenerate pair (recover written pre-measurement): the screen
  // ceiling binds shed too, so each setter is independently lawful.
  const screen = clampShedFps(90, { recoverFps: 120, displayMaxFps: 60, current: 28 });
  assert.strictEqual(screen.value, 59, 'shed also respects the screen max (minus the gap)');
  assert.strictEqual(screen.reason, 'screen');
}

// ── reconcileThresholdPair ──────────────────────────────────────────
{
  // The pre-measurement pair (shed 100 / recover 120) meets a 60Hz screen.
  assert.deepStrictEqual(
    reconcileThresholdPair({ shedFps: 100, recoverFps: 120 }, 60),
    { shedFps: 59, recoverFps: 60 },
    'the measurement corrects a pre-measurement pair: recover to the max, shed under it',
  );
  assert.deepStrictEqual(
    reconcileThresholdPair({ shedFps: 28, recoverFps: 30 }, 60),
    { shedFps: 28, recoverFps: 30 },
    'a lawful pair is untouched',
  );
  assert.deepStrictEqual(
    reconcileThresholdPair({ shedFps: 28, recoverFps: 30 }, null),
    { shedFps: 28, recoverFps: 30 },
    'no measurement, no change',
  );
}

// ── clampNoteFor (ruling 2: never a silent adjustment) ──────────────
assert.strictEqual(
  clampNoteFor(clampRecoverFps(120, { shedFps: 20, displayMaxFps: 60, current: 30 }), 'recover'),
  'screen max 60',
  'the screen clamp names the measured max',
);
assert.strictEqual(
  clampNoteFor(clampRecoverFps(15, { shedFps: 20, displayMaxFps: 60, current: 30 }), 'recover'),
  'must stay above shed',
);
assert.strictEqual(
  clampNoteFor(clampShedFps(35, { recoverFps: 30, displayMaxFps: 60, current: 28 }), 'shed'),
  'must stay below recover',
);
assert.strictEqual(
  clampNoteFor(clampRecoverFps(25, { shedFps: 20, displayMaxFps: 60, current: 30 }), 'recover'),
  null,
  'an unclamped commit shows no note',
);

// ── the real slice setters ──────────────────────────────────────────
function makeStore() {
  let state = {};
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  state = { ...createGlobalSlice(set) };
  return { get: () => state };
}

{
  const s = makeStore();
  assert.strictEqual(s.get().governorShedFps, 28, 'shed default 28');
  assert.strictEqual(s.get().governorRecoverFps, 30, 'recover default 30');
  assert.strictEqual(s.get().displayMaxFps, null, 'no measurement at boot');

  // Before any measurement, the absolute cap alone binds (as it did).
  s.get().setGovernorRecoverFps(120);
  assert.strictEqual(
    s.get().governorRecoverFps,
    120,
    'pre-measurement, 120 is settable — the window the reconcile exists for',
  );

  // The measurement lands; the governor's reconcile corrects the pair.
  s.get().setDisplayMaxFps(60);
  assert.strictEqual(s.get().displayMaxFps, 60);
  s.get().reconcileGovernorThresholds();
  assert.strictEqual(s.get().governorRecoverFps, 60, 'reconcile pulls recover to the measured max');

  // From here the trap is unrepresentable through the setter.
  s.get().setGovernorRecoverFps(120);
  assert.strictEqual(s.get().governorRecoverFps, 60, 'post-measurement, 120 clamps to the screen max');
  s.get().setGovernorShedFps(20);
  s.get().setGovernorRecoverFps(25);
  assert.strictEqual(s.get().governorRecoverFps, 25, 'the value typing could not enter now takes');
  s.get().setGovernorShedFps(35);
  assert.strictEqual(s.get().governorShedFps, 24, 'shed stays below recover by the gap');

  // Raise-only measurement: a loaded window never lowers the ceiling.
  s.get().setDisplayMaxFps(30);
  assert.strictEqual(s.get().displayMaxFps, 60, 'a lower later estimate is ignored');
  s.get().setDisplayMaxFps(120);
  assert.strictEqual(s.get().displayMaxFps, 120, 'a higher estimate raises the ceiling');
  s.get().setDisplayMaxFps('abc');
  assert.strictEqual(s.get().displayMaxFps, 120, 'garbage measurement ignored');
}

// ── the panel's source contract ─────────────────────────────────────
{
  const src = readFileSync(new URL('../panels/GovernorTunePanel.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('governorThresholds.mjs'), 'panel imports the pair law');
  assert.ok(src.includes('clampNoteFor'), 'panel renders the clamp note from the law');
  assert.ok(src.includes('setDraft'), 'the field edits a local draft');
  assert.ok(src.includes('onBlur={commit}'), 'the draft commits on blur');
  assert.ok(!src.includes('setValue(e.target.value)'), 'the per-keystroke write-through (the typing bug) is gone');
}

console.log('governorThresholds.selfcheck: OK (#2482 pair law: gap + screen max, visible clamp, draft-commit field)');
