// data/kits.js — #1944 (asset descriptors, slice 3 of #1941): KITS — named weighted recipes over the descriptor.
//
// A kit says "this kind of asset, this much": `where` narrows the pool (descriptor facets, categories, styles,
// families, a role-fit floor), `weights` leans inside what is left (tag → ×, role → ×, multiplying the H/M/L
// base), `cap` is the most the kit may put on a stage. "Kanji + Big Shapes + Botanica" is three kits dealt together
// (state/rollPool.mjs dealKitTriad) — never merged into one soup.
//
// Pure, browser-safe. Seed kits are data here; an artist's own ride the project document (`kits`) through
// sanitizeKit, the one door.
import { assetsWhere, TAG_VOCAB, STYLES, FAMILIES } from './assetStyle.js';
import { FACETS, FACET_TERMS } from './assetFacets.js';
import { ROLES } from '../assets/assetRoles.js';
import { ALL_CATEGORIES } from './categories.js';

export const KIT_CAP_MAX = 12;
export const KIT_CAP_DEFAULT = 4;
export const KITS_MAX = 24; // artist kits per project
export const WEIGHT_MIN = 0.25;
export const WEIGHT_MAX = 4;

/** The shipped seed kits. */
export const SEED_KITS = Object.freeze([
  { id: 'kanji', name: 'Kanji', where: { facets: { script: ['glyph', 'letter'] } }, weights: { glyph: 2 }, cap: 4 },
  { id: 'big-shapes', name: 'Big Shapes', where: { minRole: { body: 0.6 } }, weights: { body: 2 }, cap: 3 },
  {
    id: 'botanica',
    name: 'Botanica',
    where: { facets: { subject: ['leaf', 'flower', 'branch', 'root', 'seed'] } },
    weights: { flower: 1.5, leaf: 1.5 },
    cap: 4,
  },
  {
    id: 'instrument',
    name: 'Instrument',
    where: { styles: ['swiss', 'techno'], facets: { form: ['line', 'dash', 'hatch', 'grid', 'cross', 'arrow'] } },
    weights: { limb: 1.5 },
    cap: 4,
  },
  { id: 'signal', name: 'Signal', where: { families: ['micro-hud'] }, weights: {}, cap: 4 },
  { id: 'bloom', name: 'Bloom', where: { categories: ['radial', 'floral'] }, weights: { texture: 1.5 }, cap: 4 },
]);

const slug = (s) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(s);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const clampW = (n) => Math.round(Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, n)) * 100) / 100;
const list = (raw, allowed) => [...new Set((Array.isArray(raw) ? raw : []).filter((x) => allowed.includes(x)))];

/**
 * The trust boundary for a kit record: { id, name, where, weights, cap } or null. `id` is a slug, `name` ≤ 24 chars,
 * every `where` value must be a member of its vocabulary (facet terms of THAT facet, real categories, styles,
 * families, roles with a floor in [0, 1]), weights are clamped to [¼, 4] and keyed by a vocabulary tag or a role,
 * `cap` is an integer in 1..12. A kit that constrains nothing (empty `where`) is refused: it would be the whole library.
 */
export function sanitizeKit(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 24) : '';
  if (!slug(id) || !name) return null;
  const w = raw.where && typeof raw.where === 'object' ? raw.where : {};
  const facets = {};
  for (const f of FACETS) {
    const t = list(w.facets && w.facets[f], FACET_TERMS[f]);
    if (t.length) facets[f] = t;
  }
  const minRole = {};
  for (const r of ROLES) {
    const v = w.minRole && w.minRole[r];
    if (isNum(v) && v > 0 && v <= 1) minRole[r] = Math.round(v * 100) / 100;
  }
  const where = {};
  if (Object.keys(facets).length) where.facets = facets;
  const categories = list(w.categories, ALL_CATEGORIES);
  if (categories.length) where.categories = categories;
  const styles = list(w.styles, STYLES);
  if (styles.length) where.styles = styles;
  const families = list(w.families, FAMILIES);
  if (families.length) where.families = families;
  if (Object.keys(minRole).length) where.minRole = minRole;
  if (!Object.keys(where).length) return null;
  const weights = {};
  const rw = raw.weights && typeof raw.weights === 'object' ? raw.weights : {};
  for (const k of [...TAG_VOCAB, ...ROLES]) if (isNum(rw[k])) weights[k] = clampW(rw[k]);
  const cap = Number.isInteger(raw.cap) ? Math.min(KIT_CAP_MAX, Math.max(1, raw.cap)) : KIT_CAP_DEFAULT;
  return { id, name, where, weights, cap };
}

/** The document's artist kits: a validated, deduped, capped list (never shadowing a seed kit's id), or null. */
export function sanitizeKitsDoc(raw) {
  if (!Array.isArray(raw)) return null;
  const seed = new Set(SEED_KITS.map((k) => k.id));
  const out = [];
  for (const r of raw) {
    const k = sanitizeKit(r);
    if (k && !seed.has(k.id) && !out.some((o) => o.id === k.id)) out.push(k);
    if (out.length >= KITS_MAX) break;
  }
  return out.length ? out : null;
}

/** The standing triad: up to three distinct kit ids that exist (seed or artist), in order. */
export function sanitizeKitTriad(raw, kits = SEED_KITS) {
  const have = new Set(kits.map((k) => k.id));
  const out = [];
  for (const id of Array.isArray(raw) ? raw : [])
    if (typeof id === 'string' && have.has(id) && !out.includes(id)) out.push(id);
  return out.slice(0, 3);
}

/** Look up kits by id across the seed kits and the artist's. */
export function kitsById(ids, artistKits = []) {
  const all = [...SEED_KITS, ...(artistKits || [])];
  return (Array.isArray(ids) ? ids : []).map((id) => all.find((k) => k.id === id)).filter(Boolean);
}

const BASE = { heavy: 4, medium: 2, light: 1 };

/**
 * A kit's sub-pool over descriptor records (data/assetDescriptor.js): { ids, weightOf }. `weightOf(id)` is the H/M/L
 * base (record.weight) × the product of the kit's matching tag weights × each role weight eased in by the asset's
 * fit — never below ⅒, never above 8× the base.
 */
export function resolveKit(kit, records) {
  const w = kit.where || {};
  const ids = assetsWhere(records, {
    categories: w.categories,
    styles: w.styles,
    families: w.families,
    facets: w.facets,
    minRole: w.minRole,
  });
  const byId = new Map(records.map((r) => [r.id, r]));
  const weightOf = (id) => {
    const r = byId.get(id);
    if (!r) return 0;
    let m = BASE[r.weight] || BASE.medium;
    const eff = r.descriptor.tags.effective;
    const has = new Set([...FACETS.flatMap((f) => eff[f]), ...eff.free]);
    for (const [k, x] of Object.entries(kit.weights || {})) {
      if (ROLES.includes(k)) m *= 1 + r.descriptor.roles[k] * (x - 1);
      else if (has.has(k)) m *= x;
    }
    return Math.min(BASE[r.weight] * 8 || 16, Math.max((BASE[r.weight] || 2) / 10, m));
  };
  return { ids, weightOf };
}
