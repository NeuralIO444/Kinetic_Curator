// Project document — portable session state (#33 / #34).
// Full project JSON is the reproducible unit (seed alone is not).
import { captureSnapshot } from './slices/layersSlice.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';

export const PROJECT_VERSION = 1;
export const AUTOSAVE_KEY = 'kc:project:v1';

function normalizeSnapshots(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [id, snap] of Object.entries(raw)) {
    if (!snap || typeof snap !== 'object') continue;
    out[id] = {
      ...snap,
      layoutParams: normalizeLayoutParams(snap.layoutParams),
    };
  }
  return out;
}

/**
 * @param {object} state - zustand-like slice of relevant fields. `seed` /
 *   `layoutParams` / `enabledAssets` always describe the *active* layer
 *   (see layersSlice.js); `layers` (if present) carries the rest.
 * @returns {object} project document
 */
export function serializeProject(state) {
  const doc = {
    version: PROJECT_VERSION,
    seed: state.seed >>> 0,
    paletteId: state.paletteId,
    layoutParams: normalizeLayoutParams(state.layoutParams),
    enabledAssets: { ...state.enabledAssets },
    quality: state.quality || 'balanced',
  };
  if (state.assetWeightOverrides && Object.keys(state.assetWeightOverrides).length > 0) {
    doc.assetWeightOverrides = { ...state.assetWeightOverrides };
  }
  // Custom palette colours (#52) are part of the look — without these a
  // reopened project silently reverts to the catalog palette (#53).
  if (state.paletteOverrides) {
    doc.paletteOverrides = JSON.parse(JSON.stringify(state.paletteOverrides));
  }
  if (Array.isArray(state.layers) && state.activeLayerId) {
    doc.layers = state.layers;
    doc.activeLayerId = state.activeLayerId;
    // The active layer's true data lives in the live top-level fields
    // above, not in layerSnapshots — fold it in so every layer round-trips.
    const snaps = {
      ...(state.layerSnapshots || {}),
      [state.activeLayerId]: captureSnapshot(state),
    };
    doc.layerSnapshots = normalizeSnapshots(snaps);
  }
  return doc;
}

/**
 * Normalize legacy OUTPUT JSON and v1 project docs.
 * @param {unknown} raw
 * @returns {{ ok: true, doc: object } | { ok: false, error: string }}
 */
export function parseProject(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Not a JSON object' };
  }

  // Legacy export: { seed, palette, layout }
  const isLegacy = raw.version == null && (raw.layout || raw.palette || raw.seed != null);
  if (isLegacy) {
    let seed = raw.seed;
    if (typeof seed === 'string') seed = parseInt(seed, 16);
    if (!Number.isFinite(seed)) seed = 0;
    return {
      ok: true,
      doc: {
        version: PROJECT_VERSION,
        seed: seed >>> 0,
        paletteId: raw.paletteId || raw.palette || 'praystation',
        layoutParams: normalizeLayoutParams(raw.layoutParams || raw.layout),
        enabledAssets: raw.enabledAssets || null,
        quality: raw.quality || 'balanced',
        assetWeightOverrides: raw.assetWeightOverrides || null,
        paletteOverrides: raw.paletteOverrides || null,
        layers: Array.isArray(raw.layers) ? raw.layers : null,
        activeLayerId: raw.activeLayerId || null,
        layerSnapshots: normalizeSnapshots(raw.layerSnapshots),
      },
    };
  }

  if (raw.version !== PROJECT_VERSION) {
    return { ok: false, error: `Unsupported project version: ${raw.version}` };
  }

  let seed = raw.seed;
  if (typeof seed === 'string') seed = parseInt(seed, 16);
  if (!Number.isFinite(seed)) {
    return { ok: false, error: 'Invalid seed' };
  }

  return {
    ok: true,
    doc: {
      version: PROJECT_VERSION,
      seed: seed >>> 0,
      paletteId: typeof raw.paletteId === 'string' ? raw.paletteId : 'praystation',
      layoutParams: normalizeLayoutParams(raw.layoutParams),
      enabledAssets:
        raw.enabledAssets && typeof raw.enabledAssets === 'object' ? { ...raw.enabledAssets } : null,
      quality: typeof raw.quality === 'string' ? raw.quality : 'balanced',
      assetWeightOverrides:
        raw.assetWeightOverrides && typeof raw.assetWeightOverrides === 'object'
          ? { ...raw.assetWeightOverrides }
          : null,
      paletteOverrides:
        raw.paletteOverrides && typeof raw.paletteOverrides === 'object'
          ? raw.paletteOverrides
          : null,
      layers: Array.isArray(raw.layers) ? raw.layers : null,
      activeLayerId: typeof raw.activeLayerId === 'string' ? raw.activeLayerId : null,
      layerSnapshots: normalizeSnapshots(raw.layerSnapshots),
    },
  };
}

export function downloadProject(doc, filename) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || `kinetic-curator-${(doc.seed >>> 0).toString(16)}.project.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = parseProject(parsed);
    return result.ok ? result.doc : null;
  } catch {
    return null;
  }
}

export function writeAutosave(doc) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch (e) {
    console.warn('[project] autosave failed', e);
  }
}
