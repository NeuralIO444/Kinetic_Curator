// Project-document normalization helpers — dependency-neutral on purpose.
//
// projectDocument.js needs these, and so does slices/globalSlice.js
// (applyProject). globalSlice ← projectDocument would close an import
// cycle (projectDocument → slices/layersSlice → globalSlice), so the
// shared helpers live here: this module imports only leaf modules
// (data/layout-modes, data/assets, data/quality, fx/fxFilters,
// engine/kernel/rng → engine/prng) and is safe to import from anywhere.
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeFxEffects } from '../fx/fxFilters.js';
import { ASSETS } from '../data/assets/index.js';
import { QUALITY_PRESETS } from '../data/quality.js';
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';

/** #103 Track B — the live loop resolves every layer per frame; cap hostile docs. */
export const MAX_LAYERS = 16;

/**
 * #456 — mirrors `slices/layersSlice.js`'s `MAX_CONTENT_TRACKS`. Not imported
 * from there: layersSlice → globalSlice → this module is an existing cycle
 * this file's own header comment calls out, so the value is duplicated
 * rather than imported. The UI enforces the cap at creation time only; a
 * hand-edited or legacy document can still carry more content tracks than
 * the cap allows, which would otherwise silently violate the tape-budget/
 * governor contract that assumes it holds.
 */
export const MAX_CONTENT_TRACKS = 4;

/**
 * #269 — cap hostile CA grids from project snapshots. Real grids are 40×28
 * (davisSlice); a 1000×1000 grid otherwise survives parsing, bloating every
 * undo snapshot (~2 MB each) and stalling first render on the blur cache in
 * registry.js. Oversized or ragged grids are rejected to null — CA mode then
 * degrades to random sampling via the `if (!caGrid) return random(ctx)`
 * fallback in the CA sampler.
 */
export const MAX_CA_GRID_DIM = 256;

function sanitizeCaGrid(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CA_GRID_DIM) return null;
  const out = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length === 0 || row.length > MAX_CA_GRID_DIM) return null;
    // #644 — cell values must be numeric before they reach the field
    // generator: coerce numeric strings, and replace anything non-finite
    // (NaN, Infinity, garbage) with 0 instead of letting it poison the CA.
    out.push(row.map((cell) => {
      const n = typeof cell === 'number' ? cell : Number(cell);
      return Number.isFinite(n) ? n : 0;
    }));
  }
  return out;
}

const KNOWN_ASSET_IDS = new Set(ASSETS.map((a) => a.id));

/**
 * Keep only keys the store can actually use: catalog asset ids plus the
 * document's own sanitized custom assets (ids are `user:`-prefixed and capped
 * by OVERLAY_CAP in sanitizeOverlay). A hostile 100k-key map collapses to
 * the known set instead of bloating the store on apply.
 */
export function sanitizeEnabledAssets(raw, customAssets = []) {
  if (!raw || typeof raw !== 'object') return null;
  const customIds = new Set(
    (Array.isArray(customAssets) ? customAssets : [])
      .map((a) => a && a.id)
      .filter((id) => typeof id === 'string' && id.startsWith('user:')),
  );
  const out = {};
  for (const key of Object.keys(raw)) {
    if (KNOWN_ASSET_IDS.has(key) || customIds.has(key)) out[key] = !!raw[key];
  }
  return out;
}

/**
 * Weight overrides apply to catalog assets only; unknown keys are dropped.
 * The store's weight cycle is the strings 'light'/'medium'/'heavy'
 * (globalSlice WEIGHT_CYCLE) — accept those verbatim; anything else falls
 * back to the neutral weight ('light' === SELECTION_WEIGHT 1).
 */
const WEIGHT_STRINGS = new Set(['light', 'medium', 'heavy']);
export function sanitizeAssetWeightOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of Object.keys(raw)) {
    if (!KNOWN_ASSET_IDS.has(key)) continue;
    out[key] = WEIGHT_STRINGS.has(raw[key]) ? raw[key] : 'light';
  }
  return out;
}

/** Unknown quality ids fall back; a dangling key must never reach the caps lookup. */
export function sanitizeQuality(raw, fallback = 'balanced') {
  return typeof raw === 'string' && QUALITY_PRESETS[raw] ? raw : fallback;
}

