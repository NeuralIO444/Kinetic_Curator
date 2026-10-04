/**
 * regionInstances.js — #725 slice 3 (pure): region-targeted kineme instances.
 *
 * A kineme addressed at a slot animates only that region. The render path
 * splits an asset's quad into per-region instances (flat list, one pass):
 * one instance per animated slot plus a remainder instance for everything
 * else. A region-ID mask texture (baked per atlas cell) clips each instance
 * to its region's pixels in the fragment shader.
 *
 * Instance .region: -1 = normal (no mask test), 0 = remainder (keep mask 0),
 * 1-4 = slot A-D (keep only that slot's pixels).
 */

import { REGION_SLOTS, normalizeRegionSlots, slotOfRegion } from './regionSlots.js';

/** 1-based slot index for the mask, matching REGION_SLOTS order. */
export const slotIndex = (slot) => REGION_SLOTS.indexOf(slot) + 1;

/**
 * Expand base instances into region instances.
 * @param {Array} instances - base instances ({asset, ...})
 * @param {Map} slotsByAsset - assetId -> normalized slot map
 * @param {Object} regionKineme - {assetId: {slot: kinemeId}} (sanitized)
 * @param {Function} getKineme - kinemeId -> def or undefined
 * @param {Object} regionCycle - {assetId: {slot: speed}} (sanitized, optional)
 * @returns {Array} instances with .region set; region instances also carry
 *   .regionKinemeId, .regionSlot, and .regionCycle (speed, 0 when none).
 *
 * A slot is "active" (gets a cutout) when it has a motion kineme OR a cycle
 * speed. The remainder keeps everything else.
 */
export function expandRegionInstances(instances, slotsByAsset, regionKineme, getKineme, regionCycle = null) {
  const out = [];
  for (const inst of instances) {
    const slots = slotsByAsset.get(inst.asset);
    const rk = regionKineme?.[inst.asset];
    const cy = regionCycle?.[inst.asset];
    const animated = [];
    if (slots && (rk || cy)) {
      for (const s of REGION_SLOTS) {
        if (!slots[s]) continue;
        const kid = rk && typeof rk === 'object' ? rk[s] : null;
        const speed = cy && typeof cy === 'object' ? Number(cy[s]) || 0 : 0;
        if ((kid && getKineme(kid)) || speed > 0) {
          animated.push({ slot: s, kinemeId: kid && getKineme(kid) ? kid : null, cycle: speed });
        }
      }
    }
    if (!animated.length) {
      out.push({ ...inst, region: -1 });
      continue;
    }
    // Remainder first (drawn under the region cutouts): keeps every pixel
    // whose mask is 0 — unassigned regions and assigned-but-static slots.
    out.push({ ...inst, region: 0 });
    for (const a of animated) {
      out.push({
        ...inst,
        region: slotIndex(a.slot),
        regionSlot: a.slot,
        regionKinemeId: a.kinemeId,
        regionCycle: a.cycle,
      });
    }
  }
  return out;
}

// Mask geometry: the live atlas cell is 400px for -50..150 (2px/unit), so
// the 0..100 asset box — where region detection runs at 200px, 2px/unit —
// lands 1:1 at pixel offset (100, 100). Keep in sync with liveAtlas.mjs.
export const MASK_CELL_PX = 400;
export const MASK_BOX_OFFSET = 100;
export const MASK_DETECT_PX = 200;

/**
 * Build a cell-sized slot mask from a detection result.
 * @param {{idMap: Int32Array, w: number, h: number, regions: Array}} cached
 * @param {Object} slots - normalized slot map (regionId -> slot)
 * @returns {Uint8Array} MASK_CELL_PX² bytes; 0 = no slot, 1-4 = slot A-D.
 */
export function buildRegionMask(cached, slots) {
  const out = new Uint8Array(MASK_CELL_PX * MASK_CELL_PX);
  if (!cached || !cached.idMap || cached.w !== MASK_DETECT_PX || cached.h !== MASK_DETECT_PX) return out;
  const norm = normalizeRegionSlots(slots);
  if (!REGION_SLOTS.some((s) => norm[s])) return out;
  const { idMap, regions } = cached;
  for (let y = 0; y < MASK_DETECT_PX; y++) {
    for (let x = 0; x < MASK_DETECT_PX; x++) {
      const ri = idMap[y * MASK_DETECT_PX + x];
      if (ri < 0) continue;
      const s = slotOfRegion(norm, regions[ri].id);
      if (!s) continue;
      out[(y + MASK_BOX_OFFSET) * MASK_CELL_PX + (x + MASK_BOX_OFFSET)] = slotIndex(s);
    }
  }
  return out;
}
