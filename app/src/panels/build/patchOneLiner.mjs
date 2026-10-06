// patchOneLiner.mjs — #1019: plain-language PATCH one-liner for newcomers.
//
// The PATCH row (`PATCH | ⊗ MOD | ✦ FIELD | ↻ FEED` + MATRIX) is a jargon
// wall with no plain-language line (layer eval F10, 2026-10-05). This module
// owns the one visible subtitle's copy and its show rule — pure, no React,
// so the rule is node-testable via the selfcheck below.
//
// Show rule (acceptance): with 2+ content tracks, PATCH shows the subtitle
// once; it never nags on repeat visits. Persistence is a localStorage flag
// (FirstRunOverlay's `kc:` prefix convention); the "shows once" guarantee
// works like this:
//   - `seen`  — read from localStorage at mount. Survives reloads.
//   - `dismissed` — session-only × on the line itself.
//   - `contentCount` — 2+ KC tracks (PATCH only exists on content rows).
// The flag is written to localStorage the first time the line displays, so
// the line stays up for the current session until the user taps ×, but a
// reload never brings it back.

export const PATCH_ONELINER_SEEN_KEY = 'kc:patch-oneliner-seen';

// Mockup C register: compact, lowercase, tells you the two things to touch
// (the mode select and the target select right above it).
export const PATCH_ONELINER_COPY =
  "PATCH routes one track's motion into another — pick a mode, point at a target.";

export function shouldShowPatchOneLiner({ seen, dismissed, contentCount }) {
  if (seen || dismissed) return false;
  return Number(contentCount) >= 2;
}

export function readPatchOneLinerSeen(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(PATCH_ONELINER_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePatchOneLinerSeen(storage = globalThis.localStorage) {
  try {
    storage?.setItem(PATCH_ONELINER_SEEN_KEY, '1');
  } catch {
    /* storage unavailable — line just lives for this session */
  }
}
