// curator/roomWidth.js — Phase 4 step 3 (#1145, #1356): LOIS's room tightens or loosens Davis's shifts.
//
// Matt (2026-10-13, option A): reuse the numbers he has already tuned by feel. Every room in the Director's table
// (directorTable.js) says how UNLEASHED Davis is there: `kin_weight`, from 0.5 (NOD x BLOOM: the earned keep, savour
// it) to 1.75 (BURN x FLOW: both barrels). A moth's shift width now follows it, so the rooms that already roll more
// candidates also let moths differ more, and a savoured keep keeps them close to standard.
//
// It can only NARROW (the width is a multiplier at most 1 on the band's width, which is what the roadmap calls the
// band's range). No room (either Director stateless: silence is the default) is exactly step 2's width, 1.
import { directorGains } from './director.js';

/** The kin_weight at which a room lets Davis use the band's whole width. Rooms above it are capped at 1. */
export const KIN_FULL = 1.5;
/** The narrowest a room can make it: even the most savoured keep still lets a moth differ a little. */
export const ROOM_MIN = 0.25;

/**
 * @param gains directorGains() output ({ kinWeight, room })
 * @returns { width, room, allowance } width in [ROOM_MIN, 1], room = { n, lois, davis } or null, the room's allowance 0..1
 */
export function roomWidthFor(gains) {
  if (!gains || !gains.room) return { width: 1, room: null, allowance: 0 };
  const k = Number.isFinite(gains.kinWeight) ? gains.kinWeight : 1;
  const width = Math.min(1, Math.max(ROOM_MIN, k / KIN_FULL));
  const allowance = Number.isFinite(gains.swayAllowance) ? gains.swayAllowance : 0;
  return { width, room: { n: gains.room.n, lois: gains.room.lois, davis: gains.room.davis }, allowance };
}

/** The room's width from the two Directors' state codes (either null = no room = 1). */
export function roomWidthFromCodes(loisCode, davisCode) {
  return roomWidthFor(directorGains({ loisCode, davisCode }));
}
