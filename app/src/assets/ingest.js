/**
 * Ingest / sanitize SVG for the project overlay (#113 / #115).
 * Never writes into the shipped 137. Live tab does not eval markup.
 */

const FORBIDDEN = /<script|foreignObject|<iframe|<object|<embed|<image|<img|\bon[a-z]+\s*=|javascript:|data:text\/html/i;
const REMOTE_HREF = /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i;
const STYLE_URL = /style\s*=\s*["'][^"']*url\s*\(/i;
const ENTITY = /<!ENTITY|&#/i;
const ALLOWED = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line',
  'defs', 'title', 'clippath', 'lineargradient', 'radialgradient', 'stop',
]);
const MAX_BYTES = 48_000;
const MAX_G_DEPTH = 24;
const ACCENT_HEX = /#e0245e|#ff2d95|#ff006e/gi;

export function stripAuthoringChrome(svg) {
  return String(svg || '')
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '')
    .replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/gi, '');
}

// ---- #1275: forgiving ingest ----

/**
 * SVG 1.1 presentation attributes we are willing to lift out of <style>
 * blocks. Deliberately narrow: anything else bails the whole stylesheet
 * back to stripping (yesterday's behavior).
 */
const SAFE_CSS_PROPS = new Set([
  'fill', 'fill-rule', 'fill-opacity',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'opacity', 'clip-rule',
]);

function isSafeCssValue(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 120) return false;
  // No quotes/brackets (attribute injection), no url()/javascript: (exfil),
  // no !important (cascade games). Keep it to flat paint values.
  return !/[<>"'&!]|url\s*\(|javascript:|expression\s*\(/i.test(s);
}

/**
 * Parse a stylesheet ONLY if it is nothing but simple `.class { decls }`
 * rules (Illustrator's default "Internal CSS" export). Returns
 * Map<className, Array<[prop, value]>> in source order, or null when
 * anything fancier appears — the caller then strips the block as before.
 */
function parseSimpleStylesheet(css) {
  const clean = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@/.test(clean)) return null;
  const rules = new Map();
  const ruleRe = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
  let m;
  let last = 0;
  while ((m = ruleRe.exec(clean))) {
    if (!/^\s*$/.test(clean.slice(last, m.index))) return null;
    last = ruleRe.lastIndex;
    const decls = [];
    for (const part of m[2].split(';')) {
      const t = part.trim();
      if (!t) continue;
      const ci = t.indexOf(':');
      if (ci < 0) return null;
      const prop = t.slice(0, ci).trim().toLowerCase();
      const val = t.slice(ci + 1).trim();
      if (!SAFE_CSS_PROPS.has(prop) || !isSafeCssValue(val)) return null;
      decls.push([prop, val]);
    }
    if (decls.length) rules.set(m[1], decls);
  }
  if (!/^\s*$/.test(clean.slice(last))) return null;
  return rules;
}

/**
 * Stamp converted declarations onto matching elements as presentation
 * attributes. Stylesheet order wins between classes (same specificity);
 * an attribute already on the element wins over any class (matches what
 * stripping the stylesheet used to render).
 */
function applyClassAttributes(svg, rules) {
  return String(svg || '').replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*?)(\/?)>/g,
    (full, name, attrs, selfClose) => {
      const cm = /\bclass\s*=\s*"([^"]*)"/.exec(attrs) || /\bclass\s*=\s*'([^']*)'/.exec(attrs);
      if (!cm) return full;
      const tokens = new Set(cm[1].split(/\s+/).filter(Boolean));
      let add = '';
      for (const [cls, decls] of rules) {
        if (!tokens.has(cls)) continue;
        for (const [prop, val] of decls) {
          if (new RegExp(`\\b${prop}\\s*=`, 'i').test(attrs + add)) continue;
          add += ` ${prop}="${val}"`;
        }
      }
      if (!add) return full;
      return `<${name}${attrs}${add}${selfClose ? '/' : ''}>`;
    }
  );
}

/**
 * Convert convertible <style> blocks to presentation attributes, then
 * strip whatever <style> remains. SVGs without <style> pass through
 * byte-identical.
 */
