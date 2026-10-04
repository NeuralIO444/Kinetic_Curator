/**
 * regionSlots.js — #725 slice 2 (pure): region slot bookkeeping.
 *
 * Four fixed slots (A/B/C/D, Matt Q2). One region per slot; a region lives
 * in at most one slot. Slot assignments are keyed by stable region ID, so
 * a redraw that keeps the flat color preserves them; a recolor breaks them
 * (new ID — Matt Q4: acceptable).
 */

export const REGION_SLOTS = Object.freeze(['A', 'B', 'C', 'D']);

/** Empty slot map. */
export function emptyRegionSlots() {
  return { A: null, B: null, C: null, D: null };
}

const isSlot = (s) => REGION_SLOTS.includes(s);
const isRegionId = (id) => typeof id === 'string' && /^rm-[0-9a-f]{6}-\d+-\d+(-\d+)?$/.test(id);

/**
 * Normalize a raw slot map (from storage / ingest). Drops unknown slots,
 * malformed IDs, and double-booked regions (first slot wins, A→D).
 */
export function normalizeRegionSlots(raw) {
  const out = emptyRegionSlots();
  if (!raw || typeof raw !== 'object') return out;
  const taken = new Set();
  for (const s of REGION_SLOTS) {
    const id = raw[s];
    if (!isRegionId(id) || taken.has(id)) continue;
    taken.add(id);
    out[s] = id;
  }
  return out;
}

/**
 * Assign a region to a slot (regionId null = unassign the slot).
 * A region already in another slot is moved. Returns a new slot map.
 */
export function assignRegionSlot(slots, slot, regionId) {
  if (!isSlot(slot)) return normalizeRegionSlots(slots);
  if (regionId !== null && !isRegionId(regionId)) return normalizeRegionSlots(slots);
  const out = normalizeRegionSlots(slots);
  for (const s of REGION_SLOTS) {
    if (out[s] === regionId) out[s] = null;
  }
  out[slot] = regionId;
  return out;
}

/** Which slot (if any) holds the region. */
export function slotOfRegion(slots, regionId) {
  const n = normalizeRegionSlots(slots);
  for (const s of REGION_SLOTS) if (n[s] === regionId) return s;
  return null;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Normalize a raw region list (from storage). Keeps well-formed regions;
 * drops anything malformed. IDs are NOT re-derived here — they were
 * assigned at detect time and must survive round-trips byte-identical.
 */
export function normalizeRegions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    if (!isRegionId(r.id) || seen.has(r.id)) continue;
    if (typeof r.color !== 'string' || !/^[0-9a-f]{6}$/.test(r.color)) continue;
    if (![r.cx, r.cy, r.x0, r.y0, r.x1, r.y1].every(isNum)) continue;
    if (!Number.isInteger(r.area) || r.area <= 0) continue;
    seen.add(r.id);
    out.push({
      id: r.id, color: r.color,
      cx: r.cx, cy: r.cy, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1,
      area: r.area,
    });
  }
  return out;
}
