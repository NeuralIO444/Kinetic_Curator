// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  serializeProject,
  writeAutosave,
  readAutosave,
} from '../state/projectDocument.js';

const DEBOUNCE_MS = 500;
// General safety net: any sustained stream of edits (a held slider, a fast
// evolve interval) would otherwise reset this debounce forever and autosave
// would never fire. A maxWait cap guarantees a write eventually.
// (Ambient life drift no longer touches layoutParams at all — #107 §2 moved
// it to the driftOverlay slot — so it is not what this guards against.)
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
      const { doc, quarantined } = readAutosave();
      if (quarantined) {
        // Boot factory defaults and say so. Never silently apply a document
        // we could not parse (#107 §6).
        useStore.getState().setPersistStatus('quarantined');
      }
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
        state.customAssets === prev.customAssets &&
        state.layers === prev.layers &&
        state.paletteOverrides === prev.paletteOverrides
      ) {
        return;
      }
      const now = Date.now();
      if (firstChangeAt.current == null) firstChangeAt.current = now;
      const doWrite = () => {
        firstChangeAt.current = null;
        const res = writeAutosave(serializeProject(useStore.getState()));
        const store = useStore.getState();
        // Do not clear a quarantine flag on a later successful write: the
        // operator still needs to know this session did not start from their
        // last document.
        if (store.persistStatus !== 'quarantined') {
          const next = res.ok ? 'ok' : 'unsaved';
          if (store.persistStatus !== next) store.setPersistStatus(next);
        }
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