export function absorbStyleBlocks(svg) {
  let out = String(svg || '');
  for (const b of out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const rules = parseSimpleStylesheet(b[1]);
    if (rules && rules.size) out = applyClassAttributes(out, rules);
  }
  return out.replace(/<style[\s\S]*?<\/style>/gi, '');
}

function parseLength(v) {
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(px)?\s*$/i.exec(String(v ?? ''));
  return m ? parseFloat(m[1]) : NaN;
}

/**
 * Read the root <svg> coordinate bounds: viewBox wins, else width/height.
 * Returns { minx, miny, w, h } or null when unknown/malformed (no-op path).
 */
export function parseSvgBounds(openTag) {
  const tag = String(openTag || '');
  const vb = /viewBox\s*=\s*"([^"]*)"/i.exec(tag);
  if (vb) {
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every((n) => Number.isFinite(n)) && p[2] > 0 && p[3] > 0) {
      return { minx: p[0], miny: p[1], w: p[2], h: p[3] };
    }
    return null;
  }
  const w = /(?<![\w-])width\s*=\s*"([^"]*)"/i.exec(tag);
  const h = /(?<![\w-])height\s*=\s*"([^"]*)"/i.exec(tag);
  const W = w ? parseLength(w[1]) : NaN;
  const H = h ? parseLength(h[1]) : NaN;
  if (Number.isFinite(W) && W > 0 && Number.isFinite(H) && H > 0) {
    return { minx: 0, miny: 0, w: W, h: H };
  }
  return null;
}

const fmtN = (n) => String(Math.round(n * 10000) / 10000);
const FIT_BOX = 100;

/**
 * Map source bounds into the 0 0 100 100 tile box, aspect preserved,
 * centered. Strict no-op when bounds are null or already inside the box —
 * previously-good SVGs ingest byte-identical.
 */
export function fitInner(inner, bounds) {
  const s = String(inner || '');
  if (!bounds) return s;
  const { minx, miny, w, h } = bounds;
  if (minx >= 0 && miny >= 0 && minx + w <= FIT_BOX && miny + h <= FIT_BOX) return s;
  const k = Math.min(FIT_BOX / w, FIT_BOX / h);
  const tx = -minx * k + (FIT_BOX - w * k) / 2;
  const ty = -miny * k + (FIT_BOX - h * k) / 2;
  return `<g transform="translate(${fmtN(tx)},${fmtN(ty)}) scale(${fmtN(k)})">${s}</g>`;
}

/** Human fix suggestion per rejection. `hint` rides next to `error`; the error codes are unchanged. */
const ERROR_HINTS = {
  'empty': 'Nothing to import — drop an SVG file or paste SVG code',
  'too large': 'Over 48KB — simplify paths, or uncheck Preserve Illustrator Editing Capabilities on export',
  'too deep': 'Too many nested groups — ungroup a few levels in Illustrator and retry',
  'not svg': "That doesn't look like SVG — export it as .svg first",
  'overlay full': 'Asset pool is full (32) — remove one to make room',
  'raster image': "Embedded raster images aren't supported — vector shapes only",
  'hostile markup': 'Unsupported markup',
  'canon is read-only': "Built-in assets can't be replaced",
  'id taken': 'That name is already taken — pick another',
};

function tagHintFor(error) {
  const m = /^tag not allowed: (.+)$/.exec(error || '');
  if (!m) return undefined;
  const tag = m[1];
  if (tag === 'text') return 'Convert text to outlines (Illustrator: Type → Create Outlines)';
  if (tag === 'filter') return 'Remove or expand effects (Illustrator: Object → Expand Appearance)';
  if (tag === 'image') return "Embedded raster images aren't supported — vector shapes only";
  return `Unsupported <${tag}> element — expand or outline it in Illustrator and retry`;
}

export function errorHint(error) {
  return ERROR_HINTS[error] || tagHintFor(error);
}

function fail(error) {
  return { ok: false, error, hint: errorHint(error) };
}

export function isHostile(svg) {
  const s = String(svg || '');
  return FORBIDDEN.test(s) || REMOTE_HREF.test(s) || STYLE_URL.test(s) || ENTITY.test(s);
}

