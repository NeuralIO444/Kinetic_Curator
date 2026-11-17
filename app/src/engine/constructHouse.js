// engine/constructHouse.js — #2108 (constructs, slice 5a): the HOUSE SET.
//
// Matt's ruling (2026-11-17): the constructs KIN and the Curator deal are a fixed house set — HOUSE_PER_STYLE
// per style, each dealt from a fixed seed, nothing saved. Dealing runs in pure code that cannot bank a record,
// so a construct has to exist before a deal can pick it; the house set always does, and a take that names one
// replays exactly because the set is a pure function of this file and the Canon data.
//
// A house construct's id is the assembler's own `cn-<hash>` of (style, vocabulary, turns, scale, seed), so the
// id MOVES whenever its recipe's inputs change: an older take naming a retired id finds no tile (a clean miss),
// never a different shape under the same name.
//
// Pure and deterministic. Data only in this slice: nothing reads the house set yet (5b puts it in the catalogue,
// excluded from every deal; the gate in PR 2 lifts that).

import { assembleConstruct, constructTile } from './constructAssembler.js';
import { constructRule, CONSTRUCT_STYLE_IDS } from './constructRules.js';

/** Constructs per style in the house set (Matt, 2026-11-17: 6 per style, 66 in all). */
export const HOUSE_PER_STYLE = 6;

/** FNV-1a of a string: a stable 32-bit key. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The fixed seed of house construct `i` of a style. */
export const houseSeed = (style, i) => hash32(`house|${style}|${i}`);

/**
 * The house set against a pool: every style's records, in Canon order, `HOUSE_PER_STYLE` each. A style whose
 * vocabulary the pool cannot supply contributes none (the set only ever shrinks toward what can be drawn).
 * @param findAsset (assetId) => the pool record, or nothing.
 * @param assetAttach the project's hand-edited ATTACH map, or null. The house set is meant to be project-free,
 *   so callers that want a stable set pass null (the default).
 */
export function houseConstructs(findAsset, assetAttach = null) {
  const out = [];
  for (const style of CONSTRUCT_STYLE_IDS) {
    const rule = constructRule(style, findAsset, assetAttach);
    if (!rule) continue;
    const seen = new Set();
    for (let i = 0; i < HOUSE_PER_STYLE; i++) {
      // A repeated recipe (the same pieces from another seed) would be a duplicate tile: step the seed past it.
      for (let t = 0; t < 8; t++) {
        const rec = assembleConstruct({ ...rule, seed: houseSeed(style, i + t * HOUSE_PER_STYLE) });
        if (rec && !seen.has(rec.id)) {
          seen.add(rec.id);
          out.push(rec);
          break;
        }
      }
    }
  }
  return out;
}

/** The house set's pool tiles: records whose every piece the pool can draw. Others are left out. */
export function houseConstructTiles(findAsset, assetAttach = null) {
  const tiles = [];
  for (const rec of houseConstructs(findAsset, assetAttach)) {
    const tile = constructTile(rec, (id) => findAsset(id)?.svg);
    if (tile) tiles.push(tile);
  }
  return tiles;
}
