// cultureGait.mjs — CULTURE Phase 5, slice B: gait as CULTURE's (the parent issues 2331 and 2332, on the
// Motion Core seam). Pure apart from the gait state it is handed: no DOM, no GL, no clock, no chance.
//
// WHAT A GAIT IS HERE. The gait record (engine/gait.js, docs/design/gait-spec.md) is the live stage's, shared
// untouched: a portable motion record of REGISTERED kineme drivers by join-tree depth (root, inner, leaf), a
// cascade in beats, and a break-up structure (release order, scatter, rejoin). CULTURE does not fork it and does
// not change a byte of the live gait code. This module is the dish's side of it:
//
//   ADAPTERS (M5, the parent issue 2331)  cultureTreeOf(kind, record) — the join tree of each kind of wearer:
//       'rig'       a CULTURE citizen's assembled body (engine/cultureBody.mjs): the part tree, head the root
//       'creature'  a WetLab creature rig (engine/creatureRig.js buildRig): bones parent-first, head and every
//                   limb chain rooted; a limb's depth is its bone's depth in the chain
//       'beast'     a Strandbeest linkage (engine/beastRig.js poseLinkage): the beam is the root, each leg's twelve
//                   bars hang off it along the linkage's own construction (crank and frame off the beam, the
//                   moving bars off the bars they pivot on)
//       'glyph'     ROOT ONLY (Matt, 2026-11-18 19:06 PT: "A glyph wears a gait root only (it moves whole)");
//                   stroke-level gait is out of scope
//       'construct' / 'asset'  delegated to gait.js's own treeOf, untouched
//     cultureGaitPose then moves any wearer by its depth through the SAME evaluator and drivers the stage uses
//     (gaitStage.poseConstruct → engine/gait.js evaluateGait → engine/kineme.js drivers), so one shared gait
//     moves a construct, a creature, a beast and a glyph each by its own depth. The result is a Motion Core Pose
//     delta per node, so it composes with the citizens' feel layer (cultureMotion.mjs, 'culture:feel') through
//     composePose: the creature's own pose is the base and the gait layers over it ("Creature pose still composes
//     UNDER the gait" — the parent issue 2331).
//
//   THE QUEEN'S PICKS (M5 ruling, Matt 2026-11-18 19:56 PT): "The QUEEN picks for every wearer … Canon default
//     gaits by their style, the QUEEN picks per phrase, the user lock wins, and every pick is recorded in the take."
//     The picks are the live ones (engine/gaitAssign.js queenPicks, applyGaitAssign: no audio is still, true
//     silence is still, low or mid energy is idle, high is performing, a lock is never re-picked). The dish keeps
//     the standing assignments and the recorded log in its gait state (createCultureGait).
//
//   BREAK-UP (M5 ruling): "Creatures and beasts break up too: the M4 ferrofluid release/rejoin applies by their
//     limb tree … A glyph is root only, so it moves whole." The break-up fold is gaitBreakup.js's own, untouched:
//     the Queen's magnet standing in the dish's fluid is the field's "strong here" (markDriftDelta), a citizen's
//     parts release by their limb tree and rejoin to the exact rest pose. The offsets are a POSE delta (the layout's
//     read) — the bodies in the solver never move because of a gait; physics is not the gait's.
//
//   THE DAMP STEP (M6, the parent issue 2332; Matt 2026-11-18 19:28 PT): "Damp step: −25% of the gait's amounts per
//     phrase, with a floor at 25% (it never fully stops). Recovery is +25% per phrase once the frame reads clean.
//     Locked gaits are exempt from both." TASTE reads the frame; when moving pieces outrank the dealt shapes
//     (hierarchy: dealt > pieces > forces) it hands the case to the QUEEN, who steps the gait's amounts down ONE
//     capped notch per phrase (CULTURE_DAMP_STEP, floored at CULTURE_DAMP_FLOOR), and back up one notch per
//     clean phrase. The notch scales the driver amounts AND the break-up's scatter reach (the "amounts" the pieces
//     travel by: with the guardrail's subject being break-up pieces, a damp that left the scatter alone could never
//     bring a broken frame back); a level change eases over one beat (the gait swap's own ease), never a pop.
//   TASTE's reading is the coordinator's default (the issue text gives no number): moving pieces OUTRANK dealt
//     shapes when more than half of the wearer's ink (the parts' disc area) has left its own footprint — a part
//     displaced by at least its own radius no longer reads as the dealt shape it was, it reads as a moving piece.
//     CULTURE_OUTRANK_SHARE = 0.5, tunable in iteration.
//   THE LOIS VETO (M6): "protected negative space = cells of the existing coverage grid under 10% ink. Break-up
//     pieces may not release or scatter into them." The dish's coverage grid is its shared grid (96 × 54 cells of
//     20 px — the soil's, the fluid's, one grid); a cell's ink is the share of it covered by the DEALT frame (every
//     living body's disc and every static box, at the positions the solver has them — never the displaced pieces,
//     or a scatter would justify itself). A piece's break-up offset is pulled back along its own line, in sixteenths,
//     to the farthest point that stands on a cell with at least CULTURE_INK_FLOOR (10%) ink; a piece that starts
//     in negative space does not release at all. LOIS only vetoes — she never builds.
//   LOCKED GAITS are exempt from both: a locked wearer's gait is never damped and its break-up is never vetoed.
//
// THE CLOCK (gait-spec ruling 6). The gait counts BEATS: the gait layer accumulates beats on the world's swarm
// cadence at the room's tempo (default 120 BPM — "with no audio, the kineme loop clock at a default BPM") and
// every driver, ease and fold reads that beat count. A phrase is PHRASE_BARS (4) bars of 4 beats = 16 beats (the
// QUEEN's own phrase, curator/paceLive.js; pinned equal in the suite). The layer is DORMANT with no citizens in the
// world: it accumulates nothing, so a world with no wearers steps and hashes exactly as it did before this slice.
//
// THE ROOM. What the QUEEN hears is an input the host hands the world (setCultureRoom): the energy band, silence,
// tempo. With no reading at all the wanted gait is still ("a room that is not listening keeps today's render" —
// Matt, 2026-11-18 18:53 PT), so a dish nobody feeds wears no gait and its citizens pose exactly as before.
//
// Nothing here knows a world: the world hands in the tables it owns (the body table, the citizens, the statics, the
// fluid's drift field) and gets back state plus a derived `out` per wearer (the pose the layout reads).
import { composePose, POSE_IDENTITY } from './motionCore/index.js';
import { GAIT_DEFAULT_BPM, treeOf as gaitTreeOf } from './gait.js';
import { poseConstruct } from './gaitStage.js';
import { createGaitBlend, GAIT_EASE, GAIT_EASE_BEATS } from './gaitBlend.js';
import { createGaitBreakup, easeOf } from './gaitBreakup.js';
import { markDriftDelta } from './dishFluidDrift.mjs';
import { applyGaitAssign, gaitInputStamp, queenPicks, sanitizeGaitAssign } from './gaitAssign.js';
import { canonGaitById } from '../data/canon/gaits.js';
import { buildRig } from './creatureRig.js';
import { poseLinkage } from './beastRig.js';
import { BEAST_BARS } from './beastBuilder.js';
import { ATTACH_BOX } from './assetAttach.js';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';

