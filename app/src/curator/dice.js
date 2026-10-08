// dice.js — the tasteful dice: random proposes, taste disposes.
//
// One roll = N candidate (layout, cast) pairs dealt wild, scored by a scorer,
// LOIS shortlists 3 finalists, the performer crowns one. The scorer is an
// interface ({ id, score(candidate) }) — the persona scorer is interim; the
// MLX head (Phase B) implements the same interface and the dice never changes.
//
// Decisions (research/tasteful-dice-2026-10-07.md §7-8):
//   - uniform layout pick across all STUB_VOICES (affinity table ignored)
//   - cast 2–5, sized to the mode (per-mode hash) ± Davis wildness
//   - roles read from asset metadata; new packs auto-absorb (no pack lists)
//   - wildness from Davis's state: UGLY wilder, FLOW calmer
//   - same-category weak prior + learned co-occurrence from the crown log
//
// #1145: a room may pass kinFreedom (0..1). Absent, wildnessForDavis stands,
// so existing rolls are unchanged.
import { STUB_VOICES } from '../data/voices.js';

/** Candidates dealt per roll before shortlisting (the Lois pass: show this count). */
export const DICE_CANDIDATES_BASE = 8;
export const DICE_CANDIDATES_WILD = 8;
/** Finalists LOIS shortlists per roll. */
export const DICE_FINALISTS = 3;

/** Davis state code → wildness 0..1. UGLY sifts wide, FLOW stays close to home. */
export function wildnessForDavis(code) {
  switch (code) {
    case 'UGLY': return 1.0;
    case 'STUCK': return 0.8;
    case 'SEEDLING': return 0.5;
    case 'BLOOM': return 0.3;
    case 'FLOW': return 0.2;
    default: return 0.5; // Davis silent: honest middle
  }
}

const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Characteristic cast size per mode: 2–4 from the mode id hash, never a pack list. */
export function baseCastSize(layoutId) {
  return 2 + (fnv1a(String(layoutId)) % 3);
}

/** Cast size for one proposal: mode character ± wildness jitter, clamped 2–5. */
export function castSizeFor(layoutId, rng, wildness) {
  const base = baseCastSize(layoutId);
  const spread = 1 + wildness; // FLOW ≈ ±1, UGLY ≈ ±2
  const jitter = Math.round((rng() * 2 - 1) * spread);
  return Math.min(5, Math.max(2, base + jitter));
}

// --- role pools (metadata only; every predicate falls back to the full pool) ---

const isLead = (a) => a.weight === 'heavy' || a.density === 'solid';
const isTexture = (a) => a.density === 'sparse' || a.category === 'dots';
const isAccent = (a) =>
  a.category === 'linework' ||
  (Array.isArray(a.tags) && a.tags.some((t) => t === 'glyph' || t === 'letter' || t === 'emblem'));

function poolFor(assets, pred) {
  const hit = assets.filter(pred);
  return hit.length ? hit : assets; // auto-absorb: a pack without the tag still deals
}

// --- compatibility: weak same-category prior + learned co-occurrence ---

/** Same-category affinity is a starting guess, not a rule. */
export function priorAffinity(a, b) {
  return a.category && a.category === b.category ? 0.6 : 0.4;
}

/** Learned: how often this pair was crowned together. Neutral until crowns exist. */
export function learnedAffinity(a, b, crowns) {
  if (!crowns || !crowns.length) return 0.5;
  let pair = 0;
  for (const c of crowns) {
    const ids = c.assetIds || [];
    if (ids.includes(a.id) && ids.includes(b.id)) pair++;
  }
  return pair / crowns.length;
}

/**
 * Compatibility of two assets. The learned weight grows with evidence:
 * after ~50 crowns the keeps outvote the prior 3:1. No hand-authored matrix.
 */
export function affinity(a, b, crowns) {
  const n = crowns ? crowns.length : 0;
  const wLearned = Math.min(0.75, n / 50);
  return (1 - wLearned) * priorAffinity(a, b) + wLearned * learnedAffinity(a, b, crowns);
}

/** Weighted pick of one asset from pool, favoring affinity with the cast so far. */
function pickWeighted(pool, picked, crowns, rng, wildness) {
  const remaining = pool.filter((a) => !picked.some((p) => p.id === a.id));
  const src = remaining.length ? remaining : pool.filter((a) => !picked.some((p) => p.id === a.id));
  const candidates = src.length ? src : pool;
  if (candidates.length === 1) return candidates[0];
  // Wildness flattens the weights: UGLY barely listens to affinity, FLOW obeys it.
  const temp = 0.3 + wildness * 1.7;
  const weights = candidates.map((a) => {
    if (!picked.length) return 1;
    const aff = picked.reduce((s, p) => s + affinity(a, p, crowns), 0) / picked.length;
    return Math.pow(Math.max(0.05, aff), 1 / temp);
  });
  let r = rng() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Deal one cast: roles first (lead/texture/accent), then wild cards to size. */
export function dealCast(assets, size, rng, wildness, crowns) {
  const picked = [];
  const take = (pred) => {
    const a = pickWeighted(poolFor(assets, pred), picked, crowns, rng, wildness);
    if (a && !picked.some((p) => p.id === a.id)) picked.push(a);
  };
  if (size >= 2) {
    take(isLead);
    take(rng() < 0.5 ? isTexture : isAccent);
  }
  if (size >= 3) take(isAccent);
  if (size >= 4) take(isTexture);
  while (picked.length < size) take(() => true); // wild cards: affinity does the curating
  return picked.map((a) => a.id);
}

/**
 * Roll the dice.
 * @returns {{ candidates, finalists, rolled, kept, wildness, davisCode }}
 * candidates: every proposal with its score; finalists: top 3 by score.
 * kinFreedom, when a room scheduled it, replaces wildnessForDavis for this roll.
 */
export function rollDice({ assets, rng = Math.random, davisCode = null, kinFreedom = null, scorer, crowns = [] }) {
  if (!assets || !assets.length) throw new Error('[dice] no assets to deal from');
  if (!scorer || typeof scorer.score !== 'function') throw new Error('[dice] scorer missing');
  const scheduled = typeof kinFreedom === 'number' && Number.isFinite(kinFreedom) ? kinFreedom : null;
  const wildness = scheduled == null ? wildnessForDavis(davisCode) : Math.min(1, Math.max(0, scheduled));
  const n = DICE_CANDIDATES_BASE + Math.round(wildness * DICE_CANDIDATES_WILD);
  const candidates = [];
  for (let i = 0; i < n; i++) {
    const layout = STUB_VOICES[Math.floor(rng() * STUB_VOICES.length)];
    const size = castSizeFor(layout.id, rng, wildness);
    const assetIds = dealCast(assets, size, rng, wildness, crowns);
    const candidate = { layoutId: layout.id, assetIds };
    candidates.push({ ...candidate, score: scorer.score(candidate) });
  }
  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates,
    finalists: candidates.slice(0, DICE_FINALISTS),
    rolled: n,
    kept: DICE_FINALISTS,
    wildness,
    davisCode,
  };
}
