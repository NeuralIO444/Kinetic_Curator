/** #520 / #732 — stack FX n was one family, not a 4-slot rack.
 *  FX-1 Distort · FX-2 Tonal · FX-3 Blur · FX-4 Finish
 *
 *  #1609 (Strata Q Phase 3, D6) — the per-track family binding is dead: the
 *  skeleton has ONE FX layer holding any 4 kinds, so no track ordinal owns a
 *  family any more. FX_TRACK_FAMILY / rackSlotForFxOrdinal / kindsForFxOrdinal
 *  remain only as the historical record of the binding; nothing in the app
 *  routes adds through them. What survives is the kind→family lookup below,
 *  which the free-pick editor uses to face each tile with its family.
 */
import { FX_RACK } from './fxFilters.js';

export const FX_TRACK_FAMILY = {
  1: 'EF-2',
  2: 'EF-3',
  3: 'EF-1',
  4: 'EF-4',
};

export function rackSlotForFxOrdinal(n) {
  const id = FX_TRACK_FAMILY[n];
  return FX_RACK.find((s) => s.slot === id) || null;
}

export function kindsForFxOrdinal(n) {
  return rackSlotForFxOrdinal(n)?.kinds || [];
}

/** The rack slot (family) a kind belongs to — every live kind is in exactly one. */
export function rackSlotForKind(kind) {
  return FX_RACK.find((s) => s.kinds.includes(kind)) || null;
}
