// roomScheduler.js — gain schedule for the 20 rooms (#1145).
//
// The verdict strip stays a readout (#1126: it never acts). This module is the
// separate scheduler. It reads the same LOIS × Davis pair the strip names and
// returns dials. It does not render, and it has no timer: a room exists only
// when both Directors already have a state from the honest feed.
//
// Derivation (the copy matrix is the source of truth, not the 4-row sketch):
//   LOIS sets the thermostat. NOD tightens, VIBE holds, BURN opens, AWAY freezes.
//   Davis sets KIN freedom, via the existing wildnessForDavis table.
//   Three interaction overrides only:
//     AGREEMENT  (NOD × BLOOM)  holds the tightest temperature
//     FULL BURN  (BURN × FLOW)  is the one unleashed cell
//     THE CLASH  (NOD × not BLOOM) is the tension cell
//   THE ROOM is the neutral default (VIBE × any, and BURN × not FLOW).
//
// Weights are the softmax temperature pickPersona already has. There is no
// per-voice sampling probability. weightShift is the labelled LOIS column
// (-1 tight, 0 hold, 1 open); temperature is the number the picker reads.
// AWAY freezes that column (shift 0, frozenWeights) instead of opening it.
//
// Queen sway stays 0 until #1140 (keep-context) and #1139 (magnitudes).
// Rule 10: this bias is never a surface value. Tilt is bounded by the
// artist's own taste scores — temperature only reshapes the existing softmax.
//
// #1144 owns explore/refine when it lands. applyPhaseClamp is the hook:
// a demonstrated REFINE wins, and the room cannot outrun it.

import { roomFor } from './directorsMatrix.js';
import { wildnessForDavis } from './dice.js';

export const TEMP_BASELINE = 0.4; // today's pickPersona constant; THE ROOM
export const TEMP_AGREEMENT = 0.1;
export const TEMP_NOD = 0.15;
export const TEMP_CLASH = 0.35;
export const TEMP_BURN = 0.7;
export const TEMP_FULL_BURN = 0.9;
export const TEMP_MIN = 0.1;
export const TEMP_MAX = 0.9;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function neutral() {
  return {
    room: false,
    verdict: null,
    temperature: TEMP_BASELINE,
    kinFreedom: wildnessForDavis(null),
    weightShift: 0,
    frozenWeights: false,
    queenBias: 0,
    suggestReroll: false,
  };
}

function loisTemperature(loisCode) {
  switch (loisCode) {
    case 'NOD': return TEMP_NOD;
    case 'VIBE': return TEMP_BASELINE;
    case 'BURN': return TEMP_BURN;
    case 'AWAY': return TEMP_BASELINE;
    default: return TEMP_BASELINE;
  }
}

function loisShift(loisCode) {
  switch (loisCode) {
    case 'NOD': return -1;
    case 'BURN': return 1;
    default: return 0; // VIBE holds, AWAY freezes
  }
}

/**
 * Gain row for one room. Silence (either Director without a state, or a
 * pair the matrix does not name) is the neutral row — baseline temperature,
 * Davis-silent wildness, no sway, no re-roll suggestion.
 */
export function scheduleRoom(loisCode, davisCode) {
  const talk = roomFor(loisCode, davisCode);
  if (!talk) return neutral();

  let temperature = loisTemperature(loisCode);
  let kinFreedom = wildnessForDavis(davisCode);
  const weightShift = loisShift(loisCode);
  const frozenWeights = loisCode === 'AWAY';
  // Stall is Davis STUCK while the critic is not already pointing at a keep.
  const suggestReroll = davisCode === 'STUCK' && loisCode !== 'NOD';

  if (talk.verdict === 'AGREEMENT') {
    temperature = TEMP_AGREEMENT;
    kinFreedom = Math.min(kinFreedom, wildnessForDavis('FLOW'));
  } else if (talk.verdict === 'FULL BURN') {
    temperature = TEMP_FULL_BURN;
    kinFreedom = 1;
  } else if (talk.verdict === 'THE CLASH') {
    temperature = TEMP_CLASH;
  }

  return {
    room: true,
    verdict: talk.verdict,
    temperature: clamp(temperature, TEMP_MIN, TEMP_MAX),
    kinFreedom: clamp(kinFreedom, 0, 1),
    weightShift,
    frozenWeights,
    queenBias: 0,
    suggestReroll,
  };
}

/**
 * #1144 precedence. REFINE (a keep, or sustained small slider deltas) caps
 * the room temperature. EXPLORE leaves the room in charge. Unknown phase
 * is a no-op — this scheduler does not invent a phase tracker.
 */
export function applyPhaseClamp(schedule, phase) {
  const row = schedule && schedule.temperature != null ? schedule : neutral();
  if (phase === 'REFINE') {
    return { ...row, temperature: Math.min(row.temperature, TEMP_AGREEMENT) };
  }
  return row;
}

let current = neutral();

/** Record the room sampled from a real feed read. Returns the row. */
export function noteRoom(loisCode, davisCode) {
  current = scheduleRoom(loisCode, davisCode);
  return current;
}

export function getRoomSchedule() {
  return current;
}

export function resetRoomSchedule() {
  current = neutral();
  return current;
}
