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
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { ASSETS_LATIN } from '../data/assets/assets-latin.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { ASSETS_ORNAMENTS } from '../data/assets/assets-ornaments.js';
import { ASSETS_PLATE } from '../data/assets/assets-plate.js';
import { isCreatureTile } from '../engine/creatureTileId.js'; // #1850
import { assetDescriptor, libraryTraits } from '../data/assetDescriptor.js'; // #1944
import { resolveKit, kitsById } from '../data/kits.js'; // #1944
import { mkRng } from '../engine/prng.js'; // #1944

/** Pool size range — matches the old 4-asset sets, with a little more room for a mixed deal. */
export const POOL_MIN = 4;
export const POOL_MAX = 6;
/** How many families a mixed deal spans. */
export const POOL_FAMILIES_MIN = 2;
export const POOL_FAMILIES_MAX = 3;
/** Never dealt by a roll. #1982: the poem-only kana stamps ride with the citizen.
 * #1998: the curated kanji stamps ride with them.
 * #2002: the slice-3 packs (lowercase + punctuation, serif, ornaments) ride too.
 * #2005: the plate stamps (Fraunces) ride too. */
export const NEVER_DEALT = Object.freeze([
  'creature',
  ...ASSETS_KANA.map((a) => a.id),
  ...ASSETS_KANJI.map((a) => a.id),
  ...ASSETS_LATIN.map((a) => a.id),
  ...ASSETS_SERIF.map((a) => a.id),
  ...ASSETS_ORNAMENTS.map((a) => a.id),
  ...ASSETS_PLATE.map((a) => a.id),
]);

const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));

function sampleWithout(rng, arr, k) {
  const a = arr.slice();
  const out = [];
  while (out.length < k && a.length) out.push(a.splice(pickIndex(rng, a.length), 1)[0]);
  return out;
}

