// engine/gaitStage.js — #2329 (GAIT M3): a construct wearing a moving gait, posed piece by piece. Pure.
//
// The stage hook (gl/liveResolve.mjs → engine/constructStage.js) deals a construct as its pieces only when `moving`
// says so (Matt's 2026-11-18 ruling: at rest a construct IS its flat tile). This module supplies both halves:
//   moving(item)  true only for a construct tile whose assigned gait has a non-zero amount
//   pose(...)     the pieces' marks, moved by the gait's per-node amounts through the REGISTERED kineme drivers
//
// The drivers are the KINEME drivers themselves (engine/kineme.js evaluateKineme), not a re-derivation: each node is
// evaluated with ITS role's amounts at ITS beat time (engine/gait.js evaluateGait: the wearer's phase plus
// depth × cascade, so a leaf follows the root). Only the channels a piece can show are read: scale (breath, pulse)
// and position (drift). brush-wobble has no stage consumer on main and palette-breath needs the bind-cache colour
// arrays, so a gait's amounts for those two are evaluated and left unapplied here — the Canon defaults name neither.
//
// The parent transform: each node's motion is a similarity about its own centre (scale by 1 + dScale, move by
// dx, dy), and a child wears its parent's motion before its own — map(child) = map(parent) ∘ local(child). A
// wandering root carries the whole shape; a breathing joint carries its leaves with it, so the joins hold.
//
// Hard gate: no stamp, or no moving gait → no options at all (the hook then sees no `moving` and returns the same
// array). Anchored drivers: at beat time where every node's driver time is 0 the pose is the rest pose.
import { evaluateGait, gaitBeatTime } from './gait.js';
import { evaluateKineme } from './kineme.js';
import { gaitsOfStamp } from './gaitAssign.js';

/** Driver id → the kineme ctx amount key. */
const AMOUNT_KEY = Object.freeze({
  breath: 'breath',
  drift: 'drift',
  pulse: 'pulse',
  'brush-wobble': 'brushWobble',
  'palette-breath': 'paletteBreath',
});
/** Kineme phase slots per wearer: a construct has at most this many pieces (CONSTRUCT_MAX_PARTS is 16). */
const SLOTS_PER_WEARER = 64;

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A dealt construct's pieces as a gait tree (node k ↔ piece k). */
function treeOfPieces(pieces) {
  const at = new Map(pieces.map((p, k) => [p.id, k]));
  let maxDepth = 0;
  const nodes = pieces.map((p, k) => {
    const d = p.depth | 0;
    if (d > maxDepth) maxDepth = d;
    return { id: k, parent: p.parent == null ? -1 : (at.get(p.parent) ?? -1), depth: d };
  });
  return { nodes, maxDepth };
}

/**
 * Pose one construct's piece marks by a gait. Returns NEW marks, or the same `marks` when the gait moves nothing here.
 * @param marks    [{ assetId, x, y, rotation, scale }] — pieceMark of each piece, in piece order
 * @param pieces   expandConstructPieces(...).pieces (ids, parents, depths)
 * @param gait     a sanitized gait
 * @param o        { beatTime, bpm, wearerSeed, seed, slot, canvasW, canvasH }
 */
export function poseConstruct(marks, pieces, gait, o) {
  const n = Array.isArray(marks) ? marks.length : 0;
  if (!n || !Array.isArray(pieces) || pieces.length !== n) return marks;
  const tree = treeOfPieces(pieces);
  const ev = evaluateGait({ n }, gait, tree, o.beatTime, o.wearerSeed >>> 0);
  if (!ev || !ev.active) return marks;
  const secPerBeat = 60 / (o.bpm > 0 ? o.bpm : 120);
  const base = ((o.slot | 0) % 1024) * SLOTS_PER_WEARER;
  // the composed map of each node: p → s·p + t
  const S = new Float64Array(n);
  const TX = new Float64Array(n);
  const TY = new Float64Array(n);
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    const amounts = {};
    let any = false;
    for (const [id, arr] of Object.entries(ev.amounts)) {
      const key = AMOUNT_KEY[id];
      if (key && arr[k] > 0) {
        amounts[key] = arr[k];
        any = true;
      }
    }
    let ds = 0;
    let dx = 0;
    let dy = 0;
    if (any) {
      const d = evaluateKineme(
        { n: 1, index: Int32Array.of(base + k), x: Float64Array.of(marks[k].x), y: Float64Array.of(marks[k].y) },
        {
          seed: o.seed | 0,
          driverSec: ev.beat[k] * secPerBeat,
          boilStep: 0,
          amounts,
          canvasW: o.canvasW,
          canvasH: o.canvasH,
          anchored: true,
        },
      );
      ds = d.dScale[0];
      dx = d.dx[0];
      dy = d.dy[0];
    }
    // local(k): p → (1 + ds)(p − c) + c + d, about the piece's own centre c
    const cx = marks[k].x;
    const cy = marks[k].y;
    const ls = 1 + ds;
    const ltx = cx - ls * cx + dx;
    const lty = cy - ls * cy + dy;
    const par = tree.nodes[k].parent;
    if (par >= 0 && par < k) {
      S[k] = S[par] * ls;
      TX[k] = S[par] * ltx + TX[par];
      TY[k] = S[par] * lty + TY[par];
    } else {
      S[k] = ls;
      TX[k] = ltx;
      TY[k] = lty;
    }
    out[k] = { ...marks[k], x: S[k] * cx + TX[k], y: S[k] * cy + TY[k], scale: marks[k].scale * S[k] };
  }
  return out;
}

/**
 * The stage options for one frame: { moving, pose } for constructPieceItems, or null when no moving gait stands
 * (pass nothing: the hook's hard gate).
 * @param stamp   the frame input's `gaits` (engine/gaitAssign.js gaitInputStamp)
 * @param frame   { driverSec, seed, canvasW, canvasH } — the kineme clock and the layer's seed
 */
export function gaitStageOptions(stamp, frame = {}) {
  const gaits = gaitsOfStamp(stamp);
  if (!gaits) return null;
  const worn = new Map();
  for (const [target, gait] of gaits) worn.set(target, { gait, bpm: stamp.bpm });
  return gaitStageOptionsFor(worn, frame);
}

/**
 * #2329 follow-up — the same options from what each wearer wears this frame (engine/gaitBlend.js step(): a Map
 * target → { gait, bpm }, a cross-fade mid-swap or the stamped record itself). Each wearer's beat counts at its own
 * tempo, so a wearer easing to still after the stamp is gone keeps the beat it was moving on.
 */
export function gaitStageOptionsFor(worn, { driverSec = 0, seed = 0, canvasW = 0, canvasH = 0 } = {}) {
  if (!(worn instanceof Map) || !worn.size) return null;
  return {
    moving: (item) => !!item && worn.has(item.assetId),
    pose: (marks, pieces, tile, slot) => {
      const w = worn.get(tile.assetId);
      if (!w) return marks;
      const who = `${tile.assetId}|${tile.key ?? slot}`;
      return poseConstruct(marks, pieces, w.gait, {
        beatTime: gaitBeatTime({ bpm: w.bpm, driverSec }),
        bpm: w.bpm,
        wearerSeed: (seed ^ hash32(who)) >>> 0,
        seed,
        slot,
        canvasW,
        canvasH,
      });
    },
  };
}
