// sliderBounds.mjs — range expansion for the tap-name dialog (#1127).
//
// A dual slider rests on a default span (SCALE 0.1–3, ROTATE ±180, ALPHA 0–100). The dialog lets a performer WIDEN
// that span up to the engine's hard limits (RANGE_SPEC), or narrow it for finer control. The span is a property of
// the SLIDER, not of the scene: it lives for the session only (Matt, 2026-10-07), so a saved project, a keep and a
// share link never carry it. Pure, no DOM: the dialog and the row read it through `useSliderBounds`.

/** Parse the two typed fields against the hard limits. Whole-or-nothing: either both are good or neither applies. */
export function parseBoundsDraft(draft, hard) {
  const lo = Number(typeof draft?.min === 'string' && draft.min.trim() === '' ? NaN : draft?.min);
  const hi = Number(typeof draft?.max === 'string' && draft.max.trim() === '' ? NaN : draft?.max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ok: false, error: 'Both ends must be numbers.' };
  if (lo < hard.min || hi > hard.max) return { ok: false, error: `Stay within ${hard.min} to ${hard.max}.` };
  if (hi - lo <= 0) return { ok: false, error: 'MAX must be above MIN.' };
  return { ok: true, min: lo, max: hi };
}

/** A value pair pulled inside new bounds. Order is kept: a reversed pair (hi < lo) is a legitimate author's choice. */
export function fitRange(low, high, min, max) {
  const c = (v) => Math.min(max, Math.max(min, v));
  return [c(low), c(high)];
}

/** The session store: key -> [min, max]. A key with no entry rests on its default span. */
export function createBoundsStore() {
  const map = new Map();
  const listeners = new Set();
  let version = 0;
  const bump = () => { version += 1; listeners.forEach((f) => f()); };
  return {
    get: (key, fallback) => map.get(key) || fallback,
    set(key, min, max) { map.set(key, [min, max]); bump(); },
    reset(key) { if (map.delete(key)) bump(); },
    has: (key) => map.has(key),
    version: () => version,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
