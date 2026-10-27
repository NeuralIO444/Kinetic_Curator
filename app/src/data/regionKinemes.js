/**
 * regionKinemes.js — #1433 (per-region animation R2): the playback-side
 * surface for per-region kinemes.
 *
 * R2 consumes exactly this much: for an asset, its tagged region records
 * (R1's bake, #1432) and an assignment of kineme ids to region ids. The
 * assignment DATA — family defaults, the asset-tools editor — is R3
 * (#1434); this module is the sanitizer + resolver both stages share, so
 * the shape is fixed here: { [regionId]: kinemeId } per asset, kineme
 * ids from the #781 library (data/kinemes.js), region ids from the
 * asset's own records.
 *
 * Sources, in winning order: a project document's `regionKinemes`
 * ({ [assetId]: { [regionId]: kinemeId } } — the artist's override, the
 * same doc-level pattern as `assetKineme`) over the asset record's own
 * `regionKinemes` field (R3's family defaults, #1434 — baked for the
 * library, auto-tagged onto imports on arrival). A doc entry of `null`
 * is the artist's tombstone: that region is deliberately still, and the
 * default does not come back until the override is cleared.
 *
 * Browser-safe, pure. No Math.random, no Date.now: phases are the house
 * seed hash over (asset id, region id), so copies and regions never
 * move in lockstep and a kept render replays exactly.
 */

import { ASSETS } from './assets/index.js';
import { getKineme, kinemePhase } from './kinemes.js';

/** Bake tags at most this many regions per asset (Matt's ruling on #1433, 2026-10-14). */
export const REGION_TAG_CAP = 12;

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

/**
 * The region records an asset carries (R1's bake / overlay imports), or null.
 * An explicit `record` (an overlay asset from a document's customAssets)
 * wins over the built-in catalogue — that is how custom `user:` assets
 * resolve: the contract learns their regions from the document, not the
 * catalogue (#1434 closes the gap R2 flagged).
 */
export function regionsForAsset(assetId, record) {
  if (record && Array.isArray(record.regions) && record.regions.length) return record.regions;
  const r = BY_ID.get(assetId)?.regions;
  return Array.isArray(r) && r.length ? r : null;
}

/**
 * Sanitize one asset's raw region → kineme assignment against its region
 * records. Unknown region ids, unknown kineme ids, and anything past
 * the tag cap are dropped. Returns null when nothing valid remains, so
 * callers can omit the field entirely (the sanitizeAssetKineme pattern).
 */
