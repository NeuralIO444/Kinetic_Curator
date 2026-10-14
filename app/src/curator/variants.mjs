// variants.mjs — #1530 (Look Explorer E5): Davis variants.
//
// The library is 294 hand-authored assets whose `svg` is a fragment
// string on a 100×100 box. This engine breeds NEW marks from them by
// seeded string math: a variant is a RECIPE { parents, op, seed,
// params }, and generating the recipe is a pure function — same
// recipe + same library = the same svg string, forever, on any
// machine. By render time a variant is an ordinary asset record
// (an svg string + the lead parent's placement fields), so the
// standard bake renders it with no explorer-only tricks: stills =
// live by construction, replay is exact, and generation happens at
// DEAL time in the offline miner — never per frame, never in the
// live loop. Its cost declaration is VARIANT_GENERATION below: the
// governor's ladder governs live effects; this work is offline
// string math with zero live cost.
//
// Ops (the issue's set, at the granularity the library actually has —
// 136 of 294 assets carry no <path> at all; they are circles, rects,
// lines, text. So transforms act on the whole fragment, and only the
// two ops that are meaningless without path geometry — jitter and
// morph — are path ops, with declared domains):
//   transform (one parent)
//     symmetry — dihedral rosette: the fragment repeated by rotation
//                (and optionally reflection) about the box centre
//     tile     — a ring of shrunken copies, each rotated to face out
//     restyle  — paint restyle: accent-swap / outline / dash / ghost /
//                weight, rewritten on the fragment's own attributes
//     jitter   — every geometry coordinate perturbed within a stated
//                tolerance by the recipe's own seeded stream
//   combine (two parents)
//     superpose — both bodies in one box; the second under a seeded
//                rotate/scale/shift
//     mask     — the lead's silhouette (its filled geometry) clips
//                the second parent's linework, via clipPath
//     splice   — the parents' drawing streams alternate, segment by
//                segment (path nodes split into subpaths first)
//     morph    — pointwise interpolation, ONLY where the two parents'
//                path structures are identical (pathSignature
//                equality — the honest subset; superpose and mask
//                carry the load everywhere else)
//
// Category law (the issue's ruling): a variant inherits its LEAD
// parent's category; combine provenance records both parents.
// Variant-ness is provenance in v1, NOT a feature-space axis —
// recipeFeatures never hears about variants (FEATURES_VERSION
// untouched); the miner featurizes a variant at its lead parent's
// coordinates. Nothing here promotes a variant into the library:
// a variant record exists only where a recipe is carried (a run, a
// crowned keep's provenance). There is no auto-promotion code path.
import { mulberry32 } from './coverageReport.mjs';

export const VARIANT_ID_PREFIX = 'var_';
export const TRANSFORM_OPS = Object.freeze(['symmetry', 'tile', 'restyle', 'jitter']);
export const COMBINE_OPS = Object.freeze(['superpose', 'mask', 'splice', 'morph']);
export const VARIANT_OPS = Object.freeze([...TRANSFORM_OPS, ...COMBINE_OPS]);
/** Ops that are meaningless without <path> geometry on the lead. */
export const PATH_OPS = Object.freeze(['jitter', 'morph']);
export const RESTYLE_MODES = Object.freeze(['accent-swap', 'outline', 'dash', 'ghost', 'weight']);
export const DASH_PATTERNS = Object.freeze(['5 4', '2 3', '9 3 2 3', '1 4']);
/** Where generation happens, declared: offline, at deal time. */
export const VARIANT_GENERATION = Object.freeze({
  at: 'deal-time', perFrame: false, liveCost: 'none', tier: 'offline',
});
export const MAX_VARIANTS_PER_RECORD = 256; // the cast cap (FAVORITE_CAST_MAX)

const CENTER = 50; // assets are authored on a 100×100 box
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Canonical number formatting: 3 decimals, no -0, no exponents —
 * the same input formats to the same string on every JS engine. */
