// data/assetStyle.js — #1769 (KINETIC variety S3): every asset's FAMILY, STYLE and normalized TAGS, as data.
//
// The library already carried a form taxonomy — `category` (geometric, stamps, linework…), with data/categories.js as
// its single source of truth — and free-form `tags` (a 297-value folksonomy). This module adds what the KINETIC epic
// (#1766) reads on top, WITHOUT editing the 295 authored records:
//   - FAMILY: the source pack an asset came from (Haeckel, letterforms, pixel glyphs, line/floral, HUD, organic/geo,
//     stamps/radial, experimental), from the id prefix — a table, so an imported asset (#1479) can carry one too;
//   - STYLE: a small controlled list of 2-D design languages (Swiss, Japanese, grunge, engraved, …), assigned by
//     STYLE_RULES — an ordered table over family / category / canonical tags, first match wins. Data, not branches:
//     the miner/loot pipeline can extend the table for imported assets on arrival;
//   - TAGS: the folksonomy collapsed onto TAG_VOCAB (32 canonical terms) through TAG_SYNONYMS. Every raw tag in the
//     library has a canonical home — assetStyle.selfcheck fails the build otherwise.
// The read API (assetRecord, assetsWhere, the counts) is what the roll (S1), looks (S4), voices (S5) and the curator
// (S6) consume. Pure; no render behaviour reads this module unless a roll deals from it.

/** Canonical tag → the raw folksonomy tags it absorbs (#1769: 297 raw values → 32 terms). */
export const TAG_SYNONYMS = Object.freeze({
  blob: ['blob', 'soft', 'lobed', 'amoeba', 'stretched', 'kidney', 'lobe', 'drop', 'tear', 'pod', 'wobble', 'dome'],
  leaf: ['leaf', 'veined', 'frond', 'fern', 'palm', 'clover', 'three-leaf', 'kelp', 'algae', 'pinnate', 'pennate'],
  flower: ['flower', 'petal', 'petals', 'five-petal', 'six-petal', 'bud', 'tulip', 'dandelion', 'pinwheel', 'seedhead'],
  branch: ['branch', 'sprig', 'twig', 'vine', 'trunk', 'tendril', 'curl'],
  root: ['root', 'roots', 'taproot', 'hairs', 'mycelium', 'hypha', 'hyphae', 'sprout', 'confluence', 'merge'],
  seed: ['seed', 'spore', 'pollen'],
  organism: [
    'radiolarian',
    'plankton',
    'diatom',
    'frustule',
    'medusa',
    'jellyfish',
    'cnidarian',
    'ammonite',
    'shell',
    'starfish',
    'echinoderm',
    'pentaradial',
    'coral',
    'polyp',
    'sponge',
    'porous',
    'filter',
    'siphonophore',
    'bells',
    'spiky',
    'ciliate',
    'slipper',
    'microbe',
    'flagella',
    'cilia',
    'swarm',
    'colony',
    'neuron',
    'nerve',
    'dendrite',
    'plume',
    'feather',
    'barb',
    'creature',
    'moth',
    'dish',
  ],
  network: [
    'network',
    'node',
    'nodes',
    'circuit',
    'trace',
    'bus',
    'stubs',
    'via',
    'manhattan',
    'dataflow',
    'artery',
    'chain',
    'satellite',
  ],
  circle: [
    'circle',
    'round',
    'ellipse',
    'halfcircle',
    'quartercircle',
    'quarter',
    'crescent',
    'arc',
    'eye',
    'dot-eye',
    'iris',
  ],
  ring: ['ring', 'rings', 'concentric', 'nested', 'bullseye', 'orbit', 'planet', 'tilted', 'hollow', 'loop', 'yin'],
  square: ['square', 'rect', 'bar', 'stripe', 'plate', 'patch'],
  triangle: [
    'triangle',
    'triangular',
    'wedge',
    'wedges',
    'pie',
    'quartered',
    'trapezoid',
    'parallelogram',
    'step',
    'staircase',
    'arch',
  ],
  polygon: ['hexagon', 'hexagonal', 'hex', 'pentagon', 'octagon', 'diamond', 'facet', 'gem', 'lattice'],
  star: [
    'star',
    '4-point',
    '5-point',
    '6-point',
    '8-point',
    'spark',
    'asterisk',
    'sun',
    'rays',
    'radiant',
    'burst',
    'starburst',
    'spike',
    'fan',
    'radial',
  ],
  cross: ['cross', 'plus', 'x', 'crosshair', 'target', 'sight', 'registration', 'cropmarks', 'crop'],
  arrow: ['arrow', 'chevron', 'pointer', 'direction', 'needle', 'pointed', 'bolt', 'tail', 'omega', 'j'],
  spiral: ['spiral', 'knot', 'tangle', 'meander'],
  wave: ['wave', 'squiggle', 'zigzag', 'swoosh', 'curve', 'curved', 'flow', 'sweep'],
  line: [
    'line',
    'linear',
    'solid',
    'double',
    'thick',
    'tight',
    'loose',
    'horizontal',
    'vertical',
    'diagonal',
    'streak',
    'slash',
    'stroke',
    'blade',
    'blades',
    'sliver',
    'lines',
    'open',
  ],
  dash: ['dash', 'dashed', 'dot-dash', 'dotted', 'tally', 'marks', 'mark', 'ticks', 'ruler', 'gauge'],
  hatch: ['hatch', 'hatched', 'crosshatch', 'texture'],
  grid: ['grid', 'modular', 'cluster', 'scatter', 'mixed'],
  dot: ['dot', 'dots', 'speck', 'speckle', 'confetti', 'halftone'],
  glyph: ['glyph', 'emblem', 'symbol', 'at', 'hash', 'percent', 'tag', 'label', 'signal', 'spec', 'test', 'barcode'],
  letter: ['letter', 'type', 'a', 'k', 'z'],
  digit: ['digit', 'number', '7', '13', '99', '01', '000'],
  hud: ['hud', 'micro', 'bracket', 'brackets', 'corner', 'corners', 'frame', 'dial', 'center'],
  pixel: ['pixel'],
  crystal: ['prism', 'shard', 'shards', 'crystal', 'core', 'glow', 'dissolve', 'twin', 'overlap', 'split', 'offset'],
  fade: ['fade', 'gradient', 'ghost', 'doubleprint'],
  print: ['print', 'riso', 'misregistration', 'grain', 'noise', 'crt', 'scanlines'],
  doodle: ['doodle', 'scribble', 'outline', 'simple'],
});

