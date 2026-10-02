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

// ── editing helpers (#790 PR4) — pure; the UI and the store compose these ──

/** The table being edited: the scene's table, or a fresh copy of the default. */
export function editableRoutes(routes) {
  return Array.isArray(routes) ? routes.map((r) => ({ ...r })) : DEFAULT_ROUTES.map((r) => ({ ...r }));
}

/** A sensible starting depth per target (natural units, well inside its ceiling). */
export const NEW_ROUTE_DEPTH = Object.freeze({
  'render.scale': 0.2, 'render.alpha': 10, 'render.breath': 0.03, 'render.glow': 0.5,
  'render.hue': 15, 'render.squash': 0.2, 'render.kineme': 0.5, 'render.accum': 4, 'render.sun': 0.2,
});

/** Slider bounds and step for a target's route depth. */
export function routeDepthRange(target) {
  const max = ROUTE_TARGETS[target].clamp[1];
  return { min: -max, max, step: max >= 60 ? 0.5 : max >= 1 ? 0.01 : 0.001 };
}

/** The depth a double-click resets a route to: its default-table value, else the new-route depth. */
export function defaultDepthFor(input, target) {
  return DEFAULT_BY_PAIR.get(`${input}>${target}`) ?? NEW_ROUTE_DEPTH[target];
}

/**
 * The next route to add: the first (input, target) pair the table doesn't
 * already hold, preferring `input` when given (clicking a meter band). Null when
 * the table is full or every pair is taken.
 */
export function nextRoute(table, input = null) {
  if (!Array.isArray(table) || table.length >= MAX_ROUTES) return null;
  const taken = new Set(table.map(pairKey));
  const inputs = input ? [input, ...ROUTE_INPUTS.filter((i) => i !== input)] : ['band.air', ...ROUTE_INPUTS.filter((i) => i !== 'band.air')];
  for (const i of inputs) {
    for (const t of Object.keys(ROUTE_TARGETS)) {
      if (!taken.has(`${i}>${t}`)) return { input: i, target: t, depth: NEW_ROUTE_DEPTH[t] };
    }
  }
  return null;
}

/** Table with route `i` patched. A patch that would duplicate another route's pair is refused (table returned as is). */
export function patchRoute(table, i, patch) {
  if (!table[i]) return table;
  const next = { ...table[i], ...patch };
  if (table.some((r, j) => j !== i && pairKey(r) === pairKey(next))) return table;
  return table.map((r, j) => (j === i ? next : r));
}

/** Table without route `i`. */
export function removeRoute(table, i) {
  return table.filter((_, j) => j !== i);
}
