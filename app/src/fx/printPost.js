/**
 * printPost.js — Print desk post-filter allow-list (#172).
 *
 * The print desk is a modal on OUTPUT for *print*, not live. The operator
 * stacks a few post filters on a frozen still, sees the PNG, saves it.
 *
 * Pipeline the desk implements (browser side):
 *   project → app still export (frozen PNG) → allow-list → preview PNG + sidecar
 *
 * The farm twin is `studio/print_post.py`, which runs the REAL ffmpeg
 * allow-list on a still. This module emits the exact ffmpeg filtergraph
 * string for the stack (`stackToFfmpeg`), so the farm reproduces the desk's
 * stack with real ffmpeg. The browser preview is canvas-pixel math that
 * matches each filter qualitatively — it is a preview, not the print master.
 *
 * Allow-list (anything else is a later issue — unknown chips THROW):
 *   BLUR     → gblur        (gaussian blur, sigma px)
 *   SHARP    → unsharp      (unsharp mask, amount)
 *   GRAIN    → noise        (temporal grain, alls 0..100)
 *   VIGNETTE → vignette     (edge falloff, angle 0..PI/2)
 *   GRADE    → eq           (brightness/contrast/saturation from one amount)
 *   SPLIT    → chromashift  (RGB channel split, px)
 *
 * No filtergraph string is ever typed by the operator — chips only.
 * DOM-free: operates on { data, width, height } so the node selfcheck can
 * exercise the same code the modal runs.
 */

// Chip id → definition. One amount each, off by default (the modal holds
// the on/off state; the engine only sees the active stack).
export const POST_CHIPS = [
  { id: 'BLUR',     ffmpeg: 'gblur',       min: 0,  max: 8,  step: 0.5,  def: 2,    unit: 'px', hint: 'Gaussian blur — ffmpeg gblur' },
  { id: 'SHARP',    ffmpeg: 'unsharp',     min: 0,  max: 2,  step: 0.1,  def: 1,    unit: '',   hint: 'Unsharp mask — ffmpeg unsharp' },
  { id: 'GRAIN',    ffmpeg: 'noise',       min: 0,  max: 100, step: 1,   def: 25,   unit: '',   hint: 'Film grain — ffmpeg noise' },
  { id: 'VIGNETTE', ffmpeg: 'vignette',    min: 0,  max: 1,  step: 0.05, def: 0.35, unit: '',   hint: 'Edge falloff — ffmpeg vignette' },
  { id: 'GRADE',    ffmpeg: 'eq',          min: -1, max: 1,  step: 0.05, def: 0.25, unit: '',   hint: 'Contrast/saturation grade — ffmpeg eq' },
  { id: 'SPLIT',    ffmpeg: 'chromashift', min: 0,  max: 20, step: 1,    def: 4,    unit: 'px', hint: 'RGB channel split — ffmpeg chromashift' },
];

const CHIP_MAP = new Map(POST_CHIPS.map((c) => [c.id, c]));

/** Chip definition, or throws — the allow-list is fail-closed. */
export function chipDef(id) {
  const d = CHIP_MAP.get(id);
  if (!d) throw new Error(`[printPost] unknown post filter "${id}" — not on the #172 allow-list`);
  return d;
}

/**
 * Validate + clamp a stack: [{ chip, amount }]. Unknown chips throw;
 * amounts clamp to the chip's range. Zero-amount entries are dropped
 * (an amount of 0 is the identity for every filter).
 */
export function sanitizeStack(stack) {
  if (!Array.isArray(stack)) return [];
  const out = [];
  for (const entry of stack) {
    if (!entry || typeof entry !== 'object') continue;
    const d = chipDef(entry.chip); // throws on unknown chip
    const amount = Math.max(d.min, Math.min(d.max, Number(entry.amount) || 0));
    if (amount !== 0) out.push({ chip: d.id, amount });
  }
  return out;
}

// --- pixel helpers -----------------------------------------------------------

