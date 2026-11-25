// engine/creatureGait.mjs — #2475 (the live-stage line of Matt's M5 scope ruling, 2026-11-18 19:56 PT): creature and
// beast tiles on the live stage wear the QUEEN's gait picks, as the constructs already do.
//
//   "The QUEEN picks for every wearer: creatures, beasts and glyphs get Canon default gaits by their style, the QUEEN
//    picks per phrase, the user lock wins, and every pick is recorded in the take. Same rules as constructs (#2329)."
//   "Creature pose still composes UNDER the gait."
//
// THE SAME CHAIN AS A CONSTRUCT'S, end to end — nothing forked:
//   pick     curator/gaitLive.js startGaitPick → engine/gaitAssign.js queenPicks (a wearer's own Canon defaults, a lock
//            is never re-picked) → the store's assignGait (applyGaitAssign: the lock rule again) → the take's GAIT_ASSIGN
//            decision log (curator/gaitRecord.mjs). This module only names the new wearers (creatureGaitTargets) and
//            their Canon style (creatureGaitStyle).
//   stamp    the loop stamps every moving Canon assignment on the resolver input (`input.gaits`, gaitInputStamp — target
//            agnostic), so a take's input log carries the creatures' picks frame by frame, as it carries the constructs'.
//   ease     the resolver's cross-fade fold (engine/gaitBlend.js) steps every stamped target, the creatures included,
//            and rides the resolver snapshot — a swap eases over one beat, and a take replays every fade exactly.
//   pose     the creature's parts are dealt at CONTRACT time (gl/sceneContract.js → engine/creatureRig.js), downstream of
//            the resolver, so the contract reads the fold's step for the frame's effective input (gaitContractFields,
//            through the room's contract fields) and poses the parts by the SAME evaluator a construct's pieces use
//            (engine/gaitStage.js poseConstruct → engine/gait.js evaluateGait → the registered kineme drivers).
//
// THE JOIN TREE (gait-spec: a wearer moves by its depth — root, inner, leaf). A creature: its body is the ROOT, each bone
// hangs off its parent bone (a head or a limb's first bone off the body) — so a wandering root carries the whole animal
// and a leaf follows its joint. A beast: its beam is the root, each leg's twelve bars hang off the bars they pivot on
// (the linkage's own construction, beastBuilder.js BEAST_BARS), the crank and frame off the beam. The beast's foot trace
// is ground, not body: it never wears the gait. A mobile is neither a creature nor a beast (no ruling names it): it is
// not a wearer.
//
// The pose is composed OVER the creature's own (Lois's walk, the linkage's crank, the roam, the pull): each part's posed
// place is the input, the gait's similarity per node (scale about the part's centre, then move) composed parent-first.
//
// Hard gate: no worn map, a tile nobody picked, or a frozen frame → the very same instances (the contract and its hash
// unchanged). Pure apart from the fold readout gaitContractFields reads. No clock, no random.
import { poseConstruct } from './gaitStage.js';
import { gaitBeatTime } from './gait.js';
import { gaitBlendStepFor } from './gaitBlend.js';
import { canonGaits } from '../data/canon/gaits.js';
import { assetStyle } from '../data/assetStyle.js';
import { BEAST_BARS } from './beastBuilder.js';
import { BEAM_ID } from './beastRig.js';

/**
 * The Canon style a wearer is picked from where its own drawing names none — the CULTURE dish's taste calls, kept one
 * (pinned equal to engine/cultureGait.mjs CULTURE_GAIT_STYLES in the suite): a creature with no body asset to read
 * breathes and wanders (organic, the dish creature's), a beast ticks tight on the pulse (swiss, the Strandbeest's).
 */
export const LIVE_GAIT_FALLBACK_STYLES = Object.freeze({ creature: 'organic', beast: 'swiss' });

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r3 = (n) => Math.round(n * 1000) / 1000;

/** 'creature' | 'beast' for a wet-lab pool tile that wears a gait on the live stage, else null (a mobile included). */
export function creatureGaitKind(rec) {
  if (!isObj(rec) || rec.category !== 'creature' || rec.source !== 'wetlab' || !isObj(rec.rig)) return null;
  if (isObj(rec.rig.linkage)) return 'beast';
  if (rec.rig.figure === 'mobile') return null;
  return Array.isArray(rec.rig.bones) && rec.rig.bones.length ? 'creature' : null;
}

