// engine/constructPool.js — banked constructs as bodies (spec §14; Matt 2026-11-17: "banked constructs become pool
// tiles, own PR first").
//
// A project saves construct RECORDS only (the 2026-11-16 ruling): a tile is never saved and never takes an import slot.
// So wherever something needs a banked construct's drawing, it draws the tile from the record, here. The house set is
// already in the catalogue (ASSETS, #2307); this covers the constructs an artist built on the CONSTRUCT rung.
//
// Scope of this module: creature BODIES (findBodyAsset), and (#2337) the STAGE pool (poolWithConstructs): the tiles
// of the banked constructs ride the pool the resolver places from, beside the overlay and the stage-born tiles. The
// stage's pool is composed in gl/liveLoop.mjs (a one-writer file), which calls poolWithConstructs at its two pool reads.
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

let poolMemo = { pool: null, records: null, svgOf: null, out: null };

/**
 * #2337 — the pool the STAGE places from: `pool` (overlay + stage-born tiles) plus a tile for every banked construct
 * (`state.constructRecords`) whose pieces can all be drawn, in bank order. Nothing is saved: the tiles are drawn from
 * the records on read (the 2026-11-16 ruling: a project keeps construct RECORDS only), so a tile never takes an import
 * slot and never reaches serializeProject.
 *
 * - With nothing banked, or no record that draws, this returns `pool` itself (the same array): today's pool exactly,
 *   so a project with no constructs resolves as it always did.
 * - A tile whose id is already in `pool` is not added twice.
 * - Memoized on the identities of `pool`, `constructRecords` and `svgOf`, so the live loop's per-frame reads stay
 *   allocation-free while nothing changes (the same contract as kineticBirths.poolWithBirths).
 *
 * @param svgOf (assetId) => the catalogue svg of a primitive (the overlay in `pool` is consulted first).
 */
export function poolWithConstructs(pool, constructRecords, svgOf) {
  const base = Array.isArray(pool) ? pool : [];
  const records = Array.isArray(constructRecords) ? constructRecords : [];
  if (!records.length || typeof svgOf !== 'function') return base;
  if (poolMemo.pool === base && poolMemo.records === records && poolMemo.svgOf === svgOf) return poolMemo.out;
  const have = new Set();
  const overlaySvg = new Map();
  for (const a of base) {
    if (a && typeof a.id === 'string') {
      have.add(a.id);
      overlaySvg.set(a.id, a.svg);
    }
  }
  const pieceSvg = (id) => (overlaySvg.has(id) ? overlaySvg.get(id) : svgOf(id));
  const tiles = [];
  for (const rec of records) {
    const tile = constructTile(rec, pieceSvg);
    if (tile && !have.has(tile.id)) {
      have.add(tile.id);
      tiles.push(tile);
    }
  }
  const out = tiles.length ? [...base, ...tiles] : base;
  poolMemo = { pool: base, records, svgOf, out };
  return out;
}
