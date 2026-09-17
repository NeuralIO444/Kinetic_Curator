import { captureSnapshot } from './slices/layersSlice.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeOverlay } from '../assets/overlay.js';
// Re-exported so existing import sites (fxFilters.selfcheck, OutputPanel)
// keep working; the implementations live in the cycle-free module.
import { normalizeSnapshots, normalizeLayers } from './projectNormalize.js';
export { normalizeSnapshots, normalizeLayers };

export const PROJECT_VERSION = 1;
export const AUTOSAVE_KEY = 'kc:project:v1';
/** Where a document that failed to parse is kept instead of being applied (#107 §6). */
export const QUARANTINE_KEY = 'kc:project:quarantine';

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
  if (state.paletteOverrides) {
    doc.paletteOverrides = JSON.parse(JSON.stringify(state.paletteOverrides));
  }
  const overlay = sanitizeOverlay(state.customAssets);
  if (overlay.length) doc.customAssets = overlay;
  if (Array.isArray(state.layers) && state.activeLayerId) {
    doc.layers = state.layers;
    doc.activeLayerId = state.activeLayerId;
    const snaps = {
      ...(state.layerSnapshots || {}),
      [state.activeLayerId]: captureSnapshot(state),
    };
    doc.layerSnapshots = normalizeSnapshots(snaps);
  }
  return doc;
}

export function parseProject(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Not a JSON object' };
  }

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
        customAssets: sanitizeOverlay(raw.customAssets),
        ...normalizeLayers(raw.layers, raw.activeLayerId),
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
      customAssets: sanitizeOverlay(raw.customAssets),
      ...normalizeLayers(raw.layers, raw.activeLayerId),
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

/**
 * Autosave is a crash-only journal (#107 §6): boot either restores a document
 * that parsed cleanly, or starts from factory defaults. There is no third
 * option where a half-understood document is applied anyway — that is how an
 * operator loses a set to a blob they cannot see and cannot delete.
 *
 * A document that fails to parse is moved to QUARANTINE_KEY rather than
 * dropped, so it can be recovered by hand, and so the next boot does not
 * retry the same poison and fail the same way.
 *
 * @returns {{doc: object|null, quarantined: boolean}}
 */
export function readAutosave() {
  let raw = null;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return { doc: null, quarantined: false };
  }
  if (!raw) return { doc: null, quarantined: false };

  const quarantine = (reason) => {
    try {
      localStorage.setItem(QUARANTINE_KEY, JSON.stringify({
        quarantinedAt: new Date().toISOString(), reason, raw,
      }));
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch { /* storage is already unhappy; nothing useful to do */ }
    console.warn(`[project] autosave quarantined (${reason}); booting defaults`);
    return { doc: null, quarantined: true };
  };

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (e) {
    return quarantine(`unparseable JSON: ${e.message}`);
  }

  // Envelope form is { version, savedAt, doc }; older builds wrote the bare
  // document, so accept both rather than quarantining every existing session
  // on upgrade.
  const candidate = envelope && typeof envelope === 'object' && envelope.doc
    ? envelope.doc
    : envelope;

  const result = parseProject(candidate);
  if (!result.ok) return quarantine(result.error || 'failed to parse');
  return { doc: result.doc, quarantined: false };
}

/**
 * @returns {{ok: boolean, error?: string}} so the shell can show UNSAVED
 *   instead of letting the operator believe the set is being persisted.
 */
export function writeAutosave(doc) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      doc,
    }));
    return { ok: true };
  } catch (e) {
    // Quota exceeded, or a private window that refuses storage entirely.
    console.warn('[project] autosave failed', e);
    return { ok: false, error: e?.name === 'QuotaExceededError' ? 'quota' : 'blocked' };
  }
}

/** The document that was refused at boot, if any. */
export function readQuarantine() {
  try {
    const raw = localStorage.getItem(QUARANTINE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