/**
 * A creature or beast tile's Canon style: a beast's is LIVE_GAIT_FALLBACK_STYLES.beast; a creature's is its body
 * asset's (data/assetStyle.js — the body's style already deals its material, #2339), or the fallback when the body
 * is not in the pool. Null for anything that is not a wearer.
 * @param rec       the tile's pool record
 * @param bodyOf    (assetId) => the body's pool record, or null
 */
export function creatureGaitStyle(rec, bodyOf = () => null) {
  const kind = creatureGaitKind(rec);
  if (kind === 'beast') return LIVE_GAIT_FALLBACK_STYLES.beast;
  if (kind !== 'creature') return null;
  let body = null;
  try {
    body = typeof rec.rig.body === 'string' && rec.rig.body ? bodyOf(rec.rig.body) : null;
  } catch {
    body = null;
  }
  const style = body ? assetStyle(body) : null;
  return style && canonGaits(style) ? style : LIVE_GAIT_FALLBACK_STYLES.creature;
}

/**
 * The creature and beast tiles the QUEEN may pick for: the stage pool's wearers that the pool lets place (an explicit
 * enabledAssets entry, or every tile when enabledAssets is null — the resolver's own rule for a non-construct asset),
 * sorted. Returns [] for no pool.
 */
export function creatureGaitTargets(pool, enabledAssets = null) {
  if (!Array.isArray(pool)) return [];
  const on = isObj(enabledAssets) ? enabledAssets : null;
  const out = new Set();
  for (const rec of pool) {
    if (!creatureGaitKind(rec) || typeof rec.id !== 'string') continue;
    if (on && !on[rec.id]) continue;
    out.add(rec.id);
  }
  return [...out].sort();
}

/**
 * The contract's gait field for a frame, from its effective resolver input: `{ gaitWorn: { worn, driverSec, canvasW,
 * canvasH } }` while a creature or beast tile in the input's pool wears (or eases out of) a gait, else {} — so a frame
 * with no creature pick builds exactly the contract it always did. `worn` is the resolver's fold step for THIS input
 * (gaitBlendStepFor(input.gaits)), filtered to the creature and beast tiles; read only while pieces may deal
 * (`input.constructPieces`, the resolver's own gate for stepping the fold).
 */
export function gaitContractFields(input) {
  if (!isObj(input) || !input.constructPieces) return {};
  const st = gaitBlendStepFor(input.gaits);
  if (!st || !(st.worn instanceof Map) || !st.worn.size) return {};
  const wearers = new Set();
  for (const rec of Array.isArray(input.customAssets) ? input.customAssets : [])
    if (creatureGaitKind(rec) && st.worn.has(rec.id)) wearers.add(rec.id);
  if (!wearers.size) return {};
  const worn = new Map();
  for (const id of [...wearers].sort()) worn.set(id, st.worn.get(id));
  return {
    gaitWorn: {
      worn,
      driverSec: fin(st.driverSec) ? st.driverSec : 0,
      canvasW: fin(input.canvasW) ? input.canvasW : 0,
      canvasH: fin(input.canvasH) ? input.canvasH : 0,
    },
  };
}

/** The contract's `gaitWorn` doc field through the door: the same shape, or null. */
export function sanitizeGaitWorn(raw) {
  if (!isObj(raw) || !(raw.worn instanceof Map) || !raw.worn.size) return null;
  return {
    worn: raw.worn,
    driverSec: fin(raw.driverSec) ? raw.driverSec : 0,
    canvasW: fin(raw.canvasW) && raw.canvasW > 0 ? raw.canvasW : 0,
    canvasH: fin(raw.canvasH) && raw.canvasH > 0 ? raw.canvasH : 0,
  };
}

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Each beast bar's parent bar name (null = the beam): the earlier bar that ends where it starts. */
export const BEAST_BAR_PARENT = (() => {
  const out = new Map();
  BEAST_BARS.forEach(([name, from], i) => {
    let parent = null;
    for (let j = 0; j < i && parent === null; j++) if (BEAST_BARS[j][2] === from) parent = BEAST_BARS[j][0];
    out.set(name, parent);
  });
  return out;
})();

