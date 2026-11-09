// panels/assetPoolLogic.mjs — #1943: the asset pool's filtering, counts and selection, as pure data logic.
// The panel renders; this decides. Everything here is deterministic and browser-safe.
import { assetDescriptor, libraryTraits } from '../data/assetDescriptor.js';
import { FACETS } from '../data/assetFacets.js';
import { ROLES } from '../assets/assetRoles.js';
import { ASSETS_KANA } from '../data/assets/assets-kana.js';
import { ASSETS_KANJI } from '../data/assets/assets-kanji.js';
import { ASSETS_LATIN } from '../data/assets/assets-latin.js';
import { ASSETS_SERIF } from '../data/assets/assets-serif.js';
import { ASSETS_ORNAMENTS } from '../data/assets/assets-ornaments.js';
import { ASSETS_PLATE } from '../data/assets/assets-plate.js';
import { ASSETS_RISO } from '../data/assets/assets-riso.js';

// #1982 — the kana stamps are poem-only (FIELD): catalogue members so the
// census and the stage atlas resolve them, but they never become pool
// records — no tiles, no facet counts, no change to the pool's numbers.
// #1998 — the curated kanji stamps join the same exclusion, by the same ids
// pattern: the poem-only set is the native-script union (kana + kanji).
// #2002 — the slice-3 packs (Anton lowercase + punctuation, the serif face,
// the ornaments) join the same exclusion: the poem-only set is the whole
// union the FIELD director deals alone (poets/placement.js POEM_ONLY_STAMP_IDS).
// #2005 — the plate pack (Fraunces) joins the same exclusion.
const POEM_ONLY_IDS = new Set(
  [
    ...ASSETS_KANA,
    ...ASSETS_KANJI,
    ...ASSETS_LATIN,
    ...ASSETS_SERIF,
    ...ASSETS_ORNAMENTS,
    ...ASSETS_PLATE,
    ...ASSETS_RISO,
  ].map((a) => a.id),
);

/** Descriptor records for the pool: library assets read baked traits + the document's edits, imports their own. */
export function poolDescriptors(assets, assetTags = {}) {
  return (Array.isArray(assets) ? assets : [])
    .filter((a) => !POEM_ONLY_IDS.has(a.id))
    .map((a) => {
      const isUser = String(a.id).startsWith('user:');
      return assetDescriptor(a, isUser ? a.traits || null : libraryTraits(a.id), isUser ? a.tagEdits : assetTags[a.id]);
    });
}

/** Every searchable word of a record: id, family, style, category, raw tags and every effective tag (and free words). */
export function searchText(rec) {
  const eff = rec.descriptor.tags.effective;
  return [rec.id, rec.family, rec.style, rec.category, ...rec.tags, ...FACETS.flatMap((f) => eff[f]), ...eff.free]
    .join(' ')
    .toLowerCase();
}

/** facets: { facet: [terms] } — OR within a facet, AND across facets. role: { role: min fit }. */
export function matchesFilters(rec, { cat = 'all', text = '', facets = {}, role = {} } = {}) {
  if (cat === 'user') {
    if (!String(rec.id).startsWith('user:')) return false;
  } else if (cat !== 'all' && rec.category !== cat) return false;
  const q = String(text).trim().toLowerCase();
  if (q && !q.split(/\s+/).every((w) => searchText(rec).includes(w))) return false;
  const eff = rec.descriptor.tags.effective;
  for (const f of FACETS) {
    const want = facets[f];
    if (want && want.length && !want.some((t) => eff[f].includes(t))) return false;
  }
  for (const r of ROLES) if (role[r] != null && rec.descriptor.roles[r] < role[r]) return false;
  return true;
}

export function filterRecords(recs, filters) {
  return recs.filter((r) => matchesFilters(r, filters));
}

/** Facet chip counts over a record list: { facet: { term: n } } (terms with no assets are absent). */
export function facetCounts(recs) {
  const out = Object.fromEntries(FACETS.map((f) => [f, {}]));
  for (const r of recs)
    for (const f of FACETS) for (const t of r.descriptor.tags.effective[f]) out[f][t] = (out[f][t] || 0) + 1;
  return out;
}

/** Category chip counts: { category: n } plus `all` and `user`. */
export function categoryCounts(recs) {
  const out = { all: recs.length, user: 0 };
  for (const r of recs) {
    if (String(r.id).startsWith('user:')) out.user++;
    out[r.category] = (out[r.category] || 0) + 1;
  }
  return out;
}

/** The active filters as a removable chip row: [{ key, label, kind, facet?, term?, role? }]. */
export function activeChips({ cat = 'all', text = '', facets = {}, role = {} } = {}) {
  const chips = [];
  if (cat !== 'all') chips.push({ key: `cat:${cat}`, kind: 'cat', label: cat });
  if (String(text).trim()) chips.push({ key: 'text', kind: 'text', label: `“${String(text).trim()}”` });
  for (const f of FACETS)
    for (const t of facets[f] || [])
      chips.push({ key: `${f}:${t}`, kind: 'facet', facet: f, term: t, label: `${f}: ${t}` });
  for (const r of ROLES)
    if (role[r] != null) chips.push({ key: `role:${r}`, kind: 'role', role: r, label: `${r} ≥ ${role[r]}` });
  return chips;
}

/** Toggle a facet term in a filter map (immutable). */
export function toggleFacet(facets, facet, term) {
  const cur = facets[facet] || [];
  const next = cur.includes(term) ? cur.filter((t) => t !== term) : [...cur, term];
  const out = { ...facets };
  if (next.length) out[facet] = next;
  else delete out[facet];
  return out;
}

/**
 * Selection (shift- or ctrl-click). `order` is the visible id order. A plain toggle adds/removes `id`; a range
 * (shift) selects everything between the anchor and `id`, inclusive, in the visible order.
 */
export function nextSelection(sel, order, id, { range = false, anchor = null } = {}) {
  const cur = sel.filter((x) => order.includes(x));
  if (range && anchor && order.includes(anchor)) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y);
    return [...new Set([...cur, ...order.slice(a, b + 1)])];
  }
  return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

/**
 * #1944 — a kit from the filters on screen: facets → `where.facets`, a category chip → `where.categories`, role chips →
 * `where.minRole`. Returns the record for `saveKit`, or null when no filter is active (a kit must constrain something) or
 * the name leaves no slug.
 */
export function kitFromFilters(name, { cat = 'all', facets = {}, role = {} } = {}, takenIds = []) {
  const label = String(name || '')
    .trim()
    .slice(0, 24);
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!slug) return null;
  const where = {};
  if (Object.keys(facets).length)
    where.facets = Object.fromEntries(Object.entries(facets).map(([k, v]) => [k, [...v]]));
  if (cat !== 'all' && cat !== 'user') where.categories = [cat];
  const minRole = Object.fromEntries(Object.entries(role).filter(([, v]) => v != null));
  if (Object.keys(minRole).length) where.minRole = minRole;
  if (!Object.keys(where).length) return null;
  let id = slug;
  for (let n = 2; takenIds.includes(id); n++) id = `${slug.slice(0, 29)}-${n}`;
  return { id, name: label, where, weights: {}, cap: 4 };
}
