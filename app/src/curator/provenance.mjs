// provenance.mjs — #1507 (Explorer E3): where a keep-shaped record came from.
//
// Spec §5: a mined candidate carries
//   provenance: { source: 'explorer', run: <runId>, corner: <profileId|'wilderness'>, axes: {...} }
// alongside the standard #1140 keep shape, so the ledger can tell
// mined ≠ rolled ≠ hand-built forever. This module is the one place that
// shape is sanitized and read — the trust boundary for it, in the same
// spirit as davisSlice.sanitizeFavorite (records arrive from files and
// from storage; neither is trusted past this door).
//
// Absent stays absent: a hand-built or dice-crowned record has NO
// provenance key, and none is invented here.
import { PERSONA_TASTES } from './personaTastes.js';

export const PROVENANCE_SOURCES = Object.freeze(['explorer']);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const shortStr = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** The corner's product-surface word (renderProfiles display policy: the
 * TE-style alias, never the artist's name). Wilderness stays wilderness. */
const ALIAS_BY_CORNER = new Map(PERSONA_TASTES.map((t) => [t.id, t.alias]));
export function cornerWord(corner) {
  if (corner === 'wilderness') return 'wilderness';
  return ALIAS_BY_CORNER.get(corner) ?? (typeof corner === 'string' && corner ? corner : 'wilderness');
}

/** Axes are telemetry: bounded strings and one bounded count, nothing else. */
function sanitizeAxes(raw) {
  if (!isPlainObject(raw)) return undefined;
  const axes = {};
  const layout = shortStr(raw.layout, 40);
  const palette = shortStr(raw.palette, 80);
  if (layout) axes.layout = layout;
  if (palette) axes.palette = palette;
  if (Number.isFinite(raw.castSize)) axes.castSize = Math.max(0, Math.min(256, Math.floor(raw.castSize)));
  return Object.keys(axes).length ? axes : undefined;
}

/**
 * Sanitize a provenance block. Returns a clean { source, run, corner, axes? }
 * or undefined when the input is not a recognizable provenance (unknown
 * source, missing run) — an unrecognized origin is dropped whole, never
 * half-kept.
 */
export function sanitizeProvenance(raw) {
  if (!isPlainObject(raw)) return undefined;
  if (!PROVENANCE_SOURCES.includes(raw.source)) return undefined;
  const run = shortStr(raw.run, 80);
  if (!run) return undefined;
  const corner = shortStr(raw.corner, 40) ?? 'wilderness';
  const axes = sanitizeAxes(raw.axes);
  return { source: raw.source, run, corner, ...(axes ? { axes } : {}) };
}

/** Shape predicate for validators (the taste ledger's row check). */
export function isProvenance(o) {
  if (!isPlainObject(o)) return false;
  if (!PROVENANCE_SOURCES.includes(o.source)) return false;
  if (typeof o.run !== 'string' || !o.run) return false;
  if (typeof o.corner !== 'string' || !o.corner) return false;
  if (o.axes !== undefined && !isPlainObject(o.axes)) return false;
  return true;
}

/** Mined = carries explorer provenance. Rolled and hand-built carry none. */
export const isMined = (rec) => rec?.provenance?.source === 'explorer';

/**
 * The plain-word provenance line (spec §3 step 5): "radial cast · hydra
 * palette · SPECIMEN corner". Segments are omitted when their fact is
 * absent — the line never invents a cast or a palette.
 *   assetsById: Map<id, asset> (for the cast's dominant category)
 *   palettesById: Map<id, palette> (for the palette's catalog name)
 */
export function provenanceLabel(rec, { assetsById, palettesById } = {}) {
  const prov = rec?.provenance;
  if (!prov) return '';
  const parts = [];
  const assets = Array.isArray(rec?.config?.assets) ? rec.config.assets : [];
  if (assets.length && assetsById) {
    const counts = new Map();
    for (const id of assets) {
      const cat = assetsById.get(id)?.category;
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    let best = null;
    let bestN = 0;
    for (const [cat, n] of counts) if (n > bestN) { best = cat; bestN = n; }
    if (best) parts.push(`${best} cast`);
  }
  const paletteId = rec?.config?.palette?.id;
  if (paletteId) {
    const name = palettesById?.get(paletteId)?.name;
    parts.push(`${name ? name.toLowerCase() : paletteId} palette`);
  }
  parts.push(prov.corner === 'wilderness' ? 'wilderness' : `${cornerWord(prov.corner)} corner`);
  return parts.join(' · ');
}
