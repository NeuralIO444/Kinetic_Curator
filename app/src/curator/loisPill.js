// loisPill.js — the LOIS face pill state derivation (#1001).
//
// The pill is a state light, not a portrait: one fixed pill left of LIVE,
// always the same width. Only the face, the three-letter code, and the
// color change. CRIT (signal red) is PARKED on #954 — this module must never
// emit it; shipping the red eyes without the trained vector would be theater.
//
// Priority: NOD (transient keep flash) > VIBE (dwell / seed revisit) >
// LEAN (browsing triggers) > AWAY (base). VIBE's "without acting" uses the
// activity heartbeat (any pointer/keydown), not the tracked bus events, so
// staring at a render counts as lingering while slider-dragging does not.
import { LOIS_VIBE_DWELL_MS } from './loisActivity.js';

// Flash / hold windows. Surfaces read these; nothing else sets them.
export const LOIS_PILL_NOD_MS = 2600; // NOD: the keep flash, then fall back
export const LOIS_PILL_LEAN_HOLD_MS = 12000; // LEAN: "sizing the wall" lingers
export const LOIS_PILL_VIBE_HOLD_MS = 12000; // VIBE: seed-revisit flash
export { LOIS_VIBE_DWELL_MS };

export const LOIS_PILL_META = {
  AWAY: {
    face: '(・_・)',
    code: 'AWAY',
    mood: 'away — out of the room. Make freely.',
    // dimmed ink: absence. Muted gray so it reads on the dark bar.
    color: '#6e6e6e',
    border: '#2e2e2e',
  },
  LEAN: {
    face: '(￣ー￣)',
    code: 'LEAN',
    mood: 'leaning in — sizing the wall.',
    color: '#F2EAD8', // cream: watching
    border: '#4a463c',
  },
  VIBE: {
    face: '(￣▽￣)',
    code: 'VIBE',
    mood: 'vibing — something is catching, and he has not said so.',
    color: '#F2EAD8', // cream: watching
    border: '#4a463c',
  },
  NOD: {
    face: '(¬‿¬)',
    code: 'NOD',
    mood: 'nods — the keep. Now you are thinking with your own brains.',
    color: '#D9A441', // mustard: approval
    border: '#6b5322',
  },
};

/**
 * Pure derivation. All inputs are plain values; no store, no DOM.
 * @returns one of 'AWAY' | 'LEAN' | 'VIBE' | 'NOD' — never CRIT.
 */
export function deriveLoisPill({
  now,
  nodUntil = 0,
  vibeUntil = 0,
  leanUntil = 0,
  dwellMs = 0,
  idleMs = 0,
} = {}) {
  if (now < nodUntil) return 'NOD';
  if (now < vibeUntil) return 'VIBE';
  if (dwellMs >= LOIS_VIBE_DWELL_MS && idleMs >= LOIS_VIBE_DWELL_MS) return 'VIBE';
  if (now < leanUntil) return 'LEAN';
  return 'AWAY';
}

/** Render line for the pill: `[(¬‿¬) LOIS · NOD]`. */
export function loisPillText(code) {
  const m = LOIS_PILL_META[code] || LOIS_PILL_META.AWAY;
  return `${m.face} LOIS · ${m.code}`;
}
