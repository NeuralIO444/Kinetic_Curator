// personaTastes.js — taste profiles distilled from the mode-persona files.
//
// SOURCE OF TRUTH: the `kc-persona/1` records in app/src/personas/ (#2381, the Persona Kernel). Each
// persona's distilled mapping — name, alias, rationale and weights — lives in its record's identity/taste
// slots; this file is a READER that projects the records back into the shape the engine has always
// consumed. The records were distilled by hand from ~/workspace/your_files/personas/<slug>.md (NOT in
// this repo — they live in the user's files), mapping each persona's Loves/Avoids onto the 19 measurable
// features in taste.js. It is an interpretation, not a measurement: weights were set by reading each
// persona file and mapping only what is actually computable from candidate params. Anything the file
// says about palette, brushwork, or photorealism has no measurable counterpart in the randomized params
// and is deliberately left out — never faked.
//
// If a persona .md changes, re-distill by hand and update the record (registry.mjs validates it; the
// personaKernel selfcheck fails on drift). A future MLX ranker replaces this whole file; the engine
// contract in curate.js is unchanged by that swap.
//
// DISPLAY POLICY (Matt's IP caution): the product surface NEVER shows real
// artist names. `name` is the honest lineage kept in code only; `alias` is
// the TE-style evocative label the UI shows (voice selector, "persona pick:
// <alias>" hint). After <artist> attribution stays here in code and in the
// persona source files — lineage documented, just not on the surface.

import { getPersona } from '../personas/registry.mjs';

export const TASTE_FEATURES = [
  'markDensity', // count — how many marks
  'markSize', // mean(scale) — how big the marks are
  'sizeVariety', // scale range — size diversity across marks
  'rotationSpread', // rotate range — angular diversity
  'opacity', // mean(alpha)
  'opacityVariety', // alpha range
  'disorder', // jitter + displacement — chaotic placement
  'coverage', // density — how much of the field is filled
  'depth', // zTiers — layering
  'flowEnergy', // noiseSpeed — motion speed
  'flowWarp', // noiseFreq — spatial warping of the field
  'swarmDrive', // swarmCohesion — flocking tightness
  'attractors', // gravityWells — structured pull points
  'particles', // particleCount — fine particulate detail
  'calm', // damping — how fast motion settles
  'windPush', // wind — ambient push on the marks (#518)
  'breathSwell', // breath — slow scale swell (#518)
  'drift', // lifeDrift — organic wander (#518)
  'flowRate', // flap — beat rate (#518)
];

// weights: +loves / −avoids. Sparse on purpose — only set where the
// persona file actually says something measurable. The order is the order
// this table has always had: DAVIS first, then the nine voice personas.
const TASTE_IDS = ['davis', 'molnar', 'mohr', 'benjamin', 'reas', 'haeckel', 'oxman', 'stock', 'anadol', 'menkman'];

export const PERSONA_TASTES = TASTE_IDS.map((id) => {
  const record = getPersona(id);
  return {
    id: record.id,
    name: record.identity.name,
    alias: record.identity.callsign,
    rationale: record.taste.rationale,
    weights: { ...record.taste.weights },
  };
});

export function getPersonaTaste(id) {
  return PERSONA_TASTES.find((p) => p.id === id) ?? null;
}

export function personaTasteIds() {
  return PERSONA_TASTES.map((p) => p.id);
}