export const fmt = (n) => {
  const r = Math.round((Number(n) || 0) * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const r3 = (v) => Math.round(v * 1000) / 1000;

// ── ids ─────────────────────────────────────────────────────────────
// FNV-1a, two 32-bit lanes over the canonical recipe string. Ids
// need stability and collision-resistance, not cryptography.
function fnv1a(str, basis) {
  let h = basis >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Canonical recipe JSON (params keys sorted) — the id's input and
 * the sanitizer's comparison shape. */
export function canonicalRecipe(recipe) {
  const params = {};
  for (const k of Object.keys(recipe?.params || {}).sort()) params[k] = recipe.params[k];
  return JSON.stringify({
    parents: [...(recipe?.parents || [])], op: recipe?.op, seed: recipe?.seed, params,
  });
}

export function variantIdFor(recipe) {
  const c = canonicalRecipe(recipe);
  return `${VARIANT_ID_PREFIX}${fnv1a(c, 0x811c9dc5)}${fnv1a(c, 0x01000193 ^ 0x811c9dc5)}`;
}

export const isVariantId = (id) => typeof id === 'string' && /^var_[0-9a-f]{16}$/.test(id);

// ── recipe validation (the provenance boundary's shape) ─────────────
const PARAM_RULES = {
  symmetry: { folds: ['int', 2, 8], mirror: ['bool'] },
  tile: { count: ['int', 2, 6], radius: ['num', 0, 30], scale: ['num', 0.2, 1] },
  restyle: { mode: ['enum', RESTYLE_MODES], dash: ['int', 0, DASH_PATTERNS.length - 1] },
  jitter: { amount: ['num', 0.05, 4] },
  superpose: {
    rot: ['num', -180, 180], scaleB: ['num', 0.3, 2], dx: ['num', -30, 30], dy: ['num', -30, 30],
  },
  mask: {},
  splice: {},
  morph: { t: ['num', 0, 1] },
};

function sanitizeParams(op, raw) {
  if (!isPlainObject(raw)) return null;
  const rules = PARAM_RULES[op];
  const out = {};
  for (const [key, rule] of Object.entries(rules)) {
    const v = raw[key];
    if (v === undefined) return null; // a declared param is required — no silent defaults
    if (rule[0] === 'int') {
      if (!Number.isFinite(v)) return null;
      out[key] = Math.min(rule[2], Math.max(rule[1], Math.floor(v)));
    } else if (rule[0] === 'num') {
      if (!Number.isFinite(v)) return null;
      out[key] = r3(Math.min(rule[2], Math.max(rule[1], v)));
    } else if (rule[0] === 'bool') {
      if (typeof v !== 'boolean') return null;
      out[key] = v;
    } else if (rule[0] === 'enum') {
      if (!rule[1].includes(v)) return null;
      out[key] = v;
    }
  }
  return out;
}

/**
 * Sanitize a variant recipe: { parents, op, seed, params } with the
 * op's declared params only (unknown keys dropped), or null when the
 * shape is not a recipe (unknown op, wrong parent count, bad seed,
 * missing/invalid params). Shape-level, like sanitizeCast: whether
 * the parents exist in the shipped library is the generator's check,
 * not the boundary's.
 */
export function sanitizeRecipe(raw) {
  if (!isPlainObject(raw)) return null;
  if (!VARIANT_OPS.includes(raw.op)) return null;
  const arity = TRANSFORM_OPS.includes(raw.op) ? 1 : 2;
  if (!Array.isArray(raw.parents) || raw.parents.length !== arity) return null;
  const parents = raw.parents.map((p) => (typeof p === 'string' && p && p.length <= 80 ? p : null));
  if (parents.some((p) => p === null)) return null;
  if (arity === 2 && parents[0] === parents[1]) return null;
  if (!Number.isFinite(raw.seed)) return null;
  const seed = Math.floor(raw.seed);
  if (seed < 0 || seed > 0xffffffff) return null;
  const params = sanitizeParams(raw.op, raw.params);
  if (!params) return null;
  return { parents, op: raw.op, seed, params };
}

/** A recipe is valid iff it is already in canonical sanitized shape. */
export function isRecipe(raw) {
  const clean = sanitizeRecipe(raw);
  return clean !== null && canonicalRecipe(clean) === canonicalRecipe(raw);
}

// ── fragment structure ──────────────────────────────────────────────
const TAG_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*?>/g;

/** Split an svg fragment into its top-level nodes (raw strings,
 * leading inter-node whitespace rides with the node it precedes). */
export function splitNodes(svg) {
  const s = String(svg || '');
  const nodes = [];
  let depth = 0;
  let nodeStart = 0;
  TAG_RE.lastIndex = 0;
  let m;
  const push = (end) => {
    const raw = s.slice(nodeStart, end);
    if (raw.trim()) nodes.push(raw);
    nodeStart = end;
  };
  while ((m = TAG_RE.exec(s))) {
    const tag = m[0];
    if (tag.startsWith('<!--')) continue;
    const closing = tag.startsWith('</');
    const selfClosing = /\/>$/.test(tag);
    if (depth === 0 && !closing) {
      if (nodeStart < m.index && s.slice(nodeStart, m.index).trim()) push(m.index);
      if (selfClosing) { push(TAG_RE.lastIndex); continue; }
      depth = 1;
      continue;
    }
    if (closing) depth--;
    else if (!selfClosing) depth++;
    if (depth === 0 && closing) push(TAG_RE.lastIndex);
  }
  if (nodeStart < s.length && s.slice(nodeStart).trim()) push(s.length);
  return nodes;
}

export const nodeTag = (node) => {
  const m = /^<\/?\s*([a-zA-Z][\w:-]*)/.exec(String(node || ''));
  return m ? m[1].toLowerCase() : '';
};

/** Spans of <defs>…</defs> in a fragment (their contents are paint
 * definitions, not geometry — geometry rewriting skips them). */
function defsSpans(s) {
  const spans = [];
  const re = /<defs\b[^>]*>[\s\S]*?<\/defs>/g;
  let m;
  while ((m = re.exec(s))) spans.push([m.index, m.index + m[0].length]);
  return spans;
}
const inSpans = (spans, i) => spans.some(([a, b]) => i >= a && i < b);

// ── path data: parse to absolute segments, serialize canonically ────
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const TOKEN_RE = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/g;

/**
 * Parse path data into absolute segments:
 * [{ c:'M'|'L'|'C'|'Q'|'A'|'Z', p:[...] }] — H/V/S/T and all relative
 * forms are normalized away (S/T by control-point reflection), so
 * two paths are structurally comparable and pointwise interpolable.
 * Null on anything malformed or unsupported — never a guess.
 */
export function parsePath(d) {
  if (typeof d !== 'string' || !d.trim()) return null;
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  let covered = '';
  while ((m = TOKEN_RE.exec(d))) {
    covered += m[0];
    tokens.push(m[1] ? { cmd: m[1] } : { num: parseFloat(m[2]) });
  }
  if (covered.replace(/[\s,]/g, '') !== d.replace(/[\s,]/g, '')) return null;
  const segs = [];
  let i = 0;
  let cmd = null;
  let cx = 0; let cy = 0; let sx = 0; let sy = 0;
  let prevC2 = null; let prevQ1 = null;
  const readNums = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i + k];
      if (!t || t.num === undefined || !Number.isFinite(t.num)) return null;
      out.push(t.num);
    }
    i += n;
    return out;
  };
  while (i < tokens.length) {
    if (tokens[i].cmd) { cmd = tokens[i].cmd; i++; }
    if (!cmd) return null;
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (upper === 'Z') {
      segs.push({ c: 'Z', p: [] });
      cx = sx; cy = sy; prevC2 = prevQ1 = null;
      cmd = null;
      continue;
    }
    const arity = ARITY[upper];
    if (arity === undefined) return null;
    const v = readNums(arity);
    if (!v) return null;
    const ox = rel ? cx : 0; const oy = rel ? cy : 0;
    if (upper === 'M') {
      cx = v[0] + ox; cy = v[1] + oy; sx = cx; sy = cy;
      segs.push({ c: 'M', p: [cx, cy] });
      prevC2 = prevQ1 = null;
      cmd = rel ? 'l' : 'L'; // implicit repeats of M are linetos
    } else if (upper === 'L') {
      cx = v[0] + ox; cy = v[1] + oy;
      segs.push({ c: 'L', p: [cx, cy] });
      prevC2 = prevQ1 = null;
    } else if (upper === 'H') {
      cx = v[0] + (rel ? cx : 0);
      segs.push({ c: 'L', p: [cx, cy] });
      prevC2 = prevQ1 = null;
    } else if (upper === 'V') {
      cy = v[0] + (rel ? cy : 0);
      segs.push({ c: 'L', p: [cx, cy] });
      prevC2 = prevQ1 = null;
    } else if (upper === 'C') {
      const p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy];
      segs.push({ c: 'C', p });
      prevC2 = [p[2], p[3]]; prevQ1 = null;
      cx = p[4]; cy = p[5];
    } else if (upper === 'S') {
      const c1 = prevC2 ? [2 * cx - prevC2[0], 2 * cy - prevC2[1]] : [cx, cy];
      const p = [c1[0], c1[1], v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy];
      segs.push({ c: 'C', p });
      prevC2 = [p[2], p[3]]; prevQ1 = null;
      cx = p[4]; cy = p[5];
    } else if (upper === 'Q') {
      const p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy];
      segs.push({ c: 'Q', p });
      prevQ1 = [p[0], p[1]]; prevC2 = null;
      cx = p[2]; cy = p[3];
    } else if (upper === 'T') {
      const c1 = prevQ1 ? [2 * cx - prevQ1[0], 2 * cy - prevQ1[1]] : [cx, cy];
      const p = [c1[0], c1[1], v[0] + ox, v[1] + oy];
      segs.push({ c: 'Q', p });
      prevQ1 = [p[0], p[1]]; prevC2 = null;
      cx = p[2]; cy = p[3];
    } else if (upper === 'A') {
      const p = [v[0], v[1], v[2], v[3], v[4], v[5] + ox, v[6] + oy];
      segs.push({ c: 'A', p });
      prevC2 = prevQ1 = null;
      cx = p[5]; cy = p[6];
    }
  }
  return segs.length ? segs : null;
}

