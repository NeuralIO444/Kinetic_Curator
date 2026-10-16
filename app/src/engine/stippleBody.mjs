/**
 * stippleBody.mjs — #1549 (Materials M3): the `material: 'stipple'` body.
 *
 * Stipple's semantics are recovered, not invented — primary sources
 * only:
 *
 *  - The retired material catalog (app/src/engine/materials.js @
 *    c300a988, deleted in the #505 gate sweep): stipple is
 *    `{ id: 'stipple', kind: 'pattern', cell: 6 }` — a pattern body
 *    on a 6-unit cell, where flat is kind 'flat', plate 'radial',
 *    wash 'linear'.
 *  - The def itself (app/src/components/MaterialSheet.jsx @ 0b7d758c,
 *    "SVG defs for plate / wash / stipple"):
 *      <pattern id="kc-mat-stipple" width="6" height="6"
 *               patternUnits="userSpaceOnUse">
 *        <circle cx="1.5" cy="1.5" r="0.8" fill="var(--ink)" />
 *        <circle cx="4.5" cy="4.2" r="0.6" fill="var(--accent)" />
 *      </pattern>
 *    A 6×6 tile holding TWO dots and nothing else: an ink dot
 *    (r 0.8 at 1.5,1.5) and a smaller accent dot (r 0.6 at 4.5,4.2).
 *    The rest of the tile is transparent — a stipple-painted shape
 *    is a field of dots, not a filled silhouette. Neither circle
 *    crosses a tile edge (ink spans 0.7–2.3, accent 3.9–5.1 ×
 *    3.6–4.8), so the tile wraps cleanly with no seam term.
 *  - How it was consumed (app/src/panels/canvas/Layer.jsx @ 7e779235,
 *    "wings take material pigment via --ink"): the pattern replaced
 *    the item's --ink paint (fill = url(#kc-mat-stipple)); the
 *    --accent paint stayed flat. So the INK channel of each glyph is
 *    screened through the dot field — inside the ink dot it paints
 *    ink, inside the accent dot it paints accent, everywhere else
 *    it paints nothing — and the vein/accent channel is untouched.
 *    The pattern's user space is the item's own space (the glyph box
 *    is 100 units — Layer's ASSET_SIZE — so the 6-unit cell is 6% of
 *    the glyph), and the field turns/scales with the item exactly as
 *    the glyph does.
 *
 * GL expression (the plate pattern, docs/ASSET_CHANNELS.md §C): in
 * the quad shader's live-tint branch, a stipple instance's ink term
 * is screened by the same dot test — a pure function of the
 * fragment's local position in the glyph box, computed identically
 * in the JS function (tests + measurement), the GLSL chunk (live
 * canvas) and the SVG pattern def (composed stills — the retired
 * def's tile and circles at Matt's dot scale, STIPPLE_DOT_SCALE).
 * The gaps remove ink coverage by exactly the amount they remove
 * ink colour (the plate branch's bookkeeping).
 * Dot edges are hard, as the def's circles are hard and this
 * renderer runs antialias:false throughout.
 *
 * Stipple also survives the headless GL export (studio.py still,
 * u_liveTint = 0), where plate and wash — colour ramps that need
 * the ink/accent decomposition — render flat and are disclosed
 * (sceneContract.warnUnsupportedMaterials). A screen needs no
 * decomposition: in the export's baked-sample path the same dot
 * test scales the sample's coverage (stippleCover), so the exported
 * glyph is the same dot field, painted with the baked colours
 * instead of the separated channels.
 *
 * Perf (iPad-class budget): the flag is set at placement time
 * (buildPlacements, carried as the material body code in the plate
 * tail slot), the shader term is a mod and two distance tests
 * inside the existing fragment pass — no new pass, no texture, no
 * per-frame CPU. The dot field is a function of local position
 * only: it is never baked per instance.
 *
 * Scale note: the GL local frame spans the atlas cell, and the
 * plate ramp already reads that frame as the glyph box; the stipple
 * cell is expressed in the same frame (local × 100 = asset units),
 * so any cell padding the atlas bake leaves is shared with plate's
 * approximation, not a new one. The composed stills use the def
 * itself and are exact.
 */
import { registerCostTier } from '../gl/costTiers.mjs';

export const STIPPLE_MATERIAL = 'stipple';

/** The material-param switch: is this layoutParams.material the stipple material? */
export function isStippleMaterial(material) {
  return material === STIPPLE_MATERIAL;
}

/** The glyph box in asset units (Layer.jsx ASSET_SIZE @ 7e779235). */
export const STIPPLE_BOX = 100;

/** The pattern cell in asset units (catalog @ c300a988: cell 6). */
export const STIPPLE_CELL = 6;

/**
 * The dots, verbatim from the def: centre + radius in asset units
 * within the 6×6 tile, and the channel each dot paints with.
 */
export const STIPPLE_DOTS = Object.freeze([
  Object.freeze({ cx: 1.5, cy: 1.5, r: 0.8, color: 'ink' }),
  Object.freeze({ cx: 4.5, cy: 4.2, r: 0.6, color: 'accent' }),
]);

/**
 * Matt's tuning (2026-10-14, chosen on rendered density strips):
 * the def's dots cover ~9% of the tile, which read too dark at
 * scene scale — stipple should dissolve marks into the dot field,
 * not speckle them. STIPPLE_DOTS above stays verbatim (the
 * recovered def, cited); every consumer scales the radii by this
 * one constant. ×2.5 → radii 2.0 / 1.5, ~55% ink.
 */
