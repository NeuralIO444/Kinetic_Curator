// dishRadius.mjs — the one contact-disc radius law (#1408), in a leaf.
//
// A body's contact disc: contactRadius · scale · trim. Defined here, in
// a module that imports nothing, so every consumer — the per-system
// pass and the cross-strata pass (dishContacts.mjs, which re-exports
// it), and the coalescence law (dishCoalesce.mjs, #1411) — shares the
// one law without importing each other's passes (and their import-time
// side effects, like cost-tier registrations).

/**
 * One body's contact radius: the stratum base scaled by the body's live
 * scale and its asset trim (#1229: per-asset contact trim, carried on
 * the body). Non-finite scale reads as 1, a non-positive trim as 1 —
 * the disc never goes negative or NaN.
 */
export function contactBodyRadius(base, scale, trim) {
  const s = Number.isFinite(scale) ? Math.max(0, scale) : 1;
  const t = Number.isFinite(trim) && trim > 0 ? trim : 1;
  return base * s * t;
}
