// loisFace.js — in-app LOIS kaomoji (#948).
//
// State light, not a portrait. Four faces. CRIT stays on #954.
// The five-minute idle timer stays on #956. In the app the mode light wins:
// AWAY until the crit room (Curator press, hit recall, palette browse, a keep).

import { LOIS_VIBE_DWELL_MS } from './loisActivity.js';

export const LOIS_FACES = {
  AWAY: { code: 'AWAY', face: '(・_・)', tone: 'ink', label: 'Out of the room. Make freely.' },
  LEAN: { code: 'LEAN', face: '(￣ー￣)', tone: 'cream', label: 'Sizing the wall.' },
  VIBE: { code: 'VIBE', face: '(￣▽￣)', tone: 'cream', label: 'Something is catching.' },
  NOD: { code: 'NOD', face: '(¬‿¬)', tone: 'mustard', label: 'That took courage.' },
};

/**
 * kept holds until the next pitch. A seed revisit is the pre-nod even
 * before the dwell timer. Door closed is always AWAY.
 */
export function resolveLoisFace({
  inCrit = false,
  kept = false,
  dwellMs = 0,
  seedRevisit = false,
  vibeMs = LOIS_VIBE_DWELL_MS,
} = {}) {
  if (!inCrit) return LOIS_FACES.AWAY;
  if (kept) return LOIS_FACES.NOD;
  if (seedRevisit || dwellMs >= vibeMs) return LOIS_FACES.VIBE;
  return LOIS_FACES.LEAN;
}

/** Pill session. Wall-clock of the linger lives in loisActivity; this only
 *  remembers whether the door is open and whether the last pitch was kept. */
export function createLoisFaceSession() {
  let inCrit = false;
  let kept = false;
  return {
    noteCurate() { inCrit = true; kept = false; },
    noteKeep() { inCrit = true; kept = true; },
    noteRecall() { inCrit = true; },
    noteBrowse() { inCrit = true; },
    face(feed = {}) {
      return resolveLoisFace({
        inCrit,
        kept,
        dwellMs: feed.dwellMs ?? 0,
        seedRevisit: !!feed.seedRevisit,
        vibeMs: feed.vibeMs,
      });
    },
  };
}
