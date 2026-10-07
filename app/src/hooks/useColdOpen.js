import { useSyncExternalStore } from 'react';
import { createColdOpen } from './coldOpen.mjs';

// One cold open per page load, shared by every top-bar button.
// `window.__KC_COLD_OPEN_MS` is a test hook (like __KC_EXPOSE_STORE): a starved CI runner can take longer than the
// real 2.2 s just to get to the first assertion, so the e2e stretches the window instead of racing it.
const coldOpen = createColdOpen({ ms: (typeof window !== 'undefined' && Number(window.__KC_COLD_OPEN_MS)) || undefined });
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