export function serializePath(segs) {
  return segs.map((s) => (s.c === 'Z' ? 'Z' : `${s.c} ${s.p.map(fmt).join(' ')}`)).join(' ');
}

/** Split absolute segments into subpaths (each starts with M). */
function splitSubpaths(segs) {
  const out = [];
  let cur = null;
  for (const s of segs) {
    if (s.c === 'M') { cur = [s]; out.push(cur); } else if (cur) cur.push(s);
    else { cur = [{ c: 'M', p: [0, 0] }, s]; out.push(cur); }
  }
  return out;
}

/** The path nodes of a fragment: [{ node, d }] for each top-level
 * <path>. Nested paths (inside <g>) ride their group as one node —
 * path ops address top-level paths, the library's own granularity. */
export function pathNodesOf(svg) {
  return splitNodes(svg)
    .filter((n) => nodeTag(n) === 'path')
    .map((node) => {
      const m = /\bd\s*=\s*"([^"]*)"/.exec(node) || /\bd\s*=\s*'([^']*)'/.exec(node);
      return { node, d: m ? m[1] : null };
    })
    .filter((p) => p.d !== null);
}

export const hasPaths = (svg) => pathNodesOf(svg).length > 0;

/**
 * The morph compatibility rule, stated once: two parents are
 * morphable iff their top-level path sequences have the same length
 * and identical absolutized command signatures, path by path. The
 * signature is the evidence; anything else is not a morph.
 */
