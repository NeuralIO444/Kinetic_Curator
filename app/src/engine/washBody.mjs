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
 * #1585 (Materials M4) — the wash scalars as live per-Look params
 * (layoutParams.washStrength / washSpread, registered in PARAM_SPEC).
 * WASH_STOPS stays authored data; the params reshape how a glyph
 * travels it:
 *  - strength scales the ramp's travel toward ink (1 = the full
 *    accent→ink ramp, 0 = the glyph holds the top stop's colour);
 *  - spread stretches the height over which the ramp runs (1 = the
 *    full glyph height; < 1 compresses the travel into the top of
 *    the glyph and pads with the last stop, SVG-style; > 1 leaves
 *    the bottom short of the last stop).
 * Absent or non-finite fields resolve to the defaults, so a pre-M4
 * document renders exactly as the fixed ramp rendered it.
 */
export const WASH_PARAM_DEFAULTS = Object.freeze({ strength: 1, spread: 1 });

export function washParamsFrom(layoutParams) {
  const strength = layoutParams?.washStrength;
  const spread = layoutParams?.washSpread;
  return {
    strength: Number.isFinite(strength) ? strength : 1,
    spread: Number.isFinite(spread) && spread > 0 ? spread : 1,
  };
}

// Exact at the endpoints (a + (b - a) * 1 is not always b in doubles,
// and the ramp must read the stop values exactly at the stops).
const lerp = (a, b, f) => (f <= 0 ? a : f >= 1 ? b : a + (b - a) * f);

/**
 * The ramp at glyph-box position (lx, ly). Returns:
 *  - inkMix: 0 = paint the ink channel with the accent colour,
 *    1 = with the ink colour (the colour stops, resolved);
 *  - alpha: the stop opacity at that height — always 1 for wash
 *    (the def has no opacity stops); kept in the shape so callers
 *    can treat the material ramps uniformly.
 * lx plays no part: the def is a one-dimensional (vertical) ramp.
 * `prm` is the M4 param pair (washParamsFrom); omitted, it is the
 * shipped pair and the ramp is the pre-M4 ramp, value for value.
 */
export function washRampAt(lx, ly, prm = WASH_PARAM_DEFAULTS) {
  const t = Math.min(1, Math.max(0, ly / prm.spread));
  let a = WASH_STOPS[0];
  let b = WASH_STOPS[WASH_STOPS.length - 1];
  for (let i = 0; i < WASH_STOPS.length - 1; i++) {
    if (t >= WASH_STOPS[i].t && t <= WASH_STOPS[i + 1].t) {
      a = WASH_STOPS[i];
      b = WASH_STOPS[i + 1];
      break;
    }
  }
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const mixOf = (s) => (s.color === 'accent' ? 0 : 1);
  return { inkMix: lerp(mixOf(a), mixOf(b), f) * prm.strength, alpha: lerp(a.opacity, b.opacity, f) };
}

/**
 * The GLSL expression of the same ramp, interpolated into QUAD_FS by
 * gl/shaders.mjs (the plate pattern: leaf constants inlined, one
 * source of truth). washShade(local, ink, accent, prm) returns the
 * re-painted ink colour, prm = (strength, spread) (#1585 — a
 * per-instance attribute the packer fills from the Look's params, or
 * from WASH_PARAM_DEFAULTS when the Look never moved them). There is
 * no coverage term — the wash def never touches alpha.
 */
export const WASH_GLSL = /* glsl */ `
vec3 washShade(vec2 local, vec3 ink, vec3 accent, vec2 prm) {
  return mix(accent, ink, clamp(local.y / prm.y, 0.0, 1.0) * prm.x);
}`;

/** #rrggbb (or #rgb) → [r, g, b] in 0..255, or null when unparsable. */
function hexRgb(hex) {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(hex ?? ''));
  if (!m) return null;
  const h =
    m[1].length === 3
      ? m[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** The channel mix a strength-scaled wash stop paints with. */
function mixHex(accentHex, inkHex, f) {
  const a = hexRgb(accentHex);
  const b = hexRgb(inkHex);
  if (!a || !b) return f >= 1 ? inkHex : accentHex;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The SVG gradient def for one item's two channels — value-faithful
 * to the retired MaterialSheet def (same geometry, same stops; the
 * def declares no stop-opacity, so none is emitted), with the item's
 * accent/ink hexes in the var(--accent)/var(--ink) slots. Used by
 * the still composer. `prm` is the M4 param pair (#1585): at the
 * shipped pair the def is byte-identical to the pre-M4 def; off it,
 * spread stretches the gradient VECTOR (y2 = spread — the ramp value
 * at glyph height y is the table's value at y/spread, exactly the
 * JS/GLSL reading; past the vector's end the pad is the last stop,
 * the SVG default) and each stop's colour is its authored channel
 * mix scaled by strength. (Scaling stop OFFSETS instead would clamp
 * at the box edge and could never express a stretch — measured: a
 * spread-2 def with clamped offsets rasterizes identically to the
 * default. The vector is the honest expression.)
 */
export function washGradientDef(id, accentHex, inkHex, prm = WASH_PARAM_DEFAULTS) {
  if (prm.strength === 1 && prm.spread === 1) {
    const stop = (s) =>
      `<stop offset="${Math.round(s.t * 100)}%" stop-color="${s.color === 'accent' ? accentHex : inkHex}"/>`;
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${WASH_STOPS.map(stop).join('')}</linearGradient>`;
  }
  const mixOf = (s) => (s.color === 'accent' ? 0 : 1);
  const stop = (s) =>
    `<stop offset="${Math.round(s.t * 100)}%" stop-color="${mixHex(accentHex, inkHex, mixOf(s) * prm.strength)}"/>`;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="${prm.spread}">${WASH_STOPS.map(stop).join('')}</linearGradient>`;
}

registerCostTier('engine/wash-body', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.01,
  notes:
    '#1549: material wash body — one flag per placed instance at build time (carried as body code 2 in the plate tail slot); the ramp itself is a fragment-shader term in the existing quad pass (light/wash-gradient) and a bake-time gradient def in composed stills. No new pass, no texture, no per-frame CPU.',
});
registerCostTier('light/wash-gradient', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.05,
  notes:
    '#1549: vertical accent→ink ramp on the ink channel for wash-flagged instances inside the existing QUAD_FS live-tint branch — one mix per fragment, wash instances only; alpha untouched (the def has no opacity stops).',
});
