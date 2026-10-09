// loisRank.js — hand-tuned rank for the LOIS voice (#948).
//
// This is a heuristic, not Lois. Nothing in the app can judge a picture
// the way the #954 vector will. Until that model exists, the CURATOR step
// can still prefer a pitch that hits at a glance, sits far from the pile,
// and refuses the cautious middle. The copy is the persona. The score is
// a ruler. It does not train, and it does not touch taste.json.

import { extractFeatures } from './taste.js';

const GLANCE_KEYS = ['markSize', 'coverage', 'opacity', 'markDensity', 'disorder'];
const BOLD_KEYS = ['disorder', 'sizeVariety', 'rotationSpread', 'flowEnergy', 'windPush', 'markSize'];

let lastVerdict = '';
let lastParts = null; // #1122 — the CUR detent reads the verdict's real score

export function getLoisVerdict() {
  return lastVerdict;
}

/** The { score, glance, originality, boldness } behind the last verdict, or null. */
export function getLoisVerdictParts() {
  return lastParts;
}

export function clearLoisVerdict() {
  lastVerdict = '';
  lastParts = null;
}

function meanOf(rows) {
  const keys = Object.keys(rows[0]);
  const mean = {};
  for (const k of keys) {
    let s = 0;
    for (const row of rows) s += row[k];
    mean[k] = s / rows.length;
  }
  return mean;
}

/** Glance, distance from the pool, boldness. Each part is 0..1. */
export function scoreLoisHeuristic(features, mean) {
  const glance = GLANCE_KEYS.reduce((s, k) => s + Math.abs(features[k] - 0.5) * 2, 0) / GLANCE_KEYS.length;
  const keys = Object.keys(features);
  let dist = 0;
  for (const k of keys) {
    const d = features[k] - (mean[k] ?? 0.5);
    dist += d * d;
  }
  const originality = Math.min(1, Math.sqrt(dist / keys.length) / 0.35);
  const boldness = BOLD_KEYS.reduce((s, k) => s + Math.abs((features[k] ?? 0.5) - 0.5) * 2, 0) / BOLD_KEYS.length;
  const score = 0.34 * glance + 0.42 * originality + 0.24 * boldness;
  return { score, glance, originality, boldness };
}

/** Short, provocative, never praise-for-praise. */
export function loisVerdict(parts) {
  const { glance, originality, boldness } = parts;
  if (glance < 0.28) return 'No hit at a glance. Out.';
  if (originality < 0.22) return 'Too close to the pile. Habit.';
  if (boldness < 0.3) return 'Cautious or creative, kid. Pick one.';
  if (glance >= 0.55 && originality >= 0.45) return "Now you're thinking with your own brains, kid.";
  if (boldness >= 0.55) return "That took a nanosecond. Don't flinch.";
  return 'Ninety-nine percent of this is zero.';
}

/**
 * Rank an existing pool. Argmax — the provocateur does not dither (first of equals wins).
 * Returns -1 on empty input. Never mutates candidates.
 *
 * `choose(scores, candidates)` is an optional chooser (the Director's, when it has one): it receives every
 * candidate's score and returns the index to take. A bad answer (not an index into the pool) falls back to the
 * argmax, so a chooser can never break the pick. The verdict always describes the candidate actually chosen.
 * Without a chooser this is exactly the argmax it always was.
 */
export function rankLois(candidates, choose = null) {
  const n = candidates?.length ?? 0;
  if (n === 0) {
    lastVerdict = '';
    lastParts = null;
    return { index: -1, verdict: '', parts: null };
  }
  const feats = candidates.map((c) => extractFeatures(c));
  const mean = meanOf(feats);
  const allParts = feats.map((f) => scoreLoisHeuristic(f, mean));
  let best = 0;
  for (let i = 1; i < n; i++) if (allParts[i].score > allParts[best].score) best = i;
  if (typeof choose === 'function') {
    try {
      const picked = choose(allParts.map((p) => p.score), candidates);
      if (Number.isInteger(picked) && picked >= 0 && picked < n) best = picked;
    } catch {
      /* a chooser that throws is no chooser: the argmax stands */
    }
  }
  const bestParts = allParts[best];
  const verdict = loisVerdict(bestParts);
  lastVerdict = verdict;
  lastParts = bestParts;
  return { index: best, verdict, parts: bestParts };
}