export function pathSignature(svg) {
  const paths = pathNodesOf(svg);
  if (!paths.length) return null;
  const sigs = [];
  for (const { d } of paths) {
    const segs = parsePath(d);
    if (!segs) return null;
    sigs.push(segs.map((s) => s.c).join(''));
  }
  return sigs.join('|');
}

export const morphCompatible = (svgA, svgB) => {
  const a = pathSignature(svgA);
  return a !== null && a === pathSignature(svgB);
};

// ── attribute rewriting (leaf geometry + paint) ─────────────────────
const LEAF_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline', 'text']);
const LEAF_RE = /<([a-zA-Z][\w:-]*)\b[^>]*?>/g;

function rewriteLeafTags(svg, fn) {
  const s = String(svg || '');
  const spans = defsSpans(s);
  LEAF_RE.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = LEAF_RE.exec(s))) {
    if (inSpans(spans, m.index)) continue;
    if (!LEAF_TAGS.has(m[1].toLowerCase())) continue;
    out += s.slice(last, m.index) + fn(m[0]);
    last = m.index + m[0].length;
  }
  return out + s.slice(last);
}

const getAttr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag)
    || new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`).exec(tag);
  return m ? m[1] : null;
};
const setAttr = (tag, name, value) => {
  const re = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*')`);
  if (re.test(tag)) return tag.replace(re, `${name}="${value}"`);
  return tag.replace(/\s*\/?>$/, (e) => ` ${name}="${value}"${e.trim() === '/>' || e.includes('/') ? '/>' : '>'}`);
};
const hasAttr = (tag, name) => new RegExp(`\\b${name}\\s*=`).test(tag);

