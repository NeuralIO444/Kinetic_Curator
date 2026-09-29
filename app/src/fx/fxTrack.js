/** #520 / #732 — stack FX n is one family, not a 4-slot rack.
 *  FX-1 Distort · FX-2 Tonal · FX-3 Blur · FX-4 Finish
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
