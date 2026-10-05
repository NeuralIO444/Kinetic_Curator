// stageDisplays.mjs — #607 STAGE Phase B.
// Display descriptors for the stage display selector. Pure: Tauri 1.x
// Monitor shapes in, normalized descriptors out. No DOM, no store.
//
// Tauri 1.x Monitor: { name, size: {width,height}, position: {x,y}, scaleFactor }.
// It does NOT expose refresh rate — the descriptor says so honestly instead
// of inventing a number.

export const REFRESH_RATE_UNAVAILABLE =
  'Refresh rate is not exposed by the Tauri 1.x display API — shown as n/a.';

/**
 * Normalize one raw monitor into a stage display descriptor.
 * Never throws; hostile shapes degrade to a 1×1 "Display N".
 */
export function normalizeMonitor(raw, index = 0) {
  const size = (raw && typeof raw === 'object' && raw.size) || {};
  const pos = (raw && typeof raw === 'object' && raw.position) || {};
  const w = Math.max(1, Math.round(Number(size.width) || 0));
  const h = Math.max(1, Math.round(Number(size.height) || 0));
  const name = raw && typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim().slice(0, 80)
    : `Display ${index + 1}`;
  return {
    id: `mon-${index}-${w}x${h}`,
    name,
    w,
    h,
    x: Math.round(Number(pos.x) || 0),
    y: Math.round(Number(pos.y) || 0),
    scaleFactor: Number(raw && raw.scaleFactor) > 0 ? Number(raw.scaleFactor) : 1,
    refreshRateHz: null, // not exposed by Tauri 1.x — see REFRESH_RATE_UNAVAILABLE
  };
}

/** Normalize a whole enumeration. */
export function normalizeMonitors(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map((m, i) => normalizeMonitor(m, i));
}

/**
 * Resolve which display to stage on.
 * @returns {{display: object|null, note: string|null}} — note is a plain-
 *   English explanation when we fell back (or null when the pick is clean).
 *   Never invents a display: empty list → {display: null}.
 */
export function resolveStageDisplay(displays, selectedId) {
  const list = Array.isArray(displays) ? displays : [];
  if (list.length === 0) return { display: null, note: null };
  const picked = list.find((d) => d && d.id === selectedId);
  if (picked) return { display: picked, note: null };
  const first = list[0];
  if (!selectedId) return { display: first, note: null };
  return {
    display: first,
    note: `Saved display is gone — fell back to ${first.name}. Pick again if that is wrong.`,
  };
}

/**
 * The unplug check: is the display we are staging on still enumerated?
 * @returns {boolean} true when the selected display vanished.
 */
export function isDisplayGone(displays, selectedId) {
  if (!selectedId) return false;
  const list = Array.isArray(displays) ? displays : [];
  return !list.some((d) => d && d.id === selectedId);
}

/** Native raster for "Match display" — the canvas size to write. */
export function matchRaster(display) {
  if (!display || !Number.isFinite(display.w) || !Number.isFinite(display.h)) return null;
  return { w: Math.max(1, Math.round(display.w)), h: Math.max(1, Math.round(display.h)) };
}

/** One-line label for the selector: "Studio Display — 1920×1080 · n/a Hz". */
export function displayLabel(d) {
  if (!d) return '—';
  return `${d.name} — ${d.w}×${d.h} · n/a Hz`;
}