export function normalizeSnapshots(raw, customAssets = [], root = {}) {
  if (!raw || typeof raw !== 'object') return {};
  // #637 — a partial snapshot must not wipe good root values with defaults:
  // fields the snapshot omits fall back to the root document's values, so
  // importing a doc with root seed 9999 and an empty active snapshot keeps
  // 9999 instead of resetting to seed 0. Explicit snapshot values keep
  // precedence; hard defaults apply only when the root lacks the field too.
  const rootSeed = Number.isFinite(root.seed) ? root.seed >>> 0 : 0;
  const rootPaletteId = typeof root.paletteId === 'string' ? root.paletteId : 'praystation';
  const out = {};
  for (const [id, snap] of Object.entries(raw)) {
    if (!snap || typeof snap !== 'object') continue;
    // Fill every field the render path reads. A hand-edited snapshot missing
    // enabledAssets threw inside the Canvas panel's memo (src.enabledAssets
    // undefined); lockedParams/caGrid missing meant a load silently dropped
    // parameter locks and the CA grid.
    // #635 — the snapshot's asset map gets the same hostile-input cleanup as
    // the root map: the active snapshot wins on import, so an unsanitized map
    // here defeated the allowlist and re-serialized into future exports.
    out[id] = {
      seed: Number.isFinite(snap.seed) ? snap.seed >>> 0 : rootSeed,
      seedOffsets: normalizeSeedOffsets(snap.seedOffsets),
      paletteId: typeof snap.paletteId === 'string' ? snap.paletteId : rootPaletteId,
      paletteOverrides: snap.paletteOverrides ?? null,
      layoutParams: normalizeLayoutParams(snap.layoutParams ?? root.layoutParams),
      lockedParams: snap.lockedParams && typeof snap.lockedParams === 'object' ? snap.lockedParams : {},
      caGrid: sanitizeCaGrid(snap.caGrid),
      enabledAssets: sanitizeEnabledAssets(snap.enabledAssets, customAssets) || {},
    };
  }
  return out;
}

/**
 * Normalize the layer list on load. Content layers pass through; FX layers
 * get their effect stacks sanitized (unknown kinds dropped, params clamped)
 * so a hand-edited or older document can never crash the filter compiler.
 * Also repairs activeLayerId: FX layers are never the content-active layer,
 * so a doc pointing at one falls back to the first content layer.
 */
export function normalizeLayers(rawLayers, rawActiveId) {
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
    return { layers: null, activeLayerId: typeof rawActiveId === 'string' ? rawActiveId : null };
  }
  // #103 Track B — bound the doc up front; the live loop resolves every
  // layer per frame, so a 200-layer document is a perf cliff, not a project.
  const layers = [];
  const seen = new Set();
  let contentCount = 0;
  for (const l of rawLayers) {
    if (layers.length >= MAX_LAYERS) break;
    if (!l || typeof l !== 'object' || typeof l.id !== 'string') continue;
    if (seen.has(l.id)) continue; // duplicate IDs collide in React keys and the snapshot map
    const type = l.type === 'fx' ? 'fx' : 'content';
    // #456 — the 4-content-track cap is a creation-time UI check only; a
    // document can still carry more. Skip the overflow rather than truncate
    // by raw array position, same "degrade, don't crash" posture as MAX_LAYERS.
    if (type === 'content') {
      if (contentCount >= MAX_CONTENT_TRACKS) continue;
      contentCount++;
    }
    seen.add(l.id);
    const layer = {
      id: l.id,
      name: typeof l.name === 'string' ? l.name : 'Layer',
      type,
      visible: l.visible !== false,
      layerBlendMode: typeof l.layerBlendMode === 'string' ? l.layerBlendMode : 'normal',
      layerOpacity: Number.isFinite(l.layerOpacity) ? Math.min(1, Math.max(0, l.layerOpacity)) : 1,
    };
    if (type === 'fx') {
      layer.effects = sanitizeFxEffects(l.effects);
    } else {
      // #456 — patches were dropped entirely on load (never copied from the
      // raw doc into the normalized layer). `to` is a stable layer id
      // (#457) that must be validated once every surviving layer's id is
      // known, so that pass runs below after this loop finishes.
      const mode = ['off', 'mod', 'field', 'feed'].includes(l.patch?.mode) ? l.patch.mode : 'off';
      const strength = Number.isFinite(l.patch?.strength) ? Math.min(1, Math.max(0, l.patch.strength)) : 0.16;
      const to = typeof l.patch?.to === 'string' ? l.patch.to : null;
      layer.patch = { mode, to, strength };
    }
    layers.push(layer);
  }
  if (layers.length === 0) return { layers: null, activeLayerId: null };
  // FX layers are never the content-active layer; a document with no content
  // layer at all is degenerate — treat it as invalid like an empty list.
  if (!layers.some((l) => l.type === 'content')) return { layers: null, activeLayerId: null };
  // #456 — a patch target that no longer exists (dropped by the cap above,
  // a stale/self id, or an id pointing at an FX layer) goes inert (`to:
  // null`) rather than pointing at nothing; `liveResolve.mjs` already no-ops
  // on a missing target, so this doesn't need to also force `mode: 'off'`.
  for (const l of layers) {
    if (l.type !== 'content' || !l.patch || l.patch.to === null) continue;
    const validTarget = l.patch.to !== l.id
      && layers.some((o) => o.id === l.patch.to && o.type === 'content');
    if (!validTarget) l.patch = { ...l.patch, to: null };
  }
  let activeLayerId = typeof rawActiveId === 'string' ? rawActiveId : null;
  const active = layers.find((l) => l.id === activeLayerId);
  if (!active || active.type === 'fx') {
    activeLayerId = layers.find((l) => l.type === 'content').id;
  }
  return { layers, activeLayerId };
}
