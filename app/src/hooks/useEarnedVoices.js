import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { Events, on } from '../composition/eventBus.js';

// #1153 — when Davis's BLOOM lands (a keep after a run of the artist's own rolls) the instrument shelves that moment
// as an earned voice. The feed announces it the instant the keep is recorded, while the kept frame is still the live
// one, so what is shelved is the frame that was kept, not whatever the next roll made of it.
export function useEarnedVoices() {
  useEffect(() => on(Events.BLOOM, ({ rolls, at } = {}) => useStore.getState().mintEarnedVoice({ rolls, at })), []);
}
