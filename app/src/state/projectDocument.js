import { captureSnapshot } from './slices/layersSlice.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { sanitizeOverlay } from '../assets/overlay.js';
// Re-exported so existing import sites (fxFilters.selfcheck, PipelinePanel)
// keep working; the implementations live in the cycle-free module.
import { normalizeSnapshots, normalizeLayers } from './projectNormalize.js';
export { normalizeSnapshots, normalizeLayers };
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { sanitizeLight } from '../data/light.js';
import { sanitizeAssetKineme, sanitizeAssetStill } from '../data/kinemes.js';
import { sanitizeRegionKinemesDoc } from '../data/regionKinemes.js';
import { sanitizeAssetAttach } from '../engine/assetAttach.js';
import { sanitizeCount } from '../curator/spawn.js';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import { sanitizeCanvasSpec, isInstrumentCanvas } from '../data/canvasPresets.js';
import { DEFAULT_BANK_NAME, sanitizeMidiBanks, sanitizeMidiActiveBank, activeBankMap } from '../midi/banks.mjs';
import { sanitizeMathMacros } from '../curator/mathMacros.js';
import {
  sanitizeEnabledAssets,
  sanitizeAssetWeightOverrides,
  sanitizeAssetOptions,
  sanitizeQuality,
  sanitizePaletteLocks,
} from './projectNormalize.js';

export const PROJECT_VERSION = 1;
export const AUTOSAVE_KEY = 'kc:project:v1';
/** Where a document that failed to parse is kept instead of being applied (#107 §6). */
export const QUARANTINE_KEY = 'kc:project:quarantine';
/**
 * #1745 — how many quarantined documents are kept. One boot can quarantine
 * the primary, the backup and the legacy key; a single slot kept only the
 * last (oldest) of those and lost the newest work. Newest first, oldest dropped.
 */
export const QUARANTINE_CAP = 4;

/** Every quarantined entry, newest first. Reads the pre-#1745 single-object shape too. */
export function readQuarantineAll(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(QUARANTINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed.entries.filter((e) => e && typeof e === 'object');
    if (parsed && typeof parsed === 'object' && 'raw' in parsed) return [parsed]; // pre-#1745: one object
    return [];
  } catch {
    return [];
  }
}

/**
 * #1745 — add one entry to the quarantine list without overwriting the others.
 * Returns true only when the entry is stored: the caller removes the source
 * key on true and leaves it in place on false (nothing is lost either way).
 * On a quota error, older entries are shed one at a time to make room — never
 * the new one, which is the document being moved out of the source key.
 */
function pushQuarantine(entry, storage = globalThis.localStorage) {
  let entries = [entry, ...readQuarantineAll(storage).filter((e) => e.raw !== entry.raw)].slice(0, QUARANTINE_CAP);
  for (;;) {
    try {
      storage.setItem(QUARANTINE_KEY, JSON.stringify({ entries }));
      return true;
    } catch {
      if (entries.length <= 1) return false;
      entries = entries.slice(0, -1);
    }
  }
}

const MAX_UINT32 = 0xffffffff;

/**
 * #646 — count top-level fields the sanitizers repaired: the raw file had a
 * value and the doc has something else. Missing fields filled with defaults
 * don't count (normalization, not repair). Pure and exported for tests.
 */