// ── the numbers (Matt's rulings are marked; the rest are the coordinator's defaults, tunable) ──────────────────────

/** The wearers' kinds the adapters know (the parent issue 2331: construct, creature, beast, glyph; 'rig' is the citizen). */
export const CULTURE_GAIT_WEARER_KINDS = Object.freeze(['rig', 'creature', 'beast', 'glyph', 'construct', 'asset']);
/** Damp: −25% of the gait's amounts per phrase (Matt, the parent issue 2332). */
export const CULTURE_DAMP_STEP = 0.25;
/** Damp: the floor at 25% — "it never fully stops" (Matt, the parent issue 2332). Recovery is +25% a phrase. */
export const CULTURE_DAMP_FLOOR = 0.25;
/** The most notches a wearer can stand down: from 100% to the floor in steps of CULTURE_DAMP_STEP. */
export const CULTURE_DAMP_NOTCHES = Math.round((1 - CULTURE_DAMP_FLOOR) / CULTURE_DAMP_STEP);
/** LOIS: a coverage-grid cell under this much ink is protected negative space (Matt, the parent issue 2332). */
export const CULTURE_INK_FLOOR = 0.1;
/** TASTE (default): moving pieces outrank dealt shapes when this share of a wearer's ink has left its footprint. */
export const CULTURE_OUTRANK_SHARE = 0.5;
/** A phrase, in beats: PHRASE_BARS (4) × 4 beats a bar. */
export const CULTURE_PHRASE_BEATS = 16;
/** The gait layer runs on the swarm's cadence: one swarm step is two 120 Hz world steps = 1/60 s. */
export const CULTURE_GAIT_STEP_S = 1 / 60;
/** The veto pulls a break-up offset back in this many equal shares. */
export const CULTURE_VETO_STEPS = 16;
/** Ink is sampled on a 4 × 4 lattice in every coverage cell. */
export const CULTURE_INK_SAMPLES = 4;
/** The room's energy bands the QUEEN hears (curator/gaitLive.js: audio:energy). */
export const CULTURE_ROOM_ENERGIES = Object.freeze([null, 'low', 'mid', 'high']);
/** The recorded log's ceiling: a take that long refuses a further assignment, loudly. */
export const CULTURE_GAIT_LOG_CAP = 4096;
/** The tempo bounds the room may hand the gait clock. */
export const CULTURE_ROOM_BPM = Object.freeze({ min: 30, max: 300 });

