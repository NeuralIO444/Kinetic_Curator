import { ingestSvg, duplicateAsset, isHostile, overlayId } from './ingest.js';
import { sanitizeGradient } from './gradient.js';

export const OVERLAY_CAP = 32;

/**
 * #701/#708 — this is the ONE trust boundary a custom asset's `gradient`
 * field crosses: everything else (duplicateAsset spreading `...asset`,
 * mergePool reading `asset.gradient` off canon or overlay alike) already
 * carries an object-shaped field through untouched. A project file is
 * untrusted input, so the field is re-validated here with the same
 * sanitizeGradient the bakers trust — never passed through raw. Omitted
 * (not `null`) when absent or invalid, so an asset with no gradient is
 * indistinguishable from one that never had the field, and `hasGradient()`
 * / the `raw.gradient` checks in liveLoop.mjs stay false as intended.
 */
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
    const gradient = sanitizeGradient(raw.gradient);
    out.push({
      id,
      category: raw.category || 'fragments',
      weight: raw.weight || 'medium',
      tags: Array.isArray(raw.tags) ? raw.tags : ['overlay'],
      compound: !!raw.compound,
      source: raw.source || 'overlay',
      svg: String(raw.svg),
      ...(gradient ? { gradient } : {}),
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

export function ingestIntoOverlay(rawSvg, overlay, hint = 'ingest', opts = {}) {
  const clean = sanitizeOverlay(overlay);
  if (clean.length >= OVERLAY_CAP) return { ok: false, error: 'overlay full', overlay: clean };
  const taken = new Set(clean.map((a) => a.id));
  let base = String(hint || 'ingest').replace(/\.svg$/i, '');
  const source = opts.source || 'ingest';
  const ingestOpts = { id: base };
  if (opts.category) ingestOpts.category = opts.category;
  if (opts.weight) ingestOpts.weight = opts.weight;
  let parsed = ingestSvg(rawSvg, ingestOpts);
  if (!parsed.ok) return { ok: false, error: parsed.error, overlay: clean };
  let n = 2;
  while (taken.has(parsed.asset.id)) {
    parsed = ingestSvg(rawSvg, { ...ingestOpts, id: `${base}_${n}` });
    n += 1;
    if (!parsed.ok) return { ok: false, error: parsed.error, overlay: clean };
  }
  const asset = { ...parsed.asset, source, tags: [...new Set([...(parsed.asset.tags || []), 'overlay', source])] };
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