export function countRepairedFields(raw, doc) {
  if (raw == null || typeof raw !== 'object' || doc == null || typeof doc !== 'object') return 0;
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let n = 0;
  // quality: unknown preset falls back
  if (raw.quality !== undefined && doc.quality !== raw.quality) n++;
  // paletteId: non-string falls back to 'praystation'
  if (raw.paletteId !== undefined && doc.paletteId !== raw.paletteId) n++;
  // autoQuality: coerced via !== false
  if (raw.autoQuality !== undefined && typeof raw.autoQuality !== 'boolean') n++;
  // enabledAssets: hostile map collapsed to the known set
  if (
    raw.enabledAssets != null &&
    typeof raw.enabledAssets === 'object' &&
    !sameJson(raw.enabledAssets, doc.enabledAssets)
  )
    n++;
  // assetWeightOverrides / paletteLocks: dropped keys
  if (
    raw.assetWeightOverrides != null &&
    typeof raw.assetWeightOverrides === 'object' &&
    !sameJson(raw.assetWeightOverrides, doc.assetWeightOverrides)
  )
    n++;
  if (
    raw.paletteLocks != null &&
    typeof raw.paletteLocks === 'object' &&
    !sameJson(raw.paletteLocks, doc.paletteLocks || {})
  )
    n++;
  // layers: dropped or capped
  if (Array.isArray(raw.layers) && raw.layers.length !== (doc.layers || []).length) n++;
  return n;
}
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
  // #651 — optional project title, stored in the doc so reimported titles persist.
  if (typeof state.projectTitle === 'string' && state.projectTitle.trim()) {
    doc.title = state.projectTitle.trim().slice(0, 80);
  }
  if (state.paletteOverrides) {
    doc.paletteOverrides = JSON.parse(JSON.stringify(state.paletteOverrides));
  }
  // #638 — palette locks pin swatches during harmony regeneration; without
  // them a reopened piece shuffles colors the designer had pinned down.
  const locks = sanitizePaletteLocks(state.paletteLocks);
  if (locks && Object.keys(locks).length > 0) {
    doc.paletteLocks = locks;
  }
  const overlay = sanitizeOverlay(state.customAssets);
  if (overlay.length) doc.customAssets = overlay;
  // #594 — the one scene sun. Written only when on: an unlit piece exports
  // exactly as it did before lighting existed.
  const light = sanitizeLight(state.light);
  if (light) doc.light = light;
  // #781 KINEME — which assets move, and how. Written only when set: a
  // motionless piece exports exactly as before.
  const kineme = sanitizeAssetKineme(state.assetKineme);
  if (kineme) doc.assetKineme = kineme;
  // #1434 — per-region kineme overrides (the artist's hand over the family
  // defaults; null entries are tombstones — a region set still on purpose).
  // Written only when set: a piece with no region edits exports as before.
  const regionKinemes = sanitizeRegionKinemesDoc(state.regionKinemes);
  if (regionKinemes) doc.regionKinemes = regionKinemes;
  // #1128 — assets pinned still (the living-motion floor skips them). Written only when set.
  const still = sanitizeAssetStill(state.assetStill);
  if (still) doc.assetStill = still;
  // #1694 S2 — tile options (the citizen's family). Written only when set: a piece with no
  // option touched exports exactly as before.
  const assetOptions = sanitizeAssetOptions(state.assetOptions, overlay);
  if (assetOptions) doc.assetOptions = assetOptions;
  // #1355 — wet-lab attach points, per asset. Written only when set.
  const attach = sanitizeAssetAttach(state.assetAttach);
  if (attach) doc.assetAttach = attach;
  // #1694 S3 — the creature count has no top-level field any more: it is the BUILD layout
  // param `creatures`, written above inside layoutParams like every other param (the
  // pre-fold-in top-level `creatureCount` field is read back only by parseProject's
  // migration, below).
  // #790 — the scene's audio routes. Written only when customised (null = the
  // default table), so an untouched piece exports exactly as before. [] is saved.
  const audioRoutes = sanitizeAudioRoutes(state.audioRoutes);
  if (audioRoutes) doc.audioRoutes = audioRoutes;
  const canvas = sanitizeCanvasSpec(state);
  if (!isInstrumentCanvas(canvas) || canvas.canvasFps !== 60 || canvas.stageMode !== 'preview') {
    doc.canvasW = canvas.canvasW;
    doc.canvasH = canvas.canvasH;
    doc.canvasFps = canvas.canvasFps;
    doc.canvasPresetId = canvas.canvasPresetId;
    doc.stageMode = canvas.stageMode;
  }
  // #617 — MIDI mappings; #1720 — banks. A project that never left the single
  // MAIN bank exports exactly as before (a `midiMap` field, only when something
  // is mapped). A project using banks writes the bank list in full; the active
  // bank is written only when it is not the first.
  const midiBanks = sanitizeMidiBanks(state.midiBanks, state.midiMap);
  const midiActiveBank = sanitizeMidiActiveBank(state.midiActiveBank, midiBanks);
  if (midiBanks.length === 1 && midiBanks[0].name === DEFAULT_BANK_NAME) {
    if (Object.keys(midiBanks[0].map).length) doc.midiMap = midiBanks[0].map;
  } else {
    doc.midiBanks = midiBanks;
    if (midiActiveBank !== 0) doc.midiActiveBank = midiActiveBank;
  }
  // #724 — math macro setups. Written only when a macro exists: a project
  // with no macros exports exactly as before.
  const mathMacros = sanitizeMathMacros(state.mathMacros);
  if (mathMacros.length) doc.mathMacros = mathMacros;
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

