// rollSafety.js — what a random roll may and may not do to the picture. Pure.
//
// The KIN hammer's CHAOS roll (kineticRoll) is meant to be wild, but never a dead frame. Measured on
// 25 rolls (headless GL, luminance of every frame): 12 came out washed out, flat or black. Three causes:
//
//   1. The BOTTOM content layer composites over the bare canvas, so a random blend mode (screen over a
//      light ground, overlay / soft-light / difference over a dark one) goes white, black or flat.
//      -> the lowest content layer stays NORMAL in a roll.
//   2. INVERT turns the whole picture into its negative (a dark scene reads 0.25 -> 0.69).
//      -> a roll never picks it.
//   3. HAZE at its default strength (0.35 / lift 0.5) halves the contrast and doubles the brightness
//      (0.25 -> 0.47, range 0.67 -> 0.33): the pale veil.
//      -> a rolled haze is a gentle one (0.15 / 0.1 keeps 87% of the contrast).
//
// These are limits on what a ROLL deals. Anything the player chooses by hand is untouched.

import { defaultFxParams } from './fxFilters.js';

/** FX kinds a roll never deals. */
export const ROLL_EXCLUDED_FX = Object.freeze(['invert']);

/** Param overrides for kinds whose defaults wash the picture out. */
const ROLL_FX_PARAMS = Object.freeze({ haze: Object.freeze({ amount: 0.15, lift: 0.1 }) });

/** The kinds a roll may pick from. */
export const rollFxKinds = (menuKinds) => menuKinds.filter((k) => !ROLL_EXCLUDED_FX.includes(k));

/** Default params for a rolled effect: the usual defaults, softened where they would wash the picture out. */
export const rollFxParams = (kind) => ({ ...defaultFxParams(kind), ...(ROLL_FX_PARAMS[kind] || null) });

/**
 * Blend mode a roll gives a content layer. The lowest content layer is always 'normal'.
 * @param {boolean} isBottom is this the lowest content layer
 * @param {() => string} pickBlend draws a random blend mode
 */
export const rollBlend = (isBottom, pickBlend) => (isBottom ? 'normal' : pickBlend());