/**
 * The Canon style each plan's wearers are picked from (the QUEEN reads "Canon default gaits by their style"). A taste
 * call, flagged: the dish creature breathes and wanders and follows the flow when it breaks up (organic); the moth's
 * long, slow follow-through and drifting, retracing break-up is the japanese set's.
 */
export const CULTURE_GAIT_STYLES = Object.freeze({ dish: 'organic', moth: 'japanese' });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// ── the adapters (M5) ───────────────────────────────────────────────────────────────────────────────────────────────

const node = (id, parent, depth) => ({ id, parent, depth });

/** A tree from parent INDICES (−1 = root), parents listed before children. */
function treeFromParents(parents) {
  const nodes = [];
  let maxDepth = 0;
  for (let k = 0; k < parents.length; k++) {
    const p = parents[k];
    const depth = p >= 0 && p < k ? nodes[p].depth + 1 : 0;
    if (depth > maxDepth) maxDepth = depth;
    nodes.push(node(k, p >= 0 && p < k ? p : -1, depth));
  }
  return { nodes, maxDepth };
}

/** Each leg bar's parent bar, from the linkage's own construction: the earlier bar that ends where it starts, else the beam. */
const BEAST_BAR_PARENT = (() => {
  const out = new Map();
  BEAST_BARS.forEach(([name, from], i) => {
    let parent = null;
    for (let j = 0; j < i && parent === null; j++) if (BEAST_BARS[j][2] === from) parent = BEAST_BARS[j][0];
    out.set(name, parent);
  });
  return out;
})();

/**
 * A wearer's join tree: { nodes: [{ id, parent, depth }], maxDepth }, node k ↔ the wearer's k-th piece (parent an
 * INDEX, −1 for a root — gait.js's own shape). Null for a kind the adapters do not know, or a record that does not
 * make a tree (a creature with no rig, a stillborn beast, a construct whose points are not supplied).
 *   'rig'        record = a CULTURE body (parts[].parent)
 *   'creature'   record = a WetLab creature record, or its rig ({ bones })
 *   'beast'      record = a linkage ({ measures, phase }) that is feasible
 *   'glyph'      ROOT ONLY: one node (it moves whole)
 *   'construct' / 'asset'  gait.js's treeOf (opts.pointsOf for a construct)
 */
export function cultureTreeOf(kind, record, opts = {}) {
  switch (kind) {
    case 'glyph':
      return { nodes: [node(0, -1, 0)], maxDepth: 0 };
    case 'rig': {
      const parts = record && Array.isArray(record.parts) ? record.parts : null;
      if (!parts || !parts.length) return null;
      return treeFromParents(parts.map((p) => p.parent));
    }
    case 'creature': {
      const rig = record && Array.isArray(record.bones) ? record : buildRig(record);
      if (!rig || !Array.isArray(rig.bones) || !rig.bones.length) return null;
      const at = new Map(rig.bones.map((b, k) => [b.id, k]));
      return treeFromParents(
        rig.bones.map((b) => (b.parent === null || b.parent === undefined ? -1 : (at.get(b.parent) ?? -1))),
      );
    }
    case 'beast': {
      const bones = record ? poseLinkage(record, 0) : null;
      if (!bones || !bones.length) return null;
      const at = new Map(bones.map((b, k) => [b.id, k]));
      return treeFromParents(
        bones.map((b) => {
          if (b.id === 'beam') return -1;
          const name = b.id.slice(b.id.indexOf(':') + 1);
          const parentName = BEAST_BAR_PARENT.get(name);
          const parentId = parentName ? `${b.leg}:${parentName}` : 'beam';
          return at.get(parentId) ?? at.get('beam') ?? -1;
        }),
      );
    }
    case 'construct':
    case 'asset':
      return gaitTreeOf(kind, record, opts);
    default:
      return null;
  }
}