/**
 * #1694 S3 — the creature count's home moved from a top-level document field to the BUILD
 * layout param `creatures`. A document written before the move carries `creatureCount` at
 * the top level and no `creatures` key anywhere in its layout params: land the old field in
 * the param — root and layer snapshots alike — so a saved project's population survives
 * the move intact. The old field's own sanitizer stays the law for its value. An explicit
 * `creatures` param always wins (it is the new home); a snapshot without params of its own
 * inherited the root's, so it takes the root's landed value.
 */
function landLegacyCreatureCount(raw, doc) {
  if (raw.creatureCount === undefined) return;
  const n = sanitizeCount(raw.creatureCount);
  const rawParams = raw.layoutParams || raw.layout;
  if (!(rawParams && typeof rawParams === 'object' && 'creatures' in rawParams)) {
    doc.layoutParams = { ...doc.layoutParams, creatures: n };
  }
  const rawSnaps = raw.layerSnapshots && typeof raw.layerSnapshots === 'object' ? raw.layerSnapshots : {};
  for (const [id, snap] of Object.entries(doc.layerSnapshots || {})) {
    const rawSnap = rawSnaps[id];
    if (!rawSnap || typeof rawSnap !== 'object') continue;
    if (rawSnap.layoutParams && typeof rawSnap.layoutParams === 'object') {
      if (!('creatures' in rawSnap.layoutParams)) {
        snap.layoutParams = { ...snap.layoutParams, creatures: n };
      }
    } else {
      snap.layoutParams = { ...snap.layoutParams, creatures: doc.layoutParams.creatures };
    }
  }
}

/**
 * #617 + #1720 — the document's MIDI fields, normalized once for both parse
 * branches: the bank list (the legacy `midiMap` becomes the single MAIN bank;
 * when both shapes are present the bank list wins), the active bank, and the
 * active bank's map under the `midiMap` name the store mirrors.
 */
