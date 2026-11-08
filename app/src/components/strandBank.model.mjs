// strandBank.model.mjs — the Strand Bank's pure model (#1871, creatures, of #1848).
//
// The bank is the creature assembler's posture, rebuilt around strands: the ingredients of assembly as
// named, discrete things with stable ids — an asset, an ATTACH role set, a named gene value. Discrete
// things stay discrete, never averaged: the anti-mush rule expressed as an interaction. This model derives
// the catalogue (what can be picked) and the warnings (what a picked combination carries); it holds no
// truth of its own. Every write goes through engine/creatureAssembler.js's assembleCreature and the one
// door — the catalogue is advisory, exactly as the Timeline's options are.
//
// Strand ids speak the genome's own source grammar where one exists: a body strand is `asset:<id>` (the
// FORM genes' source for their shape), a named gene value is `look:<id>` / `voice:<id>` (the source an
// assembled gene carries when the performer named its value). Role sets take `points:<auto|own>:<assetId>`:
// the two named forms a shape's ATTACH points already have — the set worked out from its shape (AUTO,
// engine/autoAttach.js) and the artist's own hand-edited set (state: assetAttach), the set the lab's editor
// has always shown.
//
// Warnings: the bank surfaces conflicts that exist in the code; it invents none.
//   - cost — the registry prices ASSETS, not records or genes: an asset's rasterization cost score
//     (assets/ingest.js's assetCostScore, read through assets/cost.js) over COST_WARNING_THRESHOLD is the
//     codebase's one overrun, and ingest already treats it as a non-blocking heads-up. The bank applies
//     that same overrun to the body pick. Nothing prices a creature record itself, so no other cost
//     warning exists to surface.
//   - skeleton — the role set against the body plan, as engine/creatureRig.js's buildRig computes it: no
//     H point → no head bone; no L points → no limb chains; neither → no rig at all, and the creature
//     reaches the stage as a bare body. The record is legal either way (the door allows a headless
//     creature) — today that phenotype arrives silently; the bank says it out loud, before the press.
// Look and Voice picks never warn: the decks are independent by law, and no code relates a named Look or
// Voice to a body or a skeleton. DRIVE and MATERIAL carry no strands (strandlessFamilies, below).
//
// KC-1 DS: strands and warnings are discrete fact — ids, counts, a score against a named line — so the
// bank renders TE: plain text, named choices, no sliders and no shimmer.

import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { lookName, voiceName } from '../engine/creatureAssembler.js';
import { sanitizeAttachPoints } from '../engine/assetAttach.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { getAssetCost } from '../assets/cost.js';
import { COST_WARNING_THRESHOLD } from '../assets/ingest.js';

/** The counts a role set gives a creature: heads (at most one — the attach law), limbs, plain joints. */
const ptCounts = (points) => ({
  heads: points.filter((p) => p.role === 'H').length,
  limbs: points.filter((p) => p.role === 'L').length,
  joints: points.filter((p) => !p.role).length,
});

/** Every asset on the shelf as a body strand: `asset:<id>` — the FORM genes' own source grammar. */
export function assetStrands(assets = []) {
  const out = [];
  for (const a of assets || []) {
    if (!a || typeof a.id !== 'string' || !a.id) continue;
    out.push({ kind: 'asset', id: `asset:${a.id}`, assetId: a.id, label: a.id });
  }
  return out;
}

/**
 * One shape's role sets: the AUTO set (worked out from its shape) always; the artist's own set when one
 * exists in the attach state. A set's points are the attach door's clean form — at most four, at most
 * one H — so a strand never promises a skeleton the assembler would not derive from it.
 * @returns {{ auto: object, own: object|null }}
 *   strand: { kind:'points', id, assetId, source:'auto'|'own', label, points, counts:{heads,limbs,joints} }
 */
export function roleSetStrands(asset, ownPoints) {
  if (!asset || typeof asset.id !== 'string') return { auto: null, own: null };
  const autoPts = sanitizeAttachPoints(typeof asset.svg === 'string' ? autoAttachPoints(asset.svg) : []);
  const auto = {
    kind: 'points',
    id: `points:auto:${asset.id}`,
    assetId: asset.id,
    source: 'auto',
    label: 'auto — worked out from the shape',
    points: autoPts,
    counts: ptCounts(autoPts),
  };
  let own = null;
  if (Array.isArray(ownPoints)) {
    const ownPts = sanitizeAttachPoints(ownPoints);
    own = {
      kind: 'points',
      id: `points:own:${asset.id}`,
      assetId: asset.id,
      source: 'own',
      label: 'yours — edited by hand',
      points: ownPts,
      counts: ptCounts(ownPts),
    };
  }
  return { auto, own };
}

