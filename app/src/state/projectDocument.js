import { captureSnapshot } from './slices/layersSlice.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeOverlay } from '../assets/overlay.js';
// Re-exported so existing import sites (fxFilters.selfcheck, PipelinePanel)
// keep working; the implementations live in the cycle-free module.
import { normalizeSnapshots, normalizeLayers } from './projectNormalize.js';
export { normalizeSnapshots, normalizeLayers };
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import {
  sanitizeEnabledAssets,
  sanitizeAssetWeightOverrides,
  sanitizeQuality,
} from './projectNormalize.js';

export const PROJECT_VERSION = 1;
export const AUTOSAVE_KEY = 'kc:project:v1';
/** Where a document that failed to parse is kept instead of being applied (#107 §6). */
export const QUARANTINE_KEY = 'kc:project:quarantine';

const MAX_UINT32 = 0xffffffff;
/**
 * #642 — seeds are uint32. Oversized, negative, fractional, or non-numeric
 * seeds reject with a clear message instead of silently truncating to 0
 * via `>>> 0` (2**40 became seed 0 with no warning). Hex strings stay
 * supported for legacy files.
 */
function coerceSeed(raw) {
  let seed = raw;
  if (typeof seed === 'string') seed = parseInt(seed, 16);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_UINT32) {
    return { ok: false, error: `Invalid seed: ${String(raw)}` };
  }
  return { ok: true, seed: seed >>> 0 };
}

export function serializeProject(state) {
  const doc = {
    version: PROJECT_VERSION,
    seed: state.seed >>> 0,
    // #305 — sub-seed stream offsets persist like the seed itself; a kept
    // render's recipe is only deterministic with these attached.
    seedOffsets: normalizeSeedOffsets(state.seedOffsets),
    paletteId: state.paletteId,
    layoutParams: normalizeLayoutParams(state.layoutParams),
    enabledAssets: { ...state.enabledAssets },
    quality: state.quality || 'balanced',
    // #310: the AUTO toggle left performer sight, but the governor still
    // reads autoQuality — the document carries it so a set's choice survives.
    autoQuality: state.autoQuality !== false,
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
    doc.layerSnapshots = normalizeSnapshots(snaps, overlay);
  }
  return doc;
}