export function sanitizeRegionKinemes(raw, records) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(records) || !records.length) return null;
  const valid = new Set(records.map((r) => r.id));
  const out = {};
  for (const [regionId, kid] of Object.entries(raw)) {
    if (typeof regionId !== 'string' || !valid.has(regionId)) continue;
    if (typeof kid !== 'string' || !getKineme(kid)) continue;
    out[regionId] = kid;
    if (Object.keys(out).length >= REGION_TAG_CAP) break;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The effective assignment for one asset: the record's own defaults
 * (R3's field — baked family defaults for the library, auto-tagged
 * defaults for imports) under the doc's per-region overrides. A doc
 * entry of `null` is a tombstone: the artist set that region still on
 * purpose, so the key is REMOVED from the merged map (the default does
 * not leak back). Null when the asset has no regions or nothing is
 * assigned — including the all-tombstoned case, which is exactly the
 * pre-R3 still state.
 *
 * @param {string} assetId
 * @param {object} [docRegionKinemes] — the doc's whole { assetId: {...} } map
 * @param {object} [record] — an overlay asset record (regions + defaults)
 */
export function regionAssignmentFor(assetId, docRegionKinemes, record) {
  const records = regionsForAsset(assetId, record);
  if (!records) return null;
  const rec = record && Array.isArray(record.regions) && record.regions.length ? record : BY_ID.get(assetId);
  const base = sanitizeRegionKinemes(rec?.regionKinemes, records);
  const rawOver = docRegionKinemes && typeof docRegionKinemes === 'object' ? docRegionKinemes[assetId] : null;
  const over = sanitizeRegionKinemes(rawOver, records);
  if (!base && !over && !rawOver) return null;
  const merged = { ...(base || {}), ...(over || {}) };
  if (rawOver && typeof rawOver === 'object' && !Array.isArray(rawOver)) {
    const valid = new Set(records.map((r) => r.id));
    for (const [regionId, v] of Object.entries(rawOver)) {
      if (v === null && valid.has(regionId)) delete merged[regionId];
    }
  }
  return Object.keys(merged).length ? merged : null;
}

/**
 * Sanitize a project document's whole `regionKinemes` map (the trust
 * boundary in projectDocument.js). Unlike the record-level sanitizer,
 * `null` values SURVIVE: they are the artist's tombstones (region set
 * deliberately still), and dropping them on load would resurrect the
 * family default the artist killed. Unknown kineme ids, non-string
 * keys, and anything past the per-asset tag cap are dropped. Returns
 * null when nothing valid remains, so callers can omit the field.
 */
export function sanitizeRegionKinemesDoc(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [assetId, per] of Object.entries(raw)) {
    if (typeof assetId !== 'string' || !assetId) continue;
    if (!per || typeof per !== 'object' || Array.isArray(per)) continue;
    const clean = {};
    for (const [regionId, v] of Object.entries(per)) {
      if (typeof regionId !== 'string' || !regionId) continue;
      if (v === null) clean[regionId] = null;
      else if (typeof v === 'string' && getKineme(v)) clean[regionId] = v;
      if (Object.keys(clean).length >= REGION_TAG_CAP) break;
    }
    if (Object.keys(clean).length) out[assetId] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The governor's selection (#1433, amended ruling): which ASSIGNED
 * regions animate individually within the budget. Mechanical cost
 * logic, not curation: the largest regions win (the most visible motion
 * per instance of cost), ties break by the record order R1 committed.
 * Deterministic for a given (records, assignment, budget).
 *
 * @returns {Set<string>} region ids that animate; assigned regions not
 *   in the set render merged (at rest) — the mark always draws complete.
 */
export function selectAnimatedRegions(records, assignment, budget) {
  const picked = new Set();
  const n = Math.max(0, Math.floor(Number(budget) || 0));
  if (!n || !assignment) return picked;
  const order = records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => assignment[r.id])
    .sort((a, b) => b.r.area - a.r.area || a.i - b.i);
  for (const { r } of order.slice(0, n)) picked.add(r.id);
  return picked;
}

/** Per-region phase in [0, 1): the house seed hash of (asset id, region id). */
export function regionKinemePhase(assetId, regionId) {
  return kinemePhase(assetId, regionId);
}

/**
 * #1435 (R4) — is this region a STROKE: a long, thin run of ink, as
 * opposed to a blob that fills its box? Two measured properties of the
 * committed record, nothing else: the bbox's long axis spans at least
 * STROKE_MIN_LONG units of the 100-unit asset box (a travelling bend
 * needs length to travel along), and the ink fills at most STROKE_MAX_FILL
 * of the bbox (a curve wandering its box, not a slab — a solid bar IS
 * its bbox at fill ~1.0 and stays a bob; a squiggle measures ~0.15).
 * `area` is the record's ink count on the canonical 200x200 raster, so
 * the fill ratio is area over the bbox's raster area. Pure geometry:
 * the bake, the contract, and the suites all read the same answer from
 * the same record.
 */
export const STROKE_MIN_LONG = 28;
export const STROKE_MAX_FILL = 0.3;

export function isStrokeRegion(record) {
  if (!record) return false;
  const w = (record.x1 - record.x0) * 100;
  const h = (record.y1 - record.y0) * 100;
  const long = Math.max(w, h);
  if (!(long >= STROKE_MIN_LONG)) return false;
  const bboxPx = (record.x1 - record.x0) * 200 * ((record.y1 - record.y0) * 200);
  if (!(bboxPx > 0)) return false;
  return record.area / bboxPx <= STROKE_MAX_FILL;
}

/**
 * #1435 (R4) — how many slices the bend cuts a stroke region into along
 * its length: one slice per ~14 units of long axis, clamped to [3, 8]
 * (3 is the fewest that articulates; 8 keeps the instance multiplication
 * bounded — the slices are full-price instances and the governor sees
 * the true count). Deterministic in the record, like the stroke test.
 */
export function bendSlicesFor(record) {
  if (!record) return 0;
  const long = Math.max((record.x1 - record.x0) * 100, (record.y1 - record.y0) * 100);
  return Math.max(3, Math.min(8, Math.round(long / 14)));
}
