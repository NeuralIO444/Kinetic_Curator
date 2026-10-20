// kernel/weather/registry.js — the weather family registry (#1183 dish contract).
//
// Weather = modules that act through field strengths, not post-processing
// ("weather is visibly in charge" — decided 2026-10-08). Entry:
// { id, family: 'weather', reads, writes, costTier, create } with
// create(seed, opts) → an update handle the orchestrator steps.
//
// This is the hook weather modules register into; UI renders weather tiles
// from this registry, so a new module is a new tile with zero panel changes.
// First module: 'haze-air' (#1183 weather slice 1, below).

import { createRegistry } from '../registry.js';
import { makeNoiseField } from '../field/index.js';

export const WEATHER = createRegistry('weather', {
  payloadKey: 'create',
  defaults: { reads: ['scalars'], writes: ['fields'], costTier: 1 },
});

/** Octaves of fBm in the mist. Cost ruling (Matt, 2026-10-19): the field ships at
 *  2 octaves — measured at 800 marks, one sample costs 0.117 ms against 0.154 ms
 *  for the noise defaults' 3 (and 0.061 ms at 1 octave); two keeps a finer grain
 *  in the mist inside the ruled ≈0.6 ms weather budget. A caller may still pass
 *  its own `octaves` (the kernel probe does), the module's default is 2. */
export const HAZE_AIR_OCTAVES = 2;

/**
 * Haze as air — the FX layer's haze as a seeded fBm field in the dish
 * (#1183 weather slice 1). The field is analytic — a pure function of
 * (seed, x, y, z), z advanced by loop time so the mist drifts — and the
 * marks' response to it (colour toward the veil + alpha thinning) lives in
 * engine/weatherAir.mjs; the connection (nearest FX layer above with haze,
 * dish.air) is gl/dishWeather.mjs. Declared costTier 1 beside the response.
 * create(seed, { freq, octaves, lacunarity, gain, z }).
 */
WEATHER.register({
  id: 'haze-air',
  reads: ['fx.haze'],
  writes: ['fields.air'],
  costTier: 1,
  create: (seed, opts = {}) => makeNoiseField(seed >>> 0, { octaves: HAZE_AIR_OCTAVES, ...opts }),
});