/** A tree as the stage's `pieces` ({ id, parent id, depth }), the shape gaitStage.poseConstruct reads. */
export function cultureGaitPieces(tree) {
  return tree.nodes.map((n) => ({ id: n.id, parent: n.parent < 0 ? null : tree.nodes[n.parent].id, depth: n.depth }));
}

/**
 * One wearer moved by a gait, each node by ITS depth: the gait's per-node driver amounts and beat times through the
 * live evaluator and the registered drivers (gaitStage.poseConstruct, unchanged), read back as a Motion Core Pose
 * per node — dx / dy the node's own offset (px), sx / sy its scale (the parent's swell carried down the joins).
 * `marks` are the node's rest positions [{ x, y }] in node order; `o` = { beatTime, bpm?, wearerSeed, seed, slot,
 * canvasW, canvasH }. Returns null on a malformed call; an array of the SAME frozen POSE_IDENTITY when the gait moves
 * nothing here (no gait, amount 0 everywhere, or no role this wearer has a node for) — today's render exactly.
 */
export function cultureGaitPose(marks, tree, gait, o) {
  const n = Array.isArray(marks) ? marks.length : 0;
  if (!n || !tree || !Array.isArray(tree.nodes) || tree.nodes.length !== n) return null;
  const rest = marks.map((m) => ({ assetId: 0, rotation: 0, ...m, scale: 1 }));
  if (!gait) return rest.map(() => POSE_IDENTITY);
  const posed = poseConstruct(rest, cultureGaitPieces(tree), gait, { bpm: GAIT_DEFAULT_BPM, ...o });
  if (posed === rest) return rest.map(() => POSE_IDENTITY);
  return posed.map((p, k) =>
    Object.freeze({ dx: p.x - rest[k].x, dy: p.y - rest[k].y, dRot: 0, sx: p.scale, sy: p.scale, dAlpha: 0 }),
  );
}

/** The creature's own pose is the base and the gait layers over it (the parent issue 2331), through Motion Core. */
export function cultureComposeGaitOverFeel(feelPose, gaitPose) {
  return composePose(feelPose, gaitPose);
}

// ── the damp step (M6) ──────────────────────────────────────────────────────────────────────────────────────────────

/** The amount a wearer's notch stands at: 1 at notch 0, CULTURE_DAMP_FLOOR at the cap. */
export const cultureDampTarget = (notch) => 1 - CULTURE_DAMP_STEP * notch;

/**
 * THE QUEEN'S DAMP STEP for one phrase: the notch a wearer stands at after TASTE's reading. Flagged (moving pieces
 * outrank the dealt shapes): one notch down, capped at CULTURE_DAMP_NOTCHES (the floor). Clean: one notch back up.
 * A locked wearer is exempt from both: its notch is returned untouched. Pure.
 */
export function cultureDampStep(notch, outranks, locked) {
  if (locked) return notch;
  if (outranks) return Math.min(CULTURE_DAMP_NOTCHES, notch + 1);
  return Math.max(0, notch - 1);
}

/**
 * A wearer's damp entry { n, from, t0 } at beat `beats`: the level it wears — the notch's target, eased over one beat
 * (GAIT_EASE_BEATS) from where it was — or exactly 1 for a locked wearer (exempt). Pure.
 */
export function cultureDampLevel(entry, beats, locked) {
  if (locked || !entry) return 1;
  const to = cultureDampTarget(entry.n);
  if (entry.from === to) return to;
  const u = (beats - entry.t0) / GAIT_EASE_BEATS;
  if (u >= 1) return to;
  return entry.from + (to - entry.from) * easeOf(GAIT_EASE, u < 0 ? 0 : u);
}

/**
 * A gait's amounts scaled by a level in (0, 1]: every driver amount × level; structure (cascade, release, rejoin)
 * kept. Level 1 returns the gait ITSELF (not a copy) — undamped is exactly the record, bit for bit. Pure.
 */
export function dampGait(gait, level) {
  if (!gait || level === 1) return gait;
  const roles = {};
  for (const [role, r] of Object.entries(gait.roles || {}))
    roles[role] = { ...r, drivers: (r.drivers || []).map((d) => ({ ...d, amount: d.amount * level })) };
  return { ...gait, roles };
}

/**
 * TASTE's reading of one wearer's frame. `parts` = [{ radius, dx, dy }] — each LIVING part's disc and how far it now
 * stands from its dealt place. A part displaced by at least its own radius has left its footprint: its ink is a moving
 * piece, not a dealt shape. Returns { share, outranks }: the displaced share of the ink (disc area), and whether it is
 * MORE than CULTURE_OUTRANK_SHARE — moving pieces outranking dealt shapes (dealt > pieces > forces). An empty frame
 * reads clean. Pure.
 */