export function gDepth(svg) {
  let depth = 0;
  let max = 0;
  const re = /<\/?g\b/gi;
  let m;
  while ((m = re.exec(String(svg || '')))) {
    if (m[0].startsWith('</')) depth = Math.max(0, depth - 1);
    else {
      depth += 1;
      if (depth > max) max = depth;
    }
  }
  return max;
}

export function countSubpaths(svg) {
  const tags = String(svg || '').match(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/gi);
  return tags ? tags.length : 0;
}

/**
 * Showrunner asset cost score (§6): a cheap static proxy for rasterization
 * cost, computed once at ingest — never per frame.
 *
 *   cost = subpaths × (1 + groupDepth/8)
 *
 * Subpaths drive the per-frame SVG node count; nesting depth drives
 * transform/group overhead. The score is intentionally simple: it is a
 * triage signal for cheap-first ordering and cost-aware thinning, not a
 * benchmark.
 */
export function assetCostScore(svg) {
  const subpaths = countSubpaths(svg);
  const depth = gDepth(svg);
  return Math.round(subpaths * (1 + depth / 8));
}

/** Score above which ingest emits a (non-blocking) cost warning. */
export const COST_WARNING_THRESHOLD = 600;

export function overlayId(base) {
  const slug = String(base || 'motif').replace(/^user:/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  return `user:${slug}`;
}

export function ingestSvg(raw, { id, category = 'fragments', weight = 'medium' } = {}) {
  if (raw == null) return fail('empty');
  // #1275: absorb convertible <style> blocks instead of stripping them, so
  // Illustrator's default Internal-CSS export keeps its paint.
  let svg = absorbStyleBlocks(stripAuthoringChrome(String(raw).trim()));
  if (!svg) return fail('empty');
  if (svg.length > MAX_BYTES) return fail('too large');
  // #1275: raster <image> gets its own actionable error; everything else
  // hostile stays a generic rejection (don't coach attackers).
  if (/<image[\s>]/i.test(svg)) return fail('raster image');
  if (isHostile(svg)) return fail('hostile markup');

  const openTag = (svg.match(/<svg[^>]*>/i) || [''])[0];
  const bounds = parseSvgBounds(openTag);
  const inner0 = svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim() || svg;

  // Depth is measured pre-fit: the fit wrapper is one static transform we
  // add ourselves, never a reason to reject yesterday's artwork.
  if (gDepth(inner0) > MAX_G_DEPTH) return fail('too deep');
  if (!/<svg[\s>]|<path[\s>]|<g[\s>]/i.test(svg)) return fail('not svg');

  const tags = [...inner0.matchAll(/<\/?\s*([a-zA-Z0-9:-]+)/g)].map((m) => m[1].toLowerCase().replace(/:.*/, ''));
  for (const t of tags) {
    if (!t || t === '?xml' || t === '!--') continue;
    if (!ALLOWED.has(t)) return fail(`tag not allowed: ${t}`);
  }

  const inner1 = inner0.replace(ACCENT_HEX, 'var(--accent)');
  // #1275: map any artboard into the 0 0 100 100 tile box. No-op when the
  // content is already in-bounds, so previously-good SVGs stay byte-identical.
  const inner = fitInner(inner1, bounds);
  const paths = countSubpaths(inner);
  const costScore = assetCostScore(inner);

  return {
    ok: true,
    asset: {
      id: overlayId(id || 'ingest'),
      category,
      weight,
      tags: ['overlay'],
      compound: paths > 1,
      source: 'ingest',
      svg: inner,
      costScore,
      // Non-blocking heads-up: a pathological asset won't refuse ingest,
      // but the operator deserves to know it may cost frames.
      costWarning: costScore > COST_WARNING_THRESHOLD || undefined,
    },
  };
}

export function duplicateAsset(asset, takenIds = new Set()) {
  if (!asset || !asset.svg) return { ok: false, error: 'no asset' };
  let n = 2;
  let id = overlayId(`${String(asset.id).replace(/^user:/, '')}_${n}`);
  while (takenIds.has(id)) {
    n += 1;
    id = overlayId(`${String(asset.id).replace(/^user:/, '')}_${n}`);
  }
  return {
    ok: true,
    asset: {
      ...asset,
      id,
      source: 'duplicate',
      tags: [...new Set([...(asset.tags || []), 'overlay', 'duplicate'])],
    },
  };
}
