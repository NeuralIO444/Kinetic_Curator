// state/recipeLive.js — the live store as a recipe carrier (#2324).
//
// recipes.recipeFieldsFromKept turns any "kept render" (a snapshot, a favorite, the store) into recipe fields, but
// it stays free of the project document so the recipe modules load light. A v3 recipe also carries the scene block,
// which is read from the document's own scene view (`sceneOf`), so it is exactly what a save would hold.
import { sceneOf } from './projectDocument.js';
import { recipeFieldsFromKept } from './recipes.js';
import { pickSceneBlock } from './recipeSceneKeys.js';

/** Recipe fields for the scene on stage: seed, offsets, palette (+ overrides), layout, stack and the scene block. */
export function recipeFieldsFromState(state) {
  return {
    ...recipeFieldsFromKept(state),
    paletteOverrides: state.paletteOverrides ?? null,
    scene: pickSceneBlock(sceneOf(state)),
  };
}