function midiDocFields(raw) {
  const midiBanks = sanitizeMidiBanks(raw.midiBanks, raw.midiMap);
  const midiActiveBank = sanitizeMidiActiveBank(raw.midiActiveBank, midiBanks);
  return { midiBanks, midiActiveBank, midiMap: activeBankMap(midiBanks, midiActiveBank) };
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
    const { layers, activeLayerId, trims } = normalizeLayers(raw.layers, raw.activeLayerId);
    // #643 — drop snapshots for layers that don't exist in the doc.
    const layerIds = (layers || []).map((l) => l && l.id);
    const doc = {
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
      assetWeightOverrides: sanitizeAssetWeightOverrides(raw.assetWeightOverrides, customAssets),
      paletteOverrides: raw.paletteOverrides || null,
      paletteLocks: sanitizePaletteLocks(raw.paletteLocks) || {},
      light: sanitizeLight(raw.light), // #594 — absent → null (off)
      assetKineme: sanitizeAssetKineme(raw.assetKineme) || {}, // #781
      regionKinemes: sanitizeRegionKinemesDoc(raw.regionKinemes) || {}, // #1434 — tombstones (null) survive
      assetStill: sanitizeAssetStill(raw.assetStill) || {}, // #1128
      assetOptions: sanitizeAssetOptions(raw.assetOptions, customAssets) || {}, // #1694 S2
      assetAttach: sanitizeAssetAttach(raw.assetAttach) || {}, // #1355
      audioRoutes: sanitizeAudioRoutes(raw.audioRoutes), // #790
      ...midiDocFields(raw), // #617 + #1720 — banks, active bank, the active map
      mathMacros: sanitizeMathMacros(raw.mathMacros), // #724
      customAssets,
      layers,
      activeLayerId,
      // #637 — partial snapshots inherit the root doc's seed/palette/layout.
      // #643 — drop snapshots for layers that don't exist in the doc.
      layerSnapshots: normalizeSnapshots(
        raw.layerSnapshots,
        customAssets,
        {
          seed: seed >>> 0,
          paletteId: raw.paletteId || raw.palette || 'praystation',
          layoutParams: raw.layoutParams || raw.layout,
        },
        layerIds,
      ),
    };
    // #1609 — the skeleton trim's names ride the doc to the load receipt
    // (loadedMessage names them). Absent when nothing trimmed, so a clean
    // load's doc is exactly the doc it was before the skeleton.
    if (trims && trims.length) doc.layerTrims = trims;
    landLegacyCreatureCount(raw, doc);
    return { ok: true, doc, sanitized: countRepairedFields(raw, doc) };
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
  const { layers, activeLayerId, trims } = normalizeLayers(raw.layers, raw.activeLayerId);
  // #643 — drop snapshots for layers that don't exist in the doc.
  const layerIds = (layers || []).map((l) => l && l.id);
  const doc = {
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
    assetWeightOverrides: sanitizeAssetWeightOverrides(raw.assetWeightOverrides, customAssets),
    light: sanitizeLight(raw.light), // #594 — absent → null (off)
    assetKineme: sanitizeAssetKineme(raw.assetKineme) || {}, // #781
    regionKinemes: sanitizeRegionKinemesDoc(raw.regionKinemes) || {}, // #1434 — tombstones (null) survive
    assetStill: sanitizeAssetStill(raw.assetStill) || {}, // #1128
    assetOptions: sanitizeAssetOptions(raw.assetOptions, customAssets) || {}, // #1694 S2
    assetAttach: sanitizeAssetAttach(raw.assetAttach) || {}, // #1355
    audioRoutes: sanitizeAudioRoutes(raw.audioRoutes), // #790
    ...midiDocFields(raw), // #617 + #1720 — banks, active bank, the active map
    mathMacros: sanitizeMathMacros(raw.mathMacros), // #724
    paletteOverrides: raw.paletteOverrides && typeof raw.paletteOverrides === 'object' ? raw.paletteOverrides : null,
    paletteLocks: sanitizePaletteLocks(raw.paletteLocks) || {},
    customAssets,
    layers,
    activeLayerId,
    // #637 — partial snapshots inherit the root doc's seed/palette/layout.
    // #643 — drop snapshots for layers that don't exist in the doc.
    layerSnapshots: normalizeSnapshots(
      raw.layerSnapshots,
      customAssets,
      {
        seed: raw.seed,
        paletteId: raw.paletteId,
        layoutParams: raw.layoutParams,
      },
      layerIds,
    ),
  };
  // #1609 — the skeleton trim's names ride the doc to the load receipt
  // (loadedMessage names them). Absent when nothing trimmed, so a clean
  // load's doc is exactly the doc it was before the skeleton.
  if (trims && trims.length) doc.layerTrims = trims;
  landLegacyCreatureCount(raw, doc);
  return { ok: true, doc, sanitized: countRepairedFields(raw, doc) };
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
      // #1745: appended to the list, never over another quarantined document
      if (pushQuarantine({ quarantinedAt: new Date().toISOString(), reason, source: AUTOSAVE_KEY, raw })) {
        localStorage.removeItem(AUTOSAVE_KEY);
      }
    } catch {
      /* storage is already unhappy; nothing useful to do */
    }
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
  const candidate = envelope && typeof envelope === 'object' && envelope.doc ? envelope.doc : envelope;

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
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({
        version: PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        doc,
      }),
    );
    return { ok: true };
  } catch (e) {
    // Quota exceeded, or a private window that refuses storage entirely.
    console.warn('[project] autosave failed', e);
    return { ok: false, error: e?.name === 'QuotaExceededError' ? 'quota' : 'blocked' };
  }
}

/** The document that was refused at boot, if any. */
/** The most recently refused document, if any (readQuarantineAll for every one, #1745). */
export function readQuarantine() {
  return readQuarantineAll()[0] ?? null;
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
    // #1745: only a primary that still parses is rotated in — an unreadable one
    // (left behind when its quarantine could not be stored) must not replace a
    // good backup.
    let prevReadable = false;
    if (prev) {
      try {
        JSON.parse(prev);
        prevReadable = true;
      } catch {
        /* keep the backup */
      }
    }
    if (prevReadable) {
      try {
        localStorage.setItem(PIPELINE_BACKUP_KEY, prev);
      } catch {
        // Quota hit on backup — drop it silently so the primary write
        // still has room. The backup is best-effort.
        try {
          localStorage.removeItem(PIPELINE_BACKUP_KEY);
        } catch {
          /* */
        }
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
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { doc: null, quarantined: false };
  }
  if (!raw) return { doc: null, quarantined: false };

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    console.warn(`[pipeline] ${key} unparseable, quarantining`);
    _quarantineKey(key, 'unparseable JSON');
    return { doc: null, quarantined: true };
  }

  const candidate = envelope && typeof envelope === 'object' && envelope.doc ? envelope.doc : envelope;
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
    // #1745: appended to the list, never over another quarantined document
    if (pushQuarantine({ quarantinedAt: new Date().toISOString(), reason, source: key, raw })) {
      localStorage.removeItem(key);
    }
  } catch {
    /* storage is already unhappy */
  }
}
