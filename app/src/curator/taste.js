// taste.js — persona-weighted interim taste scorer for the Curator.
//
// The MLX taste model is NOT trained yet (docs/MLX_CURATOR_RUNBOOK.md has
// not been run on the Mac Studio), so there is no embedding ranker to call.
// This module is the honest interim: it measures 19 real visual features
// from each candidate's params — nothing rendered, nothing faked — and
// scores them against a persona's distilled Loves/Avoids (personaTastes.js).
//
// When the MLX ranker lands it slots in as just another scorer: it
// implements the same engine contract ({ name, status(), pick() }) and
// takes priority in curate.js's getActiveCurator(). This file is then
// retired or kept as a cold-start fallback — the contract doesn't care.

import { PERSONA_TASTES, getPersonaTaste } from './personaTastes.js';
import { getRenderProfile, applyRenderProfile } from './renderProfiles.js';
import { rankLois } from './loisRank.js';
import { getDirector, blendPick } from './director.js';
import { getPhase } from './phase.js';
import { loisActivity } from './loisActivity.js';

// Re-exported so UI code has a single import site for persona data.
export { PERSONA_TASTES };

// LOIS is a rank + voice, not a taste weight and not a render profile (#948).
// Selectable. Not the house default — Davis stays the working creed.
export const LOIS_VOICE = {
  id: 'lois',
  alias: 'LOIS',
  title: 'LOIS',
  heuristic: true,
  rationale: 'Hand-tuned rank: glance, distance from the pile, boldness. Not a trained eye.',
};

export function voiceOptions() {
  return [LOIS_VOICE, ...PERSONA_TASTES];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Unknown/missing feature: neutral 0.5, never 0 (0 would read as "absent").
const num = (v, lo, hi) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp01((v - lo) / (hi - lo)) : 0.5;
const rangeMean = (r, lo, hi) =>
  Array.isArray(r) && r.length >= 2 ? num((r[0] + r[1]) / 2, lo, hi) : 0.5;
const rangeSpan = (r, lo, hi) =>
  Array.isArray(r) && r.length >= 2 ? num(Math.abs(r[1] - r[0]), 0, hi - lo) : 0.5;

/**
 * Measure 19 honest visual features from a candidate layoutParams object.
 * Every feature is normalized 0..1 and computed only from values that are
 * actually in the params. Palette is NOT randomized by the Curator, so
 * there is deliberately no palette feature — that would be a fake signal.
 * Never throws; never mutates its input.
 */
export function extractFeatures(params) {
  const p = params ?? {};
  const disorder = (num(p.jitter, 0, 150) + num(p.displacement, 0, 150)) / 2;
  return {
    markDensity: num(p.count, 30, 600),
    markSize: rangeMean(p.scale, 0.1, 3.0),
    sizeVariety: rangeSpan(p.scale, 0.1, 3.0),
    rotationSpread: rangeSpan(p.rotate, -180, 180),
    opacity: rangeMean(p.alpha, 10, 100),
    opacityVariety: rangeSpan(p.alpha, 10, 100),
    disorder,
    coverage: num(p.density, 20, 120),
    depth: num(p.zTiers, 1, 10),
    flowEnergy: num(p.noiseSpeed, 0.1, 2.0),
    flowWarp: num(p.noiseFreq, 0.002, 0.015),
    swarmDrive: num(p.swarmCohesion, 0.2, 4.0),
    attractors: num(p.gravityWells, 0.1, 3.0),
    particles: num(p.particleCount, 50, 300),
    calm: num(p.damping, 0.9, 0.98),
    // #518 motion features — from the same keys the Motion factors drive.
    windPush: num(p.wind, 0, 3),
    breathSwell: num(p.breath, 0, 1),
    drift: num(p.lifeDrift, 0, 1),
    flowRate: num(p.flap, 0, 1), // flap = wing/tail beat rate
  };
}

/** Dot product of features against a persona's taste weights. */
export function scoreCandidate(features, weights) {
  let s = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (typeof features[k] === 'number') s += w * features[k];
  }
  return s;
}


