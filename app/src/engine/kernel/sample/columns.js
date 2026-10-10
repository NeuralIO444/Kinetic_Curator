// Kernel SoA 5/5 — sampler column-writing protocol (#1309).
//
// The sampler ctx gains an optional column-writing mode. When `ctx.out` is
// set, the sampler writes its result lanes directly into the provided
// Float64Array columns at `ctx.row` and returns `undefined` — no per-point
// `{x, y}` object is allocated on the placement path.
//
//   ctx.out = { x, y, t, rot01 }   // lanes; t/rot01 may be null when the
//                                  // orchestrator has no lane for them
//   ctx.row = n                    // the lane to write
//
// Contract:
// - x and y are ALWAYS written (finite). The sampler ABI guarantees a
//   point; a column-mode sampler that cannot place still writes *something*
//   (the legacy fallbacks — canvas centre — apply unchanged).
// - t / rot01 are written only by samplers that produce them. The
//   orchestrator pre-fills those lanes with NaN for the row before the
//   call; a NaN read-back means "not produced" and selects the legacy
//   fallback (default t ramp / hash uRot draw), exactly as `pos.t ===
//   undefined` / `pos.rot01 === undefined` did on the object path.
// - Samplers that do not implement the protocol keep the legacy
//   `{x, y, t?, rot01?}` return; the orchestrator adapts them by unpacking
//   the return into the lanes. Third-party samplers registered via
//   registerSampler(id, fn) take that path automatically — zero breakage.
//
// Bit-identity: the column write stores the same f64 expression the object
// return would have carried, evaluated in the same order (notably the
// per-item rng() draw order). The placement goldens pin this.

/**
 * Write one sampler result into the column-mode lanes.
 * @returns {boolean} true when column mode was active (caller returns
 *   undefined); false when ctx.out is absent (caller returns the legacy
 *   {x, y} object).
 */
export function writeSampleColumns(ctx, x, y, t, rot01) {
  const out = ctx.out;
  if (!out) return false;
  const r = ctx.row;
  out.x[r] = x;
  out.y[r] = y;
  if (t !== undefined && out.t) out.t[r] = t;
  if (rot01 !== undefined && out.rot01) out.rot01[r] = rot01;
  return true;
}
