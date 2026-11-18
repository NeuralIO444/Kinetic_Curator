// state/sceneApply.js — the scene half of a document, as store fields (#2322, recipes-v3-spec §3.2).
//
// `applyProject` used to be one block that mixed the scene (what is ON STAGE) with the rig (the performer's own
// setup). A recipe pasted through it reset the rig too — title, canvas fps, audio routes, MIDI, macros — and
// cleared undo. This module splits that block along DOC_FIELD_CLASS (projectDocument.js) so three callers share
// ONE set of sanitizers and cannot drift apart:
//   applyProject  — a document load: rig fields + scene fields + resets (unchanged behaviour)
//   applyScene    — a recipe: only the scene keys it speaks for, one undo step, rig untouched
//   undo / redo   — a `scene` undo entry restores through sceneFieldsFromDoc too
// Pure: nothing here reads or writes the store.
import { sceneOf } from './projectDocument.js';
import { pushToUndo, UNDO_KIND_SCENE } from './history.js';
import { ASSETS } from '../data/assets/index.js'; // eslint-disable-line no-unused-vars -- keeps the asset registry loaded before DEFAULT_4_ASSETS is read
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { normalizeSeedOffsets } from '../engine/kernel/rng.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import {
  normalizeSnapshots,
  sanitizeEnabledAssets,
  sanitizeAssetWeightOverrides,
  sanitizeAssetOptions,
  sanitizeQuality,
  sanitizePaletteLocks,
  MAX_LAYERS,
} from './projectNormalize.js';
import { sanitizeAssetKineme, sanitizeAssetStill, DEFAULT_ASSET_KINEME } from '../data/kinemes.js';
import { sanitizeRegionKinemesDoc } from '../data/regionKinemes.js';
import { sanitizeLight } from '../data/light.js';
import { sanitizeWorld } from '../data/world.js';
import { sanitizeAssetTagsDoc } from '../data/assetFacets.js';
import { sanitizeKitsDoc, sanitizeKitTriad, SEED_KITS } from '../data/kits.js';
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';
import { sanitizeCanvasSpec } from '../data/canvasPresets.js';
import { sanitizeMidiBanks, sanitizeMidiActiveBank, activeBankMap } from '../midi/banks.mjs';
import { sanitizeMathMacros } from '../curator/mathMacros.js';
import { sanitizeAssetAttach } from '../engine/assetAttach.js';
import { sanitizeCreatureRecords } from '../engine/creatureAssembler.js';
import { sanitizeConstructRecords } from '../engine/constructAssembler.js';
import { sanitizeGaitRecords } from '../engine/gait.js'; // #2328
import { sanitizeShapeShelf } from '../panels/shapeShelf.mjs';

// HYPE Processing aesthetic: start with exactly 4 curated assets, not all 205
const DEFAULT_4_ASSETS = ['org_blob_01', 'rad_rings_01', 'stamp_glyph_01', 'rad_orbit_01'];
export const initialEnabledAssets = Object.fromEntries(DEFAULT_4_ASSETS.map((id) => [id, true]));
// #1694 S2 — the creature citizen starts ENABLED in the default document: creatures were never
// gated by this map (the artist's count alone governed them), so citizenship must not unbirth
// them at rest. Only an explicit off — the tile toggle, or a solo of another asset — ever
// writes `creature: false` (see curator/creatureCitizen.js for the resolver-side read).
initialEnabledAssets.creature = true;

/**
 * #1062 — a document's asset map, taken as the WHOLE set rather than an overlay
 * on the default four: what the document lists IS the set. An absent or empty map
 * means "the document does not say" and falls back to the default four: a damaged
 * file must not open to a blank canvas, and a genuine all-off state is stored as
 * explicit `false` values, never as `{}`.
 */
export function wholeEnabledAssets(map) {
  return map && typeof map === 'object' && Object.keys(map).length > 0 ? { ...map } : { ...initialEnabledAssets };
}

/** The rig half of a document load: the performer's own setup (DOC_FIELD_CLASS `rig`). Only `applyProject` calls this. */
export function rigFieldsFromDoc(doc, state) {
  const next = {
    // #103 Track B — a dangling quality key must never reach the caps lookup.
    quality: sanitizeQuality(doc.quality, state.quality || 'balanced'),
    // #310: AUTO left performer sight, but the governor still reads the
    // flag — the document carries the hidden default.
    autoQuality: doc.autoQuality !== false,
  };
  // #638 — restore palette locks so harmony regeneration keeps building
  // around the swatches the designer pinned.
  next.paletteLocks = sanitizePaletteLocks(doc.paletteLocks) || {};
  next.assetTags = sanitizeAssetTagsDoc(doc.assetTags) || {}; // #1942
  next.kits = sanitizeKitsDoc(doc.kits) || []; // #1944
  next.audioRoutes = sanitizeAudioRoutes(doc.audioRoutes); // #790
  {
    const canvas = sanitizeCanvasSpec(doc);
    next.canvasFps = canvas.canvasFps;
    next.stageMode = canvas.stageMode;
  }
  {
    // #617 + #1720 — banks land together: the bank list, the active bank, and
    // the active bank's map as the `midiMap` mirror. A doc without banks
    // (the legacy midiMap shape) becomes the single MAIN bank.
    const banks = sanitizeMidiBanks(doc.midiBanks, doc.midiMap);
    const active = sanitizeMidiActiveBank(doc.midiActiveBank, banks);
    next.midiBanks = banks;
    next.midiActiveBank = active;
    next.midiMap = activeBankMap(banks, active);
  }
  next.mathMacros = sanitizeMathMacros(doc.mathMacros); // #724 — a doc without macros has none
  // #651 — reimported titles persist; a doc without a title clears it.
  next.projectTitle = typeof doc.title === 'string' ? doc.title.slice(0, 80) : '';
  return next;
}

