/**
 * FX layer filters — effect definitions + SVG filter compiler.
 *
 * An FX layer holds an ordered `effects` array, e.g.
 *   [{ kind: 'rgbSplit', params: { dx: 3 } }, { kind: 'grain', params: { amount: 0.4 } }]
 * This module compiles it into a single SVG <filter> per layer, as an
 * ordered list of filter primitives. Effects chain top-down: the first
 * effect reads SourceGraphic, and each later effect reads the previous
 * effect's output, so the stack compounds like an adjustment-layer chain.
 * (Before chaining, every effect read SourceGraphic independently and only
 * the last effect's output was visible.) Two renderers exist:
 *   - FxFilterDefs (./FxFilterDefs.jsx) for the live React app
 *   - renderFxFilterString() for the offline studio path (studio/render.mjs)
 * Both consume the same primitive list, so live and export agree.
 *
 * Hard rules:
 * - Unknown effect kinds fail closed: skipped, never crash the render.
 * - Param values are sanitized against FX_EFFECT_DEFS (clamped, defaulted).
 * - Filter output is EXCLUDED from the determinism contract (like audio/LFO):
 *   filter rasterization may vary subtly across browsers and resvg.
 * - #192 retired the Showrunner FX cut ladder: effects always compile at
 *   full fidelity (ctx.turbulenceOctaves from the quality tier). No effect
 *   is ever silently simplified or dropped — the governor sheds resolution
 *   (renderScale) before anything visible is cut.
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
  blur: {
    label: 'Blur',
    hint: 'Gaussian blur on the source. One primitive — the cheapest effect in the stack.',
    params: {
      radius: { label: 'Radius', min: 0, max: 40, step: 0.5, def: 6, hint: 'Blur radius in pixels' },
    },
  },
  scanlines: {
    label: 'Scanlines',
    hint: 'CRT scanline banding: fine horizontal dark lines over the artwork. Turbulence-based, so the Showrunner clamps its detail under load.',
    params: {
      density: { label: 'Density', min: 0.05, max: 1, step: 0.05, def: 0.35, hint: 'Line frequency — higher = finer lines' },
      amount: { label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.5, hint: 'Line darkness' },
    },
  },
  posterize: {
    label: 'Posterize',
    hint: 'Reduce each channel to a fixed number of tonal steps. Flat poster look, one primitive.',
    params: {
      levels: { label: 'Levels', min: 2, max: 8, step: 1, def: 4, hint: 'Tonal steps per channel' },
    },
  },
  invert: {
    label: 'Invert',
    hint: 'Flip every channel. No parameters — stack it, strobe it.',
    params: {},
  },
  solarize: {
    label: 'Solarize',
    hint: 'Fold the tonal curve: mid-tones push bright, shadows and highlights stay dark. Psych-poster look.',
    params: {},
  },
  edge: {
    label: 'Edge Detect',
    hint: '3×3 convolution edge detection. Alpha channel is preserved, so transparent areas stay clean.',
    params: {},
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

function buildRgbSplit(params, ctx, rid, src) {
  const dx = r3(params.dx + (ctx.dxMod || 0));
  const rIso = rid(), gIso = rid(), bIso = rid(), rOff = rid(), bOff = rid(), rg = rid();
  return [
    { prim: 'feColorMatrix', attrs: { in: src, type: 'matrix', values: CH_R, result: rIso } },
    { prim: 'feColorMatrix', attrs: { in: src, type: 'matrix', values: CH_G, result: gIso } },
    { prim: 'feColorMatrix', attrs: { in: src, type: 'matrix', values: CH_B, result: bIso } },
    { prim: 'feOffset', attrs: { in: rIso, dx, dy: 0, result: rOff } },
    { prim: 'feOffset', attrs: { in: bIso, dx: r3(-dx), dy: 0, result: bOff } },
    // screen() recombines isolated channels losslessly: screen(c,0)=c per channel.
    { prim: 'feBlend', attrs: { in: rOff, in2: gIso, mode: 'screen', result: rg } },
    { prim: 'feBlend', attrs: { in: rg, in2: bOff, mode: 'screen' } },
  ];
}

function buildDisplace(params, ctx, rid, src) {
  // The turbulenceOctaves tier budget clamps noise detail (#192: no FX cuts).
  const octaves = Math.max(1, Math.min(4, Math.round(ctx.octaves ?? 3)));
  const noise = rid();
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: 0.012, numOctaves: octaves, seed: Math.round(params.seed), result: noise } },
    { prim: 'feDisplacementMap', attrs: { in: src, in2: noise, scale: r3(params.scale), xChannelSelector: 'R', yChannelSelector: 'G' } },
  ];
}

function buildTear(params, ctx, rid, src) {
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
    { prim: 'feDisplacementMap', attrs: { in: src, in2: flat, scale: r3(params.amount * 4), xChannelSelector: 'R', yChannelSelector: 'G' } },
  ];
}

function buildGrain(params, ctx, rid, src, srcAlpha) {
  const n = rid(), ga = rid(), gam = rid();
  const k = r3(Math.max(0, Math.min(1, params.amount)));
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, seed: 3, result: n } },
    // Noise alpha channel, RGB zeroed: black grain with varying opacity.
    { prim: 'feColorMatrix', attrs: { in: n, type: 'matrix', values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${k} 0`, result: ga } },
    // Alpha-aware: mask the grain by the chained source's own alpha so it never paints
    // the filter-region box over transparent areas.
    { prim: 'feComposite', attrs: { in: ga, in2: srcAlpha, operator: 'in', result: gam } },
    { prim: 'feComposite', attrs: { in: gam, in2: src, operator: 'over' } },
  ];
}

function buildBlur(params, ctx, rid, src) {
  return [
    { prim: 'feGaussianBlur', attrs: { in: src, stdDeviation: r3(Math.max(0, params.radius)) } },
  ];
}

function buildScanlines(params, ctx, rid, src, srcAlpha) {
  // The turbulenceOctaves tier budget clamps noise detail (#192: no FX cuts).
  const octaves = Math.max(1, Math.min(4, Math.round(ctx.octaves ?? 3)));
  // Noise varies along Y (bands across the height), near-constant along X:
  // fine horizontal dark lines. Alpha-masked to the source like grain.
  const n = rid(), la = rid(), lam = rid();
  const fy = r3(Math.max(0.01, params.density));
  const k = r3(Math.max(0, Math.min(1, params.amount)));
  return [
    { prim: 'feTurbulence', attrs: { type: 'fractalNoise', baseFrequency: `0.01 ${fy}`, numOctaves: octaves, seed: 11, result: n } },
    { prim: 'feColorMatrix', attrs: { in: n, type: 'matrix', values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${k} 0`, result: la } },
    { prim: 'feComposite', attrs: { in: la, in2: srcAlpha, operator: 'in', result: lam } },
    { prim: 'feComposite', attrs: { in: lam, in2: src, operator: 'over' } },
  ];
}

function buildPosterize(params, ctx, rid, src) {
  const levels = Math.max(2, Math.min(8, Math.round(params.levels)));
  const table = Array.from({ length: levels }, (_, i) => r3(i / (levels - 1))).join(' ');
  const func = (prim) => ({ prim, attrs: { type: 'discrete', tableValues: table } });
  return [
    {
      prim: 'feComponentTransfer', attrs: { in: src },
      children: [func('feFuncR'), func('feFuncG'), func('feFuncB')],
    },
  ];
}

function buildInvert(params, ctx, rid, src) {
  const flip = (prim) => ({ prim, attrs: { type: 'linear', slope: -1, intercept: 1 } });
  return [
    {
      prim: 'feComponentTransfer', attrs: { in: src },
      children: [flip('feFuncR'), flip('feFuncG'), flip('feFuncB')],
    },
  ];
}

function buildSolarize(params, ctx, rid, src) {
  const curve = (prim) => ({ prim, attrs: { type: 'table', tableValues: '0 0.5 1 0.5 0' } });
  return [
    {
      prim: 'feComponentTransfer', attrs: { in: src },
      children: [curve('feFuncR'), curve('feFuncG'), curve('feFuncB')],
    },
  ];
}

function buildEdge(params, ctx, rid, src) {
  return [
    {
      prim: 'feConvolveMatrix',
      attrs: { in: src, order: 3, kernelMatrix: '-1 -1 -1 -1 8 -1 -1 -1 -1', preserveAlpha: 'true' },
    },
  ];
}

const BUILDERS = { rgbSplit: buildRgbSplit, displace: buildDisplace, tear: buildTear, grain: buildGrain, blur: buildBlur, scanlines: buildScanlines, posterize: buildPosterize, invert: buildInvert, solarize: buildSolarize, edge: buildEdge };

/**
 * Compile an effects array into filter primitives.
 * ctx: { octaves, dxMod, primBudget }
 *  - octaves: turbulence detail budget from the quality tier (displace,
 *    tear, scanlines). #192: effects are never silently simplified.
 *  - primBudget: soft ceiling — exceeding it warns (see docs/FX_LAYERS.md
 *    for why this warns instead of dropping: the binding degradation is
 *    the shed ladder, not prim counting).
 */
export function compileFxPrimitives(effects, ctx = {}) {
  const list = sanitizeFxEffects(effects);
  const prims = [];
  let n = 0;
  const rid = () => `r${n++}`;
  // Chain top-down: the first effect reads SourceGraphic/SourceAlpha; each
  // later effect reads the previous effect's output, so the stack compounds.
  // Only non-final effects get a named output id — the final effect's last
  // primitive stays implicit (it becomes the filter output), which keeps
  // single-effect stacks compiling exactly as before.
  const active = list.filter((fx) => {
    // #192: no FX culling — every sanitized effect compiles, always.
    return !!BUILDERS[fx.kind]; // unknown kind: fail closed (also guarded by sanitize)
  });
  let src = 'SourceGraphic';
  let srcAlpha = 'SourceAlpha';
  active.forEach((fx, i) => {
    const built = BUILDERS[fx.kind](fx.params, ctx, rid, src, srcAlpha);
    if (i < active.length - 1) {
      const out = rid();
      built[built.length - 1].attrs.result = out;
      src = out;
      srcAlpha = out;
    }
    prims.push(...built);
  });
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
