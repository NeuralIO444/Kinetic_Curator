// kernel/feature/registry.js — the feature family registry (#1183 dish contract).
//
// Features = world features with position + radius (tears/rifts,
// attractors). Entry: { id, family: 'feature', reads, writes, costTier,
// create } with create(seed, opts) → { id, kind, x, y, radius, … }, placed
// into dish.features at dish-fill time.
//
// No feature modules exist yet — tears and attractors are later dish slices —
// so this registry starts empty. This is the hook they register into.

import { createRegistry } from '../registry.js';

export const FEATURES = createRegistry('feature', {
  payloadKey: 'create',
  defaults: { reads: ['seed'], writes: ['features'], costTier: 0 },
});
