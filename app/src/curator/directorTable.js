// directorTable.js — the 20 gain rows: what each room does (#1145).
//
// Matt's call, 2026-10-08: the 20 rooms are ACTIVE CONTROL — each room sets
// its own gains. This table is the gain-scheduling table, versioned in code
// next to the room definitions (directorsMatrix.js, which stays readout-
// only). Tune live: every value below is a labelled constant.
//
// Columns:
//   base_temp       the room's temperature anchor (effectiveTemp.js schedules it)
//   kin_weight      Davis's primaries: CURATOR candidate-count multiplier
//                   (unleashed rooms roll more, settled rooms roll fewer)
//   lois_weight     how much LOIS's NOD/VIBE/BURN/AWAY judgment counts in the
//                   pick versus Davis (Matt's call: his own influence gain,
//                   lives here — never in taste.json)
//   sway_allowance  how much Queen sway this room permits 0..1
//                   (GATED NEUTRAL until #762's proof clears — wired, held at 0)
//   intensity_budget how much peak this room may spend 0..1 (L4D: per-area budgets)
//   tilt_limit      explore-phase tilt cap beyond demonstrated keeps
//                   (refine phases are always 0; GATED NEUTRAL until #762)
//   relax_seconds   DERIVED from intensity_budget — one rule (Matt's call):
//                   clamp(round(20 + budget * 25), 20, 45). Hotter room,
//                   longer cool-down. Stored here, audited by the selfcheck.
//
// Initial-value reasoning (per verdict family; Matt tunes by feel):
//   AGREEMENT (NOD×BLOOM)   the earned keep: cool, few candidates, LOIS tight,
//                           Queen holds tight, short relax — savor it.
//   THE CLASH (NOD×rest)    the argument: medium-hot, working kin, shifting
//                           weights, moderate sway. The tension cell.
//   THE ROOM (VIBE×all,     the neutral operating point: everything near
//    BURN×seed/ugly/        default. BURN rows run warmer (he's burning).
//    stuck/bloom)
//   FULL BURN (BURN×FLOW)   both barrels: hottest temp, most candidates, LOIS
//                           at his wildest, Queen backs off (it's already wild),
//                           longest relax — ride it, then breathe.
//   DAVIS ALONE (AWAY×any)  no critic: LOIS weight 0 (frozen — he's not there),
//                           KIN free, Queen boldest (gated for now).

/** Relax rule: hotter room → longer cool-down. Clamped 20–45s (Matt's call). */
export function relaxSecondsFor(intensityBudget) {
  const b = Math.min(1, Math.max(0, Number(intensityBudget) || 0));
  return Math.min(45, Math.max(20, Math.round(20 + b * 25)));
}

const row = (base_temp, kin_weight, lois_weight, sway_allowance, intensity_budget, tilt_limit) => ({
  base_temp,
  kin_weight,
  lois_weight,
  sway_allowance,
  intensity_budget,
  tilt_limit,
  relax_seconds: relaxSecondsFor(intensity_budget),
});

/**
 * Keyed `${loisCode}×${davisCode}` — the same pair roomFor() resolves.
 * Every room in DIRECTORS_MATRIX has exactly one row here (selfchecked).
 */
export const DIRECTOR_TABLE = {
  // THE CLASH — NOD × FLOW/SEEDLING/UGLY/STUCK (rooms 1–4)
  'NOD×FLOW': row(0.45, 1.1, 0.6, 0.4, 0.7, 0.03),
  'NOD×SEEDLING': row(0.45, 1.1, 0.6, 0.4, 0.7, 0.03),
  'NOD×UGLY': row(0.45, 1.1, 0.6, 0.4, 0.7, 0.03),
  'NOD×STUCK': row(0.45, 1.2, 0.6, 0.4, 0.75, 0.03),
  // AGREEMENT — NOD × BLOOM (room 5)
  'NOD×BLOOM': row(0.12, 0.5, 0.85, 0.15, 0.3, 0.01),
  // THE ROOM — VIBE × all (rooms 6–10)
  'VIBE×FLOW': row(0.45, 1.25, 0.4, 0.5, 0.65, 0.03),
  'VIBE×SEEDLING': row(0.4, 1.0, 0.4, 0.5, 0.6, 0.03),
  'VIBE×UGLY': row(0.35, 0.9, 0.4, 0.5, 0.55, 0.03),
  'VIBE×STUCK': row(0.45, 1.2, 0.4, 0.5, 0.7, 0.03),
  'VIBE×BLOOM': row(0.3, 0.7, 0.4, 0.5, 0.5, 0.02),
  // FULL BURN — BURN × FLOW (room 11)
  'BURN×FLOW': row(0.55, 1.75, 0.9, 0.1, 1.0, 0.05),
  // THE ROOM, burning — BURN × SEEDLING/UGLY/STUCK/BLOOM (rooms 12–15)
  'BURN×SEEDLING': row(0.5, 1.15, 0.7, 0.45, 0.7, 0.03),
  'BURN×UGLY': row(0.45, 1.0, 0.7, 0.45, 0.65, 0.03),
  'BURN×STUCK': row(0.55, 1.3, 0.7, 0.45, 0.75, 0.04),
  'BURN×BLOOM': row(0.4, 0.8, 0.7, 0.45, 0.6, 0.03),
  // DAVIS ALONE — AWAY × any (rooms 16–20): LOIS weight 0, always.
  'AWAY×FLOW': row(0.5, 1.4, 0, 0.9, 0.75, 0.04),
  'AWAY×SEEDLING': row(0.45, 1.1, 0, 0.9, 0.7, 0.04),
  'AWAY×UGLY': row(0.4, 1.0, 0, 0.9, 0.65, 0.04),
  'AWAY×STUCK': row(0.5, 1.3, 0, 0.9, 0.75, 0.04),
  'AWAY×BLOOM': row(0.35, 0.8, 0, 0.9, 0.6, 0.03),
};

/** The gain row for a LOIS×Davis code pair, or null for an unknown pair. */
export function rowFor(loisCode, davisCode) {
  const key = `${loisCode}×${davisCode}`;
  return Object.prototype.hasOwnProperty.call(DIRECTOR_TABLE, key) ? DIRECTOR_TABLE[key] : null;
}
