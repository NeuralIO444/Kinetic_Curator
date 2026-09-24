// useCuratorIPC — listens to native Apple Neural Engine curation events (#tally).
// Streams confidence updates from Phase 3 Core ML into the Zustand store
// to drive the Teenage Engineering hardware TallyLight on the MasterBar.

import { useEffect } from 'react';
import { useStore } from '../state/store.js';

export function useCuratorIPC() {
  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    async function initListener() {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        if (cancelled) return;

        unlisten = await listen('curator-confidence', (event) => {
          const payload = event.payload || {};
          const score = typeof payload.score === 'number' ? payload.score : 0;
          const active = payload.active !== false;
          const latency = typeof payload.latency_ms === 'number' ? payload.latency_ms : 0;

          useStore.getState().setCuratorConfidence(score, active, latency);
        });
      } catch {
        // Running in standard web browser outside Tauri desktop shell — silent fallback.
      }
    }

    initListener();

    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') {
        unlisten();
      }
    };
  }, []);
}
