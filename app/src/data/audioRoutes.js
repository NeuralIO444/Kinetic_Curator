// audioRoutes.js — the scene's audio route table: sanitizer (#790 PR2).
//
// `audioRoutes` is scene-level state like the sun (light) and KINEME
// assignments: one table for the whole piece, saved in the project, NOT carried
// by voices and never lerped by MIX. The evaluator lives in gl/audioRoutes.mjs.
//
//   null → the default table (today's hardcoded routes); nothing is saved
//   []   → the user deleted every route (valid, saved: audio drives nothing)
//   [..] → a custom table
//
// Browser-safe, pure. The one trust boundary for the field (project import,
// store setter, undo): anything unrecognised is dropped, never passed through.
import { DEFAULT_ROUTES, ROUTE_INPUTS, ROUTE_TARGETS, MAX_ROUTES } from '../gl/audioRoutes.mjs';

const pairKey = (r) => `${r.input}>${r.target}`;
const DEFAULT_BY_PAIR = new Map(DEFAULT_ROUTES.map((r) => [pairKey(r), r.depth]));

/** Largest |depth| a route may carry: the target's own output ceiling. */
const maxDepth = (target) => ROUTE_TARGETS[target].clamp[1];

/** Is this table the default (same routes, any order, same depths)? */
export function isDefaultRoutes(routes) {
  if (!Array.isArray(routes) || routes.length !== DEFAULT_ROUTES.length) return false;
  return routes.every((r) => {
    const d = DEFAULT_BY_PAIR.get(pairKey(r));
    return d !== undefined && Math.abs(d - r.depth) < 1e-9;
  });
}

/**
 * Normalize a raw route table.
 * @returns {Array<{input:string,target:string,depth:number}>|null}
 *   null = default/absent/garbage; [] = explicitly no routes.
 */
export function sanitizeAudioRoutes(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (out.length >= MAX_ROUTES) break;
    if (!r || typeof r !== 'object') continue;
    if (!ROUTE_INPUTS.includes(r.input) || !Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, r.target)) continue;
    const depth = Number(r.depth);
    if (!Number.isFinite(depth)) continue;
    const key = pairKey(r);
    if (seen.has(key)) continue; // identity is the input+target pair: first one wins
    seen.add(key);
    const max = maxDepth(r.target);
    out.push({ input: r.input, target: r.target, depth: Math.min(max, Math.max(-max, depth)) });
  }
  // A non-empty array with nothing usable is garbage, not "delete every route".
  if (out.length === 0) return null;
  return isDefaultRoutes(out) ? null : out;
}
