// dishFluidPull.mjs — FERROFLUID #2178, channel 2: the bone pull. Pure.
//
// The field bends the figures that stand in it: a creature's or beast's joints are dragged
// by the ferrofluid through the pose seam P7 step 3.3 left (poseFigure composes one more
// delta per bone — see engine/motionCore/rigSources.js). THE LAW (Matt, ruled 2026-11-15):
// toward the magnet, field-gated. A bone bends toward the nearest magnet; the pull acts
// only where the field at the bone is strong (the published density at the bone's cell,
// gated at the matter floor), and its strength scales with that density and the PULL dial.
// Field that grew on its own, away from any magnet, has density but no direction of its
// own — with no magnet placed there is no pull anywhere; the magnets are the puppeteers,
// the fluid is how hard they can pull.
//
// This module is the field read only: given the published state (density, magnets, dial)
// and a bone's joint + tip in STAGE pixels, it returns the pull as a stage-space delta
// { dRot (degrees), offX, offY (px) } or null (no pull — the bone poses exactly as it
// would without the field). The expansion (engine/creatureRig.js) owns the tile transform
// and converts the delta into rig terms; poseFigure never learns what a field is. The read
// is a pure function of the frame's published state — the same frame's publication, the
// discipline the attached body has always used (the one-frame-behind rule is the
// stage↔stage coupling's, not the pose seam's) — so a take replays the pull exactly.

import { FLUID_GRID_COLS, FLUID_GRID_ROWS } from './dishFluid.mjs';
import { MATTER_DENSITY_FLOOR } from './dishFluidRender.mjs';

/** The density a bone's cell must reach before the field can pull on it (the matter floor). */
export const PULL_DENSITY_FLOOR = MATTER_DENSITY_FLOOR;
/** Fraction of the angle-to-magnet a saturated bone at full PULL dial closes per frame's pose. */
export const PULL_BEND = 0.5;
/** A root joint's drift toward the magnet at saturation and full dial, in stage px. */
export const PULL_DRIFT_PX = 18;

const wrapDeg = (d) => {
  let a = d % 360;
  if (a > 180) a -= 360;
  else if (a < -180) a += 360;
  return a;
};

/**
 * The pull on one bone. `field`: { density (the published dish-grid array), magnets
 * (sanitized, dish-normalized), pull (the PULL dial 0..1), aspectHW, W, H (stage px) }.
 * (jx, jy) the bone's joint and (tx, ty) its tip, in stage px — the bone's position THIS
 * frame, before the pull (the posers sample at the unpulled pose). Returns null when the
 * field cannot pull here: no magnets, dial at 0, the joint off the dish, the cell's
 * density under the floor, or a degenerate bone/magnet direction.
 */
export function bonePullDelta(field, jx, jy, tx, ty) {
  if (!field || !field.density || field.density.length !== FLUID_GRID_COLS * FLUID_GRID_ROWS) return null;
  const magnets = Array.isArray(field.magnets) ? field.magnets : [];
  const pull = Number(field.pull);
  if (!magnets.length || !(pull > 0)) return null;
  const W = Number(field.W) || 0;
  const H = Number(field.H) || 0;
  if (!(W > 0) || !(H > 0)) return null;
  const nx = jx / W;
  const ny = jy / H;
  if (!(nx >= 0) || !(nx < 1) || !(ny >= 0) || !(ny < 1)) return null;
  const cx = Math.min(FLUID_GRID_COLS - 1, Math.floor(nx * FLUID_GRID_COLS));
  const cy = Math.min(FLUID_GRID_ROWS - 1, Math.floor(ny * FLUID_GRID_ROWS));
  const d = field.density[cy * FLUID_GRID_COLS + cx];
  if (!(d >= PULL_DENSITY_FLOOR)) return null;
  const aspectHW =
    Number.isFinite(Number(field.aspectHW)) && Number(field.aspectHW) > 0 ? Number(field.aspectHW) : H / W;
  // the nearest magnet, in the kernel's own aspect-corrected distance (magnetFieldAt's metric)
  let best = null;
  let bd = Infinity;
  for (const m of magnets) {
    const dx = nx - m.x;
    const dy = (ny - m.y) * aspectHW;
    const dd = dx * dx + dy * dy;
    if (dd < bd) {
      bd = dd;
      best = m;
    }
  }
  if (!best) return null;
  const bx = tx - jx;
  const by = ty - jy;
  const mx = best.x * W - jx;
  const my = best.y * H - jy;
  const bl = Math.hypot(bx, by);
  const ml = Math.hypot(mx, my);
  if (!(bl > 1e-6) || !(ml > 1e-6)) return null;
  const cross = bx * my - by * mx;
  const dot = bx * mx + by * my;
  const deltaDeg = wrapDeg((Math.atan2(cross, dot) * 180) / Math.PI);
  const strength = Math.min(1, d) * Math.min(1, pull);
  const dRot = deltaDeg * strength * PULL_BEND;
  const offX = (mx / ml) * strength * PULL_DRIFT_PX;
  const offY = (my / ml) * strength * PULL_DRIFT_PX;
  if (dRot === 0 && offX === 0 && offY === 0) return null;
  return { dRot, offX, offY };
}