function mulberry32(a) {
  let t = (a >>> 0) + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic grain seed: project seed mixed with a per-chip salt so
// GRAIN is reproducible per (seed, stack) but independent of other filters.
function grainRand(seed) {
  return mulberry32((seed >>> 0) ^ 0x9e3779b9);
}

/** One separable box-blur pass, in place via a scratch buffer (clamp edges). */
function boxPass(src, dst, w, h, radius, horizontal) {
  const div = 2 * radius + 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let r = 0, g = 0, b = 0;
      for (let x = -radius; x <= radius; x++) {
        const cx = Math.max(0, Math.min(w - 1, x)) + row;
        r += src[cx * 4]; g += src[cx * 4 + 1]; b += src[cx * 4 + 2];
      }
      for (let x = 0; x < w; x++) {
        const i = (row + x) * 4;
        dst[i] = r / div; dst[i + 1] = g / div; dst[i + 2] = b / div; dst[i + 3] = src[i + 3];
        const xOut = Math.max(0, Math.min(w - 1, x - radius)) + row;
        const xIn = Math.max(0, Math.min(w - 1, x + radius + 1)) + row;
        r += src[xIn * 4] - src[xOut * 4];
        g += src[xIn * 4 + 1] - src[xOut * 4 + 1];
        b += src[xIn * 4 + 2] - src[xOut * 4 + 2];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let y = -radius; y <= radius; y++) {
        const cy = Math.max(0, Math.min(h - 1, y)) * w + x;
        r += src[cy * 4]; g += src[cy * 4 + 1]; b += src[cy * 4 + 2];
      }
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        dst[i] = r / div; dst[i + 1] = g / div; dst[i + 2] = b / div; dst[i + 3] = src[i + 3];
        const yOut = Math.max(0, Math.min(h - 1, y - radius)) * w + x;
        const yIn = Math.max(0, Math.min(h - 1, y + radius + 1)) * w + x;
        r += src[yIn * 4] - src[yOut * 4];
        g += src[yIn * 4 + 1] - src[yOut * 4 + 1];
        b += src[yIn * 4 + 2] - src[yOut * 4 + 2];
      }
    }
  }
}

/**
 * Gaussian-ish blur via 3 box passes (radius ≈ sigma). Matches gblur
 * qualitatively at print-preview scale; the farm's real gblur is the master.
 */
function gaussianBlur(data, w, h, sigma) {
  const radius = Math.max(1, Math.round(sigma));
  const a = new Float32Array(data.length);
  const b = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) a[i] = data[i];
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, w, h, radius, true);
    boxPass(b, a, w, h, radius, false);
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) out[i] = a[i];
  return out;
}

// --- the six filters ---------------------------------------------------------

function fBlur(data, w, h, sigma) {
  return gaussianBlur(data, w, h, sigma);
}

function fSharp(data, w, h, amount) {
  // Unsharp mask: out = orig + amount * (orig - blur(orig, r≈2)).
  const soft = gaussianBlur(data, w, h, 2);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] + amount * (data[i] - soft[i]);
    out[i + 1] = data[i + 1] + amount * (data[i + 1] - soft[i + 1]);
    out[i + 2] = data[i + 2] + amount * (data[i + 2] - soft[i + 2]);
    out[i + 3] = data[i + 3];
  }
  return out;
}

function fGrain(data, w, h, alls, seed) {
  // ffmpeg noise=alls=N adds uniform noise scaled by N; here ±(N/100)*96.
  const rand = grainRand(seed);
  const amp = (alls / 100) * 96;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] + (rand() * 2 - 1) * amp;
    out[i + 1] = data[i + 1] + (rand() * 2 - 1) * amp;
    out[i + 2] = data[i + 2] + (rand() * 2 - 1) * amp;
    out[i + 3] = data[i + 3];
  }
  return out;
}

function fVignette(data, w, h, v) {
  const cx = w / 2, cy = h / 2;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const d2 = (dx * dx + dy * dy) / 2; // 0 center → 1 corners
      const f = 1 - v * d2;
      const i = (y * w + x) * 4;
      out[i] = data[i] * f; out[i + 1] = data[i + 1] * f; out[i + 2] = data[i + 2] * f;
      out[i + 3] = data[i + 3];
    }
  }
  return out;
}

function fGrade(data, w, h, g) {
  // One amount → ffmpeg eq triple: brightness 0.08g, contrast 1+0.25g,
  // saturation 1+0.35g. Must match stackToFfmpeg's numbers exactly.
  const { brightness, contrast, saturation } = gradeEq(g);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r1 = (data[i] - 128) * contrast + 128 + brightness * 255;
    const g1 = (data[i + 1] - 128) * contrast + 128 + brightness * 255;
    const b1 = (data[i + 2] - 128) * contrast + 128 + brightness * 255;
    const luma = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
    out[i] = luma + (r1 - luma) * saturation;
    out[i + 1] = luma + (g1 - luma) * saturation;
    out[i + 2] = luma + (b1 - luma) * saturation;
    out[i + 3] = data[i + 3];
  }
  return out;
}

