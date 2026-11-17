// ladderPools.mjs — WetLab ladder, CREATURE rung: what creatures are built from (spec §14; issue #2303).
//
// Bodies (§14.2): once the construct bank holds LADDER_BODY_FLOOR drawable constructs, KIN's bodies come only from them;
// below that the library is the pool, unchanged. Kept shapes are never bodies (§14.4).
// Parts (§14.3): Davis deals parts onto a creature's bones from the parts pile. In the WetLab that pile is the stage's
// assets plus every banked construct's tile plus every kept shape — whether or not they are on the stage.
//
// Checked for #2303 (spec §14 "Not checked"): a construct tile reads as a body. All 66 house construct tiles get AUTO
// head and limb points from their drawing (autoAttach.attachPointsFor), and a WEAK press over construct tiles alone
// deals creatures with construct bodies. The points come from the composed drawing, not the record's free joins.
//
// Pure: no store, no React, no clock.
import { constructTile } from '../engine/constructAssembler.js';

/** Banked constructs that make the ladder the only source of bodies (§14.2). */
export const LADDER_BODY_FLOOR = 3;

const list = (x) => (Array.isArray(x) ? x : []);

/**
 * The banked constructs as pool tiles ([{ id, svg, category, … }]), in bank order. A record whose pieces the library
 * no longer carries draws no tile and is left out.
 */
export function ladderOverlay({ constructRecords, svgOf }) {
  if (typeof svgOf !== 'function') return [];
  const out = [];
  const seen = new Set();
  for (const rec of list(constructRecords)) {
    const tile = constructTile(rec, svgOf);
    if (tile && !seen.has(tile.id)) {
      seen.add(tile.id);
      out.push(tile);
    }
  }
  return out;
}

/**
 * The bodies KIN deals from: the construct tiles once there are LADDER_BODY_FLOOR of them, else `library` itself (the
 * same array). Shapes never enter it.
 */
export function ladderBodyPool({ library, constructRecords, svgOf }) {
  const tiles = ladderOverlay({ constructRecords, svgOf });
  return tiles.length >= LADDER_BODY_FLOOR ? tiles : library;
}

/**
 * The parts pile in the WetLab: the stage's ids first, then every banked construct's tile id, then every kept shape's
 * asset id; no duplicates. `constructTileIds` are the ids ladderOverlay drew (so a construct that cannot draw is not in
 * the pile).
 */
export function ladderPartIds({ stageIds, constructTileIds, shelf }) {
  const out = [];
  const seen = new Set();
  const add = (id) => {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  list(stageIds).forEach(add);
  list(constructTileIds).forEach(add);
  for (const s of list(shelf)) add(s && s.asset);
  return out;
}
