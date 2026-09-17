// ─── Shimmer "whisper" prototype — pure scoring/display logic ────────────────
// No React, no DOM, no network here: this module is node-importable so the
// selfcheck can cover it. The tuner rule applies: shimmer is a readout of
// predicted taste, never a reward and never an action.
//
// Score source is a scores.json of { candidateId: percentile } written by the
// sidecar (or a stub sample for the prototype). Missing file / missing
// candidate / junk value = level 0 = zero shimmer, real no-op, no errors.

export const SHIMMER_MIN_PERCENTILE = 70; // top-30% only; dead zone below
export const SHIMMER_LEVELS = 4;
export const LISTEN_GAIN = 3; // SHIFT-held amplification

// Stub evidence line for the honest why-copy. The real sidecar would ship a
// short per-model evidence string; the prototype must never invent specifics.
export const SHIMMER_EVIDENCE_STUB =
  'your kept renders lean warm and dense';

/** Clamp + sanitize one percentile value. Non-numeric or NaN -> null (no-op). */
export function sanitizePercentile(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * Percentile -> shimmer level 0..4.
 * 0 = dark (dead zone below 70, or unknown). Compressive curve on top:
 * 70-79 -> 1, 80-89 -> 2, 90-96 -> 3, 97-100 -> 4.
 */
export function percentileToLevel(p) {
  const v = sanitizePercentile(p);
  if (v === null || v < SHIMMER_MIN_PERCENTILE) return 0;
  if (v < 80) return 1;
  if (v < 90) return 2;
  if (v < 97) return 3;
  return 4;
}

/** Keep only finite 0..100 entries; drop junk, never throw. */
export function sanitizeScores(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = sanitizePercentile(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

export function levelFor(scores, candidateId) {
  if (!scores || !(candidateId in scores)) return 0;
  return percentileToLevel(scores[candidateId]);
}

/** Human band label for the why-copy, from a percentile. */
export function topBand(p) {
  const v = sanitizePercentile(p);
  if (v === null) return null;
  if (v >= 90) return 'top 10%';
  if (v >= 80) return 'top 20%';
  return 'top 30%';
}

/**
 * Honest why-copy: past-tense evidence, defeasible, no cheerleading.
 * Never mind-reads; never corrects the performer's taste.
 */
export function whyCopy(label, percentile) {
  const band = topBand(percentile);
  if (!band) return 'Shimmer is off for this one — no score on file.';
  return (
    `Shimmer — ${SHIMMER_EVIDENCE_STUB}, and ${label} sits in your ${band}. ` +
    `The model's guess, not an order.`
  );
}

/** Screen-reader note for a shimmered control: information, not animation. */
export function ariaNote(level) {
  switch (level) {
    case 4: return 'model suggestion: strongest match';
    case 3: return 'model suggestion: strong match';
    case 2: return 'model suggestion: moderate match';
    case 1: return 'model suggestion: mild match';
    default: return null;
  }
}

/**
 * Session log entry. Console-level only — no backend. This is the dataset
 * for later lift/collapse analysis: candidate id, shown percentile, outcome.
 */
export function logShimmer(entry) {
  const rec = { t: new Date().toISOString(), kind: 'shimmer', ...entry };
  console.info('[shimmer]', JSON.stringify(rec));
  return rec;
}