/** The controlled tag vocabulary. */
export const TAG_VOCAB = Object.freeze(Object.keys(TAG_SYNONYMS));

const RAW_TO_CANON = (() => {
  const m = new Map();
  for (const [canon, raws] of Object.entries(TAG_SYNONYMS)) {
    m.set(canon, canon);
    for (const r of raws) m.set(r, canon);
  }
  return m;
})();

/** One raw tag → its canonical term, or null when the vocabulary has no home for it. */
export function canonTag(raw) {
  return RAW_TO_CANON.get(String(raw).toLowerCase()) ?? null;
}

/** Source families, by id prefix (the library's packs). `imported` is the home of anything else. */
export const FAMILIES = Object.freeze([
  'organic-geo',
  'line-floral',
  'stamp-radial',
  'experimental',
  'haeckel',
  'micro-hud',
  'letterforms',
  'pixel-glyphs',
  'creature',
  'imported',
]);
export const FAMILY_BY_PREFIX = Object.freeze({
  org: 'organic-geo',
  geo: 'organic-geo',
  dot: 'organic-geo',
  line: 'line-floral',
  flora: 'line-floral',
  stamp: 'stamp-radial',
  rad: 'stamp-radial',
  xsh: 'experimental',
  bio: 'experimental',
  frg: 'experimental',
  scn: 'experimental',
  hae: 'haeckel',
  mic: 'micro-hud',
  typ: 'letterforms',
  pxg: 'pixel-glyphs',
  creature: 'creature',
});

/** The family an asset comes from. */
export function assetFamily(asset) {
  const id = String(asset && asset.id ? asset.id : '');
  const prefix = id.replace(/^user:/, '').match(/^[a-z]+/);
  return (prefix && FAMILY_BY_PREFIX[prefix[0]]) || 'imported';
}

/** The controlled style list — 2-D design languages a look or voice can ask for (#1766). */
export const STYLES = Object.freeze([
  'swiss', // grid discipline, type-led, solid primitives
  'bauhaus', // primary geometry: circle / square / triangle / wedge
  'japanese', // ma and asymmetry: sprig, branch, petal, the single ring
  'grunge', // distress: stamps, scribble, photocopy, torn fragments
  'engraved', // Haeckel plates: fine-line natural history
  'techno', // HUD, circuitry, crystal, scan
  'pixel', // the 8-bit grid
  'organic', // blob, cell, root, colony
  'op', // optical: halftone, concentric, hatch, moiré
  'memphis', // confetti, squiggle, zigzag, star
]);

