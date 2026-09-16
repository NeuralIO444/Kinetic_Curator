/**
 * Ingest / sanitize SVG for the project overlay (#113 / #115).
 * Never writes into the shipped 137. Live tab does not eval markup.
 */

const FORBIDDEN = /<script|foreignObject|iframe|object|embed|image|img|use\s|onload=|onerror=|onclick=|javascript:/i;
const ALLOWED = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'defs', 'title',
]);
const MAX_BYTES = 48_000;

const ACCENT_HEX = /#e0245e|#ff2d95|#ff006e/gi;

export function isHostile(svg) {
  return FORBIDDEN.test(String(svg || ''));
}

export function countSubpaths(svg) {
  const s = String(svg || '');
  const tags = s.match(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/gi);
  return tags ? tags.length : 0;
}

export function overlayId(base) {
  const slug = String(base || 'motif').replace(/^user:/, '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  return `user:${slug}`;
}

export function ingestSvg(raw, { id, category = 'fragments', weight = 'medium' } = {}) {
  if (raw == null) return { ok: false, error: 'empty' };
  const svg = String(raw).trim();
  if (!svg) return { ok: false, error: 'empty' };
  if (svg.length > MAX_BYTES) return { ok: false, error: 'too large' };
  if (isHostile(svg)) return { ok: false, error: 'hostile markup' };
  if (!/<svg[\s>]|<path[\s>]|<g[\s>]/i.test(svg)) return { ok: false, error: 'not svg' };

  const tags = [...svg.matchAll(/<\/\s*([a-z0-9]+)|<([a-z0-9]+)/gi)].map((m) => (m[1] || m[2]).toLowerCase());
  for (const t of tags) {
    if (!ALLOWED.has(t) && t !== '?xml') {
      return { ok: false, error: `tag not allowed: ${t}` };
    }
  }

  let body = svg
    .replace(/<\?xml[^>]*>/i, '')
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(ACCENT_HEX, 'var(--accent)');

  const inner = body.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').trim() || body;
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
