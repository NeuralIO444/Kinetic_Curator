/**
 * washBody.mjs — #1549 (Materials M3): the `material: 'wash'` body.
 *
 * Wash's semantics are recovered, not invented — primary sources only:
 *
 *  - The retired material catalog (app/src/engine/materials.js @
 *    c300a988, deleted in the #505 gate sweep): wash is
 *    `{ id: 'wash', kind: 'linear', angle: 90 }` — a linear body,
 *    where flat is kind 'flat', plate 'radial', stipple 'pattern'.
 *  - The def itself (app/src/components/MaterialSheet.jsx @ 0b7d758c,
 *    "SVG defs for plate / wash / stipple"):
 *      <linearGradient id="kc-mat-wash" x1="0" y1="0" x2="0" y2="1">
 *        <stop offset="0%"   stopColor="var(--accent)" />
 *        <stop offset="100%" stopColor="var(--ink)" />
 *      </linearGradient>
 *    A vertical ramp (the catalog's angle 90): accent at the top of
 *    the glyph box, ink at the bottom. NEITHER stop carries an
 *    opacity — the def is a full-opacity colour wash end to end.
 *    (The M3 issue's shorthand "soft translucent wash" describes the
 *    watercolour feel of a two-colour gradient, not an alpha ramp;
 *    the def is the authority and it has no alpha term. Recorded
 *    here so the discrepancy is on the record, not silently resolved.)
 *  - How it was consumed (app/src/panels/canvas/Layer.jsx @ 7e779235,
 *    "wings take material pigment via --ink"): the gradient replaced
 *    the item's --ink paint (fill = url(#kc-mat-wash)); the --accent
 *    paint stayed flat. So the INK channel of each glyph is painted
 *    by the linear ramp — accent at the glyph's top edge shading to
 *    ink at its bottom edge — and the vein/accent channel is
 *    untouched. Object-box space: the ramp lives in each glyph's own
 *    0..1 box, not in scene space.
 *
 * GL expression (the plate pattern, docs/ASSET_CHANNELS.md §C): the
 * quad shader's live-tint path composes inkA·v_ink + accA·v_accent.
 * For a wash instance this leaf's ramp re-paints the ink term: ink
 * colour = mix(accent, ink, local.y), coverage unchanged (the def
 * has no opacity stops, so there is no aMul — the wash branch never
 * touches alpha). The ramp is defined ONCE here and expressed three
 * ways from the same constants: the JS function (tests +
 * measurement), the GLSL chunk (live canvas), and the SVG gradient
 * def (composed stills — byte-faithful to the retired def).
 *
 * Perf (iPad-class budget): the flag is set at placement time
 * (buildPlacements, carried as the material body code in the plate
 * tail slot), the shader term is one mix inside the existing
 * fragment pass — no new pass, no texture, no per-frame CPU.
 *
 * Orientation note (the plate note, inherited): the def's y=0 is the
 * glyph's top in SVG space, and the composed stills reproduce that
 * exactly. The GL local frame is the atlas cell frame the plate ramp
 * already reads; the same constants are used there — if the cell
 * frame reads y-up against the baker's y-down, the wash runs
 * ink-at-top on the live canvas only. Flagged for Matt's sign-off
 * eye; the stills he signs are exact.
 */
import { registerCostTier } from '../gl/costTiers.mjs';

export const WASH_MATERIAL = 'wash';

/** The material-param switch: is this layoutParams.material the wash material? */
export function isWashMaterial(material) {
  return material === WASH_MATERIAL;
}

/**
 * The stops, verbatim from the def: offset is the fraction of the
 * glyph-box height (top → bottom); each stop paints `color`
 * ('accent' | 'ink' — resolved per item from its two channels) at
 * `opacity`. The retired def declares no stop-opacity, so both
 * opacities are 1 — recorded explicitly so the absence is a fact of
 * the table, not an oversight. Interpolation between stops is
 * linear (the SVG default).
 */
export const WASH_STOPS = Object.freeze([
  Object.freeze({ t: 0, color: 'accent', opacity: 1 }),
  Object.freeze({ t: 1, color: 'ink', opacity: 1 }),
]);

/**
 * The ramp at glyph-box position (lx, ly). Returns:
 *  - inkMix: 0 = paint the ink channel with the accent colour,
 *    1 = with the ink colour (the colour stops, resolved);
 *  - alpha: the stop opacity at that height — always 1 for wash
 *    (the def has no opacity stops); kept in the shape so callers
 *    can treat the material ramps uniformly.
 * lx plays no part: the def is a one-dimensional (vertical) ramp.
 */
export function washRampAt(lx, ly) {
  const t = Math.min(1, Math.max(0, ly));
  return { inkMix: t, alpha: 1 };
}

/**
 * The GLSL expression of the same ramp, interpolated into QUAD_FS by
 * gl/shaders.mjs (the plate pattern: leaf constants inlined, one
 * source of truth). washShade(local, ink, accent) returns the
 * re-painted ink colour. There is no coverage term — the wash def
 * never touches alpha.
 */
export const WASH_GLSL = /* glsl */`
vec3 washShade(vec2 local, vec3 ink, vec3 accent) {
  return mix(accent, ink, clamp(local.y, 0.0, 1.0));
}`;

/**
 * The SVG gradient def for one item's two channels — value-faithful
 * to the retired MaterialSheet def (same geometry, same stops; the
 * def declares no stop-opacity, so none is emitted), with the item's
 * accent/ink hexes in the var(--accent)/var(--ink) slots. Used by
 * the still composer.
 */
export function washGradientDef(id, accentHex, inkHex) {
  const stop = (s) => `<stop offset="${Math.round(s.t * 100)}%" stop-color="${s.color === 'accent' ? accentHex : inkHex}"/>`;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${WASH_STOPS.map(stop).join('')}</linearGradient>`;
}

registerCostTier('engine/wash-body', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: '#1549: material wash body — one flag per placed instance at build time (carried as body code 2 in the plate tail slot); the ramp itself is a fragment-shader term in the existing quad pass (light/wash-gradient) and a bake-time gradient def in composed stills. No new pass, no texture, no per-frame CPU.',
});
registerCostTier('light/wash-gradient', {
  tier: 0, memoryBytes: 0, timeMs: 0.05,
  notes: '#1549: vertical accent→ink ramp on the ink channel for wash-flagged instances inside the existing QUAD_FS live-tint branch — one mix per fragment, wash instances only; alpha untouched (the def has no opacity stops).',
});