export function cultureTaste(parts) {
  let total = 0;
  let moved = 0;
  for (const p of parts) {
    const a = p.radius * p.radius;
    total += a;
    if (Math.hypot(p.dx, p.dy) >= p.radius) moved += a;
  }
  const share = total > 0 ? moved / total : 0;
  return { share, outranks: share > CULTURE_OUTRANK_SHARE };
}

// ── the coverage grid and LOIS's veto (M6) ──────────────────────────────────────────────────────────────────────────

const CELL_W = CULTURE_SWARM_WORLD_W / STAGE_COLS;
const CELL_H = CULTURE_SWARM_WORLD_H / STAGE_ROWS;
const SAMPLES = CULTURE_INK_SAMPLES * CULTURE_INK_SAMPLES;
const POP = (() => {
  const t = new Uint8Array(65536);
  for (let i = 1; i < 65536; i++) t[i] = t[i >> 1] + (i & 1);
  return t;
})();

/**
 * The dealt frame's INK on the dish's coverage grid: per cell (STAGE_COLS × STAGE_ROWS, row-major), the share 0..1 of a
 * 4 × 4 lattice of sample points covered by any living body's disc or any static box — a union, not a sum, so the
 * overlapping discs of a jointed body count once. `bodies` is the world's body table, `statics` its static table
 * (or null). A fresh array. Pure.
 */
export function cultureInkGrid(bodies, statics) {
  const bits = new Uint16Array(STAGE_COLS * STAGE_ROWS);
  const S = CULTURE_INK_SAMPLES;
  const sampleX = (cx, sx) => cx * CELL_W + ((sx + 0.5) * CELL_W) / S;
  const sampleY = (cy, sy) => cy * CELL_H + ((sy + 0.5) * CELL_H) / S;
  const range = (lo, hi, cells) => [Math.max(0, Math.floor(lo)), Math.min(cells - 1, Math.floor(hi))];
  const { count, alive, x, y, radius } = bodies;
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;
    const r = radius[i];
    const [c0, c1] = range((x[i] - r) / CELL_W, (x[i] + r) / CELL_W, STAGE_COLS);
    const [r0, r1] = range((y[i] - r) / CELL_H, (y[i] + r) / CELL_H, STAGE_ROWS);
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        let m = 0;
        for (let sy = 0; sy < S; sy++) {
          const dy = sampleY(cy, sy) - y[i];
          for (let sx = 0; sx < S; sx++) {
            const dx = sampleX(cx, sx) - x[i];
            if (dx * dx + dy * dy <= r * r) m |= 1 << (sy * S + sx);
          }
        }
        bits[cy * STAGE_COLS + cx] |= m;
      }
  }
  if (statics)
    for (let b = 0; b < statics.count; b++) {
      const [c0, c1] = range(statics.minX[b] / CELL_W, statics.maxX[b] / CELL_W, STAGE_COLS);
      const [r0, r1] = range(statics.minY[b] / CELL_H, statics.maxY[b] / CELL_H, STAGE_ROWS);
      for (let cy = r0; cy <= r1; cy++)
        for (let cx = c0; cx <= c1; cx++) {
          let m = 0;
          for (let sy = 0; sy < S; sy++) {
            const py = sampleY(cy, sy);
            if (py < statics.minY[b] || py > statics.maxY[b]) continue;
            for (let sx = 0; sx < S; sx++) {
              const px = sampleX(cx, sx);
              if (px >= statics.minX[b] && px <= statics.maxX[b]) m |= 1 << (sy * S + sx);
            }
          }
          bits[cy * STAGE_COLS + cx] |= m;
        }
    }
  const out = new Float32Array(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = POP[bits[i]] / SAMPLES;
  return out;
}

/** The ink on the cell under a dish point (0 beyond the grid: off the dish is negative space). */
export function cultureInkAt(grid, x, y) {
  const cx = Math.floor(x / CELL_W);
  const cy = Math.floor(y / CELL_H);
  if (!(cx >= 0 && cx < STAGE_COLS && cy >= 0 && cy < STAGE_ROWS)) return 0;
  return grid[cy * STAGE_COLS + cx];
}

/**
 * LOIS'S VETO on one released piece. `rest` is where the dealt piece stands, `off` its break-up offset. The offset's
 * far end may not land on protected negative space (a cell under CULTURE_INK_FLOOR of ink): it is pulled back along
 * its own line, in CULTURE_VETO_STEPS shares, to the farthest point that stands on ink; a piece that starts in
 * negative space does not release at all. Returns { x, y, vetoed } — the offset it may keep. Pure.
 */
