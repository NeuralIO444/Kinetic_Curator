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
import { extractFeatures } from './tasteFeatures.js';
import { feelAffinity } from '../data/canon/settings.js';

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

// #2046 — the feature measurement itself lives in ./tasteFeatures.js (a pure leaf the data layer can import);
// it is re-exported here so this module stays the one import site it has always been.
export { extractFeatures };

/** Dot product of features against a persona's taste weights. */
export function scoreCandidate(features, weights) {
  let s = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (typeof features[k] === 'number') s += w * features[k];
  }
  return s;
}

/**
 * Cosine proximity of two feature maps from extractFeatures — the
 * shared feature-space geometry for pick-time consumers (Keeps K2's
 * fill measures novelty and distance with it). A key one side lacks
 * reads as the neutral 0.5; a map with no magnitude has no proximity.
 */
export function featureProximity(a, b) {
  if (!a || !b) return 0;
  const keys = Object.keys(a);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const x = typeof a[k] === 'number' ? a[k] : 0.5;
    const y = typeof b[k] === 'number' ? b[k] : 0.5;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * #2046 — how hard a standing chapter leans the pick: the most the Book can add to one candidate's score.
 * The persona's own scores across a CURATE pool spread by about 1, so 0.5 lets the chapter reorder close
 * calls without overruling a clear favourite. A taste dial — tune on play.
 */
export const CHAPTER_FEEL_GAIN = 0.5;

/**
 * The score a standing chapter adds to each candidate of a pool, in pool order.
 *
 * Each candidate's affinity to the chapter's feel (data/canon/settings.js feelAffinity) is read RELATIVE TO
 * THE POOL: the candidate that reads most like the chapter gets the full CHAPTER_FEEL_GAIN, the one that reads
 * least like it gets 0, the rest fall between. Raw affinities sit in a narrow band (most recipes share most
 * features), so an absolute lean would be the same small number for everyone and change nothing; ranking
 * inside the pool is what makes the Book's word audible.
 *
 * All zeros — exactly — when no chapter feel stands, or when the pool cannot be told apart by it.
 */
export function chapterLeans(featuresList, chapterFeel) {
  const zeros = featuresList.map(() => 0);
  if (!chapterFeel) return zeros;
  const aff = featuresList.map((f) => feelAffinity(f, chapterFeel));
  if (aff.some((a) => a === null)) return zeros;
  const lo = Math.min(...aff);
  const hi = Math.max(...aff);
  if (!(hi > lo)) return zeros;
  return aff.map((a) => (CHAPTER_FEEL_GAIN * (a - lo)) / (hi - lo));
}

/**
 * Pick a candidate index for a persona. Scores all candidates, takes the
 * top 3, and softmax-samples among them (temperature 0.4) so the best
 * usually wins but the pick doesn't feel robotic. rng is injectable and
 * part of the call contract: CURATE passes the seeded RNG (same seed →
 * same pick). A missing rng rolls 0 — never Math.random (#1667).
 * Returns -1 for empty input. Never mutates candidates.
 *
 * temperature is the Director's dial (#1145): effectiveTemp() is the single
 * source of truth. Defaults to 0.4 — yesterday's behavior when the Director
 * is silent.
 *
 * #2046 — `chapterFeel` is the standing chapter's feel (the Book, read back): when present every candidate's
 * score gains its chapterLeans share. Absent (no chapter standing, or Now) the scores — and so the pick and the rng
 * stream — are exactly what they were.
 */
export function pickPersona(candidates, personaId, rng, temperature = 0.4, { chapterFeel = null } = {}) {
  const n = candidates.length;
  if (n === 0) return -1;
  const taste = getPersonaTaste(personaId);
  if (!taste) return -1;
  const roll = typeof rng === 'function' ? rng : () => 0;
  const features = candidates.map((c) => extractFeatures(c));
  const lean = chapterLeans(features, chapterFeel);
  const scored = features.map((f, i) => ({ i, s: scoreCandidate(f, taste.weights) + lean[i] }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(3, n));
  // softmax over the top-k
  const T = temperature > 0 ? temperature : 0.4;
  const exps = top.map((t) => Math.exp(t.s / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  let r = roll() * sum;
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
    pick: (candidates, rng, { chapterFeel = null } = {}) => {
      // #1145: the Director supervises the persona pick. Room → gains;
      // temperature from the single source; LOIS's rank blended against
      // Davis's pick by the room's lois_weight. Silence → neutral gains →
      // yesterday's pick, exactly.
      const { gains } = getDirector().tick({ feed: loisActivity.snapshot(), phase: getPhase() }); // #1144: refine cools the room, explore warms it
      // #2046: the standing chapter's feel leans the persona's scores (pickCurated hands it in; null = no lean)
      const davisIndex = pickPersona(candidates, persona.id, rng, gains.temperature, { chapterFeel });
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
