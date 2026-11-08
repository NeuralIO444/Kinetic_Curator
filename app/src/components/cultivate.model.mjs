// cultivate.model.mjs — Simulate / Cultivate's pure model (#1872, creatures, of #1848).
//
// CULTIVATE is the dry-run between assembling a record (#1849) and injecting it (#1850): an invoked step
// that shows what the record says, computed by the machinery that already exists — no second physics, no
// preview-only approximation, no new cost or feasibility notion. This model derives the three reads; it
// holds no truth of its own. Every write goes through engine/creatureAssembler.js's withCultivation and
// the one door — the derivation is advisory, exactly as the Strand Bank's catalogue is.
//
//   - the SKETCH is the stage's own play, read back small: for a creature record, the scene contract's
//     expansion (engine/creatureRig.js's expandCreatureInstances — Davis deals the parts, Lois's gait
//     poses the bones) at time t; for a linkage body, the #1865 solver's gait sweep (poseLinkage), the
//     formula itself as the preview. Both are pure functions of the subject and t, so the play is seeded
//     and reproducible: same record, same stage pile, same seed, same t → the same frame.
//   - the COST read is the cost registry's own accounting for the record's body (assets/cost.js's
//     getAssetCost against ingest's COST_WARNING_THRESHOLD) — the same numbers the Strand Bank's warnings
//     carry, so an over-budget creature is known before it reaches the governor. The registry prices
//     assets, not records: a linkage has no asset drawing to price (its bars wear parts the stage deals),
//     so a beast's cost read is honestly absent, never estimated.
//   - the INTEGRITY read is feasibility where a feasibility notion exists, plus the bank's gene
//     conflicts. For a linkage body the notion is the linkage gate itself (engine/jansenSolver.js's
//     evaluateGenome: assembles across the full crank cycle, or a stillbirth). For a record the notion is
//     the one the bank already applies: its tile can be built (creatureTile) — a body that cannot be
//     drawn is a stillbirth, bankCreature's 'nobody' read as a verdict. Gene conflicts are the Strand
//     Bank's warnings (#1871), re-derived from the record's own combination.
//
// A cultivation is recorded on the record (the door's `cultivated` note): that it was cultivated, the seed
// it was cultivated under, the outcome, and what the reads said. CULTIVATE never blocks injection of a
// valid record and never injects anything itself — the stage stays the real gate.
//
// KC-1 DS: the reads are discrete fact — a score against a named line, a verdict, named warnings — so they
// render TE; the sketch is continuous motion, so it renders Davis (it simply plays).

import { assemblyWarnings, keptFromWarnings } from './strandBank.model.mjs';
import { creatureTile } from '../engine/creatureAssembler.js';
import { getAssetCost } from '../assets/cost.js';
import { COST_WARNING_THRESHOLD } from '../assets/ingest.js';
import { expandCreatureInstances, davisFitOf } from '../engine/creatureRig.js';
import { poseLinkage } from '../engine/beastRig.js';
import { evaluateGenome } from '../engine/jansenSolver.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import { sanitizeOverlay } from '../assets/overlay.js';

/**
 * A record's skeleton as the ATTACH points it was assembled from (head → H, limbs → L, joints plain) —
 * the combination the bank's warning derivation reads, so a cultivation re-derives exactly the warnings
 * the assembly combination carries.
 */
export const pointsOfRecord = (record) => [
  ...(record && record.head ? [{ x: record.head.x, y: record.head.y, role: 'H' }] : []),
  ...((record && record.limbs) || []).map((p) => ({ x: p.x, y: p.y, role: 'L' })),
  ...((record && record.joints) || []).map((p) => ({ x: p.x, y: p.y })),
];

/**
 * The three reads of one creature record, against its body asset (the pool's record for record.body, or
 * null when the pool no longer holds it).
 * @returns {null | { drawable: boolean, outcome: 'viable'|'stillborn',
 *   cost: null | { score: number, threshold: number, over: boolean },
 *   warnings: Array, kept: Array }}
 *   warnings are the bank's inspectable form; kept is their record-bound form (keptFromWarnings).
 *   cost is null exactly when the body cannot be drawn: no tile, no price, a stillbirth.
 */
export function cultivateReads(record, bodyAsset) {
  if (!record || typeof record !== 'object') return null;
  const drawable = !!creatureTile(record, bodyAsset || null);
  // the bank's derivation over the record's own combination; with no drawable body there is no cost to
  // read, so the derivation runs without the asset and the skeleton speaks alone
  const warnings = assemblyWarnings({ asset: drawable ? bodyAsset : null, points: pointsOfRecord(record) });
  const cost = drawable ? { score: getAssetCost(bodyAsset), threshold: COST_WARNING_THRESHOLD, over: false } : null;
  if (cost) cost.over = cost.score > cost.threshold;
  return { drawable, outcome: drawable ? 'viable' : 'stillborn', cost, warnings, kept: keptFromWarnings(warnings) };
}

