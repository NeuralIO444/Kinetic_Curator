// assets/assetRoles.js — #1942: role FITS from measured traits. Pure, browser-safe.
//
// A role fit is a weighted sum of traits in [0, 1] (an `invert` term contributes 1 − trait). The formula table is
// exported data — the Davis role deal (#1945) and the WetLab filters (#1946) read fits, never re-derive them.
import { TRAIT_NAMES } from './assetTraits.js';

export const ROLES = Object.freeze(['body', 'limb', 'head', 'texture', 'accent']);

/** role → weighted trait terms. Each role's weights sum to 1, so every fit is itself in [0, 1]. */
export const ROLE_FORMULAS = Object.freeze({
  body: [
    { trait: 'mass', w: 0.35 },
    { trait: 'fill', w: 0.3 },
    { trait: 'elong', w: 0.2, invert: true },
    { trait: 'busy', w: 0.15, invert: true },
  ],
  limb: [
    { trait: 'elong', w: 0.5 },
    { trait: 'stroke', w: 0.3 },
    { trait: 'mass', w: 0.2, invert: true },
  ],
  head: [
    { trait: 'sym', w: 0.35 },
    { trait: 'fill', w: 0.3 },
    { trait: 'elong', w: 0.2, invert: true },
    { trait: 'mass', w: 0.15 },
  ],
  texture: [
    { trait: 'busy', w: 0.5 },
    { trait: 'fill', w: 0.3, invert: true },
    { trait: 'stroke', w: 0.2 },
  ],
  accent: [
    { trait: 'mass', w: 0.6, invert: true },
    { trait: 'elong', w: 0.2, invert: true },
    { trait: 'sym', w: 0.2 },
  ],
});

/** The five role fits of a traits record (rounded to 3 places). Null traits fit nothing: every role 0. */
export function roleFits(traits) {
  const out = {};
  for (const role of ROLES) {
    let s = 0;
    if (traits) {
      for (const { trait, w, invert } of ROLE_FORMULAS[role]) {
        const v = traits[trait];
        s += w * (invert ? 1 - v : v);
      }
    }
    out[role] = Math.round(s * 1000) / 1000;
  }
  return out;
}

/** The role an asset fits best (ties break in ROLES order). */
export function bestRole(fits) {
  return ROLES.reduce((a, b) => (fits[b] > fits[a] ? b : a), ROLES[0]);
}

// every formula must name real traits
for (const role of ROLES)
  for (const t of ROLE_FORMULAS[role]) if (!TRAIT_NAMES.includes(t.trait)) throw new Error(role);
