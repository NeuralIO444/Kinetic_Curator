// node src/state/startupChaos.selfcheck.mjs
//
// #946 — startup chaos: a cold launch fires exactly one full wild roll,
// then the instrument settles into normal tap behavior. START: FIXED boots
// the deterministic factory opener instead. Heat starts cool (first KIN
// tap after boot is a RULES pass).
import assert from 'node:assert';
import { useStore } from './store.js';
import { decideBoot } from './startupBoot.mjs';
import { routeKineticTapHeat } from '../panels/layout/kineticHeat.mjs';

const S = () => useStore.getState();

// 1. decideBoot truth table — every input combination.
const t = (inp) => decideBoot(inp).action;
assert.strictEqual(t({ shareApplied: true, factoryRequested: false, startupMode: 'chaos', hasDoc: true }), 'shared', 'share link wins over everything');
assert.strictEqual(t({ shareApplied: true, factoryRequested: true, startupMode: 'fixed', hasDoc: false }), 'shared', 'share link wins over factory+fixed');
assert.strictEqual(t({ shareApplied: false, factoryRequested: true, startupMode: 'chaos', hasDoc: true }), 'restore', '?boot=factory restores, never rolls');
assert.strictEqual(t({ shareApplied: false, factoryRequested: true, startupMode: 'chaos', hasDoc: false }), 'factory', '?boot=factory with no doc is the bare factory start');
assert.strictEqual(t({ shareApplied: false, factoryRequested: false, startupMode: 'fixed', hasDoc: true }), 'factory', 'FIXED skips the restore: the known opener is factory defaults');
assert.strictEqual(t({ shareApplied: false, factoryRequested: false, startupMode: 'fixed', hasDoc: false }), 'factory', 'FIXED with no doc is the factory start');
assert.strictEqual(t({ shareApplied: false, factoryRequested: false, startupMode: 'chaos', hasDoc: false }), 'roll', 'CHAOS fresh boot rolls');
assert.strictEqual(t({ shareApplied: false, factoryRequested: false, startupMode: 'chaos', hasDoc: true }), 'restore-roll', 'CHAOS with a saved project restores first, then rolls');

// 2. START mode setting: default chaos, sanitizes junk, session value sticks.
assert.strictEqual(S().startupMode, 'chaos', 'default START mode is CHAOS');
S().setStartupMode('fixed');
assert.strictEqual(S().startupMode, 'fixed', 'FIXED sticks for the session');
S().setStartupMode('bogus');
assert.strictEqual(S().startupMode, 'chaos', 'junk sanitizes back to CHAOS');
S().setStartupMode('chaos');

// 3. The factory opener is deterministic (checked before the roll below).
assert.strictEqual(S().seed, 0xa17e9b21, 'factory opener seed is the known default');

// 4. Cold launch fires exactly one roll = exactly one undo entry.
const undoBefore = S().historyUndoStack.length;
const seedBefore = S().seed;
S().kineticRoll();
assert.strictEqual(S().historyUndoStack.length, undoBefore + 1, 'the startup roll is exactly one undo entry');
assert.notStrictEqual(S().seed, seedBefore, 'the roll draws a fresh seed — launch twice, two different openings');

// 5. Heat starts cool: the first KIN tap after boot is a RULES pass.
const first = routeKineticTapHeat({ heat: 0, taps: 0, lastTapAt: 0 }, Date.now());
assert.strictEqual(first.layer, 'rules', 'first tap after a cold boot routes to RULES');
assert.strictEqual(first.heat, 0, 'no heat carried into the boot');

console.log('[startup-chaos] ok — decideBoot table, START setting, one-roll one-undo, factory opener, cool heat');
