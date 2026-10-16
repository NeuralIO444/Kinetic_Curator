/**
 * plateBody.mjs — #1548 (Materials M2): the `material: 'plate'` body.
 *
 * Plate is the DEFAULT material (DEFAULT_LAYOUT_PARAMS.material), and
 * its semantics are recovered, not invented — primary sources only:
 *
 *  - The retired material catalog (app/src/engine/materials.js @
 *    c300a988, deleted in the #505 gate sweep): plate is
 *    `{ id: 'plate', kind: 'radial', inner: 0.15, outer: 0.85 }` — a
 *    radial body, where flat is kind 'flat', wash 'linear', stipple
 *    'pattern'.
 *  - The def itself (app/src/components/MaterialSheet.jsx @ 0b7d758c,
 *    "SVG defs for plate / wash / stipple"):
 *      <radialGradient id="kc-mat-plate" cx="50%" cy="45%" r="65%">
 *        <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.9" />
 *        <stop offset="55%"  stopColor="var(--ink)"    stopOpacity="0.85" />
 *        <stop offset="100%" stopColor="var(--ink)"    stopOpacity="0.2" />
 *      </radialGradient>
 *  - How it was consumed (Layer.jsx @ 7e779235, "wings take material
 *    pigment via --ink"): the gradient replaced the item's --ink paint
 *    (fill = url(#kc-mat-plate)); --accent paint stayed flat. So the
 *    INK channel of each glyph is painted by the radial ramp — accent
 *    at the heart (50%, 45%), ink by 55% of the radius, dissolving to
 *    ink at 0.2 opacity at the rim — and the vein/accent channel is
 *    untouched. Object-box space: the ramp lives in each glyph's own
 *    0..1 box, not in scene space.
 *
 * GL expression (docs/ASSET_CHANNELS.md §C: ink/accent IS the two-stop
 * channel model — R = body, G = vein; the palette supplies the two
 * hexes): the quad shader's live-tint path already composes
 * inkA·v_ink + accA·v_accent. For a plate instance this leaf's ramp
 * re-paints the ink term: ink colour = mix(accent, ink, ramp.s) and
 * the ink coverage scales by ramp.alpha, both pure functions of the
 * fragment's local position in the glyph box. The ramp is defined
 * ONCE here and expressed three ways from the same constants: the JS
 * function (tests + measurement), the GLSL chunk (live canvas +
 * studio GL stills), and the SVG gradient def (composed stills — the
 * baker's surface, byte-faithful to the retired def).
 *
 * Perf (iPad-class budget): the flag is set at placement time
 * (buildPlacements), the shader term is a few ALU ops inside the
 * existing fragment pass — no new pass, no texture, no per-frame CPU.
 *
 * Orientation note: the def's cy 45% is measured from the glyph's top
 * in SVG space. The composed stills reproduce that exactly. The GL
 * local frame is the atlas cell frame the Open Hand block already
 * computes in QUAD_FS; the same constants are used there — if the
 * cell frame reads y-up against the baker's y-down, the core sits
 * 10% low instead of 10% high on the live canvas only. Flagged for
 * Matt's sign-off eye; the stills he signs are exact.
 */
import { registerCostTier } from '../gl/costTiers.mjs';

export const PLATE_MATERIAL = 'plate';

/** The material-param switch: is this layoutParams.material the plate material? */
export function isPlateMaterial(material) {
  return material === PLATE_MATERIAL;
}

/** Gradient geometry in glyph-box units (MaterialSheet @ 0b7d758c). */
export const PLATE_CENTER = Object.freeze({ x: 0.36, y: 0.30 }); // tuned 2026-10-14: the retired def centers at 50%/45% — Matt offset the core up-left so the grad dot never sits in a mark's center
export const PLATE_RADIUS = 1.05; // tuned 2026-10-14: the historical def below reads r=65% — Matt scaled the gradient larger (0.65 → 0.85 → 1.05) so the filled body carries past the mark

/**
 * The stops, verbatim from the def: offset is the fraction of the
 * radius; each stop paints `color` ('accent' | 'ink' — resolved per
 * item from its two channels) at `opacity`. Interpolation between
 * stops is linear (the SVG default), beyond the last stop the pad is
 * the last stop (SVG spreadMethod pad).
 */
export const PLATE_STOPS = Object.freeze([
  Object.freeze({ t: 0, color: 'accent', opacity: 0.9 }),
  Object.freeze({ t: 0.55, color: 'ink', opacity: 0.85 }),
  Object.freeze({ t: 1, color: 'ink', opacity: 0.2 }),
]);

// Exact at the endpoints (a + (b - a) * 1 is not always b in doubles,
// and the ramp must read the stop values exactly at the stops).
const lerp = (a, b, f) => (f <= 0 ? a : f >= 1 ? b : a + (b - a) * f);

/**
 * #1585 (Materials M4) — the plate geometry as live per-Look params
 * (layoutParams.plateCenterX / plateCenterY / plateRadius, registered
 * in PARAM_SPEC). The shipped constants are the defaults: any field
 * absent or non-finite resolves to them, so a pre-M4 document renders
 * exactly as the constants rendered it. PLATE_STOPS stays authored
 * data — the params move the ramp's centre and radius, never its stops.
 */