export const STIPPLE_DOT_SCALE = 2.5;

/**
 * #1585 (Materials M4) — the dot scale as a live per-Look param
 * (layoutParams.stippleDotScale, registered in PARAM_SPEC). The
 * shipped constant is the default: an absent or non-finite value
 * resolves to STIPPLE_DOT_SCALE, so a pre-M4 document screens exactly
 * as Matt's tune screened it. STIPPLE_DOTS stays authored data — the
 * param scales the dots' radii, never their positions or channels.
 */
export function stippleDotScaleFrom(layoutParams) {
  const v = layoutParams?.stippleDotScale;
  return Number.isFinite(v) ? v : STIPPLE_DOT_SCALE;
}

/** A dot's radius at a given scale: the def radius × the scale. */
const scaledR = (d, dotScale = STIPPLE_DOT_SCALE) => d.r * dotScale;

/**
 * The screen at glyph-box position (lx, ly). Returns:
 *  - color: which channel paints the ink term here — 'ink', or
 *    'accent' (the small dot), or null in the gaps;
 *  - aMul: the ink coverage scale — 1 inside either dot, 0 in the
 *    gaps (the def's tile is transparent outside its circles).
 * `dotScale` is the M4 param (stippleDotScaleFrom); omitted, it is
 * Matt's shipped scale and the screen is the pre-M4 screen.
 */
export function stippleShadeAt(lx, ly, dotScale = STIPPLE_DOT_SCALE) {
  const px = (((lx * STIPPLE_BOX) % STIPPLE_CELL) + STIPPLE_CELL) % STIPPLE_CELL;
  const py = (((ly * STIPPLE_BOX) % STIPPLE_CELL) + STIPPLE_CELL) % STIPPLE_CELL;
  for (const d of STIPPLE_DOTS) {
    const dx = px - d.cx;
    const dy = py - d.cy;
    const r = scaledR(d, dotScale);
    if (dx * dx + dy * dy < r * r) return { color: d.color, aMul: 1 };
  }
  return { color: null, aMul: 0 };
}

/**
 * The GLSL expression of the same screen, interpolated into
 * QUAD_FS by gl/shaders.mjs (the plate pattern: leaf constants
 * inlined, one source of truth). stippleShade(local, ink, accent)
 * returns the ink term's colour and writes its coverage scale to
 * aMul (0 in the gaps). stippleCover(local) is the colour-free form
 * — 1 inside either dot, 0 in the gaps — used where there are no
 * separate channels to paint (the baked-sample path of the headless
 * export, u_liveTint = 0: screening the sample's coverage is what
 * lets stipple survive studio.py still while the colour-ramp
 * materials, plate and wash, are disclosed there instead).
 */
export const STIPPLE_GLSL = /* glsl */`
float stippleCover(vec2 local, float dotScale) {
  vec2 cell = mod(local * 100.0, 6.0);
  if (length(cell - vec2(1.5, 1.5)) < ${STIPPLE_DOTS[0].r.toFixed(2)} * dotScale) return 1.0;
  if (length(cell - vec2(4.5, 4.2)) < ${STIPPLE_DOTS[1].r.toFixed(2)} * dotScale) return 1.0;
  return 0.0;
}
vec3 stippleShade(vec2 local, vec3 ink, vec3 accent, float dotScale, out float aMul) {
  vec2 cell = mod(local * 100.0, 6.0);
  if (length(cell - vec2(1.5, 1.5)) < ${STIPPLE_DOTS[0].r.toFixed(2)} * dotScale) { aMul = 1.0; return ink; }
  if (length(cell - vec2(4.5, 4.2)) < ${STIPPLE_DOTS[1].r.toFixed(2)} * dotScale) { aMul = 1.0; return accent; }
  aMul = 0.0;
  return ink;
}`;

/**
 * The SVG pattern def for one item's two channels — the retired
 * MaterialSheet def's tile and circles, radii at the dot scale, with
 * the item's accent/ink hexes in the var(--accent)/var(--ink) slots.
 * Used by the still composer. `dotScale` is the M4 param (#1585);
 * omitted, it is Matt's shipped scale and the def is byte-identical
 * to the pre-M4 def.
 */
export function stipplePatternDef(id, accentHex, inkHex, dotScale = STIPPLE_DOT_SCALE) {
  const dot = (d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${scaledR(d, dotScale)}" fill="${d.color === 'accent' ? accentHex : inkHex}"/>`;
  return `<pattern id="${id}" width="${STIPPLE_CELL}" height="${STIPPLE_CELL}" patternUnits="userSpaceOnUse">${STIPPLE_DOTS.map(dot).join('')}</pattern>`;
}

registerCostTier('engine/stipple-body', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: '#1549: material stipple body — one flag per placed instance at build time (carried as body code 3 in the plate tail slot); the screen itself is a fragment-shader term in the existing quad pass (light/stipple-pattern) and a bake-time pattern def in composed stills. No new pass, no texture, no per-frame CPU.',
});
registerCostTier('light/stipple-pattern', {
  tier: 0, memoryBytes: 0, timeMs: 0.05,
  notes: '#1549: dot-field screen on the ink channel for stipple-flagged instances inside the existing QUAD_FS live-tint branch — a mod and two distance tests per fragment, stipple instances only.',
});
