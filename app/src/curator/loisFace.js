// loisFace.js — in-app LOIS kaomoji (#948, spec #1001).
//
// State light, not a portrait. Four faces. CRIT stays on #954 — no red,
// ever. The five-minute idle timer stays on #956; in the app the mode light
// wins: AWAY is the base state, triggers lift from it and fall back to it.
// Nothing latches: NOD is a transient flash (~2.6s), LEAN holds ~12s after
// the last lift, VIBE needs dwell AND idle (lingering without acting).

import { LOIS_VIBE_DWELL_MS } from './loisActivity.js';

export const LOIS_NOD_FLASH_MS = 2600; // NOD: the keep flash, then fall back
export const LOIS_LEAN_HOLD_MS = 12000; // LEAN: lift holds ~12s, then AWAY

export const LOIS_FACES = {
  AWAY: { code: 'AWAY', face: '(・_・)', tone: 'ink', label: 'Out of the room. Make freely.' },
  LEAN: { code: 'LEAN', face: '(￣ー￣)', tone: 'cream', label: 'Sizing the wall.' },
  VIBE: { code: 'VIBE', face: '(￣▽￣)', tone: 'cream', label: 'Something is catching.' },
  NOD: { code: 'NOD', face: '(¬‿¬)', tone: 'mustard', label: 'now you are thinking with your own brains' },
};

/**
 * Priority: NOD (flash) > VIBE (linger, no acting) > LEAN (fresh lift) > AWAY.
 * A seed revisit is the pre-nod even before the dwell timer — but still only
 * when idle, because the revisit itself was an act.
 */
export function resolveLoisFace({
  now = Date.now(),
  liftAt = null,
  keptAt = null,
  dwellMs = 0,
  idleMs = 0,
  seedRevisit = false,
  vibeMs = LOIS_VIBE_DWELL_MS,
  nodFlashMs = LOIS_NOD_FLASH_MS,
  leanHoldMs = LOIS_LEAN_HOLD_MS,
} = {}) {
  if (keptAt != null && now - keptAt < nodFlashMs) return LOIS_FACES.NOD;
  if ((seedRevisit || dwellMs >= vibeMs) && idleMs >= vibeMs) return LOIS_FACES.VIBE;
  if (liftAt != null && now - liftAt < leanHoldMs) return LOIS_FACES.LEAN;
  return LOIS_FACES.AWAY;
}

/** Pill session. Wall-clock of the linger lives in loisActivity; this only
 *  remembers when the door last opened and when the last keep landed. */
export function createLoisFaceSession({ now = () => Date.now() } = {}) {
  const t = () => now();
  let liftAt = null;
  let keptAt = null;
  return {
    noteCurate() { liftAt = t(); },
    noteKeep() { keptAt = t(); liftAt = t(); },
    noteRecall() { liftAt = t(); },
    noteBrowse() { liftAt = t(); },
    face(feed = {}) {
      return resolveLoisFace({
        now: feed.now ?? t(),
        liftAt,
        keptAt,
        dwellMs: feed.dwellMs ?? 0,
        idleMs: feed.idleMs ?? 0,
        seedRevisit: !!feed.seedRevisit,
        vibeMs: feed.vibeMs,
      });
    },
  };
}