export function loisBreakVeto(grid, rest, off) {
  if (off.x === 0 && off.y === 0) return { x: 0, y: 0, vetoed: false };
  const ink = (f) => cultureInkAt(grid, rest.x + off.x * f, rest.y + off.y * f) >= CULTURE_INK_FLOOR;
  if (ink(1)) return { x: off.x, y: off.y, vetoed: false };
  for (let k = CULTURE_VETO_STEPS - 1; k >= 1; k--) {
    const f = k / CULTURE_VETO_STEPS;
    if (ink(f)) return { x: off.x * f, y: off.y * f, vetoed: true };
  }
  return { x: 0, y: 0, vetoed: true };
}

// ── the gait state ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The target name of the world's i-th citizen: the wearer's id in the assignments and the recorded log. */
export const cultureGaitTargetOf = (index) => `citizen:${index}`;

/** The gait layer's state: born dormant — no beats, no phrase, nothing assigned, nothing worn, nothing broken. */
export function createCultureGait() {
  return {
    /** Beats accumulated while the world had wearers (the gait clock). */
    beats: 0,
    /** Phrases elapsed. */
    phrase: 0,
    /** The room the QUEEN hears (setCultureRoom): a recorded input. No reading = still. */
    room: { energy: null, silent: 0, bpm: GAIT_DEFAULT_BPM },
    /** The standing GAIT_ASSIGN map { target: { gaitId, by, locked } } (engine/gaitAssign.js). */
    assign: {},
    /** The recorded log: every applied GAIT_ASSIGN, with the world step — "every pick is recorded in the take". */
    log: [],
    /** The QUEEN's damp notch per wearer: { target: { n, from, t0 } }. */
    notch: {},
    /** The cross-fade fold (engine/gaitBlend.js): a swap eases over one beat. */
    blend: createGaitBlend(),
    /** The break-up fold (engine/gaitBreakup.js): who is out, who is rejoining. */
    breakup: createGaitBreakup(),
    /** DERIVED, not state: each wearer's current pose { dx, dy, sx, sy, alpha, bx, by, vetoed } per part, for the layout. */
    out: {},
  };
}

/** The room reading through the door: a loud refusal for anything that is not a room. */
export function normalizeCultureRoom(room) {
  if (!isObj(room)) throw new Error('cultureGait: a room is { energy, silent, bpm }');
  if (!CULTURE_ROOM_ENERGIES.includes(room.energy ?? null))
    throw new Error(`cultureGait: room energy "${String(room.energy)}" — null | low | mid | high`);
  if (!fin(room.bpm) || room.bpm < CULTURE_ROOM_BPM.min || room.bpm > CULTURE_ROOM_BPM.max)
    throw new Error(
      `cultureGait: room bpm "${String(room.bpm)}" outside [${CULTURE_ROOM_BPM.min}, ${CULTURE_ROOM_BPM.max}]`,
    );
  return { energy: room.energy ?? null, silent: room.silent ? 1 : 0, bpm: room.bpm };
}

/**
 * Apply one GAIT_ASSIGN to the gait state (the user's door and the QUEEN's own picks): refused loudly when it is not
 * one, names no wearer in the dish, or names a gait the Canon does not hold; a lock is refused for anyone but the user
 * (engine/gaitAssign.js applyGaitAssign: reason 'locked'). Applied events are RECORDED with the world step.
 * Returns { applied, reason }.
 */
export function assignCultureGait(g, raw, worldStep, citizenCount) {
  const e = sanitizeGaitAssign(raw);
  if (!e) throw new Error('cultureGait: not a GAIT_ASSIGN — { target, gaitId, by: queen | davis | user, locked }');
  const m = /^citizen:(\d+)$/.exec(e.target);
  if (!m || Number(m[1]) >= citizenCount) throw new Error(`cultureGait: no wearer "${e.target}" in this dish`);
  if (!canonGaitById(e.gaitId)) throw new Error(`cultureGait: gait "${e.gaitId}" is not a Canon gait`);
  const r = applyGaitAssign(g.assign, raw);
  if (!r.applied) return { applied: false, reason: r.reason };
  if (g.log.length >= CULTURE_GAIT_LOG_CAP)
    throw new Error(`cultureGait: the recorded log is full (${CULTURE_GAIT_LOG_CAP})`);
  g.assign = r.assignments;
  g.log.push(Object.freeze({ step: worldStep, target: e.target, gaitId: e.gaitId, by: e.by, locked: e.locked }));
  return { applied: true, reason: null };
}