/**
 * The record-bound note of one cultivation: the seed it was performed under (the document's seed — the
 * take's terms; provenance in this codebase is seeds, never clocks) and the reads, in the door's shape.
 */
export function cultivationNote(record, bodyAsset, seed = 0) {
  const reads = cultivateReads(record, bodyAsset);
  if (!reads) return null;
  return {
    seed: Number.isFinite(seed) ? seed >>> 0 : 0,
    outcome: reads.outcome,
    cost: reads.cost ? { score: reads.cost.score, threshold: reads.cost.threshold } : null,
    warnings: reads.kept,
  };
}

/** The bank's words for one warning id — the note carries ids; the words are the catalogue's own. */
const WARNING_TEXT = {
  'skeleton:no-head': {
    what: 'no head — the role set marks no H point',
    why: 'the creature is born without a head: no head bone, and no part rides where a head would be',
  },
  'skeleton:no-limbs': {
    what: 'no limbs — the role set marks no L point',
    why: 'the creature is born without limbs: no limb chains, so the gait has nothing to move',
  },
};

/**
 * A standing note read back as inspectable reads (what the panel shows for a record already cultivated):
 * the note's own numbers, with the bank's words for its warning ids.
 */
export function noteReads(note, record) {
  if (!note || typeof note !== 'object') return null;
  const bodyId = record && typeof record.body === 'string' ? record.body : '';
  return {
    seed: note.seed,
    outcome: note.outcome,
    cost: note.cost
      ? { score: note.cost.score, threshold: note.cost.threshold, over: note.cost.score > note.cost.threshold }
      : null,
    warnings: (note.warnings || []).map((e) => ({
      id: e.id,
      kind: e.kind,
      cost: e.cost || null,
      ...(e.kind === 'cost'
        ? {
            what: `${bodyId} is an expensive body`,
            why: 'its drawing scores over the cost warning line — it may cost frames',
          }
        : WARNING_TEXT[e.id] || { what: e.id, why: '' }),
    })),
  };
}

/**
 * The integrity read of a linkage body: the gate's own verdict over the measure set, exactly as the stage
 * reads it (the measures sanitized to their legal ranges first — sanitizeLinkage's path), plus the
 * solver's gait metrics when the animal assembles. No cost read: the registry prices asset drawings, and
 * a beast's drawing is dealt by the stage, so there is no registry number to report.
 * @returns {null | { feasible: boolean, stillborn: boolean,
 *   metrics: null | { flatness: number, ripple: number, step: number, clearance: number, duty: number } }}
 */
export function linkageReads(measures) {
  const m = sanitizeMeasures(measures);
  if (!m) return null;
  const ev = evaluateGenome(m, m.scale);
  return {
    feasible: !!ev.feasible,
    stillborn: !ev.feasible,
    metrics: ev.feasible
      ? { flatness: ev.flatness, ripple: ev.ripple, step: ev.step, clearance: ev.clearance, duty: ev.duty }
      : null,
  };
}

/**
 * The sketch of a creature record at time t: the scene contract's own expansion of the creature's tile
 * over the stage's pile, filtered to the creature's instances (its body and its dealt parts) — the very
 * function the stage renders through, so the miniature cannot disagree with the stage. Deterministic:
 * same record, pile, seed and t → the same instances. A body that cannot be drawn sketches nothing.
 * @returns {Array} contract instances (the tile's frame: centred on 0,0, the 100-unit box)
 */
export function sketchInstancesAt({ record, bodyAsset, stageIds = [], overlay = [], seed = 0 } = {}, t = 0) {
  const [tile] = sanitizeOverlay([creatureTile(record, bodyAsset || null)]);
  if (!tile) return [];
  const inst = (asset, key) => ({
    asset,
    key,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    seedOffset: 0,
  });
  const instances = [inst(tile.id, 'cultivate'), ...(stageIds || []).map((id, i) => inst(id, `s${i}`))];
  const overlayById = new Map([...(overlay || []), tile].map((a) => [a.id, a]));
  return expandCreatureInstances(instances, overlayById, {
    seed,
    t,
    fitOf: davisFitOf(overlayById),
  }).filter((i) => i.key === 'cultivate' || i.key.startsWith('cultivate#'));
}

/**
 * The sketch of a linkage body at time t: the solver's gait sweep posed in the tile frame (poseLinkage) —
 * the formula is the preview. Null for a stillbirth (the beast that was never alive poses at no angle).
 */
export function linkageSketchAt(measures, t = 0) {
  const m = sanitizeMeasures(measures);
  if (!m) return null;
  return poseLinkage({ measures: m, phase: 0 }, t);
}
