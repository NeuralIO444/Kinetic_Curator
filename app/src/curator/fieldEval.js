// fieldEval.js — pure step function + offline eval loop for the Director / FIELD.
// Deterministic. No live path. No inventing candidates. Seeded RNG only.

import { choosePoet, nextSlowDebt, preferredNext, isTypeNativeFamily } from './fieldDirector.js';
import { fieldDealReport, gateFieldForm } from '../poets/fieldForm.js';

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
    // S4 (#1905) — keep pressure: the caller's read of the room's keep/pass
    // velocity (the sense module's normalization, 0..1). Unmeasured = 0 = no lean.
    keepPressure: Number.isFinite(input.keepPressure) ? input.keepPressure : 0,
    genreLean: input.genreLean || null,
    rng,
    lastRejected: state.lastRejected,
    // #1932 — the genre gate: the caller names the CURRENT dealt look's
    // family (input.lookFamily); only a type-native family is eligible.
    // No family named → not eligible → silence (the default).
    typeEligible: isTypeNativeFamily(input.lookFamily),
    // #1982 — the kana context is narrower than type-eligibility: only a
    // Japanese room deals Teijo in her native script (a Swiss room is
    // type-native too, and deals her Latin face).
    japaneseContext: input.lookFamily === 'japanese',
    // #2002 (fix loop) — the slice-3 contexts, derived from the room exactly
    // as the kana context is: the Bauhaus family (the sentence face's room),
    // and the solo room — the verdict as this step resolves it, the input's
    // verdict else the room the session is standing in (DAVIS ALONE: the
    // serif face's and the plate break's room).
    bauhausContext: input.lookFamily === 'bauhaus',
    soloContext: verdict === 'DAVIS ALONE',
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

/** Scenario generators. Pure. #1932: every scenario stands in a type-native
 * room (lookFamily 'swiss') — these scenarios measure the TEMPERATURE
 * behaviour of the pick; the genre gate itself is measured in
 * curator/fieldSilence.selfcheck.mjs. */