const _tree = new WeakMap();
/** A citizen's join tree, cached on its (frozen) body. */
const treeOfCitizen = (c) => {
  let t = _tree.get(c.body);
  if (!t) _tree.set(c.body, (t = cultureTreeOf('rig', c.body)));
  return t;
};

const lockedOf = (g, target) => !!(g.assign[target] && g.assign[target].locked);

/** The phrase boundary: TASTE → the QUEEN's damp step, then the QUEEN's picks. */
function cultureGaitPhrase(g, ctx) {
  const { bodies, citizens, worldStep } = ctx;
  const living = [];
  citizens.list.forEach((c, idx) => {
    if (c.alive) living.push(idx);
  });
  // 1. TASTE reads the frame as it stands; the QUEEN steps an unlocked wearer's amounts one notch.
  for (const idx of living) {
    const target = cultureGaitTargetOf(idx);
    if (lockedOf(g, target)) continue;
    const c = citizens.list[idx];
    const o = g.out[target];
    const parts = [];
    if (o)
      for (let k = 0; k < c.n; k++)
        if (bodies.alive[c.first + k]) parts.push({ radius: bodies.radius[c.first + k], dx: o.dx[k], dy: o.dy[k] });
    const reading = cultureTaste(parts);
    const cur = g.notch[target] || { n: 0, from: 1, t0: g.beats };
    const n = cultureDampStep(cur.n, reading.outranks, false);
    if (n !== cur.n) g.notch[target] = { n, from: cultureDampLevel(cur, g.beats, false), t0: g.beats };
  }
  // 2. the QUEEN picks for every living wearer, by its Canon style; a lock is never re-picked.
  const picks = queenPicks({
    assignments: g.assign,
    targets: living.map(cultureGaitTargetOf),
    styleOf: (target) => CULTURE_GAIT_STYLES[citizens.list[Number(target.slice(8))].plan] || null,
    energy: g.room.energy,
    silent: !!g.room.silent,
  });
  for (const p of picks) assignCultureGait(g, p, worldStep, citizens.list.length);
}

/**
 * One gait-layer step on the swarm's cadence (the world calls it after the solver). DORMANT over an empty citizen
 * table: nothing accumulates, nothing is read. Otherwise: the beat clock advances; a phrase boundary runs TASTE → the
 * damp step and the QUEEN's picks; the cross-fade fold decides what each wearer wears; each wearer is moved by its
 * gait (damped by its notch) through the live evaluator, the break-up fold advances against the field's signal, and
 * LOIS vetoes released pieces from protected negative space (an unlocked wearer's only). The derived pose per wearer
 * lands in g.out for the layout to read.
 *   ctx = { bodies, citizens, statics, drift, seed, worldStep } — drift is the fluid's drift field
 *   ({ density, magnets, pull, aspectHW, W, H } as markDriftDelta reads it) or null when no magnet stands.
 */
