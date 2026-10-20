// projectWatch.mjs — which store fields make a project dirty. One list, next to the thing it must match.
//
// serializeProject (projectDocument.js) saves a set of store fields. The autosave used to watch only 12 of them, so a
// change to `light`, `mathMacros`, `paletteLocks`, the canvas size, `seedOffsets`, `projectTitle`,
// `assetStill`, `assetAttach`, `autoQuality`, `activeLayerId` or `layerSnapshots` was saved only if some OTHER watched
// field happened to change before the page closed. This list is every field the document reads; projectWatch.selfcheck
// derives it from projectDocument.js, so adding a saved field without watching it fails CI. (#1694 S3 — the creature
// count needs no key of its own here any more: it rides `layoutParams`, already watched wholesale.)
export const PROJECT_STATE_KEYS = Object.freeze([
  'seed', 'seedOffsets', 'paletteId', 'layoutParams', 'enabledAssets', 'quality', 'autoQuality',
  'assetWeightOverrides', 'projectTitle', 'paletteOverrides', 'paletteLocks', 'customAssets', 'light',
  'assetKineme', 'regionKinemes', 'assetStill', 'assetOptions', 'assetAttach', 'audioRoutes',
  'canvasW', 'canvasH', 'canvasFps', 'canvasPresetId', 'stageMode',
  'midiMap', 'mathMacros', 'layers', 'activeLayerId', 'layerSnapshots',
]);

/** True when any field the document saves changed between two store states (reference inequality, as zustand gives). */
export function projectDirty(state, prev) {
  if (!state || !prev) return false;
  for (const k of PROJECT_STATE_KEYS) if (state[k] !== prev[k]) return true;
  return false;
}
