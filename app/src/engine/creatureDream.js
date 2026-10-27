// engine/creatureDream.js — #1737: dreaming and consolidation, the two mechanisms the folklore merges into one.
//
// After Creatures (1996): (1) DREAMING REHEARSES INSTINCTS, NOT MEMORIES. At hatching and in deep sleep a Norn's brain
// replays genetically specified instinct lessons — never lived experience. (2) EXPERIENCE CONSOLIDATES AWAKE: short-term
// weights relax into long-term ones as the creature lives (engine/creaturePolicy.js reinforce does that continuously).
// Two systems, two inputs.
//
// KC-1 mapping (issue #1737):
//   - INSTINCT REHEARSAL runs when a creature hatches (and again whenever the instrument is paused — a set break is deep
//     sleep). It writes the genome's instinct genes (#1734: a situation cell, a mode, a strength) into the policy's
//     long-term weights. The newborn visibly dreams through HATCH_FRAMES (engine/dishCreature.js draws it eyes-closed and
//     resting); the computation itself is instantaneous and costs nothing while performing.
//   - CONSOLIDATION FOLDS AT A KEEP: when the artist keeps the frame, every living creature's short-term weights settle
//     into its long-term record, and that record — genome plus long-term weights — is the creature's education as a
//     portable file (creatureRecord / parseCreatureRecord, `kc-creature/1`), travelling with the creature the way
//     taste.json travels with a Look. Learning is never inherited: breeding (#1738) crosses genomes, not educations.
//
// Pure.
import { POLICY_RATES, POLICY_SIZE, N_MODES, createPolicy } from './creaturePolicy.js';
import { sanitizeGenome } from './creatureGenome.js';

/** Frames a newborn spends dreaming its instincts before it behaves (~2 s at 60 fps). */
export const HATCH_FRAMES = 120;
/** Rehearsal passes at hatch (each writes every instinct once). */
export const HATCH_PASSES = 3;
export const CREATURE_RECORD_KIND = 'kc-creature/1';

const cap = (v) => Math.max(-POLICY_RATES.wCap, Math.min(POLICY_RATES.wCap, v));

/**
 * Rehearse instincts into a policy, in place: each pass moves LTW (and STW with it) at the instinct's cell and mode
 * toward its strength. Rehearsal only ever writes the genome's own lessons — no lived experience is replayed.
 */
export function rehearseInstincts(policy, instincts, passes = 1) {
  if (!Array.isArray(instincts) || !instincts.length) return 0;
  let wrote = 0;
  for (let p = 0; p < passes; p++) {
    for (const ins of instincts) {
      if (!ins || !Number.isInteger(ins.cell) || !Number.isInteger(ins.mode)) continue;
      const i = ins.cell * N_MODES + ins.mode;
      if (i < 0 || i >= POLICY_SIZE) continue;
      const s = Number.isFinite(ins.strength) ? Math.max(0, Math.min(1, ins.strength)) : 0;
      policy.ltw[i] = cap(policy.ltw[i] + (s - policy.ltw[i]) * POLICY_RATES.instinct);
      policy.stw[i] = policy.ltw[i];
      wrote += 1;
    }
  }
  return wrote;
}

/** Consolidate, in place: the short-term weights settle into the long-term record (the fold at a keep / export). */
export function consolidate(policy) {
  for (let i = 0; i < POLICY_SIZE; i++) policy.ltw[i] = cap(policy.stw[i]);
}

/** A creature's education as a portable record: its genome and its long-term weights (rounded, small). */
export function creatureRecord(genome, policy) {
  const g = sanitizeGenome(genome);
  if (!g || !policy || !policy.ltw) return null;
  return { kind: CREATURE_RECORD_KIND, genome: g, ltw: Array.from(policy.ltw, (v) => Math.round(v * 1e4) / 1e4) };
}

/** Read a record back (a file is a trust boundary): { genome, policy } with STW = LTW, or null. */
export function parseCreatureRecord(raw) {
  if (!raw || typeof raw !== 'object' || raw.kind !== CREATURE_RECORD_KIND) return null;
  const genome = sanitizeGenome(raw.genome);
  if (!genome || !Array.isArray(raw.ltw) || raw.ltw.length !== POLICY_SIZE) return null;
  const policy = createPolicy();
  for (let i = 0; i < POLICY_SIZE; i++) {
    const v = raw.ltw[i];
    policy.ltw[i] = Number.isFinite(v) ? cap(v) : 0;
    policy.stw[i] = policy.ltw[i];
  }
  return { genome, policy };
}
