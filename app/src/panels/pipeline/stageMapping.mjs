// stageMapping.mjs — #607 STAGE Phase B.
// Source→destination rect mapping for the stage window: Fit / Fill / 1:1.
// Pure: no DOM, no Tauri, no store. The stage window draws with these rects.

export const STAGE_MAPPINGS = ['fit', 'fill', '1:1'];
export const DEFAULT_STAGE_MAPPING = 'fit';

/** Coerce anything hostile/legacy to a real mapping; never throws. */
export function sanitizeStageMapping(m) {
  return STAGE_MAPPINGS.includes(m) ? m : DEFAULT_STAGE_MAPPING;
}

/**
 * Compute the destination rect (in destination pixels) for a source frame.
 * @returns {{dx:number, dy:number, dw:number, dh:number}} — may extend past
 *   the destination edges for 'fill' (the stage window crops by drawing).
 */
export function computeStageRect(srcW, srcH, dstW, dstH, mapping) {
  const sw = Math.max(1, Math.floor(Number(srcW) || 0));
  const sh = Math.max(1, Math.floor(Number(srcH) || 0));
  const dw = Math.max(1, Math.floor(Number(dstW) || 0));
  const dh = Math.max(1, Math.floor(Number(dstH) || 0));
  const mode = sanitizeStageMapping(mapping);
  if (mode === 'fill') {
    const s = Math.max(dw / sw, dh / sh);
    const w = sw * s;
    const h = sh * s;
    return { dx: (dw - w) / 2, dy: (dh - h) / 2, dw: w, dh: h };
  }
  if (mode === '1:1') {
    return { dx: (dw - sw) / 2, dy: (dh - sh) / 2, dw: sw, dh: sh };
  }
  // fit — the default: whole frame visible, letterboxed.
  const s = Math.min(dw / sw, dh / sh);
  const w = sw * s;
  const h = sh * s;
  return { dx: (dw - w) / 2, dy: (dh - h) / 2, dw: w, dh: h };
}

/** Human label for the mapping chips. */
export function stageMappingLabel(m) {
  const mode = sanitizeStageMapping(m);
  return mode === '1:1' ? '1:1' : mode.toUpperCase();
}
