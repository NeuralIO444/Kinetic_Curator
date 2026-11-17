// engine/constructRules.js — #2108 (constructs, slice 3): a style's construction rule, resolved against the pool.
//
// The grammar is DATA: each Canon style names its construct vocabulary (`assets.primitives`, pool asset ids) and how
// a joined piece may turn (`assets.turns`) in data/canon/styles.js. This module resolves that data against a real
// pool into the rule the assembler takes — each primitive with its ATTACH points (the artist's own if they edited
// it in the wet lab, else the points worked out from its shape). It deals nothing and draws nothing.
//
// One style per construct (spec §6): the rule carries one style id and that style's vocabulary only, so nothing
// outside it can enter a construct.

import { canonStyleRecord, CANON_STYLE_IDS } from '../data/canon/styles.js';
import { attachPointsFor } from './autoAttach.js';

/** The turns a piece may take in a constructed style: quarter turns. */
export const QUARTER_TURNS = Object.freeze([0, 90, 180, 270]);
/** The turns a piece may take in an arranged style: every 15 degrees. */
export const FREE_TURNS = Object.freeze(Array.from({ length: 24 }, (_, i) => i * 15));

/** The style ids that name a construct vocabulary, in Canon order. */
export const CONSTRUCT_STYLE_IDS = Object.freeze(
  CANON_STYLE_IDS.filter((id) => canonStyleRecord(id).assets.primitives.length > 0),
);

/** A style's vocabulary as asset ids ([] for an unknown style). */
export function constructVocabularyIds(styleId) {
  const s = typeof styleId === 'string' ? canonStyleRecord(styleId) : null;
  return s ? [...s.assets.primitives] : [];
}

/**
 * The rule for one style, against a pool.
 * @param styleId      a Canon style id.
 * @param findAsset    (assetId) => the pool record, or nothing when the pool does not carry it.
 * @param assetAttach  the project's hand-edited ATTACH map ({ assetId: points }), or null.
 * @returns { style, vocabulary: [{ id, points }], rotations } — or null when the style is unknown or NONE of its
 *   primitives is in the pool. A primitive the pool lacks is left out of the rule (the vocabulary only ever
 *   shrinks toward what can be drawn); the caller's tile is refused if a banked record names a missing piece.
 */
export function constructRule(styleId, findAsset, assetAttach = null) {
  const s = typeof styleId === 'string' ? canonStyleRecord(styleId) : null;
  if (!s || typeof findAsset !== 'function') return null;
  const vocabulary = [];
  for (const id of s.assets.primitives) {
    const asset = findAsset(id);
    if (!asset || typeof asset.svg !== 'string' || !asset.svg) continue;
    vocabulary.push({ id, points: attachPointsFor(asset, assetAttach).map((p) => ({ x: p.x, y: p.y })) });
  }
  if (!vocabulary.length) return null;
  return { style: s.id, vocabulary, rotations: [...(s.assets.turns === 'free' ? FREE_TURNS : QUARTER_TURNS)] };
}
