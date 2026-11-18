// state/recipeSceneKeys.js — which scene keys a v3 recipe carries in its scene block `x` (#2324, recipes-v3-spec §3.4).
//
// The scene block is every scene key of the project document OUTSIDE the ones the recipe carries on their own:
// seed, offsets, palette, overrides and layout (top-level fields) and the layer stack (`k`). It is a literal list,
// not derived from DOC_FIELD_CLASS, so the recipe modules stay light (several selfchecks load them without the
// store). recipeUrls.v3.selfcheck.mjs holds the list equal to DOC_FIELD_CLASS: a scene key added there fails that
// check until it is listed here, so a new scene field cannot be silently left out of a link.
// Pure and node-importable.

/** Scene keys that travel in `x`, in a fixed order. */
export const SCENE_BLOCK_KEYS = Object.freeze([
  'enabledAssets',
  'assetWeightOverrides',
  'customAssets',
  'light',
  'world',
  'assetKineme',
  'regionKinemes',
  'assetStill',
  'assetOptions',
  'assetAttach',
  'creatureRecords',
  'shapeShelf',
  'constructRecords',
  'gaitRecords',
  'constructLead',
  'kitTriad',
  'canvasW',
  'canvasH',
  'canvasPresetId',
]);

/** Scene keys a recipe carries outside `x` (their own fields, or the stack). */
export const CODEC_OWN_SCENE_KEYS = Object.freeze([
  'seed',
  'seedOffsets',
  'paletteId',
  'paletteOverrides',
  'layoutParams',
  'layers',
  'activeLayerId',
  'layerSnapshots',
]);

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** The scene block of a scene document (`sceneOf(state)`): its SCENE_BLOCK_KEYS that are present. Never null. */
export function pickSceneBlock(doc) {
  const out = {};
  if (!isObj(doc)) return out;
  for (const k of SCENE_BLOCK_KEYS) if (doc[k] !== undefined) out[k] = doc[k];
  return out;
}

/** Only the SCENE_BLOCK_KEYS of an untrusted object (a decoded `x`, or parsed text lines). Unknown keys are dropped. */
export function sceneBlockFrom(raw) {
  return pickSceneBlock(isObj(raw) ? raw : {});
}
