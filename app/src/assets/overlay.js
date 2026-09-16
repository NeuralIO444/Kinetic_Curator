import { ingestSvg, duplicateAsset, isHostile, overlayId } from './ingest.js';

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

export function ingestIntoOverlay(rawSvg, overlay, hint = 'ingest') {
  const clean = sanitizeOverlay(overlay);
  if (clean.length >= OVERLAY_CAP) return { ok: false, error: 'overlay full', overlay: clean };
  const taken = new Set(clean.map((a) => a.id));
  let base = String(hint || 'ingest').replace(/\.svg$/i, '');
  let parsed = ingestSvg(rawSvg, { id: base });
  if (!parsed.ok) return { ok: false, error: parsed.error, overlay: clean };
  let n = 2;
  while (taken.has(parsed.asset.id)) {
    parsed = ingestSvg(rawSvg, { id: `${base}_${n}` });
    n += 1;
    if (!parsed.ok) return { ok: false, error: parsed.error, overlay: clean };
  }
  const asset = { ...parsed.asset, source: 'ingest', tags: [...new Set([...(parsed.asset.tags || []), 'overlay', 'ingest'])] };
  return { ok: true, asset, overlay: [...clean, asset] };
}

export function removeFromOverlay(id, overlay) {
  if (!String(id).startsWith('user:')) return { ok: false, error: 'canon is read-only', overlay: sanitizeOverlay(overlay) };
  return { ok: true, overlay: sanitizeOverlay(overlay).filter((a) => a.id !== id) };
}

export function renameOverlayAsset(id, nextName, overlay) {
  if (!String(id).startsWith('user:')) return { ok: false, error: 'canon is read-only', overlay: sanitizeOverlay(overlay) };
  const clean = sanitizeOverlay(overlay);
  const nextId = overlayId(nextName || 'motif');
  if (clean.some((a) => a.id === nextId && a.id !== id)) return { ok: false, error: 'id taken', overlay: clean };
  return {
    ok: true,
    overlay: clean.map((a) => (a.id === id ? { ...a, id: nextId } : a)),
    from: id,
    to: nextId,
  };
}

export function replaceOverlayAsset(id, rawSvg, overlay) {
  if (!String(id).startsWith('user:')) return { ok: false, error: 'canon is read-only', overlay: sanitizeOverlay(overlay) };
  const clean = sanitizeOverlay(overlay);
  const parsed = ingestSvg(rawSvg, { id: String(id).replace(/^user:/, '') });
  if (!parsed.ok) return { ok: false, error: parsed.error, overlay: clean };
  const asset = { ...parsed.asset, id, source: 'replace' };
  return {
    ok: true,
    overlay: clean.map((a) => (a.id === id ? asset : a)),
    asset,
  };
}
