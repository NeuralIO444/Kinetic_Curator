// kernel/weather/registry.js — the weather family registry (#1183 dish contract).
//
// Weather = modules that act through field strengths, not post-processing
// ("weather is visibly in charge" — decided 2026-10-08). Entry:
// { id, family: 'weather', reads, writes, costTier, create } with
// create(seed, opts) → an update handle the orchestrator steps.
//
// No weather modules exist yet — weather-as-field is a later dish slice —
// so this registry starts empty. This is the hook they register into; UI
// renders weather tiles from this registry, so a new module is a new tile
// with zero panel changes.

import { createRegistry } from '../registry.js';

export const WEATHER = createRegistry('weather', {
  payloadKey: 'create',
  defaults: { reads: ['scalars'], writes: ['fields'], costTier: 1 },
});
