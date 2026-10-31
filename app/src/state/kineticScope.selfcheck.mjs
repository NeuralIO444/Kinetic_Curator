// node src/state/kineticScope.selfcheck.mjs
// #1772 follow-up — the START pill cycles OFF → WEAK → MED → KOZ and is the ceiling over every KINETIC tap. Pins the
// cycle and legacy reads, the decks and readout per state, and — through the real store — that each state's taps deal
// only from its decks: OFF a curated 4-shape set + the 33 looks + 19 voices, WEAK the whole library with the same
// looks/voices, MED/KOZ the 69/72; hammering reaches CHAOS only at KOZ; the curator's cap is the same everywhere; and
// WEAK/MED's launch opener is one look + voice pass in ONE undo entry.
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import {
  SCOPE_CYCLE,
  SCOPE_LABEL,
  sanitizeScope,
  nextScope,
  scopeDecks,
  deckReadout,
  CURATED_SETS,
} from './kineticScope.mjs';
import { paramDiff, NUDGE_MAX_KEYS, nudgeWithinCap } from './kineticSweep.mjs';
import { routeKineticTapHeat } from '../panels/layout/kineticHeat.mjs';
import { STYLE_LOOKS } from '../data/styleLooks.js';
import { VOICE_DECK } from '../data/voiceDeck.js';

const S = () => useStore.getState();
const on = () => Object.keys(S().enabledAssets || {}).filter((k) => S().enabledAssets[k]);

// 1. the cycle, the labels, the legacy values
assert.deepEqual(SCOPE_CYCLE, ['off', 'weak', 'med', 'koz']);
assert.deepEqual(SCOPE_CYCLE.map(nextScope), ['weak', 'med', 'koz', 'off'], 'tap advances and wraps');
assert.ok(
  SCOPE_CYCLE.every((m) => SCOPE_LABEL[m].length <= 4),
  'deadpan labels, ≤4 chars',
);
assert.equal(sanitizeScope('fixed'), 'off');
assert.equal(sanitizeScope('chaos'), 'koz');
assert.equal(sanitizeScope(undefined), 'koz');
assert.equal(nextScope('fixed'), 'weak', "a legacy FIXED pill's next tap is WEAK");

// 2. decks + the honest readout
assert.deepEqual(deckReadout('off'), { assets: 49, looks: 33, voices: 19 }, "OFF: today's smallest decks");
assert.deepEqual(deckReadout('weak').looks, 33);
assert.ok(deckReadout('weak').assets > 250, 'WEAK: the whole library');
assert.deepEqual(deckReadout('med'), { ...deckReadout('weak'), looks: 69, voices: 72 }); // #1854 re-pins: MED mirrors the full libraries — looks 64 → 69 (the Marks group) and voices 64 → 72 (the Marks voice family, ruled into the same slice by Matt, 2026-10-31); the counts are observed from the decks, not caps
assert.deepEqual(deckReadout('koz'), deckReadout('med'));
assert.equal(CURATED_SETS.length, 19);
const styleIds = new Set(STYLE_LOOKS.map((l) => l.id));
assert.ok(!scopeDecks('weak').looks.some((l) => styleIds.has(l.id)), 'WEAK deals no S4 style look');
assert.ok(!scopeDecks('weak').voices.some((v) => v.kind === 'family'), 'WEAK deals no S5 family voice');
assert.deepEqual(
  SCOPE_CYCLE.map((m) => scopeDecks(m).chaos),
  [false, false, false, true],
  'only KOZ reaches chaos',
);
assert.deepEqual(
  SCOPE_CYCLE.map((m) => scopeDecks(m).launch),
  ['factory', 'open', 'open', 'roll'],
);

// 3. hammering: CHAOS only when the ceiling allows it
const hammer = (chaos) => {
  let run = { heat: 0, taps: 0, lastTapAt: 0 };
  let now = 1e6;
  const out = [];
  for (let i = 0; i < 6; i++) {
    now += i === 0 ? 5000 : 300;
    run = routeKineticTapHeat(run, now, { chaos });
    out.push(run.layer);
  }
  return out;
};
assert.deepEqual(
  hammer(true),
  ['look', 'voice', 'chaos', 'chaos', 'chaos', 'chaos'],
  'KOZ: hammering breaks into chaos',
);
assert.deepEqual(
  hammer(false),
  ['look', 'voice', 'curator', 'curator', 'curator', 'curator'],
  'below KOZ: the curator holds',
);

// 4. through the store: each state's taps deal only from its decks; the curator cap is the same everywhere
const setKeys = new Set(CURATED_SETS.map((s) => s.join('|')));
const smallVoices = new Set(scopeDecks('off').voices.map((v) => v.id));
const smallLooks = new Set(scopeDecks('off').looks.map((l) => l.id));
for (const m of SCOPE_CYCLE) {
  S().setStartupMode(m);
  for (let i = 0; i < 25; i++) {
    S().kineticLookPass();
    if (m === 'off') assert.ok(setKeys.has(on().join('|')), `OFF: the pool is one curated 4-shape set, got ${on()}`);
    if (m === 'off' || m === 'weak')
      assert.ok(smallLooks.has(S().layoutParams.composition), `${m}: a look from the original 33`);
    S().kineticVoicePass();
    if (m === 'off' || m === 'weak') assert.ok(smallVoices.has(S().kineticVoiceId), `${m}: a voice from the 19`);
    const before = { ...S().layoutParams };
    S().kineticCuratorPass();
    const moves = S().kineticNudge.moves;
    assert.ok(moves.length <= NUDGE_MAX_KEYS && moves.every((x) => nudgeWithinCap(x.key, x.from, x.to)), `${m}: cap`);
    assert.deepEqual(paramDiff(before, S().layoutParams), moves.map((x) => x.key).sort());
  }
}
assert.ok(VOICE_DECK.length === 72); // #1854: 64 + the 8 Marks family voices

// 5. WEAK / MED's launch opener: one look + voice pass, ONE undo entry
for (const m of ['weak', 'med']) {
  S().setStartupMode(m);
  while (S().historyUndoStack.length > 10) S().undo(); // under UNDO_MAX_DEPTH, so the count is honest
  const depth = S().historyUndoStack.length;
  const comp = S().layoutParams.composition;
  const voice = S().kineticVoiceId;
  S().kineticOpenPass();
  assert.equal(S().historyUndoStack.length, depth + 1, `${m}: the opener is one undo entry`);
  assert.notEqual(S().layoutParams.composition, comp, `${m}: the opener deals a look`);
  assert.notEqual(S().kineticVoiceId, voice, `${m}: the opener deals a voice`);
  S().undo();
  assert.equal(S().layoutParams.composition, comp, `${m}: one undo takes the opener back`);
}
S().setStartupMode('koz');

console.log(
  'kineticScope.selfcheck: ok (#1772 — OFF/WEAK/MED/KOZ cycle, decks + readout, chaos only at KOZ, one-undo opener)',
);