export function stepCultureGait(g, ctx) {
  const { bodies, citizens, statics, drift, seed } = ctx;
  if (!citizens.list.length) return g;
  g.beats += (g.room.bpm / 60) * CULTURE_GAIT_STEP_S;
  const ph = Math.floor(g.beats / CULTURE_PHRASE_BEATS);
  if (ph > g.phrase) {
    g.phrase = ph;
    cultureGaitPhrase(g, ctx);
  }
  // The gait clock in the stage's units: driver seconds at the default tempo, so a beat is exactly a beat.
  const driverSec = (g.beats * 60) / GAIT_DEFAULT_BPM;
  const worn = g.blend.step(gaitInputStamp(g.assign, GAIT_DEFAULT_BPM), driverSec);
  const seen = new Set();
  let ink = null;
  citizens.list.forEach((c, idx) => {
    const target = cultureGaitTargetOf(idx);
    const w = c.alive && worn ? worn.get(target) : null;
    if (!w && !(c.alive && g.breakup.has(target))) {
      delete g.out[target];
      return;
    }
    seen.add(target);
    const locked = lockedOf(g, target);
    const level = cultureDampLevel(g.notch[target], g.beats, locked);
    const gait = w ? dampGait(w.gait, level) : null;
    const n = c.n;
    const marks = new Array(n);
    for (let k = 0; k < n; k++) marks[k] = { x: bodies.x[c.first + k], y: bodies.y[c.first + k] };
    const tree = treeOfCitizen(c);
    const base = cultureGaitPose(marks, tree, gait, {
      beatTime: g.beats,
      wearerSeed: c.seed,
      seed,
      slot: idx,
      canvasW: CULTURE_SWARM_WORLD_W,
      canvasH: CULTURE_SWARM_WORLD_H,
    });
    const posed = marks.map((m, k) => ({ x: m.x + base[k].dx, y: m.y + base[k].dy }));
    const head = marks[0];
    const res = g.breakup.pose(target, {
      marks: posed,
      rest: marks,
      depths: tree.nodes.map((nd) => nd.depth),
      tile: { x: head.x, y: head.y, scale: (c.body.length * level) / ATTACH_BOX },
      field: drift,
      gait,
      bpm: GAIT_DEFAULT_BPM,
      driverSec,
      seed,
    });
    const o = {
      dx: new Float64Array(n),
      dy: new Float64Array(n),
      sx: new Float64Array(n),
      sy: new Float64Array(n),
      alpha: new Float64Array(n),
      // the break-up component alone, after LOIS's veto (dx / dy are the gait's drift plus this)
      bx: new Float64Array(n),
      by: new Float64Array(n),
      vetoed: 0,
    };
    for (let k = 0; k < n; k++) {
      let bx = 0;
      let by = 0;
      let alpha = 1;
      if (res.active) {
        bx = res.marks[k].x - posed[k].x;
        by = res.marks[k].y - posed[k].y;
        if (res.marks[k].alphaMul !== undefined) alpha = res.marks[k].alphaMul;
        if (!locked && (bx !== 0 || by !== 0)) {
          ink = ink || cultureInkGrid(bodies, statics);
          const v = loisBreakVeto(ink, marks[k], { x: bx, y: by });
          if (v.vetoed) o.vetoed += 1;
          bx = v.x;
          by = v.y;
        }
      }
      o.bx[k] = bx;
      o.by[k] = by;
      o.dx[k] = base[k].dx + bx;
      o.dy[k] = base[k].dy + by;
      o.sx[k] = base[k].sx;
      o.sy[k] = base[k].sy;
      o.alpha[k] = alpha;
    }
    g.out[target] = o;
  });
  g.breakup.sweep('', seen);
  return g;
}

/**
 * One wearer's pose for a part as a Motion Core Pose (the gait's layer, to compose over the feel), or null when the
 * wearer has no gait pose standing — the layout then carries the feel layer alone, bit for bit as before.
 */
export function cultureGaitPartPose(g, index, k) {
  const o = g.out[cultureGaitTargetOf(index)];
  if (!o) return null;
  return Object.freeze({ dx: o.dx[k], dy: o.dy[k], dRot: 0, sx: o.sx[k], sy: o.sy[k], dAlpha: o.alpha[k] - 1 });
}

// ── the hash ────────────────────────────────────────────────────────────────────────────────────────────────────────

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the gait layer's standing state: the beat clock, the phrase count, the room, the standing
 * assignments (by target), the recorded log (step, target, gait, by, lock — in order), the damp notches, the
 * cross-fade fold and the break-up fold (their own JSON snapshots). The derived `out` is not state. FNV-1a, the
 * cultureCitizensHash discipline; the world hash folds it in whole.
 */
export function cultureGaitHash(g) {
  let h = 0x811c9dc5;
  const mix = (byte) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const mixU32 = (v) => {
    mix(v & 255);
    mix((v >>> 8) & 255);
    mix((v >>> 16) & 255);
    mix((v >>> 24) & 255);
  };
  const mixFloat = (v) => {
    _f64.setFloat64(0, v);
    for (let i = 0; i < 8; i++) mix(_f64.getUint8(i));
  };
  const mixStr = (s) => {
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i) & 255);
    mix(0);
  };
  mixFloat(g.beats);
  mixU32(g.phrase);
  mixU32(CULTURE_ROOM_ENERGIES.indexOf(g.room.energy));
  mix(g.room.silent);
  mixFloat(g.room.bpm);
  for (const t of Object.keys(g.assign).sort()) {
    mixStr(t);
    mixStr(g.assign[t].gaitId);
    mixStr(g.assign[t].by);
    mix(g.assign[t].locked ? 1 : 0);
  }
  mixU32(g.log.length);
  for (const e of g.log) {
    mixU32(e.step);
    mixStr(e.target);
    mixStr(e.gaitId);
    mixStr(e.by);
    mix(e.locked ? 1 : 0);
  }
  for (const t of Object.keys(g.notch).sort()) {
    mixStr(t);
    mixU32(g.notch[t].n);
    mixFloat(g.notch[t].from);
    mixFloat(g.notch[t].t0);
  }
  mixStr(JSON.stringify(g.blend.snapshot()));
  mixStr(JSON.stringify(g.breakup.snapshot()));
  return h >>> 0;
}
