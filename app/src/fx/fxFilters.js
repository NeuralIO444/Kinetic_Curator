/**
 * FX layer filters — effect definitions + SVG filter compiler.
 *
 * An FX layer holds an ordered `effects` array, e.g.
 *   [{ kind: 'rgbSplit', params: { dx: 3 } }, { kind: 'grain', params: { amount: 0.4 } }]
 * This module compiles it into a single SVG <filter> per layer, as an
 * ordered list of filter primitives. Two renderers exist:
 *   - FxFilterDefs (./FxFilterDefs.jsx) for the live React app
 *   - renderFxFilterString() for the offline studio path (studio/render.mjs)
 * Both consume the same primitive list, so live and export agree.
 *
 * Hard rules:
 * - Unknown effect kinds fail closed: skipped, never crash the render.
 * - Param values are sanitized against FX_EFFECT_DEFS (clamped, defaulted).
 * - Filter output is EXCLUDED from the determinism contract (like audio/LFO):
 *   filter rasterization may vary subtly across browsers and resvg.
 * - Showrunner cuts are honored via ctx: shedLevel 1 forces turbulence
 *   octaves to 1 and drops grain; shedLevel 2 / maxFxLayers are applied by
 *   the caller (CanvasPanel skips whole FX layers).
 */

const r3 = (v) => Math.round(Number(v) * 1000) / 1000;

/** Effect catalog: the single source of truth for compiler, UI, and docs. */
export const FX_EFFECT_DEFS = {
  rgbSplit: {
    label: 'RGB Split',
    hint: 'Chromatic aberration — red shifts right, blue shifts left, green stays put. dx accepts live modulation for shimmer.',
    params: {
      dx: { label: 'Shift', min: 0, max: 24, step: 0.5, def: 3, hint: 'Pixel offset: red +dx, blue −dx' },
    },
  },
  displace: {
    label: 'Displace',
    hint: 'Warped, melted edges via fractal-noise displacement. Seed keeps the look stable per preset.',
    params: {
      scale: { label: 'Scale', min: 0, max: 120, step: 1, def: 24, hint: 'Maximum warp displacement in pixels' },
      seed: { label: 'Seed', min: 0, max: 99, step: 1, def: 7, hint: 'Noise seed — same seed, same warp' },
    },
  },
  tear: {
    label: 'Tear',
    hint: 'Horizontal scanline slice-tears: banded rows shear left/right. X-only displacement (Y is flattened).',
    params: {
      bands: { label: 'Bands', min: 2, max: 60, step: 1, def: 18, hint: 'Tear bands across the canvas height' },
      amount: { label: 'Amount', min: 0, max: 40, step: 1, def: 12, hint: 'Maximum horizontal shear in pixels' },
    },
  },
  grain: {
    label: 'Grain',
    hint: 'Animated film grain composited over the source. First thing the Showrunner sheds under load.',
    params: {
      amount: { label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.4, hint: 'Grain opacity' },
    },
  },
};

export const FX_EFFECT_KINDS = Object.keys(FX_EFFECT_DEFS);

export function isFxLayer(layer) {
  return !!layer && layer.type === 'fx';
}

/** Default stack for a newly added FX layer: the reference feel. */
export function defaultFxEffects() {
  return [
    { kind: 'rgbSplit', params: { dx: 3 } },
    { kind: 'grain', params: { amount: 0.4 } },
  ];
}

/** Default params for one effect kind (used by "add effect"). */
export function defaultFxParams(kind) {
  const def = FX_EFFECT_DEFS[kind];
  if (!def) return null;
  const params = {};
  for (const [key, p] of Object.entries(def.params)) params[key] = p.def;
  return params;
}

/**
 * Sanitize a raw effects array: drop unknown kinds and non-objects, clamp
 * params to their defined ranges, fill defaults. Fail closed, never throw.
 */
export function sanitizeFxEffects(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const fx of raw) {
    if (!fx || typeof fx !== 'object') continue;
    const def = FX_EFFECT_DEFS[fx.kind];
    if (!def) continue; // unknown kind: skipped
    const params = {};
    const src = fx.params && typeof fx.params === 'object' ? fx.params : {};
    for (const [key, p] of Object.entries(def.params)) {
      const v = Number(src[key]);
      params[key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
    }
    out.push({ kind: fx.kind, params });
  }
  return out;
}