/**
 * Pick a candidate index for a persona. Scores all candidates, takes the
 * top 3, and softmax-samples among them (temperature 0.4) so the best
 * usually wins but the pick doesn't feel robotic. rng is injectable:
 * pass a seeded RNG for determinism (same seed → same pick); production
 * passes Math.random. Returns -1 for empty input. Never mutates candidates.
 *
 * temperature is the Director's dial (#1145): effectiveTemp() is the single
 * source of truth. Defaults to 0.4 — yesterday's behavior when the Director
 * is silent.
 */
export function pickPersona(candidates, personaId, rng = Math.random, temperature = 0.4) {
  const n = candidates.length;
  if (n === 0) return -1;
  const taste = getPersonaTaste(personaId);
  if (!taste) return -1;
  const scored = candidates.map((c, i) => ({
    i,
    s: scoreCandidate(extractFeatures(c), taste.weights),
  }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(3, n));
  // softmax over the top-k
  const T = temperature > 0 ? temperature : 0.4;
  const exps = top.map((t) => Math.exp(t.s / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  let r = rng() * sum;
  for (let k = 0; k < top.length; k++) {
    r -= exps[k];
    if (r <= 0) return top[k].i;
  }
  return top[top.length - 1].i;
}

// ─── active persona ────────────────────────────────────────────────────
// Module-level, single-page-app state. Default voice is Davis — the
// project's working creed (dynamic abstraction) — so the button is
// interesting on first press. null = no persona, honest dice roll.
let activePersonaId = 'davis';

export function setActivePersona(id) {
  if (id === 'lois') {
    activePersonaId = 'lois';
    return;
  }
  activePersonaId = getPersonaTaste(id) ? id : null;
}

export function getActivePersonaId() {
  return activePersonaId;
}

export function getActivePersona() {
  if (activePersonaId === 'lois') return LOIS_VOICE;
  return activePersonaId ? getPersonaTaste(activePersonaId) : null;
}

export function personaIds() {
  return PERSONA_TASTES.map((p) => p.id);
}

/**
 * Curator engine backed by the active persona. Implements the engine
 * contract from curate.js: pick(candidates) -> index, status() -> active,
 * plus shapeCandidates(candidates) — the render-profile hook. Before
 * scoring, the persona dreams each candidate in its own visual language
 * (palette-adjacent params, shape/edge biases, forces); then pick() ranks
 * the shaped candidates as before. Personas WITHOUT a render profile keep
 * the #375 behavior exactly: scoring only. personaName lets the UI hint
 * say WHO tasted the pick — it carries the ALIAS (Matt's IP caution: real
 * artist names never appear on the product surface; honest attribution
 * lives in code and the persona source files only).
 */
export function personaCurator() {
  const persona = getActivePersona();
  if (!persona) {
    return { name: 'persona', status: () => 'untrained', pick: () => -1 };
  }
  // LOIS reorders the pool already rolled. No palette, no forces, no weights
  // written into the taste model. The score is named a heuristic in the hint.
  if (persona.id === 'lois') {
    return {
      name: 'persona',
      personaName: 'LOIS',
      personaId: 'lois',
      heuristic: true,
      status: () => 'active',
      pick(candidates) {
        return rankLois(candidates, getDirector().rankChooser()).index;
      },
    };
  }
  return {
    name: 'persona',
    personaName: persona.alias,
    personaId: persona.id,
    status: () => 'active',
    shapeCandidates(candidates, rng) {
      if (!getRenderProfile(persona.id)) return;
      for (let i = 0; i < candidates.length; i++) {
        candidates[i] = applyRenderProfile(candidates[i], persona.id, rng);
      }
    },
    pick: (candidates, rng) => {
      // #1145: the Director supervises the persona pick. Room → gains;
      // temperature from the single source; LOIS's rank blended against
      // Davis's pick by the room's lois_weight. Silence → neutral gains →
      // yesterday's pick, exactly.
      const { gains } = getDirector().tick({ feed: loisActivity.snapshot(), phase: getPhase() }); // #1144: refine cools the room, explore warms it
      const davisIndex = pickPersona(candidates, persona.id, rng, gains.temperature);
      if (gains.loisWeight <= 0 || gains.room == null) return davisIndex;
      const loisIndex = rankLois(candidates, getDirector().rankChooser()).index;
      return blendPick({
        davisIndex,
        loisIndex: loisIndex < 0 ? davisIndex : loisIndex,
        loisWeight: gains.loisWeight,
        rng,
      });
    },
  };
}
