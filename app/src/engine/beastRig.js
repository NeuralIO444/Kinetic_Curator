// app/src/engine/beastRig.js — #1960 BEAST S3b: the Strandbeest's linkage as a creature rig.
//
// Matt's ruling (2026-11-03): the linkage is the skeleton, its bars are invisible bones, and the asset pool attaches to
// them like the creature rig. A placed beast tile carries `rig.linkage` instead of `rig.bones`; at contract time
// engine/creatureRig.js expands it with the bone positions this module poses — the S2 solver supplies the joints where a
// creature's rig would use Lois's gait curves. Pure: measures + a crank phase in, bone segments out.
//
// The tile frame is creatureRig's: 100 × 100 units, y DOWN, angles in degrees clockwise from +x. The solver's leg frame
// is y UP with the crank centre O at the origin, so a joint (lx, ly) lands at (cx + lx·k, cy − ly·k). The legs sit along
// the body beam, `legSpacingUnits × scale` apart, exactly as the resolver-side builder spaces them. k (tile units per
// solver unit) is a CONSTANT of the genome range — the widest legal beast fills the tile — so the `scale` and `legCount`
// genes stay visible: a small beast is a small tile, never re-zoomed to fit.
//
// One part per bar NAME, not per bar instance: the 12 bars are dealt once and every leg wears the same set (a species
// look, and 12 deals not 144). The instances still pose per leg. Joint nodes are not drawn.

import { evaluateGenome } from './jansenSolver.js';
import { MEASURE_RANGES } from './jansenMeasures.js';
import { BEAST, BEAST_BARS, sanitizeMeasures, legPoints } from './beastBuilder.js';

const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

/** The widest legal beast (legCount max, scale max): beam span + a leg's reach either side, in solver units. */
const LEG_REACH_UNITS = 3; // a leg's horizontal reach about its crank centre, relative (× scale)
const WIDEST_UNITS =
  (MEASURE_RANGES.legCount.max - 1) * BEAST.legSpacingUnits * MEASURE_RANGES.scale.max +
  2 * LEG_REACH_UNITS * MEASURE_RANGES.scale.max;
/** Tile units per solver unit — fixed, see the header. 90 of the tile's 100 for the widest beast. */
export const LINKAGE_TILE_K = 90 / WIDEST_UNITS;
/** The crank turns this fast (turns per second) at drive 1 — the resolver-side builder's number. */
export const LINKAGE_CRANK_HZ = BEAST.crankHz;
/** The beam bone's id; the bar bones are `<leg>:<barName>`. */
export const BEAM_ID = 'beam';

const feasibleCache = new Map(); // measures fingerprint -> { feasible, stanceMean }
const keyOf = (m) => JSON.stringify(m);

/** Feasibility + the stance height of a measure set (S2's gate), memoised: the 360-step sweep runs once per genome. */
export function linkageInfo(measures) {
  const key = keyOf(measures);
  let info = feasibleCache.get(key);
  if (!info) {
    const ev = evaluateGenome(measures, measures.scale);
    info = {
      feasible: !!ev.feasible,
      stanceMean: ev.feasible ? ev.stanceMean : 0,
      // the body's advance per crank turn, solver units: the stance stroke over the share of the cycle it takes (S4)
      stride: ev.feasible && ev.duty > 0 ? ev.step / ev.duty : 0,
    };
    if (feasibleCache.size >= 64) feasibleCache.delete(feasibleCache.keys().next().value);
    feasibleCache.set(key, info);
  }
  return info;
}

/**
 * The trust boundary for a tile's linkage (sanitizeRig re-runs it on every overlay load): the measures clamp to their
 * legal ranges, `phase` wraps to 0..1. Null when `raw` is not an object with measures. A STILLBORN set survives the door —
 * it is a real (dead) animal, and expands to nothing — so the feasibility test lives in `posedLinkage`, not here.
 */
