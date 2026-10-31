// app/src/engine/jansenMeasures.js — #1864 BEAST S1: the 13 Jansen measure genes (relative to a).
//
// Holy numbers from research: a=38.0, b=41.5, c=39.3, d=40.1, e=55.8, f=39.4, g=36.7,
// h=65.7, i=49.0, j=50.0, k=61.9, l=7.8, m=15.0.
// All bars expressed relative to a=1 for the gene; absolute recovered by scale.
// k has a narrow range (±2% of holy relative) because research shows it breaks assembly outside that.
// Measure genes are the explicit exception to the non-brittle mutation rule: mutation uses
// seeded mutate→feasibility-check→retry (feasibility arrives in S2).
//
// Published gait anchors (absolute units, a=38): flatness 0.0281, ripple 0.267, step 2.73,
// clearance 1.12, duty 0.249. Relative solver (a=1) produces proportional values;
// multiply by scale * a to recover absolute for golden comparison.

export const JANSEN_HOLY = Object.freeze({
  a: 38.0, b: 41.5, c: 39.3, d: 40.1, e: 55.8,
  f: 39.4, g: 36.7, h: 65.7, i: 49.0, j: 50.0,
  k: 61.9, l: 7.8, m: 15.0,
});

export const JANSEN_RELATIVE = Object.freeze({
  a: 1.0,
  b: JANSEN_HOLY.b / JANSEN_HOLY.a,
  c: JANSEN_HOLY.c / JANSEN_HOLY.a,
  d: JANSEN_HOLY.d / JANSEN_HOLY.a,
  e: JANSEN_HOLY.e / JANSEN_HOLY.a,
  f: JANSEN_HOLY.f / JANSEN_HOLY.a,
  g: JANSEN_HOLY.g / JANSEN_HOLY.a,
  h: JANSEN_HOLY.h / JANSEN_HOLY.a,
  i: JANSEN_HOLY.i / JANSEN_HOLY.a,
  j: JANSEN_HOLY.j / JANSEN_HOLY.a,
  k: JANSEN_HOLY.k / JANSEN_HOLY.a,
  l: JANSEN_HOLY.l / JANSEN_HOLY.a,
  m: JANSEN_HOLY.m / JANSEN_HOLY.a,
});

/** Published absolute anchors (a=38). Relative results scale by (scale * JANSEN_HOLY.a). */
export const WANG_ANCHORS = Object.freeze({
  flatness: 0.0281,
  ripple: 0.267,
  step: 2.73,
  clearance: 1.12,
  duty: 0.249,
});

/** Ranges for relative measures. k is narrow (±0.02 around holy relative). Others ±0.30. */
export const MEASURE_RANGES = Object.freeze({
  a: Object.freeze({ min: 0.5, max: 2.0 }), // scale of the frame; absolute size via scale gene
  b: Object.freeze({ min: JANSEN_RELATIVE.b * 0.7, max: JANSEN_RELATIVE.b * 1.3 }),
  c: Object.freeze({ min: JANSEN_RELATIVE.c * 0.7, max: JANSEN_RELATIVE.c * 1.3 }),
  d: Object.freeze({ min: JANSEN_RELATIVE.d * 0.7, max: JANSEN_RELATIVE.d * 1.3 }),
  e: Object.freeze({ min: JANSEN_RELATIVE.e * 0.7, max: JANSEN_RELATIVE.e * 1.3 }),
  f: Object.freeze({ min: JANSEN_RELATIVE.f * 0.7, max: JANSEN_RELATIVE.f * 1.3 }),
  g: Object.freeze({ min: JANSEN_RELATIVE.g * 0.7, max: JANSEN_RELATIVE.g * 1.3 }),
  h: Object.freeze({ min: JANSEN_RELATIVE.h * 0.7, max: JANSEN_RELATIVE.h * 1.3 }),
  i: Object.freeze({ min: JANSEN_RELATIVE.i * 0.7, max: JANSEN_RELATIVE.i * 1.3 }),
  j: Object.freeze({ min: JANSEN_RELATIVE.j * 0.7, max: JANSEN_RELATIVE.j * 1.3 }),
  k: Object.freeze({ min: JANSEN_RELATIVE.k * 0.98, max: JANSEN_RELATIVE.k * 1.02 }), // tripwire
  l: Object.freeze({ min: JANSEN_RELATIVE.l * 0.5, max: JANSEN_RELATIVE.l * 1.5 }),
  m: Object.freeze({ min: JANSEN_RELATIVE.m * 0.7, max: JANSEN_RELATIVE.m * 1.3 }),
  legCount: Object.freeze({ min: 6, max: 12 }), // integer
  scale: Object.freeze({ min: 0.6, max: 1.4 }), // narrow size gene
  phase: Object.freeze({ min: 0, max: 1 }), // per-leg phase offset 0..1
});

export const MEASURE_IDS = Object.freeze([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
]);

/** Wild-type relative genome values (for tests and the type specimen). */
export function wildTypeMeasures() {
  return { ...JANSEN_RELATIVE, legCount: 12, scale: 1.0 };
}