/**
 * The scene half of a document (DOC_FIELD_CLASS `scene`), as store fields. A scene key the document does not
 * carry comes back CLEARED (the same "a doc without X has none" every field here has always had), except
 * `enabledAssets`, which is only returned when the document lists one. `kits` is the kit LIBRARY the dealt triad
 * is checked against: the document's own on a load, the receiver's on a recipe.
 */
export function sceneFieldsFromDoc(doc, state, { kits = [] } = {}) {
  const next = {
    seed: doc.seed >>> 0,
    // #305 — sub-seed offsets restore with the seed; absent → zeros.
    seedOffsets: normalizeSeedOffsets(doc.seedOffsets),
    paletteId: doc.paletteId || state.paletteId,
    layoutParams: normalizeLayoutParams(doc.layoutParams),
    customAssets: sanitizeOverlay(doc.customAssets),
  };
  if (doc.enabledAssets && typeof doc.enabledAssets === 'object') {
    // #103 Track B — apply-path defense in depth: collapse hostile maps to
    // known asset ids (+ the doc's own sanitized custom assets) before they
    // reach the store.
    // #1062 — what the document lists IS the set. This used to seed the
    // default four ON and overlay the document, so an asset the file never
    // mentioned came back enabled and export -> import -> export widened.
    next.enabledAssets = wholeEnabledAssets(sanitizeEnabledAssets(doc.enabledAssets, next.customAssets));
  }
  if (doc.assetWeightOverrides && typeof doc.assetWeightOverrides === 'object') {
    next.assetWeightOverrides = { ...sanitizeAssetWeightOverrides(doc.assetWeightOverrides, next.customAssets) };
  } else {
    // The serializer omits the field when empty — without this, loading a
    // clean project over a session with overrides kept the old weights.
    next.assetWeightOverrides = {};
  }
  next.paletteOverrides = doc.paletteOverrides ?? null;
  next.light = sanitizeLight(doc.light); // #594 — a doc without a sun turns it off
  next.world = sanitizeWorld(doc.world); // #2104 step 3 — a doc's recorded world stands back up through the door; a doc without one stands world-less (never the session's leftover world, never the house default)
  next.assetStill = sanitizeAssetStill(doc.assetStill) || {}; // #1128 — a doc without pins moves everything
  next.assetAttach = sanitizeAssetAttach(doc.assetAttach) || {}; // #1355
  next.creatureRecords = sanitizeCreatureRecords(doc.creatureRecords); // #1849 — a doc without records has none
  next.shapeShelf = sanitizeShapeShelf(doc.shapeShelf); // #2280 — a doc without a shelf has an empty one
  next.constructRecords = sanitizeConstructRecords(doc.constructRecords); // #2108 — a doc without constructs has none
  next.constructLead = doc.constructLead === true; // #2108 — the gate rides the project; absent = off
  next.gaitRecords = sanitizeGaitRecords(doc.gaitRecords); // #2328 — a doc without gaits has none
  // #1694 S3 — the creature count rides doc.layoutParams.creatures (installed above with the
  // rest of the params; parseProject lands a pre-fold-in document's top-level creatureCount
  // there). Homes are found again for the new dish either way.
  next.assetKineme = { ...DEFAULT_ASSET_KINEME, ...sanitizeAssetKineme(doc.assetKineme) }; // #781 — a doc without kinemes is still; #705 — doc values win over the micro-HUD defaults
  next.kitTriad = sanitizeKitTriad(doc.kitTriad, [...SEED_KITS, ...kits]); // #1944
  next.regionKinemes = sanitizeRegionKinemesDoc(doc.regionKinemes) || {}; // #1434 — a doc without region edits leaves the family defaults alone
  next.assetOptions = sanitizeAssetOptions(doc.assetOptions, next.customAssets) || {}; // #1694 S2 — a doc without tile options is all-defaults (citizen family: both)
  {
    const canvas = sanitizeCanvasSpec(doc);
    next.canvasW = canvas.canvasW;
    next.canvasH = canvas.canvasH;
    next.canvasPresetId = canvas.canvasPresetId;
  }
  if (Array.isArray(doc.layers) && doc.layers.length > 0 && doc.activeLayerId) {
    // #103 Track B — bound on the apply path too; the live loop resolves
    // every layer per frame.
    next.layers = doc.layers.slice(0, MAX_LAYERS);
    next.activeLayerId = doc.activeLayerId;
    next.layerSnapshots = normalizeSnapshots(doc.layerSnapshots, doc.customAssets, doc);
    // Install the active layer's snapshot onto live state. The serializer
    // writes lockedParams/caGrid only into snapshots (never root fields),
    // so without this a load silently dropped parameter locks and the CA
    // grid; and a doc whose root values disagree with its active snapshot
    // rendered the wrong composition until a layer switch. For well-formed
    // docs this is a no-op — the snapshot was captured from the same
    // state as the root values.
    const activeSnap = next.layerSnapshots[doc.activeLayerId];
    if (activeSnap) {
      next.seed = activeSnap.seed >>> 0;
      next.seedOffsets = normalizeSeedOffsets(activeSnap.seedOffsets ?? doc.seedOffsets);
      next.paletteId = activeSnap.paletteId || next.paletteId;
      next.paletteOverrides = activeSnap.paletteOverrides ?? null;
      next.layoutParams = normalizeLayoutParams(activeSnap.layoutParams);
      next.lockedParams = activeSnap.lockedParams || {};
      next.caGrid = activeSnap.caGrid || null;
      next.enabledAssets = wholeEnabledAssets(activeSnap.enabledAssets); // #1062 — the snapshot is the whole set too
    }
  }
  return next;
}