/** GRADE's one amount → the eq triple. Shared by the pixel math and the ffmpeg string. */
export function gradeEq(g) {
  return {
    brightness: +(0.08 * g).toFixed(4),
    contrast: +(1 + 0.25 * g).toFixed(4),
    saturation: +(1 + 0.35 * g).toFixed(4),
  };
}

function fSplit(data, w, h, px) {
  // R sampled at x+s (red moves left), B at x-s (blue moves right), G stays.
  const s = Math.round(px);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xr = Math.max(0, Math.min(w - 1, x + s));
      const xb = Math.max(0, Math.min(w - 1, x - s));
      const i = (y * w + x) * 4;
      out[i] = data[(y * w + xr) * 4];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[(y * w + xb) * 4 + 2];
      out[i + 3] = data[i + 3];
    }
  }
  return out;
}

const FILTERS = { BLUR: fBlur, SHARP: fSharp, GRAIN: fGrain, VIGNETTE: fVignette, GRADE: fGrade, SPLIT: fSplit };

/**
 * Apply the stack (in order) to { data, width, height }.
 * @param {object} pixels { data: Uint8ClampedArray, width, height }
 * @param {Array<{chip, amount}>} stack
 * @param {number} seed project seed (grain determinism)
 * @returns new { data, width, height } — input untouched.
 */
export function applyPostStack(pixels, stack, seed = 0) {
  const { data, width: w, height: h } = pixels;
  const clean = sanitizeStack(stack);
  let cur = new Uint8ClampedArray(data);
  for (const { chip, amount } of clean) {
    cur = chip === 'GRAIN'
      ? FILTERS[chip](cur, w, h, amount, seed)
      : FILTERS[chip](cur, w, h, amount);
  }
  return { data: cur, width: w, height: h };
}

// --- ffmpeg strings ----------------------------------------------------------

/** Exact ffmpeg filter for one sanitized entry. */
export function entryToFfmpeg({ chip, amount }) {
  chipDef(chip); // fail-closed even if the caller skipped sanitizeStack
  switch (chip) {
    case 'BLUR': return `gblur=sigma=${amount}`;
    case 'SHARP': return `unsharp=5:5:${amount}`;
    case 'GRAIN': return `noise=alls=${amount}:allf=t`;
    case 'VIGNETTE': return `vignette=angle=${(amount * Math.PI / 2).toFixed(4)}`;
    case 'GRADE': {
      const { brightness, contrast, saturation } = gradeEq(amount);
      return `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`;
    }
    case 'SPLIT': return `chromashift=cbh=${amount}:crh=${-amount}`;
    default: throw new Error(`[printPost] no ffmpeg mapping for "${chip}"`);
  }
}

/** The stack as one ffmpeg -vf filtergraph. '' when nothing is on. */
export function stackToFfmpeg(stack) {
  return sanitizeStack(stack).map(entryToFfmpeg).join(',');
}

/** print_post.py argv fragment for the stack (mirrors entryToFfmpeg). */
export function stackToFarmArgs(stack) {
  const args = [];
  for (const { chip, amount } of sanitizeStack(stack)) {
    switch (chip) {
      case 'BLUR': args.push('--gblur', String(amount)); break;
      case 'SHARP': args.push('--unsharp', String(amount)); break;
      case 'GRAIN': args.push('--noise', String(amount)); break;
      case 'VIGNETTE': args.push('--vignette', String((amount * Math.PI / 2).toFixed(4))); break;
      case 'GRADE': {
        const { brightness, contrast, saturation } = gradeEq(amount);
        args.push('--eq', `${brightness},${contrast},${saturation}`);
        break;
      }
      case 'SPLIT': args.push('--chromashift', String(amount)); break;
    }
  }
  return args;
}

/** Full farm reproduction command for the sidecar. */
export function stackToFarmCommand(stack, source = 'source.png', out = 'preview.png') {
  return ['python3 studio/print_post.py', source, ...stackToFarmArgs(stack), '-o', out].join(' ');
}
