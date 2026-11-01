// fieldEval.js — pure step function + offline eval loop for the Director / FIELD.
// Deterministic. No live path. No inventing candidates. Seeded RNG only.

import { choosePoet, nextSlowDebt, preferredNext } from './fieldDirector.js';

export const INITIAL_STATE = Object.freeze({
  intensity: 0.5,
  slowDebtHistory: [],
  slowDebt: 0,
  lastPoet: null,
  lastRejected: false,
  room: null,
});

/**
 * Pure step. state + input + rng → { nextState, decision }.
 * decision is null when silence is chosen.
 */
export function step(state, input, rng) {
  const intensity = Number.isFinite(input.intensity) ? input.intensity : state.intensity;
  const verdict = input.verdict || state.room;
  const debtUpdate = nextSlowDebt(state.slowDebtHistory, verdict);
  const decision = choosePoet({
    intensity,
    slowDebt: debtUpdate.debt,
    genreLean: input.genreLean || null,
    rng,
    lastRejected: state.lastRejected,
  });
  const nextRoom = preferredNext(verdict, rng);
  const nextState = {
    intensity,
    slowDebtHistory: debtUpdate.history,
    slowDebt: debtUpdate.debt,
    lastPoet: decision ? decision.poetId : null,
    lastRejected: input.rejected === true,
    room: nextRoom || verdict,
  };
  return { nextState, decision };
}

/** Scenario generators. Pure. */
export const SCENARIOS = {
  steadyCool: () => ({ intensity: 0.2, verdict: 'AGREEMENT', rejected: false }),
  steadyHot: () => ({ intensity: 0.8, verdict: 'FULL BURN', rejected: false }),
  hotStreak: (i) => ({
    intensity: i < 12 ? 0.85 : 0.4,
    verdict: i < 12 ? 'FULL BURN' : 'THE ROOM',
    rejected: false,
  }),
  withRejection: (i) => ({
    intensity: 0.5,
    verdict: 'THE ROOM',
    rejected: i % 5 === 0,
  }),
};

/** Offline eval loop. Returns summary statistics. */
export function evalLoop(seed, steps, scenarioName = 'steadyCool') {
  const scenario = SCENARIOS[scenarioName] || SCENARIOS.steadyCool;
  let state = { ...INITIAL_STATE };
  const counts = { greenleaf: 0, teijo: 0, rosselli: 0, gibson: 0, silence: 0 };
  let thrash = 0;
  const makeRng = (s) => {
    let x = s;
    return () => {
      x = (x * 16807) % 2147483647;
      return (x - 1) / 2147483646;
    };
  };
  for (let i = 0; i < steps; i++) {
    const input = scenario(i, state);
    const rng = makeRng(seed + i * 997);
    const { nextState, decision } = step(state, input, rng);
    if (!decision) counts.silence++;
    else if (counts[decision.poetId] != null) counts[decision.poetId]++;
    if (state.room && nextState.room && state.room !== nextState.room) {
      // simple thrash proxy: non-adjacent jump would be counted here if we had the full graph check
      thrash++;
    }
    state = nextState;
  }
  const total = steps;
  return {
    seed,
    steps,
    scenario: scenarioName,
    counts,
    silenceRate: counts.silence / total,
    coolBias: (counts.greenleaf + counts.teijo) / total,
    hotBias: (counts.rosselli + counts.gibson) / total,
    thrash,
    finalDebt: state.slowDebt,
  };
}