/** A beast bone id's parent bone id: `${leg}:${bar}` → its parent bar on the same leg, or the beam. */
export function beastBoneParent(id) {
  if (id === BEAM_ID) return null;
  const at = typeof id === 'string' ? id.indexOf(':') : -1;
  if (at < 0) return BEAM_ID;
  const parent = BEAST_BAR_PARENT.get(id.slice(at + 1));
  return parent ? `${id.slice(0, at)}:${parent}` : BEAM_ID;
}

/**
 * Pose one tile's parts by the gait it wears this frame. `nodes` are [{ inst, id, parent }] — the tile's posed
 * instances with their join-tree ids (parent id, or null for a root) in any order. Returns the posed instances in the
 * SAME order (new objects for every node the gait moved), or null when the tile wears nothing here (the caller keeps its
 * own instances, untouched).
 * @param tile   the placed tile's instance (asset, key, seedOffset)
 * @param wear   sanitizeGaitWorn(doc.gaitWorn)
 * @param seed   the stage seed
 */
export function wearCreatureGait(nodes, tile, wear, seed = 0) {
  if (!wear || !Array.isArray(nodes) || !nodes.length || !tile) return null;
  const w = wear.worn.get(tile.asset);
  if (!w || !isObj(w.gait)) return null;
  // parent-first order: roots in their given order, then each node after its parent (a node whose parent is missing
  // is a root), so the parent ∘ local composition reads a finished parent
  const byId = new Map();
  nodes.forEach((n, i) => byId.set(n.id, i));
  const order = [];
  const placed = new Set();
  const visit = (i, guard) => {
    if (placed.has(i) || guard > nodes.length) return;
    const p = nodes[i].parent;
    const pi = p === null || p === undefined ? -1 : (byId.get(p) ?? -1);
    if (pi >= 0 && pi !== i) visit(pi, guard + 1);
    if (placed.has(i)) return;
    placed.add(i);
    order.push(i);
  };
  for (let i = 0; i < nodes.length; i++) visit(i, 0);
  const slotOf = new Map(order.map((i, k) => [i, k]));
  const pieces = order.map((i) => {
    const n = nodes[i];
    const pi = n.parent === null || n.parent === undefined ? -1 : (byId.get(n.parent) ?? -1);
    return { id: `n${slotOf.get(i)}`, parent: pi >= 0 && pi !== i ? `n${slotOf.get(pi)}` : null, depth: 0 };
  });
  for (let k = 0; k < pieces.length; k++) {
    const par = pieces[k].parent;
    pieces[k].depth = par === null ? 0 : pieces[Number(par.slice(1))].depth + 1;
  }
  const marks = order.map((i) => ({ assetId: nodes[i].inst.asset, x: nodes[i].inst.x, y: nodes[i].inst.y, scale: 1 }));
  const who = `${tile.asset}|${tile.key ?? ''}`;
  const bpm = fin(w.bpm) && w.bpm > 0 ? w.bpm : null;
  const posed = poseConstruct(marks, pieces, w.gait, {
    beatTime: gaitBeatTime({ bpm, driverSec: wear.driverSec }),
    bpm,
    wearerSeed: ((seed >>> 0) ^ hash32(who)) >>> 0,
    seed: seed | 0,
    slot: hash32(who) % 1024,
    canvasW: wear.canvasW,
    canvasH: wear.canvasH,
  });
  if (posed === marks) return null; // the gait moves nothing here (a still amount, the anchored beat 0)
  const out = nodes.map((n) => n.inst);
  order.forEach((i, k) => {
    const m = posed[k];
    const it = nodes[i].inst;
    const s = m.scale;
    if (m.x === it.x && m.y === it.y && s === 1) return;
    out[i] = {
      ...it,
      x: r3(m.x),
      y: r3(m.y),
      ...(s !== 1 ? { scaleX: r3(it.scaleX * s), scaleY: r3(it.scaleY * s) } : {}),
    };
  });
  return out;
}

/**
 * (id) => the Canon style of a creature or beast tile in `pool`, or null — a body is looked up in the pool, then in
 * `library` (the catalogue: a creature's body is usually a library shape).
 */
export function creatureGaitStyleOf(pool, library = []) {
  const byId = new Map();
  for (const list of [library, pool]) for (const a of Array.isArray(list) ? list : []) if (a && a.id) byId.set(a.id, a);
  return (id) => creatureGaitStyle(byId.get(id) || null, (bodyId) => byId.get(bodyId) || null);
}
