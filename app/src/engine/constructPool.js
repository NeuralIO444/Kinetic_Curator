// engine/constructPool.js — banked constructs as bodies (spec §14; Matt 2026-11-17: "banked constructs become pool
// tiles, own PR first").
//
// A project saves construct RECORDS only (the 2026-11-16 ruling): a tile is never saved and never takes an import slot.
// So wherever something needs a banked construct's drawing, it draws the tile from the record, here. The house set is
// already in the catalogue (ASSETS, #2307); this covers the constructs an artist built on the CONSTRUCT rung.
//
// Scope of this module: creature BODIES. When a creature banks, its tile bakes the body's drawing in (creatureTile), so
// once the bank can find a construct body the creature stands on its own. Putting banked constructs on the STAGE is not
// here: the stage's pool is composed in gl/liveLoop.mjs, a one-writer file (CLAUDE.md), so that needs its owner.
//
// Pure: no store, no clock.
import { constructTile, constructTileId, isConstructTileId } from './constructAssembler.js';

/**
 * The pool tile of a banked construct, by its tile id (`user:cn-…`), drawn from its record. Null when the id is not a
 * construct tile id, no banked record has it, or a piece cannot be drawn.
 * @param svgOf (assetId) => a primitive's svg markup.
 */
export function bankedConstructTile(id, constructRecords, svgOf) {
  if (!isConstructTileId(id) || !Array.isArray(constructRecords) || typeof svgOf !== 'function') return null;
  const rec = constructRecords.find((r) => r && constructTileId(r.id) === id);
  return rec ? constructTile(rec, svgOf) : null;
}

/**
 * Find a creature's body: the overlay, then the catalogue, then the banked constructs. `catalogue` is ASSETS (passed
 * in so this stays pure and testable).
 */
export function findBodyAsset(id, { overlay, catalogue, constructRecords }) {
  const pool = Array.isArray(overlay) ? overlay : [];
  const cat = Array.isArray(catalogue) ? catalogue : [];
  const hit = pool.find((a) => a && a.id === id) || cat.find((a) => a && a.id === id);
  if (hit) return hit;
  const svgOf = (pid) => {
    const a = pool.find((x) => x && x.id === pid) || cat.find((x) => x && x.id === pid);
    return a ? a.svg : undefined;
  };
  return bankedConstructTile(id, constructRecords, svgOf);
}
