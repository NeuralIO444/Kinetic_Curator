// data/canon/materials.js — creature PAINT, slice P1 (docs/design/creature-paint-drive-spec.md §1.3, §1.4; #2338).
//
// A MATERIAL is how a creature is painted: a fill and a pattern over its body and dealt parts, coloured by the room.
// Each Canon style ships a few, so a Swiss creature paints Swiss. Materials carry NO colour: `tone` names one of the
// two palette tokens every asset already draws with (var(--ink) / var(--accent)), which the atlas swaps for the room's
// colours at raster time (gl/atlas.mjs subColors) — so the room always colours a painted creature.
//
// Treatments are only those proven to render (checked for #2338, 2026-11-17): solid, outline, hatch and stipple, drawn
// through BOTH rasterizers the app uses — Resvg (gl/atlas.mjs) and the browser's Image + canvas (gl/liveAtlas.mjs) —
// at matching coverage (solid 6400, hatch 3400, stipple 1200–1400, outline 1280 of 10000 px on an 80×80 square).
// Nothing else may be named here (the selfcheck holds the list).
//
// Pure data. Nothing reads it yet: P2 (#2339) gives the MATERIAL gene this value space.

/** The fills a material may use. */
export const MATERIAL_FILLS = Object.freeze(['solid', 'outline']);
/** The patterns a material may lay over its fill ('none' = the fill alone). */
export const MATERIAL_PATTERNS = Object.freeze(['none', 'hatch', 'stipple']);
/** The palette tokens a material may tone with — the two every asset draws with. */
export const MATERIAL_TONES = Object.freeze(['ink', 'accent']);

const m = (id, fill, pattern, tone) => Object.freeze({ id, fill, pattern, tone });

/** Three materials per Canon style, in Canon order; the first is the style's plain default.
 *  #2340 (Matt, 2026-11-17): a patterned material tones ACCENT. Most bodies are filled in ink, so an ink pattern
 *  over them is invisible (ink-tone hatch / stipple showed on 8–10 of 31 sampled bodies, accent on 25–29). */
export const MATERIALS_BY_STYLE = Object.freeze({
  swiss: Object.freeze([
    m('swiss-solid', 'solid', 'none', 'ink'),
    m('swiss-signal', 'solid', 'none', 'accent'),
    m('swiss-rule', 'outline', 'none', 'ink'),
  ]),
  bauhaus: Object.freeze([
    m('bauhaus-primary', 'solid', 'none', 'accent'),
    m('bauhaus-ground', 'solid', 'none', 'ink'),
    m('bauhaus-drafted', 'outline', 'none', 'ink'),
  ]),
  japanese: Object.freeze([
    m('japanese-ink', 'solid', 'none', 'ink'),
    m('japanese-brush', 'outline', 'none', 'ink'),
    m('japanese-seal', 'solid', 'none', 'accent'),
  ]),
  grunge: Object.freeze([
    m('grunge-stipple', 'solid', 'stipple', 'accent'),
    m('grunge-scratch', 'outline', 'hatch', 'accent'),
    m('grunge-stamp', 'solid', 'none', 'accent'),
  ]),
  engraved: Object.freeze([
    m('engraved-hatch', 'outline', 'hatch', 'accent'),
    m('engraved-line', 'outline', 'none', 'ink'),
    m('engraved-stipple', 'outline', 'stipple', 'accent'),
  ]),
  techno: Object.freeze([
    m('techno-wire', 'outline', 'none', 'accent'),
    m('techno-scan', 'outline', 'hatch', 'accent'),
    m('techno-panel', 'solid', 'none', 'ink'),
  ]),
  pixel: Object.freeze([
    m('pixel-block', 'solid', 'none', 'ink'),
    m('pixel-lit', 'solid', 'none', 'accent'),
    m('pixel-dither', 'solid', 'stipple', 'accent'),
  ]),
  organic: Object.freeze([
    m('organic-flesh', 'solid', 'none', 'accent'),
    m('organic-cell', 'outline', 'stipple', 'accent'),
    m('organic-membrane', 'outline', 'none', 'accent'),
  ]),
  op: Object.freeze([
    m('op-hatch', 'solid', 'hatch', 'accent'),
    m('op-dot', 'solid', 'stipple', 'accent'),
    m('op-ring', 'outline', 'none', 'ink'),
  ]),
  memphis: Object.freeze([
    m('memphis-pop', 'solid', 'none', 'accent'),
    m('memphis-confetti', 'solid', 'stipple', 'accent'),
    m('memphis-stripe', 'solid', 'hatch', 'accent'),
  ]),
  marks: Object.freeze([
    m('marks-pigment', 'solid', 'none', 'ink'),
    m('marks-tally', 'outline', 'hatch', 'accent'),
    m('marks-hand', 'outline', 'none', 'ink'),
  ]),
});

const BY_ID = new Map(Object.values(MATERIALS_BY_STYLE).flatMap((list) => list.map((x) => [x.id, x])));

/** A style's materials, [] for an unknown style. */
export function materialsForStyle(styleId) {
  return (typeof styleId === 'string' && MATERIALS_BY_STYLE[styleId]) || [];
}

/** A material record by id, or null. */
export function materialById(id) {
  return (typeof id === 'string' && BY_ID.get(id)) || null;
}

/** A known material id as itself; anything else null (a creature with no material is lawful: the gene's stub). */
export function sanitizeMaterialId(id) {
  return materialById(id) ? id : null;
}

/** The style a material belongs to, or null. */
export function materialStyle(id) {
  for (const [style, list] of Object.entries(MATERIALS_BY_STYLE)) if (list.some((x) => x.id === id)) return style;
  return null;
}
