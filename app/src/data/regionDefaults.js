/**
 * regionDefaults.js — #1434 (per-region animation R3): the family defaults.
 *
 * Deterministic functions of region geometry (position, area) and the
 * asset's family (its `category`) — no ML, no taste verdicts: assignment
 * is data, not an opinion the UI performs. Matt's ruling (2026-10-14, on
 * #1434): family defaults ship ON. Regions arrive assigned; the artist
 * override (the doc-level `regionKinemes`, see data/regionKinemes.js)
 * exists to tame or replace them, not to switch motion on from zero.
 *
 * The family table (issue #1434 + the spec's R3):
 *   floral    outer regions sway — `rock` (the osc-kind kineme); the
 *             centre region pulses. Per-region phase is NOT carried
 *             here: playback derives it from the (asset, region) seed
 *             hash (#1433), so petals around a centre never share a
 *             phase — the issue's "phase by angle" by construction.
 *   radial    every region pulses (`pulse`) — "radial pulses".
 *   linework  stroke-shaped regions bend (`bend`, #1435 R4 — the pack
 *             subdivides them along their length, phase-stepped, so the
 *             motion travels the stroke); every other region bobs
 *             (`bob`) — the bob kineme rides the boil clock like every
 *             kineme. The stroke test is geometry (regionKinemes.js
 *             isStrokeRegion): a solid bar fills its bbox and keeps the
 *             bob; a squiggle wanders its box and bends.
 *   (others)  no default: the region is still. Silence is a valid
 *             state, and a family earns a default by being named in
 *             the table, not by analogy.
 *
 * Strip assets (authored cell tracks, #1431) are excluded: their frames
 * are whole-mark animation and cell kinemes own them — the same
 * exclusion the atlas bakers apply (#1433).
 *
 * Pure and browser-safe: the library bake (Node) and the import
 * auto-tag (browser store) run the very same functions.
 */

import { stripFramesFor } from './cellKinemes.js';
import { capRegionsTracked } from '../assets/regionPartition.js';
import { normalizeRegions } from '../assets/regionSlots.js';
import { REGION_TAG_CAP, isStrokeRegion } from './regionKinemes.js';

/** The kineme each family role defaults to (ids from data/kinemes.js). */
export const FAMILY_DEFAULT_KINEMES = Object.freeze({
  sway: 'rock', // osc kind — flora outer regions
  pulse: 'pulse', // the centre, and radial everywhere
  bob: 'bob', // linework under boil
  bend: 'bend', // #1435 R4 — linework strokes: the travelling bend
});

/**
 * The centre region of a mark: the region whose centroid sits nearest
 * the area-weighted centroid of all regions (the mark's centre of ink).
 * Ties break by record order. Pure; null for an empty record list.
 */
export function centreRegionId(regions) {
  if (!Array.isArray(regions) || !regions.length) return null;
  let total = 0, mx = 0, my = 0;
  for (const r of regions) { total += r.area; mx += r.cx * r.area; my += r.cy * r.area; }
  if (!(total > 0)) return regions[0].id;
  mx /= total; my /= total;
  let best = null, bd = Infinity;
  for (const r of regions) {
    const d = (r.cx - mx) ** 2 + (r.cy - my) ** 2;
    if (d < bd) { bd = d; best = r.id; }
  }
  return best;
}

/**
 * The family-default assignment for one asset: { [regionId]: kinemeId },
 * or null when the family has no default (or the asset is a strip, or
 * it has no regions). This is what the bake writes onto the record and
 * what an import receives on arrival.
 *
 * @param {{id: string, category?: string}} asset
 * @param {Array} regions — the asset's (already capped) region records
 */
export function familyDefaultRegionKinemes(asset, regions) {
  if (!asset || typeof asset.id !== 'string') return null;
  if (!Array.isArray(regions) || !regions.length) return null;
  if (stripFramesFor(asset.id)) return null; // authored cell track owns it
  const out = {};
  switch (asset.category) {
    case 'floral': {
      const centre = centreRegionId(regions);
      for (const r of regions) out[r.id] = r.id === centre ? FAMILY_DEFAULT_KINEMES.pulse : FAMILY_DEFAULT_KINEMES.sway;
      break;
    }
    case 'radial':
      for (const r of regions) out[r.id] = FAMILY_DEFAULT_KINEMES.pulse;
      break;
    case 'linework':
      for (const r of regions) {
        out[r.id] = isStrokeRegion(r) ? FAMILY_DEFAULT_KINEMES.bend : FAMILY_DEFAULT_KINEMES.bob;
      }
      break;
    default:
      return null; // no default in the table: still
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The import pipeline's region step (#1434, Matt's ruling: imports are
 * auto-tagged on arrival — the same pipeline a library asset gets at
 * bake). Hand it the asset and the detector's raw regions; it returns
 * what lands on the record: the regions capped at REGION_TAG_CAP (the
 * tracked cap merge — the bake's own implementation) plus the family
 * defaults for those capped records. `regionKinemes` is null when the
 * family has no default, so callers omit the field.
 */
export function tagImportedRegions(asset, detectedRegions) {
  const clean = normalizeRegions(detectedRegions);
  const kept = capRegionsTracked(clean, REGION_TAG_CAP).kept;
  return { regions: kept, regionKinemes: familyDefaultRegionKinemes(asset, kept) };
}
