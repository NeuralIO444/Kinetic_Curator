// dishGround.mjs — #1183 slice 1: the resolver's dish, and the ground a content layer rests on.
//
// The live resolver owns ONE dish per document. For a content layer whose GROUND knob is above 0 and that has a
// PATTERN layer below it, groundArgs() returns the two extra arguments buildPlacements already understands
// ({ dish, lean }); for every other layer it returns the same frozen empty object, so nothing is passed and the
// frame is byte-identical to before. liveResolve.mjs (a one-writer file) takes only this call site.
//
// The ground is re-read every frame (Matt, 2026-10-11): buildPlacements runs each frame, and the function set on
// dish.ground carries this frame's time, so a mark's colour follows a drifting pattern.
//
// ponytail: buildPlacements refills the dish's 'marks' set on every call, so with several leaning layers the dish
// holds the LAST one's marks. Nothing reads dish.points yet; give each layer its own set when something does.
import { createDish } from '../engine/kernel/dish.js';
import { nearestPatternBelow, patternGround } from '../pattern/ground.js';

const NONE = Object.freeze({});
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The resolver's dish (one per resolver, so one per document). */
export function createResolverDish() {
  return createDish({ seed: 0 });
}

/**
 * Extra buildPlacements arguments for one content layer: `{ dish, lean }`, or the frozen empty object when the
 * layer has no ground or does not lean. `getPalette()` returns the ACTIVE palette (the one the pattern itself is
 * drawn with); it is a thunk so a layer that does not lean never pays for resolving it.
 */
export function groundArgs({ dish, layers, layerId, lean, getPalette, W, H, tSec, seed }) {
  const amount = clamp01(lean);
  if (!(amount > 0) || !dish) return NONE;
  const below = nearestPatternBelow(layers, layerId);
  if (!below) return NONE;
  const ground = patternGround(below.pattern, getPalette(), W, H);
  dish.seed = (seed >>> 0) || 0;
  dish.ground = (x, y) => ground.at(x, y, tSec);
  return { dish, lean: amount };
}