export function parseProject(raw) {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'Not a JSON object' };
  }

  const isLegacy = raw.version == null && (raw.layout || raw.palette || raw.seed != null);
  if (isLegacy) {
    const seedRes = coerceSeed(raw.seed);
    if (!seedRes.ok) return seedRes;
    const seed = seedRes.seed;
    const customAssets = sanitizeOverlay(raw.customAssets);
    return {
      ok: true,
      doc: {
        version: PROJECT_VERSION,
        seed: seed >>> 0,
        seedOffsets: normalizeSeedOffsets(raw.seedOffsets),
        // #645 — same string guard the v1 branch uses: a corrupt legacy file
        // with a numeric/null palette degrades to the fallback palette.
        paletteId:
          typeof raw.paletteId === 'string'
            ? raw.paletteId
            : typeof raw.palette === 'string'
              ? raw.palette
              : 'praystation',
        layoutParams: normalizeLayoutParams(raw.layoutParams || raw.layout),
        // #103 Track B — validate asset maps against the registry; a hostile
        // 100k-key map collapses to the known set instead of bloating the store.
        enabledAssets: sanitizeEnabledAssets(raw.enabledAssets, customAssets),
        quality: sanitizeQuality(raw.quality),
        autoQuality: raw.autoQuality !== false,
        assetWeightOverrides: sanitizeAssetWeightOverrides(raw.assetWeightOverrides),
        paletteOverrides: raw.paletteOverrides || null,
        customAssets,
        ...normalizeLayers(raw.layers, raw.activeLayerId),
        layerSnapshots: normalizeSnapshots(raw.layerSnapshots, customAssets),
      },
    };
  }

  // #641 — accept the version written as a numeric string ("1" means 1);
  // genuinely unknown versions still reject with the clear message.
  const version = typeof raw.version === 'string' ? Number(raw.version) : raw.version;
  if (version !== PROJECT_VERSION) {
    return { ok: false, error: `Unsupported project version: ${raw.version}` };
  }

  const seedRes = coerceSeed(raw.seed);
  if (!seedRes.ok) return seedRes;
  const seed = seedRes.seed;

  const customAssets = sanitizeOverlay(raw.customAssets);
  return {
    ok: true,
    doc: {
      version: PROJECT_VERSION,
      seed: seed >>> 0,
      seedOffsets: normalizeSeedOffsets(raw.seedOffsets),
      paletteId: typeof raw.paletteId === 'string' ? raw.paletteId : 'praystation',
      layoutParams: normalizeLayoutParams(raw.layoutParams),
      // #103 Track B — validate asset maps against the registry; a hostile
      // 100k-key map collapses to the known set instead of bloating the store.
      enabledAssets: sanitizeEnabledAssets(raw.enabledAssets, customAssets),
      quality: sanitizeQuality(raw.quality),
      autoQuality: raw.autoQuality !== false,
      assetWeightOverrides: sanitizeAssetWeightOverrides(raw.assetWeightOverrides),
      paletteOverrides:
        raw.paletteOverrides && typeof raw.paletteOverrides === 'object'
          ? raw.paletteOverrides
          : null,
      customAssets,
      ...normalizeLayers(raw.layers, raw.activeLayerId),
      layerSnapshots: normalizeSnapshots(raw.layerSnapshots, customAssets),
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

// ── Rolling pipeline autosave (#33, #53) ─────────────────────────────────
// Writes to a primary key and rotates the previous value to a single backup
// slot. On read, if the primary is quarantine-worthy the backup is tried as
// a fallback before giving up. The legacy kc:project:v1 key is left intact
// for migration — readPipelineAutosave falls through to readAutosave when
// neither pipeline key exists.

export const PIPELINE_KEY = 'kc:pipeline:v1';
export const PIPELINE_BACKUP_KEY = 'kc:pipeline:backup';

/**
 * Rolling write: rotate current → backup, then write new.
 * @returns {{ok: boolean, error?: string}}
 */
export function writePipelineAutosave(doc) {
  const envelope = JSON.stringify({
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    doc,
  });
  try {
    // Rotate current primary into the backup slot.
    const prev = localStorage.getItem(PIPELINE_KEY);
    if (prev) {
      try {
        localStorage.setItem(PIPELINE_BACKUP_KEY, prev);
      } catch {
        // Quota hit on backup — drop it silently so the primary write
        // still has room. The backup is best-effort.
        try { localStorage.removeItem(PIPELINE_BACKUP_KEY); } catch { /* */ }
      }
    }
    localStorage.setItem(PIPELINE_KEY, envelope);
    return { ok: true };
  } catch (e) {
    console.warn('[pipeline] autosave failed', e);
    return { ok: false, error: e?.name === 'QuotaExceededError' ? 'quota' : 'blocked' };
  }
}

/**
 * Read with backup fallback.
 * @returns {{doc: object|null, quarantined: boolean, fromBackup: boolean}}
 */
export function readPipelineAutosave() {
  // Try primary key.
  const primary = _tryReadKey(PIPELINE_KEY);
  if (primary.doc) return { doc: primary.doc, quarantined: false, fromBackup: false };

  // Primary was missing or quarantine-worthy — try backup.
  if (primary.quarantined) {
    const backup = _tryReadKey(PIPELINE_BACKUP_KEY);
    if (backup.doc) return { doc: backup.doc, quarantined: false, fromBackup: true };
  }

  // Neither pipeline key worked — fall through to legacy kc:project:v1.
  const legacy = readAutosave();
  if (legacy.doc) return { doc: legacy.doc, quarantined: false, fromBackup: false };

  return { doc: null, quarantined: primary.quarantined || legacy.quarantined, fromBackup: false };
}

/** Shared key-reader: parse envelope → parseProject. */
function _tryReadKey(key) {
  let raw;
  try { raw = localStorage.getItem(key); } catch { return { doc: null, quarantined: false }; }
  if (!raw) return { doc: null, quarantined: false };

  let envelope;
  try { envelope = JSON.parse(raw); } catch {
    console.warn(`[pipeline] ${key} unparseable, quarantining`);
    _quarantineKey(key, 'unparseable JSON');
    return { doc: null, quarantined: true };
  }

  const candidate = envelope && typeof envelope === 'object' && envelope.doc
    ? envelope.doc : envelope;
  const result = parseProject(candidate);
  if (!result.ok) {
    _quarantineKey(key, result.error || 'failed to parse');
    return { doc: null, quarantined: true };
  }
  return { doc: result.doc, quarantined: false };
}

function _quarantineKey(key, reason) {
  try {
    const raw = localStorage.getItem(key);
    localStorage.setItem(QUARANTINE_KEY, JSON.stringify({
      quarantinedAt: new Date().toISOString(), reason, source: key, raw,
    }));
    localStorage.removeItem(key);
  } catch { /* storage is already unhappy */ }
}
