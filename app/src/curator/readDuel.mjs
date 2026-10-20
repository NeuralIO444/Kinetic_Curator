// readDuel.mjs — #1627 S3: the duel (rides #1483, gated by S2's proof).
//
// The loop is the one the keeps fill (#1590) already runs — draft →
// gate → tilt — ridden, not rebuilt (curate.js pickCurated is the
// surface; candidateTray's crown gate is untouched):
//   DRAFT  Davis blooms candidates at all three levels (pickCurated's
//          curator pick — MLX, persona, or LOIS's own rank).
//   GATE   LOIS judges each candidate's MEASURED reads (S2's meter —
//          readMeter shares, supplied by the caller from a real
//          raster: the census, a miner still, a future in-app bake)
//          against the balance point.
//   TILT   If Davis's pick sits outside the tolerance, LOIS tilts the
//          pick to the candidate nearest the balance point. Inside
//          the tolerance, Davis's pick stands — LOIS throttles and
//          demands, she does not re-deal the hand.
//
// The balance point is the QUEEN's: the mean read-shares of the kept
// Looks (anchorFromReads over the keeps' measured reads). No keeps,
// no anchor, NO DUEL — the module declines and the pick is exactly
// yesterday's (the null-curator honesty: never fake a judgment).
// A params-space proxy for the reads was considered and rejected in
// S2: the meter is Node-side because an in-app approximation could
// not stay honest, so the duel runs only where measured reads exist.
//
// The heat knob is #1483's ruled temperature — the boldness
// temperature on Davis's picks, read through effectiveTemp.js (the
// single source of truth) unless the caller hands one in. Heat widens
// the tolerance: a hotter room lets Davis bloom further from the
// Queen's anchor before LOIS tilts. Nothing here invents a second
// thermostat.
import { readVerdict } from './readMeter.mjs';
import { effectiveTemp } from './effectiveTemp.js';

/** Demand rule: a band is demanded when it sits below the anchor by
 *  more than DEMAND_REL of the anchor's own band AND more than
 *  DEMAND_MIN_DEFICIT absolute. Relative, because the bands live at
 *  different scales: the corpus's fine band sits near 0.05, so a 0.04
 *  deficit is not a wobble — it is most of the fine read gone (the
 *  bald corpus scene meters 72% under the balanced anchor's fine). */
export const DEMAND_REL = 0.35;
export const DEMAND_MIN_DEFICIT = 0.02;
/** Throttle rule floor: a band is throttled when it sits above the
 *  anchor by more than max(THROTTLE_MIN_EXCESS, tolerance / 2). */
export const THROTTLE_MIN_EXCESS = 0.08;

const BANDS = ['big', 'mid', 'fine'];
const DEMAND_LINE = {
  big: 'demand big — no silhouette to read',
  mid: 'demand mid — nothing underneath the top',
  fine: 'demand fine — bald: no dust, no grain, no motes',
};
const THROTTLE_LINE = {
  big: 'throttle big — all top, the top is shouting',
  mid: 'throttle mid — the middle is mud-thick',
  fine: 'throttle fine — all dust, the detail is mud',
};

const validShares = (s) => !!s && BANDS.every((b) => Number.isFinite(s[b]));

/** Share-space distance, 0..1: half the L1 distance between two reads. */
export function readDistance(a, b) {
  if (!validShares(a) || !validShares(b)) return Infinity;
  return (Math.abs(a.big - b.big) + Math.abs(a.mid - b.mid) + Math.abs(a.fine - b.fine)) / 2;
}

/**
 * The Queen's anchor: the mean read-shares of the kept Looks.
 * Accepts meter rows ({shares}) or bare share maps. Null when there
 * is nothing kept to anchor on — no anchor, no duel.
 */
export function anchorFromReads(reads) {
  const maps = (reads || []).map((r) => (r && r.shares ? r.shares : r)).filter(validShares);
  if (maps.length === 0) return null;
  const mean = { big: 0, mid: 0, fine: 0 };
  for (const m of maps) for (const b of BANDS) mean[b] += m[b] / maps.length;
  return mean;
}

/** How far from the anchor a pick may sit before LOIS tilts, at a temperature. */
export function duelTolerance(temperature = effectiveTemp()) {
  const t = Number.isFinite(temperature) ? temperature : effectiveTemp();
  return +(0.08 + 0.35 * t).toFixed(4);
}

