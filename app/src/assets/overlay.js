import { ingestSvg, duplicateAsset, isHostile } from './ingest.js';

export const OVERLAY_CAP = 32;

export function sanitizeOverlay(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    if (out.length >= OVERLAY_CAP) break;
    if (isHostile(raw.svg)) continue;
    const id = String(raw.id || '');
    if (!id.startsWith('user:')) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      category: raw.category || 'fragments',
      weight: raw.weight || 'medium',
      tags: Array.isArray(raw.tags) ? raw.tags : ['overlay'],
      compound: !!raw.compound,
      source: raw.source || 'overlay',
      svg: String(raw.svg),
    });
  }
  return out;
}

export function mergePool(canon, overlay) {
  return [...canon, ...sanitizeOverlay(overlay)];
}

export function duplicateIntoOverlay(source, overlay) {
  const clean = sanitizeOverlay(overlay);
  const taken = new Set(clean.map((a) => a.id));
  const copy = duplicateAsset(source, taken);
  if (!copy.ok) return { ok: false, error: copy.error, overlay: clean };
  if (clean.length >= OVERLAY_CAP) return { ok: false, error: 'overlay full', overlay: clean };
  const checked = ingestSvg(`<svg>${copy.asset.svg}</svg>`, { id: copy.asset.id.replace(/^user:/, '') });
  const asset = checked.ok
    ? { ...copy.asset, svg: checked.asset.svg, compound: checked.asset.compound }
    : copy.asset;
  return { ok: true, asset, overlay: [...clean, asset] };
}