// ── the ops ─────────────────────────────────────────────────────────
function opSymmetry(frag, { folds, mirror }) {
  const parts = [];
  for (let i = 0; i < folds; i++) {
    const a = fmt((i * 360) / folds);
    parts.push(i === 0 ? frag : `<g transform="rotate(${a} ${CENTER} ${CENTER})">${frag}</g>`);
    if (mirror) {
      const t = `rotate(${a} ${CENTER} ${CENTER}) translate(100 0) scale(-1 1)`;
      parts.push(`<g transform="${t}">${frag}</g>`);
    }
  }
  return parts.join('');
}

function opTile(frag, { count, radius, scale }) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = fmt((i * 360) / count);
    const t = `translate(${CENTER} ${CENTER}) rotate(${a}) translate(0 ${fmt(-radius)}) scale(${fmt(scale)}) translate(-${CENTER} -${CENTER})`;
    parts.push(`<g transform="${t}">${frag}</g>`);
  }
  return parts.join('');
}

const INK_TOK = 'var(--ink)';
const ACCENT_TOK = 'var(--accent)';
function opRestyle(frag, { mode, dash }) {
  if (mode === 'ghost') return `<g opacity="0.55">${frag}</g>`;
  if (mode === 'accent-swap') {
    if (!frag.includes(INK_TOK) && !frag.includes(ACCENT_TOK)) return null;
    const HOLD = '\u0001INK\u0001';
    return frag
      .split(INK_TOK).join(HOLD)
      .split(ACCENT_TOK).join(INK_TOK)
      .split(HOLD).join(ACCENT_TOK);
  }
  let touched = false;
  const out = rewriteLeafTags(frag, (tag) => {
    if (mode === 'outline') {
      const fill = getAttr(tag, 'fill');
      if (fill === null || fill === 'none' || fill.startsWith('url(')) return tag;
      touched = true;
      let t = setAttr(tag, 'fill', 'none');
      if (!hasAttr(t, 'stroke')) t = setAttr(t, 'stroke', INK_TOK);
      if (!hasAttr(t, 'stroke-width')) t = setAttr(t, 'stroke-width', '1.6');
      return t;
    }
    if (mode === 'dash') {
      if (!hasAttr(tag, 'stroke')) return tag;
      touched = true;
      return setAttr(tag, 'stroke-dasharray', DASH_PATTERNS[dash] || DASH_PATTERNS[0]);
    }
    if (mode === 'weight') {
      const w = getAttr(tag, 'stroke-width');
      if (w === null || !Number.isFinite(parseFloat(w))) return tag;
      touched = true;
      return setAttr(tag, 'stroke-width', fmt(parseFloat(w) * 1.8));
    }
    return tag;
  });
  return touched ? out : null;
}

