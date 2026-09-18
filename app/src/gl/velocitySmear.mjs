/**
 * Velocity smear bookkeeping (#309) — "motion blur with zero fullscreen
 * passes": the trail system lives on the objects.
 *
 * Per-frame, per-instance displacement in scene units is attached to the
 * instance objects as `vx`/`vy` (current position minus previous position).
 * The renderer packs vx/vy into the instance buffer (a_inst2.zw) and QUAD_VS
 * stretches each quad along its own motion direction; at rest (v = 0) the
 * shader is exactly the old path.
 *
 * The map is keyed on `layer|key` (the contract's stable instance keys, e.g.
 * `o${i}-s${s}`). First sightings and reappearances after a gap get zero
 * velocity — no one-frame pops. One-frame deltas past MAX_SPEED (teleports,
 * layout resets, session restarts) are clamped, so a layout jump can't
 * stretch an instance across the canvas.
 *
 * Browser-safe (no Node imports). Pure JS — unit-testable without a GL
 * context.
 */

/** Scene units per frame past which a delta is a teleport, not motion. */
export const SMEAR_MAX_SPEED = 240;

/**
 * Attach per-frame velocity to each instance's `vx`/`vy` and roll the
 * position history forward. `prev` is a Map the caller owns across frames
 * (created empty); it is pruned to the current frame's keys.
 * @param {Array<object>} instances scene-contract instances (mutated: vx/vy)
 * @param {Map<string,{x:number,y:number}>} prev position history
 * @returns {Map} prev (for chaining)
 */
export function attachVelocities(instances, prev) {
  const seen = new Set();
  for (const it of instances) {
    const k = `${it.layer}|${it.key}`;
    seen.add(k);
    const q = prev.get(k);
    let vx = 0;
    let vy = 0;
    if (q && Number.isFinite(it.x) && Number.isFinite(it.y)) {
      vx = it.x - q.x;
      vy = it.y - q.y;
      const s = Math.hypot(vx, vy);
      if (s > SMEAR_MAX_SPEED) {
        const f = SMEAR_MAX_SPEED / s;
        vx *= f;
        vy *= f;
      }
    }
    it.vx = vx;
    it.vy = vy;
    prev.set(k, { x: it.x, y: it.y });
  }
  for (const k of prev.keys()) {
    if (!seen.has(k)) prev.delete(k);
  }
  return prev;
}
