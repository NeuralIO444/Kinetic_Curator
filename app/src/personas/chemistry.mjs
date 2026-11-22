// chemistry — Persona Adapters A5 (#2398): the learned relation offsets, and how they meet the
// tuning table. The nightly trainer recomputes the offsets fresh from every labeled trade and
// writes them into the canonical taste as a `relations` section ({ "answerer->caller": offset });
// the boot bridge overlays them onto the loaded taste; the band is then handed a tuning whose
// relation biases are the base biases shifted by the offsets.
//
// Three laws:
//   1. The clamp: offsets and effective biases live in the tuning table's declared bias domain
//      [-1, 1], and an offset may soften a ruled base bias to zero but never flip its sign —
//      no persona's character flips (the A5 acceptance property).
//   2. Unruled stays unruled: a pair whose base bias is null keeps null. Chemistry shifts ruled
//      numbers; it never invents one (the band's null law).
//   3. No offsets = today: with no relations section (or no offset for a pair), the tuning the
//      band reads is the very object it reads today.
import { TUNING_SEATS, personaTuning } from './tuning.mjs';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const clampBias = (x) => Math.max(-1, Math.min(1, x));

/** Every directed seat pair, in the tuning table's key form ("a->b") — derived from the seat
 * list the tuning validator itself uses, so the two can never drift apart. */
export const RELATION_PAIR_KEYS = Object.freeze(
  TUNING_SEATS.flatMap((a) => TUNING_SEATS.filter((b) => b !== a).map((b) => `${a}->${b}`)),
);
const PAIR_SET = new Set(RELATION_PAIR_KEYS);

export const isRelationPairKey = (key) => PAIR_SET.has(key);

/**
 * Validate a taste `relations` section (strict, for validateTaste): an object whose keys are
 * directed seat pairs and whose values are finite offsets in [-1, 1]. Returns the cleaned
 * section (a fresh object), or null when anything is off — the caller then neutralizes the
 * section, exactly as it does for a malformed personas section.
 */
export function validateRelationsSection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (!keys.length) return null;
  const out = {};
  for (const key of keys) {
    if (!PAIR_SET.has(key)) return null;
    if (!finite(raw[key]) || raw[key] < -1 || raw[key] > 1) return null;
    out[key] = raw[key];
  }
  return out;
}

/**
 * The boot bridge's lenient read of a store taste's relations: each entry stands or falls alone
 * (the bridge's damage law) — a bad key or value drops out, the rest still land. Returns the
 * cleaned overlay, or null when nothing usable is there.
 */
export function relationsOverlay(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!PAIR_SET.has(key)) continue;
    if (!finite(v) || v < -1 || v > 1) continue;
    out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Base biases shifted by offsets. A null base stays null (law 2); a missing offset leaves the
 * base untouched; a ruled base moves by its offset inside [-1, 1] and never across zero (law 1).
 */
export function applyRelationOffsets(baseRelations, offsets) {
  const out = {};
  for (const key of RELATION_PAIR_KEYS) {
    const base = baseRelations ? baseRelations[key] : null;
    const off = offsets ? offsets[key] : undefined;
    if (base === null || base === undefined || !finite(off)) {
      out[key] = base ?? null;
      continue;
    }
    let eff = clampBias(base + clampBias(off));
    if (base > 0 && eff < 0) eff = 0;
    if (base < 0 && eff > 0) eff = 0;
    out[key] = eff;
  }
  return out;
}

/**
 * The tuning the band plays on, given the loaded taste: the session tuning with its relations
 * shifted by the taste's learned offsets. No offsets on the taste → the session tuning itself,
 * the identical object (law 3).
 */
export function tuningWithChemistry(taste, tuning = personaTuning()) {
  const offsets = taste && taste.relations ? relationsOverlay(taste.relations) : null;
  if (!offsets) return tuning;
  return { ...tuning, relations: applyRelationOffsets(tuning.relations, offsets) };
}