/**
 * The named gene values of one family, as strands: every Look in its deck, every Voice in its deck —
 * `look:<id>` / `voice:<id>`, the source grammar of an assembled gene whose value was named. Families
 * with no deck of named values (DRIVE, MATERIAL, FORM — the body is the asset strand, the skeleton the
 * role set) return an empty list: a strand names a value the assembler can lawfully be handed.
 */
export function geneStrands(family) {
  if (family === 'LOOK')
    return COMPOSITION_PRESETS.map((p) => ({
      kind: 'gene',
      family: 'LOOK',
      geneId: 'look',
      id: `look:${p.id}`,
      value: p.id,
      label: lookName(p.id) ?? p.id,
    }));
  if (family === 'VOICE')
    return VOICE_DECK.map((v) => ({
      kind: 'gene',
      family: 'VOICE',
      geneId: 'voice',
      id: `voice:${v.id}`,
      value: v.id,
      label: voiceName(v.id) ?? v.id,
    }));
  return [];
}

/**
 * The families that carry no strands, and why — the judgement stated, not implied by an absence.
 * DRIVE: a drive is a continuous gain in a legal range, not a named value; drives are born at the wild
 * norm, blend in breeding and move by hand mutation. A drive strand would pose a quantity as a discrete
 * choice — the mush the bank exists to remove — so drives stay dealt. MATERIAL: a stub, no legal values
 * exist to name yet (the same reason the Timeline's mutate refuses it).
 */
export function strandlessFamilies() {
  return [
    {
      family: 'DRIVE',
      why: 'a drive is a continuous gain, not a named value — drives are born at the wild norm and live by breeding blends and hand mutation, so they stay dealt',
    },
    { family: 'MATERIAL', why: 'material is a stub — there are no legal values to name yet' },
  ];
}

/**
 * The whole shelf: asset strands for the pool as given, each asset's role sets, and the two gene decks.
 * @param {{ assets?: Array, assetAttach?: object }} env the pool assets and the artist's attach state
 * @returns {{ assets: Array, roleSets: Array, looks: Array, voices: Array }}
 */
export function strandCatalogue({ assets = [], assetAttach = {} } = {}) {
  const roleSets = [];
  for (const a of assets || []) {
    if (!a || typeof a.id !== 'string' || !a.id) continue;
    const { auto, own } = roleSetStrands(a, assetAttach ? assetAttach[a.id] : undefined);
    if (auto) roleSets.push(auto);
    if (own) roleSets.push(own);
  }
  return {
    assets: assetStrands(assets),
    roleSets,
    looks: geneStrands('LOOK'),
    voices: geneStrands('VOICE'),
  };
}

/**
 * The warnings one combination carries — inspectable data: what conflicts, why, and what it costs (the
 * registry's numbers where the registry defines a cost, else null). Derived from the picked body asset
 * and the picked role set's points only: gene picks cannot warn (the decks are independent by law).
 * Warning order is the catalogue's: cost first, then the skeleton.
 * @param {{ asset?: object|null, points?: Array }} picks
 * @returns {Array<{ id: string, kind: 'cost'|'skeleton', what: string, why: string,
 *                   cost: null | { score: number, threshold: number } }>}
 */
export function assemblyWarnings({ asset = null, points = [] } = {}) {
  const warnings = [];
  if (asset && typeof asset.id === 'string') {
    const score = getAssetCost(asset);
    if (score > COST_WARNING_THRESHOLD)
      warnings.push({
        id: `cost:${asset.id}`,
        kind: 'cost',
        what: `${asset.id} is an expensive body`,
        why: 'its drawing scores over the cost warning line — it may cost frames',
        cost: { score, threshold: COST_WARNING_THRESHOLD },
      });
  }
  const pts = sanitizeAttachPoints(points);
  if (!pts.some((p) => p.role === 'H'))
    warnings.push({
      id: 'skeleton:no-head',
      kind: 'skeleton',
      what: 'no head — the role set marks no H point',
      why: 'the creature is born without a head: no head bone, and no part rides where a head would be',
      cost: null,
    });
  if (!pts.some((p) => p.role === 'L'))
    warnings.push({
      id: 'skeleton:no-limbs',
      kind: 'skeleton',
      what: 'no limbs — the role set marks no L point',
      why: 'the creature is born without limbs: no limb chains, so the gait has nothing to move',
      cost: null,
    });
  return warnings;
}

/**
 * The record-bound form of the warnings: data only — the id, the kind, and the registry's numbers where
 * there are any. The words are the surface's rendering; the record carries what later surfaces need to
 * re-derive them (the assembler's door holds each entry against the record's own facts).
 */
export const keptFromWarnings = (warnings) =>
  (warnings || []).map((w) => ({
    id: w.id,
    kind: w.kind,
    cost: w.cost ? { score: w.cost.score, threshold: w.cost.threshold } : null,
  }));
