// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  serializeProject,
  writeAutosave,
  readAutosave,
} from '../state/projectDocument.js';

const DEBOUNCE_MS = 500;
// Continuous ambient drift (useContinuousLife, on by default via
// lifeDrift) replaces layoutParams every frame while running, which would
// otherwise reset this debounce forever and autosave would never fire.
// A maxWait cap guarantees a write eventually.
const MAX_WAIT_MS = 4000;
const RESTORED_FLAG = 'kc:project:restored-session';

/**
 * Subscribe to meaningful project fields, debounce write to localStorage.
 * On first mount, restore last project once per browser session.
 */
export function useProjectAutosave() {
  const timer = useRef(null);
  const firstChangeAt = useRef(null);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      if (sessionStorage.getItem(RESTORED_FLAG)) return;
      const doc = readAutosave();
      if (!doc) return;
      useStore.getState().applyProject(doc);
      sessionStorage.setItem(RESTORED_FLAG, '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (
        state.seed === prev.seed &&
        state.paletteId === prev.paletteId &&
        state.quality === prev.quality &&
        state.layoutParams === prev.layoutParams &&
        state.enabledAssets === prev.enabledAssets &&
        state.assetWeightOverrides === prev.assetWeightOverrides &&
        state.layers === prev.layers
      ) {
        return;
      }
      const now = Date.now();
      if (firstChangeAt.current == null) firstChangeAt.current = now;
      const doWrite = () => {
        firstChangeAt.current = null;
        writeAutosave(serializeProject(useStore.getState()));
      };

      if (timer.current) clearTimeout(timer.current);
      if (now - firstChangeAt.current >= MAX_WAIT_MS) {
        doWrite();
      } else {
        timer.current = setTimeout(doWrite, DEBOUNCE_MS);
      }
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