/**
 * LOIS's judgment of one measured read against the anchor.
 * Returns { dist, tolerance, pass, verdict, demand, line } — verdict is
 * the meter's own word for the read; demand/throttle name the band
 * furthest from the anchor on its side; line is the deadpan copy.
 */
export function judgeRead(shares, anchor, temperature = effectiveTemp()) {
  const tolerance = duelTolerance(temperature);
  if (!validShares(shares) || !validShares(anchor)) {
    return { dist: Infinity, tolerance, pass: false, verdict: 'unmeasured', demand: null, line: 'no read — no judgment' };
  }
  const dist = readDistance(shares, anchor);
  const verdict = readVerdict(shares);
  let demand = null;
  let worst = 0;
  for (const b of BANDS) {
    const below = anchor[b] - shares[b];
    // The named band is the worst by RELATIVE deficit: a bald read is
    // missing most of its fine band and some of its mid — LOIS names
    // the fine (72% under the anchor) before the mid (37% under).
    const rel = anchor[b] > 0 ? below / anchor[b] : 0;
    if (below > DEMAND_MIN_DEFICIT && rel > DEMAND_REL && rel > worst) {
      worst = rel; demand = { band: b, kind: 'demand', line: DEMAND_LINE[b] };
    }
  }
  if (!demand) {
    const throttleBar = Math.max(THROTTLE_MIN_EXCESS, tolerance / 2);
    worst = throttleBar;
    for (const b of BANDS) {
      const above = shares[b] - anchor[b];
      if (above > worst) { worst = above; demand = { band: b, kind: 'throttle', line: THROTTLE_LINE[b] }; }
    }
  }
  // The gate is both halves of LOIS's job: near the anchor (distance)
  // AND nothing demanded or throttled (a band at fault). A bald read
  // sits close to a big-heavy anchor in raw distance — its missing
  // fine band is still a demand, and a demand never passes.
  const pass = dist <= tolerance && !demand;
  return {
    dist: +dist.toFixed(4), tolerance, pass, verdict, demand,
    line: pass ? 'the reads hold' : (demand ? demand.line : 'off the anchor — tilt'),
  };
}

/**
 * The tilt. Given every candidate's measured read (aligned with the
 * candidate list; entries may be null where a candidate went
 * unmeasured), the Queen's anchor, and Davis's pick:
 *   · no anchor / no measured reads → declines ({ dueled: false }),
 *     the caller's pick stands untouched;
 *   · Davis's pick inside tolerance → it stands ({ dueled: true,
 *     tilted: false });
 *   · outside → the nearest-to-anchor measured candidate is taken
 *     ({ dueled: true, tilted: true }) — first of equals wins (the
 *     LOIS rank's own convention).
 */
export function duelPick({ reads, anchor, davisIndex, temperature = effectiveTemp() } = {}) {
  if (!validShares(anchor)) return { dueled: false, reason: 'no queen anchor — no duel', index: davisIndex, verdicts: [] };
  if (!Array.isArray(reads) || !reads.some((r) => validShares(r && r.shares ? r.shares : r))) {
    return { dueled: false, reason: 'no measured reads — no duel', index: davisIndex, verdicts: [] };
  }
  const verdicts = reads.map((r) => {
    const shares = r && r.shares ? r.shares : r;
    return validShares(shares) ? judgeRead(shares, anchor, temperature) : null;
  });
  const davis = Number.isInteger(davisIndex) && davisIndex >= 0 ? verdicts[davisIndex] : null;
  if (davis && davis.pass) {
    return { dueled: true, tilted: false, index: davisIndex, verdicts, line: davis.line };
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < verdicts.length; i++) {
    if (verdicts[i] && verdicts[i].dist < bestDist) { bestDist = verdicts[i].dist; best = i; }
  }
  if (best < 0) return { dueled: false, reason: 'no measured reads — no duel', index: davisIndex, verdicts };
  return {
    dueled: true, tilted: best !== davisIndex, index: best, verdicts,
    line: verdicts[best].pass ? 'tilted to the anchor' : (verdicts[davisIndex]?.line ?? 'tilted to the anchor'),
    fromLine: davis ? davis.line : null,
  };
}
