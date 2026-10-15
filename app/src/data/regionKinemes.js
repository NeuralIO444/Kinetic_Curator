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
 * `regionKinemes` field (where R3's family defaults will live).
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

/** The region records an asset carries (R1's bake / overlay imports), or null. */
export function regionsForAsset(assetId) {
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
 * (R3's field, absent until #1434) under the doc's per-region
 * overrides. Null when the asset has no regions or nothing is assigned.
 *
 * @param {string} assetId
 * @param {object} [docRegionKinemes] — the doc's whole { assetId: {...} } map
 */
export function regionAssignmentFor(assetId, docRegionKinemes) {
  const records = regionsForAsset(assetId);
  if (!records) return null;
  const base = sanitizeRegionKinemes(BY_ID.get(assetId)?.regionKinemes, records);
  const over = sanitizeRegionKinemes(
    docRegionKinemes && typeof docRegionKinemes === 'object' ? docRegionKinemes[assetId] : null,
    records,
  );
  if (!base && !over) return null;
  return { ...(base || {}), ...(over || {}) };
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
    .sort((a, b) => (b.r.area - a.r.area) || (a.i - b.i));
  for (const { r } of order.slice(0, n)) picked.add(r.id);
  return picked;
}

/** Per-region phase in [0, 1): the house seed hash of (asset id, region id). */
export function regionKinemePhase(assetId, regionId) {
  return kinemePhase(assetId, regionId);
}
