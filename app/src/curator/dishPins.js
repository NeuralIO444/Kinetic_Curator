// curator/dishPins.js — #1355 Phase 3 step 2: wet-lab pins, as data.
//
// A pin marks a privileged place in the dish (a spore). It does NOT build anything by itself: a creature forms there
// only when the formation rule says so (step 3). One pin by default: a plain click places it, or moves it. A
// Shift+click adds another, up to MAX_PINS (the TE-style limit of four).
//
// Pins live in SCENE coordinates (the canvas before zoom and pan), so they stay put when the view moves and mean the
// same thing in a recorded performance.

export const MAX_PINS = 4;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * How a pin's mark reads, from the formation rule's state for it ({ hold, formed } or null). Honest, counted frames only:
 *   'spore'   the spot does not qualify (no crowd, or not fertile): a hollow diamond
 *   'ready'   both conditions hold and the count is running: `progress` 0..1 of `holdFrames`
 *   'formed'  a creature stands here
 * A missing or broken state reads as 'spore'.
 */
export function pinMarkState(state, holdFrames = 30) {
  if (!state || typeof state !== 'object') return { kind: 'spore', progress: 0 };
  if (state.formed === true) return { kind: 'formed', progress: 1 };
  const hold = finite(state.hold) ? Math.max(0, state.hold) : 0;
  const n = finite(holdFrames) && holdFrames > 0 ? holdFrames : 30;
  if (hold <= 0) return { kind: 'spore', progress: 0 };
  return { kind: 'ready', progress: Math.min(1, hold / n) };
}

/** Keep only well-formed pins, at most MAX_PINS. Junk degrades by reduction. */
export function sanitizePins(pins) {
  if (!Array.isArray(pins)) return [];
  return pins.filter((p) => p && finite(p.x) && finite(p.y)).slice(0, MAX_PINS).map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Place a pin. Plain: the newest pin moves to `pt` (or the first pin is placed). `add`: another pin is added; at the
 * limit the newest one moves instead, so a click is never silently lost. Returns a new array, or the same array when
 * `pt` is not a real point.
 */
export function placePin(pins, pt, { add = false } = {}) {
  if (!pt || !finite(pt.x) || !finite(pt.y)) return pins;
  const next = { x: pt.x, y: pt.y };
  if (pins.length === 0 || (add && pins.length < MAX_PINS)) return [...pins, next];
  return [...pins.slice(0, -1), next];
}

/**
 * A pointer position to scene coordinates. The canvas is drawn `object-fit: contain` inside `rect`, so it may be
 * letterboxed; the view zooms around the canvas centre and then pans (the same transform liveLoop applies).
 * Returns null for a degenerate rect or a click on the letterbox bars.
 */
export function clientToScene(rect, clientX, clientY, canvasW, canvasH, zoom = 1, pan = { x: 0, y: 0 }) {
  if (!(rect?.width > 0) || !(rect.height > 0) || !(canvasW > 0) || !(canvasH > 0) || !(zoom > 0)) return null;
  const fit = Math.min(rect.width / canvasW, rect.height / canvasH);
  const sx = (clientX - rect.left - (rect.width - canvasW * fit) / 2) / fit;
  const sy = (clientY - rect.top - (rect.height - canvasH * fit) / 2) / fit;
  if (sx < 0 || sy < 0 || sx > canvasW || sy > canvasH) return null;
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  return { x: (sx - (pan?.x || 0) - cx) / zoom + cx, y: (sy - (pan?.y || 0) - cy) / zoom + cy };
}
