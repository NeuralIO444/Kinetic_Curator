// engine/creatureTileId.js — #1850: what a wet-lab creature tile is, by id and by record. Tiny on purpose: the deal
// filter (state/rollPool.mjs) and the store's pool actions read it without pulling in the assembler's decks.

/** The pool id a record's tile takes: the overlay's `user:` namespace + the record id. */
export const creatureTileId = (recordId) => `user:${recordId}`;
/** True for a creature tile's pool id. */
export const isCreatureTileId = (id) => typeof id === 'string' && /^user:cr-[0-9a-f]{8}$/.test(id);
/** The record id behind a tile id, or null. */
export const recordIdOfTile = (id) => (isCreatureTileId(id) ? id.slice('user:'.length) : null);
/**
 * True for a wet-lab creature tile as a POOL RECORD — by what it is (category + source), not by its id, so the test
 * survives anything that could move an id. The one place this matters is dealing: a creature is never dealt.
 */
export const isCreatureTile = (asset) => !!asset && asset.category === 'creature' && asset.source === 'wetlab';