/** DOM-safe filter id for a layer. */
export function fxFilterId(layerId) {
  return `fx-${String(layerId).replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

// ---------------------------------------------------------------------------
// Primitive builders — each returns [{ prim, attrs, children? }]
// ---------------------------------------------------------------------------

const CH_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const CH_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
const CH_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';

function buildRgbSplit(params, ctx, rid) {
  const dx = r3(params.dx + (ctx.dxMod || 0));
  const rIso = rid(), gIso = rid(), bIso = rid(), rOff = rid(), bOff = rid(), rg = rid();
  return [
    { prim: 'feColorMatrix', attrs: { in: 'SourceGraphic', type: 'matrix', values: CH_R, result: rIso } },
    { prim: 'feColorMatrix', attrs: { in: 'SourceGraphic', type: 'matrix', values: CH_G, result: gIso } },
    { prim: 'feColorMatrix', attrs: { in: 'SourceGraphic', type: 'matrix', values: CH_B, result: bIso } },
    { prim: 'feOffset', attrs: { in: rIso, dx, dy: 0, result: rOff } },
    { prim: 'feOffset', attrs: { in: bIso, dx: r3(-dx), dy: 0, result: bOff } },
    // screen() recombines isolated channels losslessly: screen(c,0)=c per channel.
    { prim: 'feBlend', attrs: { in: rOff, in2: gIso, mode: 'screen', result: rg } },
    { prim: 'feBlend', attrs: { in: rg, in2: bOff, mode: 'screen' } },
  ];
}

function buildDisplace(params, ctx, rid) {
  // Showrunner cut 1 (and the turbulenceOctaves budget) clamp noise detail.
  const octaves = ctx.shedLevel >= 1 ? 1 : Math.max(1, Math.min(4, Math.round(ctx.octaves ?? 3)));
  const noise = rid();
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: 0.012, numOctaves: octaves, seed: Math.round(params.seed), result: noise } },
    { prim: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: noise, scale: r3(params.scale), xChannelSelector: 'R', yChannelSelector: 'G' } },
  ];
}

function buildTear(params, ctx, rid) {
  // Stretched noise: varies along Y (bands across the height), near-constant
  // along X. Y displacement is flattened to exactly 0 via feFuncG so the
  // shear is strictly horizontal.
  const fy = r3(Math.max(0.002, params.bands / 700));
  const raw = rid(), flat = rid();
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: `0.008 ${fy}`, numOctaves: 1, seed: 7, result: raw } },
    {
      prim: 'feComponentTransfer', attrs: { in: raw, result: flat },
      children: [{ prim: 'feFuncG', attrs: { type: 'linear', slope: 0, intercept: 0.5 } }],
    },
    { prim: 'feDisplacementMap', attrs: { in: 'SourceGraphic', in2: flat, scale: r3(params.amount * 4), xChannelSelector: 'R', yChannelSelector: 'G' } },
  ];
}

function buildGrain(params, ctx, rid) {
  const n = rid(), ga = rid(), gam = rid();
  const k = r3(Math.max(0, Math.min(1, params.amount)));
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, seed: 3, result: n } },
    // Noise alpha channel, RGB zeroed: black grain with varying opacity.
    { prim: 'feColorMatrix', attrs: { in: n, type: 'matrix', values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${k} 0`, result: ga } },
    // Alpha-aware: mask the grain by the source's own alpha so it never paints
    // the filter-region box over transparent areas.
    { prim: 'feComposite', attrs: { in: ga, in2: 'SourceAlpha', operator: 'in', result: gam } },
    { prim: 'feComposite', attrs: { in: gam, in2: 'SourceGraphic', operator: 'over' } },
  ];
}

const BUILDERS = { rgbSplit: buildRgbSplit, displace: buildDisplace, tear: buildTear, grain: buildGrain };

/**
 * Compile an effects array into filter primitives.
 * ctx: { octaves, shedLevel, dxMod, primBudget }
 *  - shedLevel >= 1: grain effects are dropped (Showrunner cut 1).
 *  - primBudget: soft ceiling — exceeding it warns (see docs/FX_LAYERS.md
 *    for why this warns instead of dropping: the binding degradation is
 *    the shed ladder, not prim counting).
 */
export function compileFxPrimitives(effects, ctx = {}) {
  const list = sanitizeFxEffects(effects);
  const prims = [];
  let n = 0;
  const rid = () => `r${n++}`;
  for (const fx of list) {
    if (ctx.shedLevel >= 1 && fx.kind === 'grain') continue;
    const build = BUILDERS[fx.kind];
    if (!build) continue; // unknown kind: fail closed (also guarded by sanitize)
    prims.push(...build(fx.params, ctx, rid));
  }
  if (ctx.primBudget != null && prims.length > ctx.primBudget && !compileFxPrimitives._warned) {
    compileFxPrimitives._warned = true;
    console.warn(`[fx] ${prims.length} filter primitives exceed budget ${ctx.primBudget} — stacking FX is the steepest per-frame cost; consider fewer effects or layers`);
  }
  return prims;
}
compileFxPrimitives._warned = false;

// ---------------------------------------------------------------------------
// String renderer (studio path + selfcheck)
// ---------------------------------------------------------------------------

function escAttr(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function primToString(p) {
  const attrs = Object.entries(p.attrs)
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join('');
  const kids = (p.children || []).map(primToString).join('');
  return `<${p.prim}${attrs}>${kids}</${p.prim}>`;
}

/**
 * One self-contained <filter> string. Region is clamped to the viewport
 * (MAX_FILTER_REGION = 1.0): unbounded filter regions are a silent
 * frame-rate killer, so this is a clamp, not a tier.
 */
export function renderFxFilterString(id, prims) {
  const inner = prims.map(primToString).join('');
  return `<filter id="${escAttr(id)}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">${inner}</filter>`;
}

/** Compile + render in one step (studio convenience). */
export function fxFilterStringForLayer(layer, ctx = {}) {
  const prims = compileFxPrimitives(layer.effects, ctx);
  if (!prims.length) return null;
  return renderFxFilterString(fxFilterId(layer.id), prims);
}