/**
 * Style assignment — ordered rules, first match wins. A rule matches when every field it names matches:
 * `family` (any of), `category` (any of), `tags` (any canonical tag of the asset). The last rules are per-family
 * fallbacks, so every library asset lands somewhere; `any` is the final net (imported assets with nothing to go on).
 */
export const STYLE_RULES = Object.freeze([
  { family: ['haeckel'], style: 'engraved' },
  { family: ['pixel-glyphs'], style: 'pixel' },
  { family: ['micro-hud'], style: 'techno' },
  { family: ['letterforms'], style: 'swiss' },
  { family: ['creature'], style: 'organic' },
  // experimental: print-y scanlines are grunge (riso, misregistration); the rest of the pack is techno or organic
  { category: ['scanlines'], tags: ['print'], style: 'grunge' },
  { category: ['scanlines'], style: 'techno' },
  { category: ['fragments'], style: 'grunge' },
  { category: ['crystalline'], style: 'techno' },
  { category: ['biosynthetic'], tags: ['network'], style: 'techno' },
  { category: ['biosynthetic'], style: 'organic' },
  // stamps / radial
  { category: ['stamps'], style: 'grunge' },
  { category: ['radial'], tags: ['triangle'], style: 'bauhaus' },
  { category: ['radial'], tags: ['ring', 'dot'], style: 'op' },
  { category: ['radial'], tags: ['star'], style: 'japanese' },
  { category: ['radial'], style: 'op' },
  // line / floral
  { category: ['floral'], style: 'japanese' },
  { category: ['linework'], tags: ['wave', 'spiral'], style: 'memphis' },
  { category: ['linework'], tags: ['hatch'], style: 'op' },
  { category: ['linework'], style: 'swiss' },
  // organic / geometric / dots
  { category: ['organic'], tags: ['leaf', 'flower'], style: 'japanese' },
  { category: ['organic'], style: 'organic' },
  { category: ['dots'], tags: ['grid'], style: 'op' },
  { category: ['dots'], style: 'memphis' },
  { category: ['geometric'], tags: ['star', 'arrow'], style: 'memphis' },
  { category: ['geometric'], tags: ['circle', 'triangle'], style: 'bauhaus' },
  { category: ['geometric'], style: 'swiss' },
  { any: true, style: 'swiss' },
]);

/** An asset's tags, normalized onto TAG_VOCAB (deduped, vocabulary order). Unknown raw tags are dropped here. */
export function normalizeTags(asset) {
  const set = new Set();
  for (const t of (asset && asset.tags) || []) {
    const c = canonTag(t);
    if (c) set.add(c);
  }
  return TAG_VOCAB.filter((t) => set.has(t));
}

function ruleMatches(rule, family, category, tags) {
  if (rule.any) return true;
  if (rule.family && !rule.family.includes(family)) return false;
  if (rule.category && !rule.category.includes(category)) return false;
  if (rule.tags && !rule.tags.some((t) => tags.includes(t))) return false;
  return true;
}

/** An asset's style (always one of STYLES). */
export function assetStyle(asset) {
  const family = assetFamily(asset);
  const category = asset && asset.category;
  const tags = normalizeTags(asset);
  for (const rule of STYLE_RULES) if (ruleMatches(rule, family, category, tags)) return rule.style;
  return 'swiss';
}

/** The full record the epic reads: { id, family, category, style, tags }. */
export function assetRecord(asset) {
  return {
    id: asset.id,
    family: assetFamily(asset),
    category: asset.category,
    style: assetStyle(asset),
    tags: normalizeTags(asset),
  };
}

/** Records for a list of assets (the library, or the library plus imports). */
export function assetRecords(assets) {
  return (Array.isArray(assets) ? assets : []).filter((a) => a && a.id).map(assetRecord);
}

/**
 * The asset ids matching a filter, in input order. Every named dimension must match (any of its values):
 * { families, categories, styles, tags, exclude: [ids] }. An empty filter returns every id but the excluded.
 */
export function assetsWhere(records, { families, categories, styles, tags, exclude } = {}) {
  const ex = new Set(exclude || []);
  return records
    .filter(
      (r) =>
        !ex.has(r.id) &&
        (!families || families.includes(r.family)) &&
        (!categories || categories.includes(r.category)) &&
        (!styles || styles.includes(r.style)) &&
        (!tags || tags.some((t) => r.tags.includes(t))),
    )
    .map((r) => r.id);
}

/** Counts by one dimension ('family' | 'category' | 'style'), sorted largest first. */
export function countBy(records, key) {
  const m = {};
  for (const r of records) m[r[key]] = (m[r[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}