export function sanitizeLinkage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const measures = sanitizeMeasures(raw.measures);
  if (!measures) return null;
  const phase = Number.isFinite(raw.phase) ? ((raw.phase % 1) + 1) % 1 : 0;
  return { measures, phase };
}

const bone = (id, role, name, leg, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    id,
    role,
    name,
    leg,
    x: a.x,
    y: a.y,
    tx: b.x,
    ty: b.y,
    angle: Math.atan2(dy, dx) * DEG,
    len: Math.hypot(dx, dy),
  };
};

/**
 * Pose a linkage at `t` (driver seconds): the body beam first, then every leg's 12 bar bones in BEAST_BARS order, in
 * the tile frame. `drive` is the crank-rate multiplier. A frozen caller passes t = 0 (the rest pose). Returns null for a
 * stillbirth (the beast that was never alive) — the caller expands nothing.
 *
 * @param {{measures: object, phase: number}} linkage a sanitised linkage
 * @returns {Array<{id, role: 'body'|'limb', name, leg, x, y, tx, ty, angle, len}>|null}
 */
export function poseLinkage(linkage, t = 0, drive = 1, crank = null) {
  if (!linkage) return null;
  const m = linkage.measures;
  const info = linkageInfo(m);
  if (!info.feasible) return null;
  const n = m.legCount;
  const k = LINKAGE_TILE_K;
  const spacing = BEAST.legSpacingUnits * m.scale * k;
  // the crank line rides above the stance foot (stanceMean < 0): centre the hub→stance span on the tile's middle
  const cy = 50 + (info.stanceMean * k) / 2;
  const cx = (li) => 50 + (li - (n - 1) / 2) * spacing;
  const out = [bone(BEAM_ID, 'body', 'beam', -1, { x: cx(0), y: cy }, { x: cx(n - 1), y: cy })];
  for (let li = 0; li < n; li++) {
    const legPhase = Number.isFinite(m[`phase${li}`]) ? m[`phase${li}`] : li / n;
    // the crank runs backwards (θ falls as time rises) so the stance foot strokes backward under a right-facing body
    // #1867 — a roaming beast hands in each bank's own accumulated crank phase (turns; even legs = bank A, odd = bank B):
    // the banks drift apart to steer, and a stopped crank is a standing beast. Without it the crank is the clock's.
    const turns = crank ? (li % 2 === 0 ? crank.a : crank.b) : LINKAGE_CRANK_HZ * drive * (Number(t) || 0);
    const theta = TAU * (linkage.phase + legPhase - turns);
    const pts = legPoints(m, theta, m.scale);
    if (!pts) continue; // a pose the gate passed but this angle fails: skip the leg, never crash
    const at = (name) => ({ x: cx(li) + pts[name].x * k, y: cy - pts[name].y * k });
    for (const [name, from, to] of BEAST_BARS) {
      out.push(bone(`${li}:${name}`, 'limb', name, li, at(from), at(to)));
    }
  }
  return out;
}

/** The body's advance per crank turn in tile units (the S4 roam's stride): 0 for a stillbirth. */
export const strideTileUnits = (measures) => linkageInfo(measures).stride * LINKAGE_TILE_K;

/** The bar names, in deal order (the beam is dealt apart). */
export const LINKAGE_BAR_NAMES = Object.freeze(BEAST_BARS.map(([name]) => name));

/**
 * A static bar length per name (tile units, at the rest pose θ = 0, leg 0) — what Davis's long-bar test reads, so the deal
 * does not shift as the crank turns. Zero lengths for a stillbirth.
 */
export function restBarLengths(linkage) {
  const out = {};
  const m = linkage.measures;
  const pts = linkageInfo(m).feasible ? legPoints(m, 0, m.scale) : null;
  for (const [name, from, to] of BEAST_BARS) {
    out[name] = pts ? Math.hypot(pts[to].x - pts[from].x, pts[to].y - pts[from].y) * LINKAGE_TILE_K : 0;
  }
  return out;
}
