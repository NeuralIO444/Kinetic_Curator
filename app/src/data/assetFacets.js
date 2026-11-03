// data/assetFacets.js — #1942: the faceted tags. Pure, browser-safe.
//
// Four controlled facets (subject, form, script, mood) over the 32 TAG_VOCAB terms, plus an artist's `free` words.
// A tag set is layered like regionKinemes: SUGGESTED (computed: tags, category, family, traits) + the artist's
// overrides { add, drop } — `drop` is a tombstone for a rejected suggestion, so a recompute never resurrects it.
import { TAG_VOCAB, canonTag, assetFamily, normalizeTags } from './assetStyle.js';

export const FACETS = Object.freeze(['subject', 'form', 'script', 'mood']);
export const FACET_TERMS = Object.freeze({
  subject: ['leaf', 'flower', 'branch', 'root', 'seed', 'organism'],
  form: [
    'blob',
    'network',
    'circle',
    'ring',
    'square',
    'triangle',
    'polygon',
    'star',
    'cross',
    'arrow',
    'spiral',
    'wave',
    'line',
    'dash',
    'hatch',
    'grid',
    'dot',
    'crystal',
  ],
  script: ['glyph', 'letter', 'digit', 'pixel'],
  mood: ['hud', 'fade', 'print', 'doodle'],
});
export const FACET_OF = Object.freeze(Object.fromEntries(FACETS.flatMap((f) => FACET_TERMS[f].map((t) => [t, f]))));
export const FREE_MAX = 12;
export const FREE_LEN = 24;

/** Category → suggested canonical tags. */
export const CATEGORY_TAGS = Object.freeze({
  radial: ['ring'],
  floral: ['flower'],
  dots: ['dot'],
  crystalline: ['crystal'],
  scanlines: ['hatch'],
  stamps: ['print'],
  linework: ['line'],
});
/** Family → suggested canonical tags. */
export const FAMILY_TAGS = Object.freeze({
  haeckel: ['organism'],
  letterforms: ['letter'],
  'pixel-glyphs': ['pixel', 'glyph'],
  'micro-hud': ['hud'],
});
/** Trait rules: all conditions must hold. Data, so the table is auditable. */
export const TRAIT_TAG_RULES = Object.freeze([
  { tag: 'line', when: { elong: ['>=', 0.6], stroke: ['>=', 0.6] } },
  { tag: 'dot', when: { busy: ['>=', 0.8], fill: ['<=', 0.3] } },
  { tag: 'doodle', when: { busy: ['>=', 0.6], sym: ['<=', 0.3] } },
]);

const passes = (traits, when) =>
  Object.entries(when).every(([k, [op, v]]) => (op === '>=' ? traits[k] >= v : traits[k] <= v));

/** Suggestions: [{ facet, tag, reason: 'tag'|'category'|'family'|'trait' }], vocabulary order, first reason wins. */
export function suggestTags(asset, traits) {
  const reasons = new Map();
  const add = (tag, reason) => FACET_OF[tag] && !reasons.has(tag) && reasons.set(tag, reason);
  for (const t of normalizeTags(asset)) add(t, 'tag');
  for (const t of CATEGORY_TAGS[asset && asset.category] || []) add(t, 'category');
  for (const t of FAMILY_TAGS[assetFamily(asset)] || []) add(t, 'family');
  if (traits) for (const r of TRAIT_TAG_RULES) if (passes(traits, r.when)) add(r.tag, 'trait');
  return TAG_VOCAB.filter((t) => reasons.has(t)).map((tag) => ({
    facet: FACET_OF[tag],
    tag,
    reason: reasons.get(tag),
  }));
}

const cleanFree = (list) => {
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (typeof w !== 'string') continue;
    const s = w.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s) || s.length > FREE_LEN || out.includes(s)) continue;
    out.push(s);
    if (out.length >= FREE_MAX) break;
  }
  return out;
};
const cleanTerms = (list, facet) => {
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    const c = typeof w === 'string' ? canonTag(w) : null;
    if (c && FACET_OF[c] === facet && FACET_TERMS[facet].includes(w.toLowerCase()) && !out.includes(c)) out.push(c);
  }
  return FACET_TERMS[facet].filter((t) => out.includes(t));
};

/**
 * The trust boundary for an artist's tag overrides: { add: {facet: [...], free: [...]}, drop: {facet: [...]} } or null.
 * Facet terms must be canonical members of THAT facet; `free` is lowercase [a-z0-9-], ≤ 24 chars, deduped, ≤ 12;
 * `drop` has no free list (a free word is just removed from add). Anything else is discarded.
 */
export function sanitizeAssetTags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const add = {};
  const drop = {};
  for (const f of FACETS) {
    const a = cleanTerms(raw.add && raw.add[f], f);
    const d = cleanTerms(raw.drop && raw.drop[f], f).filter((t) => !a.includes(t));
    if (a.length) add[f] = a;
    if (d.length) drop[f] = d;
  }
  const free = cleanFree(raw.add && raw.add.free);
  if (free.length) add.free = free;
  if (!Object.keys(add).length && !Object.keys(drop).length) return null;
  return { ...(Object.keys(add).length ? { add } : {}), ...(Object.keys(drop).length ? { drop } : {}) };
}

/** Layer the artist's overrides over the suggestions → { suggested, confirmed, effective }. */
export function layerTags(suggested, overrides) {
  const o = sanitizeAssetTags(overrides);
  const effective = { subject: [], form: [], script: [], mood: [], free: [] };
  for (const s of suggested)
    if (!(o && o.drop && (o.drop[s.facet] || []).includes(s.tag))) effective[s.facet].push(s.tag);
  for (const f of FACETS)
    for (const t of (o && o.add && o.add[f]) || []) if (!effective[f].includes(t)) effective[f].push(t);
  effective.free = (o && o.add && o.add.free) || [];
  for (const f of FACETS) effective[f] = FACET_TERMS[f].filter((t) => effective[f].includes(t));
  return { suggested, confirmed: o, effective };
}

/** The document's library map { assetId: overrides } — canon ids only (an import's edits ride its overlay record). */
export function sanitizeAssetTagsDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    if (typeof id !== 'string' || !id || id.length > 64 || id.startsWith('user:')) continue;
    const o = sanitizeAssetTags(v);
    if (o) out[id] = o;
    if (Object.keys(out).length >= 400) break;
  }
  return Object.keys(out).length ? out : null;
}
