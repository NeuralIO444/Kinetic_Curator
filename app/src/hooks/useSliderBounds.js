import { useSyncExternalStore } from 'react';
import { createBoundsStore } from '../components/sliderBounds.mjs';

// One session-wide store (#1127): a widened slider stays widened until the page reloads, and is never saved.
export const sliderBounds = createBoundsStore();

/** [min, max] for a slider key: the performer's span if they set one, else `fallback`. */
export function useSliderBounds(key, fallback) {
  useSyncExternalStore(sliderBounds.subscribe, sliderBounds.version);
  return sliderBounds.get(key, fallback);
}
