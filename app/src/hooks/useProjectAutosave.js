// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  serializeProject,
  writeAutosave,
  readAutosave,
} from '../state/projectDocument.js';

const DEBOUNCE_MS = 500;
const RESTORED_FLAG = 'kc:project:restored-session';

/**
 * Subscribe to meaningful project fields, debounce write to localStorage.
 * On first mount, restore last project once per browser session.
 */
export function useProjectAutosave() {
  const timer = useRef(null);
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
        state.enabledAssets === prev.enabledAssets
      ) {
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = useStore.getState();
        writeAutosave(serializeProject(s));
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
