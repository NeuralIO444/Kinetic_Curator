import { useSyncExternalStore } from 'react';
import { createColdOpen, hold, COLD_OPEN_MS } from './coldOpen.mjs';

// One cold open per page load, shared by every top-bar button.
const coldOpen = createColdOpen({ ms: hold(COLD_OPEN_MS) });
let begun = false;
const begin = () => {
  if (begun || typeof window === 'undefined') return;
  begun = true;
  coldOpen.start({
    reducedMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    stage: !!document.fullscreenElement, // fullscreen is the stage: nothing should animate on it
  });
};

/** True while the top bar is showing the verbs' full names (the first ~2 s of a page load). */
export function useColdOpen() {
  begin();
  return useSyncExternalStore(coldOpen.subscribe, coldOpen.get, () => false);
}
