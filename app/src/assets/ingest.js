/**
 * Ingest / sanitize SVG for the project overlay (#113 / #115).
 * Never writes into the shipped 137. Live tab does not eval markup.
 */

const FORBIDDEN = /<script|foreignObject|iframe|object|embed|image|img|onload=|onerror=|onclick=|javascript:/i;
const ALLOWED = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line',
  'defs', 'title', 'clippath', 'lineargradient', 'radialgradient', 'stop',
]);
const MAX_BYTES = 48_000;
const ACCENT_HEX = /#e0245e|#ff2d95|#ff006e/gi;

export function stripAuthoringChrome(svg) {
  return String(svg || '')
    .replace(/<\?xml[^>]*>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '')
    .replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/gi, '');
}

export function isHostile(svg) {
  return FORBIDDEN.test(String(svg || ''));
}

export function countSubpaths(svg) {
  const tags = String(svg || '').match(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/gi);
  return tags ? tags.length : 0;
}

export function overlayId(base) {
  const slug = String(base || 'motif').replace(/^user:/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  return `user:${slug}`;
}

export function ingestSvg(raw, { id, category = 'fragments', weight = 'medium' } = {}) {
  if (raw == null) return { ok: false, error: 'empty' };
  let svg = stripAuthoringChrome(String(raw).trim());
  if (!svg) return { ok: false, error: 'empty' };
  if (svg.length > MAX_BYTES) return { ok: false, error: 'too large' };
  if (isHostile(svg)) return { ok: false, error: 'hostile markup' };
  if (!/<svg[\s>]|<path[\s>]|<g[\s>]/i.test(svg)) return { ok: false, error: 'not svg' };

  const tags = [...svg.matchAll(/<\/?\s*([a-zA-Z0-9:-]+)/g)].map((m) => m[1].toLowerCase().replace(/:.*/, ''));
  for (const t of tags) {
    if (!t || t === '?xml' || t === '!--') continue;
    if (!ALLOWED.has(t)) return { ok: false, error: `tag not allowed: ${t}` };
  }

  svg = svg.replace(ACCENT_HEX, 'var(--accent)');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim() || svg;
  const paths = countSubpaths(inner);

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
