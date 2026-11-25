// curator/roomCodes.js — #1949: the room's live persona codes (Lois's face, Davis's state), for the frame.
//
// App owns the honest feed and resolves the codes (curator/loisFace.js, curator/davisState.js); the live loop stamps
// them on the resolver input each frame (so a take records them, and replays them), and the scene contract reads them
// back from the frame's effective input to move and dress the creature rigs (engine/creatureRig.js). Only known codes
// pass; anything else reads as null (the defaults: Lois's NOD walk, Davis's plain deal).

import { LOIS_FACES } from './loisFace.js';
import { DAVIS_STATES } from './davisState.js';
import { gaitContractFields } from '../engine/creatureGait.mjs'; // #2475 — the creatures' worn gaits ride the same seam

const LOIS = new Set(Object.keys(LOIS_FACES));
const DAVIS = new Set(Object.keys(DAVIS_STATES));

let provider = null;
/** App registers its resolver of the room's codes: () => ({ lois, davis }). */
export function setRoomCodesProvider(fn) {
  provider = typeof fn === 'function' ? fn : null;
}

/** Clean codes: only the personas' own codes survive. */
export function sanitizeRoomCodes(raw) {
  const lois = raw && typeof raw.lois === 'string' && LOIS.has(raw.lois) ? raw.lois : null;
  const davis = raw && typeof raw.davis === 'string' && DAVIS.has(raw.davis) ? raw.davis : null;
  return { lois, davis };
}

/** This frame's codes (stamped on the resolver input). Never throws. */
export function readRoomCodes() {
  try {
    return sanitizeRoomCodes(provider ? provider() : null);
  } catch {
    return { lois: null, davis: null };
  }
}

/** The contract fields for a frame, from its effective resolver input (a take's recorded input during playback). */
export function roomContractFields(input) {
  const { lois, davis } = sanitizeRoomCodes(input && input.room);
  return {
    ...(lois ? { loisFace: lois } : {}),
    ...(davis ? { davisMood: davis } : {}),
    // #2475 — what the creature and beast tiles wear this frame (the QUEEN's picks, eased by the resolver's fold for this
    // very input): the rigs' other contract read, on the seam the live loop already hands the effective input through.
    // No creature pick → no key: the contract is exactly what it was.
    ...gaitContractFields(input),
  };
}
