// Beat arbiter — one mic attack, ordered consumers, no race.
//
// Before this file, a single audio attack drove two independent consumers:
// App.jsx `onBeat` fired Evolve (SOURCE=BEAT) and bumped `beatPulse`, which
// usePhraseLoop watched to tick the phrase bar (CLOCK=AUDIO). Arm both and
// one clap did both — evolve fired first, the phrase ticked after a
// re-render, and on a saturated pulse the phrase silently skipped while
// evolve still fired. Two writers on `seed`, no declared order.
//
// Now the attack enters once, here, and the router decides who answers:
//   PHRASE — the clock ticks only (evolve ignores the beat)
//   EVOLVE — the gate fires only (the bar holds)
//   BOTH   — recommended: the clock resolves first, then the gate fires on
//            the post-phrase state. Phrase is a clock, evolve is a gate.
//
// This function is pure (returns a decision, performs nothing) so the
// ordering rule is testable in `beatArbiter.selfcheck.mjs` without a store.

export const BEAT_ROUTES = ['phrase', 'evolve', 'both'];

export function sanitizeBeatRoute(route) {
  return BEAT_ROUTES.includes(route) ? route : 'both';
}

/**
 * Decide what a beat does. Returns `{ tickPhrase, fireEvolve }`.
 *
 * - `gated` is false under slowRender or batchPaused (same automatic-trigger
 *   pause the TIME interval honors — #107 §4/§5).
 * - Phrase only answers AUDIO-clock beats; METRO ticks on its own interval.
 * - When both fire on one beat, phrase ticks first so evolve reads the
 *   post-wrap state (wrap may home/step the seed; evolve then jumps from
 *   there). Deterministic every time — never a coin flip on `seed`.
 */
export function routeBeat(state) {
  const route = sanitizeBeatRoute(state.beatRoute);
  const phraseArmed =
    !!state.phraseEnabled &&
    (state.phraseClock || 'audio') === 'audio' &&
    !!state.audioEnabled;
  const evolveArmed = !!state.evolveMode && state.evolveSource === 'beat';
  const gated = !state.slowRender && !state.batchPaused;
  return {
    route,
    phraseArmed,
    evolveArmed,
    gated,
    tickPhrase: gated && phraseArmed && route !== 'evolve',
    fireEvolve: gated && evolveArmed && route !== 'phrase',
  };
}