export const SCENARIOS = {
  steadyCool: () => ({ intensity: 0.2, verdict: 'AGREEMENT', rejected: false, lookFamily: 'swiss' }),
  steadyHot: () => ({ intensity: 0.8, verdict: 'FULL BURN', rejected: false, lookFamily: 'swiss' }),
  hotStreak: (i) => ({
    intensity: i < 12 ? 0.85 : 0.4,
    verdict: i < 12 ? 'FULL BURN' : 'THE ROOM',
    rejected: false,
    lookFamily: 'swiss',
  }),
  withRejection: (i) => ({
    intensity: 0.5,
    verdict: 'THE ROOM',
    rejected: i % 5 === 0,
    lookFamily: 'swiss',
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

/**
 * FIELD S4 (#1905) — the room battery. evalLoop measures scenarios; the
 * battery measures ROOMS: seeded cells of (verdict, intensity, keep
 * pressure), each cell a continuous session of picks in one room through
 * the real step, every dealt decision placed through the real deal path
 * (fieldDealReport) so the stillborn gate is exercised on every form.
 *
 * Room temperature is the Director's intensity level (the sense module's
 * scalar — the same `intensity` the live tick hands the step); keep
 * pressure is the keep/pass velocity on the same normalization the
 * intensity tracker reads (the sense module's normalizeKeepPassVelocity).
 * Cells stand in a type-native room ('swiss') throughout: the battery
 * measures the temperature/pressure bias among eligible rooms — the genre
 * gate's own measurement lives in fieldSilence.selfcheck.mjs.
 *
 * Per cell it reports the poet distribution (counts + shares of deals),
 * the silence rate, the mean dealt density, the mean stamps per spawned
 * form, and the gate log: deals attempted, forms spawned, gate refusals
 * by reason, and stillbornSpawned — spawned forms that FAIL a gate
 * re-audit (must be 0: the gate is the only door a form can spawn
 * through, and the re-audit proves the door held). Placement aspect
 * rotates per draw across the stage's common geometries.
 */
export const BATTERY_CELLS = Object.freeze([
  { name: 'cool', verdict: 'AGREEMENT', intensity: 0.2, keepPressure: 0 },
  { name: 'coolKeep', verdict: 'AGREEMENT', intensity: 0.2, keepPressure: 0.8 },
  { name: 'neutral', verdict: 'THE ROOM', intensity: 0.5, keepPressure: 0 },
  { name: 'neutralKeep', verdict: 'THE ROOM', intensity: 0.5, keepPressure: 0.8 },
  { name: 'hot', verdict: 'FULL BURN', intensity: 0.85, keepPressure: 0 },
  { name: 'hotKeep', verdict: 'THE CLASH', intensity: 0.85, keepPressure: 0.8 },
]);

const BATTERY_ASPECTS = Object.freeze([0.6, 1, 10 / 7, 16 / 9]);

export function roomBattery({ seed = 1905, draws = 400 } = {}) {
  const makeRng = (s) => {
    let x = s;
    return () => {
      x = (x * 16807) % 2147483647;
      return (x - 1) / 2147483646;
    };
  };
  const cells = BATTERY_CELLS.map((cell, ci) => {
    let state = { ...INITIAL_STATE };
    const counts = { greenleaf: 0, teijo: 0, rosselli: 0, gibson: 0, silence: 0 };
    let densitySum = 0;
    let stampSum = 0;
    const gateLog = { deals: 0, spawned: 0, refused: { charset: 0, fit: 0, overlap: 0 }, stillbornSpawned: 0 };
    for (let i = 0; i < draws; i++) {
      const input = {
        intensity: cell.intensity,
        verdict: cell.verdict,
        keepPressure: cell.keepPressure,
        rejected: false,
        lookFamily: 'swiss',
      };
      const { nextState, decision } = step(state, input, makeRng(seed + ci * 100003 + i * 997));
      state = nextState;
      if (!decision) {
        counts.silence++;
        continue;
      }
      counts[decision.poetId]++;
      densitySum += decision.density;
      gateLog.deals++;
      const aspect = BATTERY_ASPECTS[i % BATTERY_ASPECTS.length];
      const { form, gate } = fieldDealReport(decision, makeRng(seed + ci * 100003 + i * 997 + 500009), { aspect });
      if (gate) {
        gateLog.refused[gate.reason] = (gateLog.refused[gate.reason] || 0) + 1;
        continue;
      }
      if (!form) continue; // threshold silence — a fragment, not a gate refusal
      gateLog.spawned++;
      stampSum += form.stamps.length;
      // The re-audit: a spawned form must pass the gate it came through.
      if (!gateFieldForm(form.stamps, { aspect: form.aspect }).ok) gateLog.stillbornSpawned++;
    }
    const dealt = draws - counts.silence;
    return {
      name: cell.name,
      verdict: cell.verdict,
      intensity: cell.intensity,
      keepPressure: cell.keepPressure,
      draws,
      counts,
      silenceRate: draws ? counts.silence / draws : 0,
      coolShare: dealt ? (counts.greenleaf + counts.teijo) / dealt : 0,
      hotShare: dealt ? (counts.rosselli + counts.gibson) / dealt : 0,
      meanDensity: dealt ? densitySum / dealt : 0,
      meanStamps: gateLog.spawned ? stampSum / gateLog.spawned : 0,
      gateLog,
    };
  });
  const totals = cells.reduce(
    (t, c) => ({
      deals: t.deals + c.gateLog.deals,
      spawned: t.spawned + c.gateLog.spawned,
      refused: {
        charset: t.refused.charset + c.gateLog.refused.charset,
        fit: t.refused.fit + c.gateLog.refused.fit,
        overlap: t.refused.overlap + c.gateLog.refused.overlap,
      },
      stillbornSpawned: t.stillbornSpawned + c.gateLog.stillbornSpawned,
    }),
    { deals: 0, spawned: 0, refused: { charset: 0, fit: 0, overlap: 0 }, stillbornSpawned: 0 },
  );
  return { seed, draws, cells, totals };
}
