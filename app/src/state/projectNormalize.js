// Project-document normalization helpers — dependency-neutral on purpose.
//
// projectDocument.js needs these, and so does slices/globalSlice.js
// (applyProject). globalSlice ← projectDocument would close an import
// cycle (projectDocument → slices/layersSlice → globalSlice), so the
// shared helpers live here: this module imports only leaf modules
// (data/layout-modes, data/assets, data/quality, fx/fxFilters) and is safe
// to import from anywhere.
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeFxEffects } from '../fx/fxFilters.js';
import { ASSETS } from '../data/assets/index.js';
import { QUALITY_PRESETS } from '../data/quality.js';

/** #103 Track B — the live loop resolves every layer per frame; cap hostile docs. */
export const MAX_LAYERS = 16;

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
 * Weight overrides apply to catalog assets only; unknown keys are dropped
 * and non-numeric values fall back to the neutral weight.
 */
export function sanitizeAssetWeightOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of Object.keys(raw)) {
    if (!KNOWN_ASSET_IDS.has(key)) continue;
    const w = Number(raw[key]);
    out[key] = Number.isFinite(w) ? w : 1;
  }
  return out;
}

/** Unknown quality ids fall back; a dangling key must never reach the caps lookup. */
export function sanitizeQuality(raw, fallback = 'balanced') {
  return typeof raw === 'string' && QUALITY_PRESETS[raw] ? raw : fallback;
}

export function normalizeSnapshots(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, snap] of Object.entries(raw)) {
    if (!snap || typeof snap !== 'object') continue;
    // Fill every field the render path reads. A hand-edited snapshot missing
    // enabledAssets threw inside the Canvas panel's memo (src.enabledAssets
    // undefined); lockedParams/caGrid missing meant a load silently dropped
    // parameter locks and the CA grid.
    out[id] = {
      seed: Number.isFinite(snap.seed) ? snap.seed >>> 0 : 0,
      paletteId: typeof snap.paletteId === 'string' ? snap.paletteId : 'praystation',
      paletteOverrides: snap.paletteOverrides ?? null,
      layoutParams: normalizeLayoutParams(snap.layoutParams),
      lockedParams: snap.lockedParams && typeof snap.lockedParams === 'object' ? snap.lockedParams : {},
      caGrid: Array.isArray(snap.caGrid) ? snap.caGrid : null,
      enabledAssets: snap.enabledAssets && typeof snap.enabledAssets === 'object' ? { ...snap.enabledAssets } : {},
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
  for (const l of rawLayers) {
    if (layers.length >= MAX_LAYERS) break;
    if (!l || typeof l !== 'object' || typeof l.id !== 'string') continue;
    if (seen.has(l.id)) continue; // duplicate IDs collide in React keys and the snapshot map
    seen.add(l.id);
    const type = l.type === 'fx' ? 'fx' : 'content';
    const layer = {
      id: l.id,
      name: typeof l.name === 'string' ? l.name : 'Layer',
      type,
      visible: l.visible !== false,
      layerBlendMode: typeof l.layerBlendMode === 'string' ? l.layerBlendMode : 'normal',
      layerOpacity: Number.isFinite(l.layerOpacity) ? Math.min(1, Math.max(0, l.layerOpacity)) : 1,
    };
    if (type === 'fx') layer.effects = sanitizeFxEffects(l.effects);
    layers.push(layer);
  }
  if (layers.length === 0) return { layers: null, activeLayerId: null };
  // FX layers are never the content-active layer; a document with no content
  // layer at all is degenerate — treat it as invalid like an empty list.
  if (!layers.some((l) => l.type === 'content')) return { layers: null, activeLayerId: null };
  let activeLayerId = typeof rawActiveId === 'string' ? rawActiveId : null;
  const active = layers.find((l) => l.id === activeLayerId);
  if (!active || active.type === 'fx') {
    activeLayerId = layers.find((l) => l.type === 'content').id;
  }
  return { layers, activeLayerId };
}
