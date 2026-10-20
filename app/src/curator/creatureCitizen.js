// creatureCitizen.js — #1694 slice 2: the creature citizen's resolver-side reads.
//
// The pool holds ONE citizen entry (`creature`, data/assets) for both live
// creature families — the field-formed moths and the dish creature (Matt's
// ruling, #1694 Q4: one entry, family as a tile option). Its state rides the
// resolver input in the same generic citizen maps the marks use:
//
//   enable  — input.enabledAssets['creature'] (the generic pool switch)
//   family  — input.assetOptions['creature'].family: 'both' | 'moth' | 'dish'
//   weight  — input.assetWeightOverrides['creature'] (spawn choice, spawn.js)
//   still   — input.assetStill['creature'] (pin-still, engine/creature.js)
//
// Enable is DEFAULT-TRUE: creatures predate the pool switch (the artist's
// creature count alone governed them), so a document/input that never
// mentions the citizen — every take recorded before this slice, the whole
// creatureGate fixture — reads ENABLED. Only an explicit `false` (the tile
// toggled off, or a solo of another asset) turns the citizen off. Family
// defaults to 'both': an absent option is exactly the pre-citizenship world.

export const CREATURE_ASSET_ID = 'creature';
export const CREATURE_FAMILIES = ['both', 'moth', 'dish'];

/** The citizen may be born at all (an explicit pool-off is the only no). */
export function creatureEnabled(input) {
  return input?.enabledAssets?.[CREATURE_ASSET_ID] !== false;
}

/** Which families the tile option allows: 'both' | 'moth' | 'dish'. */
export function creatureFamily(input) {
  const f = input?.assetOptions?.[CREATURE_ASSET_ID]?.family;
  return CREATURE_FAMILIES.includes(f) ? f : 'both';
}

/** The moth family may append (citizen on, family not dish-only). */
export function mothsAllowed(input) {
  return creatureEnabled(input) && creatureFamily(input) !== 'dish';
}

/** The dish creature may append (citizen on, family not moth-only). */
export function dishAllowed(input) {
  return creatureEnabled(input) && creatureFamily(input) !== 'moth';
}