/** The dealable records: the library plus the artist's imports, minus anything never dealt. */
export function dealableRecords(assets, customAssets = []) {
  // #1850 — a wet-lab creature tile is a pool citizen like the creature citizen: placed when the artist turns it on,
  // never dealt by a pool. Judged by what the record IS (category + source), never by its id.
  const imports = (customAssets || []).filter((a) => !isCreatureTile(a));
  return assetRecords([...(assets || []), ...imports]).filter((r) => !NEVER_DEALT.includes(r.id));
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
export function dealPoolFor(records, rng, { categories, styles, kits, kitContext } = {}) {
  // #1944 — kits first: a Look (or the artist's standing triad) that names kits deals from them, as a triad, and only
  // when they deal nothing does today's behaviour run — with the reason named, never a silent mixed deal. No kits → this
  // block is skipped without touching `rng`, so every roll without kits is byte-identical to before.
  let kitNotes = [];
  if (Array.isArray(kits) && kits.length && typeof kitContext === 'function') {
    const ctx = kitContext();
    const resolved = kitsById(kits, ctx.artistKits);
    const kitDeal = dealKitTriad(resolved, Math.floor(rng() * 0x100000000), { records: ctx.descriptors });
    if (kitDeal.ids.length) {
      const fam = new Set(records.filter((r) => kitDeal.ids.includes(r.id)).map((r) => r.family));
      return { ids: kitDeal.ids, families: [...fam], coherent: true, kitDeal, notes: kitDeal.notes };
    }
    kitNotes = kitDeal.notes.length ? kitDeal.notes : [{ kit: null, note: 'no-kits' }];
  }
  const rest = dealPoolForLegacy(records, rng, { categories, styles });
  return kitNotes.length ? { ...rest, notes: kitNotes } : rest;
}

function dealPoolForLegacy(records, rng, { categories, styles } = {}) {
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

// ─── #1944 — kits: the three-kit deal ───────────────────────────────────────────────────────────────────────────────

/** No kit in a triad is dealt under this share of the pool (the "no kit under 20%" rule). */
export const KIT_MIN_SHARE = 0.2;

const hashStr = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Largest-remainder split of `n` seats by `shares`, every share given at least one seat while n allows. */
function allocate(n, shares) {
  const counts = shares.map(() => (n >= shares.length ? 1 : 0));
  let left = n - counts.reduce((a, b) => a + b, 0);
  const rem = shares.map((s, i) => ({ i, r: s * n - counts[i] }));
  while (left > 0) {
    rem.sort((a, b) => b.r - a.r || a.i - b.i);
    counts[rem[0].i]++;
    rem[0].r -= 1;
    left--;
  }
  return counts;
}

/** Weighted draw of up to k ids without replacement, seeded. */
function drawWeighted(rng, ids, weightOf, k) {
  const pool = ids.map((id) => ({ id, w: Math.max(1e-6, weightOf(id)) }));
  const out = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let x = rng() * total;
    let at = 0;
    for (; at < pool.length - 1; at++) {
      x -= pool[at].w;
      if (x < 0) break;
    }
    out.push(pool.splice(at, 1)[0].id);
  }
  return out;
}

/**
 * The three-kit deal. `kits` are kit records (data/kits.js), one to three; `seed` an integer; `records` the descriptor
 * records the kits resolve over. Returns { ids, kits: [{ id, count, share }], size, notes }.
 *   - Each kit resolves to its own sub-pool; assets are never merged across kits, and every dealt asset belongs to at
 *     least one kit it was dealt for (no fourth source).
 *   - A seeded share per kit, none under KIT_MIN_SHARE, splits a 4..6 asset deal (largest remainder, ≥ 1 each).
 *   - Deterministic in (kit ids, seed, records): the kits are taken in id order and each draws from its own stream, so the
 *     order they were passed in changes nothing.
 *   - A kit that resolves to nothing is named in `notes` and its seats are dropped: a smaller deal, never a random one.
 */
export function dealKitTriad(kits, seed, { records } = {}) {
  const uniq = [];
  for (const k of Array.isArray(kits) ? kits : []) if (k && !uniq.some((u) => u.id === k.id)) uniq.push(k);
  const ordered = uniq.slice(0, 3).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const notes = [];
  if (!ordered.length) return { ids: [], kits: [], size: 0, notes: [{ kit: null, note: 'no-kits' }] };
  const s = seed >>> 0;
  const rng = mkRng((s ^ hashStr('triad')) | 0);
  const us = ordered.map(() => 0.05 + rng());
  const sum = us.reduce((a, b) => a + b, 0);
  const free = 1 - KIT_MIN_SHARE * ordered.length;
  const shares = us.map((u) => KIT_MIN_SHARE + (free * u) / sum);
  const size = POOL_MIN + pickIndex(rng, POOL_MAX - POOL_MIN + 1);
  const counts = allocate(size, shares);
  const taken = new Set();
  const ids = [];
  const used = [];
  ordered.forEach((kit, i) => {
    const sub = resolveKit(kit, records || []);
    if (!sub.ids.length) {
      notes.push({ kit: kit.id, note: 'empty' });
      return;
    }
    const avail = sub.ids.filter((id) => !taken.has(id));
    const want = Math.min(counts[i], kit.cap || counts[i], avail.length);
    const got = drawWeighted(mkRng((s ^ hashStr(kit.id)) | 0), avail, sub.weightOf, want);
    for (const id of got) {
      taken.add(id);
      ids.push(id);
    }
    used.push({ id: kit.id, count: got.length, share: Math.round(shares[i] * 1000) / 1000 });
  });
  return { ids, kits: used, size, notes };
}

/**
 * Descriptor records for the kit deal (computed only when kits are in play): each dealable record, with the traits
 * (baked for the library, the record's own for an import), the artist's tag edits and its effective H/M/L weight.
 */
export function kitDescriptors(records, { assets = [], customAssets = [], assetTags = {}, weightOverrides = {} } = {}) {
  const byId = new Map([...assets, ...customAssets].map((a) => [a.id, a]));
  return records
    .map((r) => {
      const a = byId.get(r.id);
      if (!a) return null;
      const user = String(r.id).startsWith('user:');
      const d = assetDescriptor(a, user ? a.traits || null : libraryTraits(r.id), user ? a.tagEdits : assetTags[r.id]);
      return { ...d, weight: weightOverrides[r.id] || a.weight || 'medium' };
    })
    .filter(Boolean);
}
