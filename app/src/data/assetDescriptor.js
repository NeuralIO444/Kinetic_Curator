// data/assetDescriptor.js — #1942: the descriptor record. assetRecord's fields, unchanged, plus `descriptor`:
//   { version: 1, traits, roles, tags: { suggested, confirmed, effective } }
// Pure; traits come from the baked table (library) or the overlay record (imports), the artist's tags from the
// project document (`assetTags`, library) or the overlay record (`tags` overrides, imports).
import { assetRecord } from './assetStyle.js';
import { roleFits } from '../assets/assetRoles.js';
import { sanitizeTraits } from '../assets/assetTraits.js';
import { suggestTags, layerTags } from './assetFacets.js';
import { ASSET_TRAITS_ROWS } from './assets/traits.generated.js';
import { TRAIT_NAMES } from '../assets/assetTraits.js';

export const DESCRIPTOR_VERSION = 1;

/** asset + optional traits + optional artist overrides → the full record. */
export function assetDescriptor(asset, traits = null, overrides = null) {
  const t = sanitizeTraits(traits);
  return {
    ...assetRecord(asset),
    descriptor: {
      version: DESCRIPTOR_VERSION,
      traits: t,
      roles: roleFits(t),
      tags: layerTags(suggestTags(asset, t), overrides),
    },
  };
}

/** Library traits, from the baked table: id → { elong, fill, stroke, sym, busy, mass }. */
export function libraryTraits(id) {
  const row = ASSET_TRAITS_ROWS[id];
  return row ? Object.fromEntries(TRAIT_NAMES.map((k, i) => [k, row[i]])) : null;
}