export const PLATE_GEO_DEFAULTS = Object.freeze({
  cx: PLATE_CENTER.x, cy: PLATE_CENTER.y, radius: PLATE_RADIUS,
});

export function plateGeoFrom(layoutParams) {
  const cx = layoutParams?.plateCenterX;
  const cy = layoutParams?.plateCenterY;
  const radius = layoutParams?.plateRadius;
  return {
    cx: Number.isFinite(cx) ? cx : PLATE_CENTER.x,
    cy: Number.isFinite(cy) ? cy : PLATE_CENTER.y,
    radius: Number.isFinite(radius) ? radius : PLATE_RADIUS,
  };
}

/**
 * The ramp at glyph-box position (lx, ly). Returns:
 *  - inkMix: 0 = paint the ink channel with the accent colour,
 *    1 = with the ink colour (the colour stops, resolved);
 *  - alpha: the stop opacity at that radius (the ink coverage scale).
 * `geo` is the M4 geometry (plateGeoFrom); omitted, it is the shipped
 * geometry and the ramp is the pre-M4 ramp, value for value.
 */
export function plateRampAt(lx, ly, geo = PLATE_GEO_DEFAULTS) {
  const dx = lx - geo.cx;
  const dy = ly - geo.cy;
  const t = Math.min(1, Math.hypot(dx, dy) / geo.radius);
  let a = PLATE_STOPS[0];
  let b = PLATE_STOPS[PLATE_STOPS.length - 1];
  for (let i = 0; i < PLATE_STOPS.length - 1; i++) {
    if (t >= PLATE_STOPS[i].t && t <= PLATE_STOPS[i + 1].t) { a = PLATE_STOPS[i]; b = PLATE_STOPS[i + 1]; break; }
  }
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const mixOf = (s) => (s.color === 'accent' ? 0 : 1);
  return { inkMix: lerp(mixOf(a), mixOf(b), f), alpha: lerp(a.opacity, b.opacity, f) };
}

const f3 = (v) => v.toFixed(3);

/**
 * The GLSL expression of the same ramp, interpolated into QUAD_FS by
 * gl/shaders.mjs (the glassBevel pattern: leaf constants inlined, one
 * source of truth). plateShade(local, ink, accent, geo) returns the
 * re-painted ink colour and writes the ink coverage scale to aMul.
 * The stops stay inlined authored data; the geometry arrives as the
 * M4 param vector geo = (cx, cy, radius) (#1585 — a per-instance
 * attribute the packer fills from the Look's params, or from
 * PLATE_GEO_DEFAULTS when the Look never moved them).
 */
export const PLATE_GLSL = /* glsl */`
vec3 plateShade(vec2 local, vec3 ink, vec3 accent, vec3 geo, out float aMul) {
  float t = clamp(length(local - geo.xy) / geo.z, 0.0, 1.0);
  float inkMix; float a;
  if (t < ${f3(PLATE_STOPS[1].t)}) {
    float f = t / ${f3(PLATE_STOPS[1].t)};
    inkMix = mix(0.0, 1.0, f);
    a = mix(${f3(PLATE_STOPS[0].opacity)}, ${f3(PLATE_STOPS[1].opacity)}, f);
  } else {
    float f = (t - ${f3(PLATE_STOPS[1].t)}) / ${f3(PLATE_STOPS[2].t - PLATE_STOPS[1].t)};
    inkMix = 1.0;
    a = mix(${f3(PLATE_STOPS[1].opacity)}, ${f3(PLATE_STOPS[2].opacity)}, f);
  }
  aMul = a;
  return mix(accent, ink, inkMix);
}`;

/**
 * The SVG gradient def for one item's two channels — value-faithful
 * to the retired MaterialSheet def (same geometry, same stops), with
 * the item's accent/ink hexes in the var(--accent)/var(--ink) slots.
 * Used by the still composer. `geo` is the M4 geometry (#1585);
 * omitted, the def is byte-identical to the pre-M4 def.
 */
export function plateGradientDef(id, accentHex, inkHex, geo = PLATE_GEO_DEFAULTS) {
  const stop = (s) => `<stop offset="${Math.round(s.t * 100)}%" stop-color="${s.color === 'accent' ? accentHex : inkHex}" stop-opacity="${s.opacity}"/>`;
  return `<radialGradient id="${id}" cx="${geo.cx * 100}%" cy="${geo.cy * 100}%" r="${geo.radius * 100}%">${PLATE_STOPS.map(stop).join('')}</radialGradient>`;
}

registerCostTier('engine/plate-body', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: '#1548: material plate body — one flag per placed instance at build time; the ramp itself is a fragment-shader term in the existing quad pass (light/plate-gradient) and a bake-time gradient def in composed stills. No new pass, no texture, no per-frame CPU.',
});
registerCostTier('light/plate-gradient', {
  tier: 0, memoryBytes: 0, timeMs: 0.05,
  notes: '#1548: radial ramp on the ink channel for plate-flagged instances inside the existing QUAD_FS live-tint branch — a distance, two mixes and a coverage scale per fragment, plate instances only.',
});
