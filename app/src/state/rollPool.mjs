// state/rollPool.mjs — #1767 (KINETIC variety S1): the asset pool a KINETIC roll deals, from the WHOLE library.
//
// Before: the chaos roll dealt exactly one SHAPE_SETS entry — 19 sets covering 49 of 295 assets, so five of every
// six assets could never appear from the button. Now a roll deals a MIXED-FAMILY pool: 2–3 source families picked
// uniformly (so a 20-asset pack like Haeckel turns up as often as the 65-asset organic/geo pack), then 4–6 assets
// spread across them — the same size as the old sets, so density and count behave as before.
//
// dealPoolFor() is the coherent variant the look pass (S6) uses: the pool is drawn from the assets a look pairs
// with (its categories / styles, data/assetStyle.js), falling back to the mixed deal when nothing matches.
//
// Pure: the caller passes `rng` (() => [0,1)). The store passes the same honest die its rolls already use; the
// selfchecks pass a seeded stream. The creature citizen is never dealt — it rides its own pool toggle.
import { assetRecords, assetsWhere } from '../data/assetStyle.js';

/** Pool size range — matches the old 4-asset sets, with a little more room for a mixed deal. */
export const POOL_MIN = 4;
export const POOL_MAX = 6;
/** How many families a mixed deal spans. */
export const POOL_FAMILIES_MIN = 2;
export const POOL_FAMILIES_MAX = 3;
/** Never dealt by a roll. */
export const NEVER_DEALT = Object.freeze(['creature']);

const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));

function sampleWithout(rng, arr, k) {
  const a = arr.slice();
  const out = [];
  while (out.length < k && a.length) out.push(a.splice(pickIndex(rng, a.length), 1)[0]);
  return out;
}

/** The dealable records: the library plus the artist's imports, minus anything never dealt. */
export function dealableRecords(assets, customAssets = []) {
  return assetRecords([...(assets || []), ...(customAssets || [])]).filter((r) => !NEVER_DEALT.includes(r.id));
}

/**
 * A mixed-family pool: { ids, families }. 2–3 families picked uniformly, then POOL_MIN..POOL_MAX assets spread
 * round-robin across them (each family gives at least one). Never empty while any dealable asset exists.
 */
export function dealMixedPool(records, rng) {
  const byFamily = new Map();
  for (const r of records) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(r.id);
  }
  const families = [...byFamily.keys()];
  if (!families.length) return { ids: [], families: [] };
  const nFam = Math.min(families.length, POOL_FAMILIES_MIN + pickIndex(rng, POOL_FAMILIES_MAX - POOL_FAMILIES_MIN + 1));
  const chosen = sampleWithout(rng, families, nFam);
  const size = POOL_MIN + pickIndex(rng, POOL_MAX - POOL_MIN + 1);
  const left = new Map(chosen.map((f) => [f, byFamily.get(f).slice()]));
  const ids = [];
  for (let i = 0; ids.length < size && [...left.values()].some((l) => l.length); i++) {
    const list = left.get(chosen[i % chosen.length]);
    if (list.length) ids.push(list.splice(pickIndex(rng, list.length), 1)[0]);
  }
  return { ids, families: chosen };
}

/**
 * A coherent pool for a look/voice that pairs with { categories, styles }: POOL_MIN..POOL_MAX assets drawn from the
 * matching set (styles narrow when they leave enough to deal; categories alone otherwise). Fewer than POOL_MIN
 * matches → the mixed deal, so a pairing never strands the stage.
 */
export function dealPoolFor(records, rng, { categories, styles } = {}) {
  let ids = [];
  if ((categories && categories.length) || (styles && styles.length)) {
    const both = assetsWhere(records, {
      categories: categories && categories.length ? categories : undefined,
      styles: styles && styles.length ? styles : undefined,
    });
    ids =
      both.length >= POOL_MIN
        ? both
        : assetsWhere(records, { categories: categories && categories.length ? categories : undefined });
  }
  if (ids.length < POOL_MIN) return { ...dealMixedPool(records, rng), coherent: false };
  const size = POOL_MIN + pickIndex(rng, POOL_MAX - POOL_MIN + 1);
  const picked = sampleWithout(rng, ids, Math.min(size, ids.length));
  const fam = new Set(records.filter((r) => picked.includes(r.id)).map((r) => r.family));
  return { ids: picked, families: [...fam], coherent: true };
}

/** An enabledAssets map for a pool's ids. */
export function poolToEnabled(ids) {
  const out = {};
  for (const id of ids) out[id] = true;
  return out;
}