/**
 * What a scene change resets that is NOT a document key: the stage's runtime on the OLD scene. Births and pins
 * belong to the old dish; the governor sheds are claims on the old scene's population; the palette is the
 * scene's, not a pick made this session (#1365). `qualityShedFrom` is NOT here: quality is the rig's.
 */
export function sceneRuntimeResets() {
  return {
    ingestError: null,
    paletteChosen: false, // #1365 — a loaded document's palette is the document's, not a pick made this session
    stageBirths: [], // #2037 — a loaded document starts its own performance: the old one's unbanked children leave with it
    dishPins: [],
    // #1694 S2 — the creature shed is likewise a governor claim on the OLD document's population.
    creatureShed: 0,
    dishLifeShed: 0, // #1923 — a governor claim on the OLD document's culture
    // #1574 — the travel shed is likewise a governor claim on the OLD document's roam.
    travelShed: false,
    // #1627 S1 — the weather shed is likewise a governor claim on the OLD document's air.
    weatherShed: false,
    // #1490 — the warp shed is likewise a governor claim on the OLD document's FX strata.
    feedbackWarpShed: false,
    // #1806 slice 2 — the accum-feed shed is likewise a governor claim on the OLD document's selection.
    accumFeedShed: false,
    // #1837 — the steering shed is likewise a governor claim on the OLD document's look.
    trailSteerShed: false,
    // #2327 — the construct collapse is likewise a governor claim on the OLD document's constructs.
    constructCollapse: false,
    constructPiecesLive: false,
  };
}

// A carried layer stack installs its active snapshot over these live fields (see sceneFieldsFromDoc).
const SNAPSHOT_INSTALLED = ['lockedParams', 'caGrid', 'enabledAssets'];

/**
 * The store fields a recipe sets. `replaceAll` (kc-r/3, which carries the whole scene): every scene key, a key
 * the recipe omits cleared. Otherwise (kc-r/1–2, kc-recipe/1–2): only the keys the recipe document has, plus what
 * its layer stack installs; every other scene key stays as it is. `enabledAssets` the recipe does not list is
 * never touched either way.
 */
export function sceneFieldsFor(doc, state, { replaceAll = false } = {}) {
  const all = sceneFieldsFromDoc(doc, state, { kits: state.kits || [] });
  if (replaceAll) return all;
  const carried = new Set(Object.keys(doc));
  if (Array.isArray(doc.layers) && doc.layers.length > 0 && doc.activeLayerId)
    for (const k of SNAPSHOT_INSTALLED) carried.add(k);
  const out = {};
  for (const k of Object.keys(all)) if (carried.has(k)) out[k] = all[k];
  return out;
}

/**
 * Undo/redo of a `scene` entry (history.js UNDO_KIND_SCENE): the saved scene document back through the same
 * sanitizers a recipe uses, plus the two snapshot-only fields the entry saves beside it. Rig keys are NOT here, so
 * an edit made to the rig after the paste is not rolled back with it.
 */
export function sceneRestoreFields(entry, state) {
  return {
    ...sceneFieldsFromDoc(entry.scene || {}, state, { kits: state.kits || [] }),
    lockedParams: entry.lockedParams,
    caGrid: entry.caGrid,
    ...sceneRuntimeResets(),
  };
}

/** The one undo step an applied recipe costs: the whole scene as it stands, pushed forced (a recipe is a discrete edit). */
export function pushSceneUndo(state) {
  return pushToUndo(state, true, UNDO_KIND_SCENE, sceneOf(state));
}

/** The scene snapshot an undo/redo counter-entry needs: the whole scene for a scene entry, nothing for any other kind. */
export const sceneSnapshotFor = (state, kind) => (kind === UNDO_KIND_SCENE ? sceneOf(state) : null);
