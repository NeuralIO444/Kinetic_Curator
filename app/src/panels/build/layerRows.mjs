// layerRows.mjs — how the BUILD layer list is ordered on screen (#1037). Pure.
//
// The layer array is stored bottom→top and folded in that order, so the LAST
// item is the frontmost. Every layer-stack convention (After Effects,
// Photoshop) lists the frontmost layer on TOP, so each section lists its rows
// from the end of the array to the start, and the sections themselves read
// MATH, FX, CONTENT top to bottom: what you see on top is applied last.
//
// "Up" on a row therefore means "later in the chain, more foreground": ▲ moves
// a track toward a HIGHER array index.

/** Section order on screen, top to bottom. */
export const SECTION_ORDER = Object.freeze(['math', 'fx', 'content']);

/** Rows of one section as drawn: frontmost first. `group` is in array (bottom→top) order. */
export const rowsTopFirst = (group) => [...group].reverse();

/**
 * The row ▲ or ▼ would trade places with, or null at the end of the section.
 * @param {Array<{id:string}>} group  one section's layers in array order
 * @param {string} id
 * @param {'up'|'down'} dir
 */
export function moveNeighbor(group, id, dir) {
  const i = group.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const j = dir === 'up' ? i + 1 : i - 1;
  return j >= 0 && j < group.length ? group[j] : null;
}

/** Can this row move up / down? (the disabled state of ▲ and ▼) */
export const canMoveUp = (group, id) => moveNeighbor(group, id, 'up') !== null;
export const canMoveDown = (group, id) => moveNeighbor(group, id, 'down') !== null;