function opJitter(frag, { amount, seed }) {
  const rng = mulberry32(seed >>> 0);
  const off = () => r3((rng() * 2 - 1) * amount);
  let touched = false;
  const out = rewriteLeafTags(frag, (tag) => {
    const name = (/^<([a-zA-Z][\w:-]*)/.exec(tag) || [])[1]?.toLowerCase();
    if (name === 'path') {
      const d = getAttr(tag, 'd');
      const segs = d && parsePath(d);
      if (!segs) return tag;
      touched = true;
      for (const s of segs) {
        if (s.c === 'A') { s.p[5] += off(); s.p[6] += off(); } // endpoint only — radii/flags are structure
        else for (let k = 0; k + 1 < s.p.length; k += 2) { s.p[k] += off(); s.p[k + 1] += off(); }
      }
      return setAttr(tag, 'd', serializePath(segs));
    }
    const bump = (t, attr) => {
      const v = getAttr(t, attr);
      if (v === null || !Number.isFinite(parseFloat(v))) return t;
      touched = true;
      return setAttr(t, attr, fmt(parseFloat(v) + off()));
    };
    let t = tag;
    if (name === 'circle' || name === 'ellipse' || name === 'text') { t = bump(t, 'cx'); t = bump(t, 'cy'); t = bump(t, 'x'); t = bump(t, 'y'); }
    else if (name === 'rect') { t = bump(t, 'x'); t = bump(t, 'y'); }
    else if (name === 'line') { t = bump(t, 'x1'); t = bump(t, 'y1'); t = bump(t, 'x2'); t = bump(t, 'y2'); }
    else if (name === 'polygon' || name === 'polyline') {
      const pts = getAttr(t, 'points');
      if (pts) {
        const nums = pts.trim().split(/[\s,]+/).map(Number);
        if (nums.length >= 2 && nums.every(Number.isFinite)) {
          touched = true;
          for (let k = 0; k + 1 < nums.length; k += 2) { nums[k] += off(); nums[k + 1] += off(); }
          t = setAttr(t, 'points', nums.map(fmt).join(' '));
        }
      }
    }
    return t;
  });
  return touched ? out : null;
}

function opSuperpose(fragA, fragB, { rot, scaleB, dx, dy }) {
  const identity = rot === 0 && scaleB === 1 && dx === 0 && dy === 0;
  if (identity) return fragA + fragB;
  const t = `translate(${CENTER} ${CENTER}) translate(${fmt(dx)} ${fmt(dy)}) rotate(${fmt(rot)}) scale(${fmt(scaleB)}) translate(-${CENTER} -${CENTER})`;
  return `${fragA}<g transform="${t}">${fragB}</g>`;
}

function opMask(fragA, fragB, recipe) {
  const clipId = `vclip_${variantIdFor(recipe).slice(VARIANT_ID_PREFIX.length)}`;
  return `<clipPath id="${clipId}">${fragA}</clipPath><g clip-path="url(#${clipId})">${fragB}</g>`;
}

