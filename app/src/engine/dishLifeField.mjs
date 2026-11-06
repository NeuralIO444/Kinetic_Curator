// dishLifeField.mjs — DISH LIFE field mode: the persistent culture's CLOCK (#1994, Phase 1 of the Stage
// Coupling Revision adopted on #1923, 2026-11-05).
//
// The revision's second mode. The VISUAL culture keeps its ruled trigger (idle ≥ 8 s, any touch ends it);
// FIELD mode is exempt from that trigger (Matt's amendment): the culture is seeded from the stage and keeps
// evolving while the performer interacts, publishing `level` / `activity` for consumers to read. It is
// invisible — the stage (dishLifeStage) builds and steps it exactly like any other culture but never draws
// it, never dissolves a mark, never stamps a cell.
//
// This module is the pure half: the CYCLE stamp. Like the quiet layer it runs in cycles — the culture steps
// at a REDUCED rate (half the culture tempo) for one bloom arc, then the cycle rolls and the stage re-seeds
// from the scene as it is then, so the field tracks the composition without any write-back (the closed loop
// is Phase 3) and never matures into the maze. Cycle index, wake and generation are pure functions of loop
// time, stamped on the input like every other recorded input — the log stays the authority, and a take that
// contains field stamps replays the field exactly.
//
// There is deliberately NO strength/dial here: the field exists when the mode is stamped; coupling strength
// gates CONSUMERS (Phase 2/4), never the field's publication. And no off-switch in the stamp itself — the
// producer decides whether to stamp at all.

/** Generations per cycle: the rule's useful bloom arc, the same length the quiet layer rides. */
export const FIELD_CYCLE_GENS = 48;
/**
 * Generations per second on the loop clock — a reduced rate: half the visual culture's tempo
 * (GENS_PER_SEC / QUIET_GPS are 8). The field is infrastructure, not a performance; consumers read a
 * climate, not a flicker. One cycle is FIELD_CYCLE_GENS / FIELD_GPS = 12 s.
 */
export const FIELD_GPS = 4;

/**
 * The field stamp for loop time `loopMs`. Pure. Always a stamp (the mode has no null state — an unstamped
 * frame is simply a frame with no field culture).
 *   { mode:'field', wakeMs, gen, cycleGens, shed }
 * wakeMs is the cycle's start on the loop clock (the stage re-seeds when it changes); gen is the target
 * generation inside the cycle; shed is the governor's level, bounded by the stage like every culture's.
 */
export function fieldStamp(loopMs, { shed = 0, gps = FIELD_GPS, cycleGens = FIELD_CYCLE_GENS } = {}) {
  const t = Number.isFinite(Number(loopMs)) && loopMs > 0 ? Number(loopMs) : 0;
  const cg = Math.max(1, Math.floor(Number(cycleGens)) || FIELD_CYCLE_GENS);
  const g = Number(gps) > 0 ? Number(gps) : FIELD_GPS;
  const cycleMs = (cg / g) * 1000;
  const cycle = Math.floor(t / cycleMs);
  const wakeMs = cycle * cycleMs;
  const gen = Math.min(cg - 1, Math.floor(((t - wakeMs) / 1000) * g));
  return { mode: 'field', wakeMs, gen, cycleGens: cg, shed: shed | 0 };
}