function drawableStream(svg) {
  const out = [];
  for (const node of splitNodes(svg)) {
    if (nodeTag(node) === 'path') {
      const m = /\bd\s*=\s*"([^"]*)"/.exec(node) || /\bd\s*=\s*'([^']*)'/.exec(node);
      const segs = m && parsePath(m[1]);
      if (segs && splitSubpaths(segs).length > 1) {
        for (const sub of splitSubpaths(segs)) {
          out.push(node.replace(/\bd\s*=\s*("[^"]*"|'[^']*')/, `d="${serializePath(sub)}"`));
        }
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

function opSplice(fragA, fragB) {
  const a = drawableStream(fragA);
  const b = drawableStream(fragB);
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out.join('');
}

function opMorph(fragA, fragB, { t }) {
  if (!morphCompatible(fragA, fragB)) return null;
  const aPaths = pathNodesOf(fragA);
  const bPaths = pathNodesOf(fragB);
  let pi = 0;
  const out = [];
  for (const node of splitNodes(fragA)) {
    if (nodeTag(node) !== 'path') { out.push(node); continue; }
    const aSegs = parsePath(aPaths[pi].d);
    const bSegs = parsePath(bPaths[pi].d);
    pi++;
    const mixed = aSegs.map((s, k) => {
      const o = bSegs[k];
      if (s.c === 'Z') return s;
      const p = s.p.map((v, j) => {
        if (s.c === 'A' && j >= 2 && j <= 4) return j === 2 ? v + (o.p[j] - v) * t : (t < 0.5 ? v : o.p[j]);
        return v + (o.p[j] - v) * t;
      });
      return { c: s.c, p };
    });
    out.push(node.replace(/\bd\s*=\s*("[^"]*"|'[^']*')/, `d="${serializePath(mixed)}"`));
  }
  return out.join('');
}

const OPS = {
  symmetry: (a, b, r) => opSymmetry(a, r.params),
  tile: (a, b, r) => opTile(a, r.params),
  restyle: (a, b, r) => opRestyle(a, r.params),
  jitter: (a, b, r) => opJitter(a, { ...r.params, seed: r.seed }),
  superpose: (a, b, r) => opSuperpose(a, b, r.params),
  mask: (a, b, r) => opMask(a, b, r),
  splice: (a, b) => opSplice(a, b),
  morph: (a, b, r) => opMorph(a, b, r.params),
};

/** Would this op produce a real variant of these parents? (The
 * miner's dealing asks before it commits a recipe; generation
 * itself answers null the same way.) */
export function opApplicable(op, svgA, svgB) {
  if (!VARIANT_OPS.includes(op) || typeof svgA !== 'string' || !svgA) return false;
  if (COMBINE_OPS.includes(op) && (typeof svgB !== 'string' || !svgB)) return false;
  if (op === 'jitter') return hasPaths(svgA) || /<(circle|ellipse|rect|line|polygon|polyline|text)\b/.test(svgA);
  if (op === 'morph') return morphCompatible(svgA, svgB);
  if (op === 'restyle') return true; // mode-level applicability is generation's null
  return true;
}

/**
 * Generate a recipe's svg string. Pure in (recipe, library):
 * returns the fragment, or null when the recipe is invalid, a
 * parent is unknown, or the op does not apply to these parents
 * (the morph rule above all). Callers treat null as an honest
 * failure, never a repair target.
 */
export function generateVariantSvg(recipe, assetsById) {
  const clean = sanitizeRecipe(recipe);
  if (!clean || canonicalRecipe(clean) !== canonicalRecipe(recipe)) return null;
  const a = assetsById?.get(clean.parents[0]);
  if (!a || typeof a.svg !== 'string' || !a.svg) return null;
  let b = null;
  if (COMBINE_OPS.includes(clean.op)) {
    b = assetsById?.get(clean.parents[1]);
    if (!b || typeof b.svg !== 'string' || !b.svg) return null;
  }
  const svg = OPS[clean.op](a.svg, b?.svg ?? null, clean);
  return typeof svg === 'string' && svg ? svg : null;
}

/**
 * The variant as an asset record: the lead parent's placement
 * fields (category, tags + 'variant', weight, density, scale,
 * rotate) carrying the generated svg. Deliberately NOT carried:
 * the lead's baked region mattes (they describe the lead's shape,
 * not the variant's) and any live-pool identity — this record
 * exists only where a recipe is carried.
 */
export function variantRecord(recipe, assetsById) {
  const svg = generateVariantSvg(recipe, assetsById);
  if (svg === null) return null;
  const lead = assetsById.get(recipe.parents[0]);
  return {
    id: variantIdFor(recipe),
    category: lead.category,
    tags: [...(Array.isArray(lead.tags) ? lead.tags : []), 'variant'],
    weight: lead.weight,
    density: lead.density,
    scale: lead.scale,
    rotate: lead.rotate,
    svg,
    variant: recipe,
    generation: VARIANT_GENERATION,
  };
}

/** The recipe's lead parent id (category accounting resolves here). */
export const leadParentOf = (recipe) => recipe?.parents?.[0] ?? null;

/**
 * Draw a recipe's params from a stream (the miner's dealing draws
 * in this fixed per-op order). Ranges are the ops' honest spans —
 * the same spans sanitizeRecipe clamps to.
 */
export function drawVariantParams(op, rng) {
  const rr = (lo, hi) => r3(lo + rng() * (hi - lo));
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  switch (op) {
    case 'symmetry': return { folds: ri(2, 6), mirror: rng() < 0.5 };
    case 'tile': return { count: ri(3, 6), radius: rr(8, 26), scale: rr(0.3, 0.65) };
    case 'restyle': return { mode: RESTYLE_MODES[ri(0, RESTYLE_MODES.length - 1)], dash: ri(0, DASH_PATTERNS.length - 1) };
    case 'jitter': return { amount: rr(0.6, 2.8) };
    case 'superpose': return { rot: ri(-180, 180), scaleB: rr(0.5, 1.5), dx: ri(-20, 20), dy: ri(-20, 20) };
    case 'mask': return {};
    case 'splice': return {};
    case 'morph': return { t: rr(0.2, 0.8) };
    default: return null;
  }
}
