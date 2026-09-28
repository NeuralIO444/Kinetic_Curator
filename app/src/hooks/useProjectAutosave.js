// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import {
  serializeProject,
  writePipelineAutosave,
  readPipelineAutosave,
} from '../state/projectDocument.js';
import { rollLivingBoot } from '../data/firstLight.js';

const DEBOUNCE_MS = 500;
// General safety net: any sustained stream of edits (a held slider, a fast
// evolve interval) would otherwise reset this debounce forever and autosave
// would never fire. A maxWait cap guarantees a write eventually.
// (Ambient life drift no longer touches layoutParams at all — #425 moved
// it into the layer resolver — so it is not what this guards against.)
const MAX_WAIT_MS = 4000;
const RESTORED_FLAG = 'kc:project:restored-session';

/**
 * #707 — `?boot=factory` skips the living boot and starts from the
 * pre-#707 factory defaults. Deterministic entry for e2e (and anyone who
 * wants the old blank-ish start); the query string survives reloads.
 */
function bootFactoryRequested() {
  try {
    return new URLSearchParams(window.location.search).get('boot') === 'factory';
  } catch {
    return false;
  }
}

/**
 * #707 — apply a rolled First Light starter directly (no MIX morph: this is
 * the first frame, not a transition). Seed is re-rolled so every fresh boot
 * is a different piece; running is forced on so the canvas is alive on load.
 */
function applyLivingBoot() {
  const st = useStore.getState();
  const { preset, paletteId, assetIds } = rollLivingBoot();
  st.bumpSeed(); // fresh random seed so every boot is a different piece
  st.setPaletteId(paletteId);
  st.setEnabledAssets(Object.fromEntries(assetIds.map((id) => [id, true])));
  st.setLayoutParams({ ...preset.params, composition: preset.id });
  // The instrument wakes up playing: running is forced on (also clears a
  // watchdog hard stop per the #264 resume contract).
  st.setRunning(true);
}

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
      const { doc, quarantined } = readPipelineAutosave();
      if (quarantined) {
        // Boot factory defaults and say so. Never silently apply a document
        // we could not parse (#107 §6).
        useStore.getState().setPersistStatus('quarantined');
      }
      if (!doc) {
        // #707 — living boot: no saved project means the instrument wakes
        // up playing. A random First Light starter (curated preset +
        // palette + 2–3 assets), a fresh seed, motion running. This is the
        // only path that changes the empty state — restores are untouched.
        // `?boot=factory` opts out (deterministic e2e entry).
        // NOTE: the restored-session flag is deliberately NOT set here, so
        // a document written between load and reload (the e2e seedDoc
        // pattern) is still picked up on the next boot, exactly as before.
        if (!bootFactoryRequested()) applyLivingBoot();
        return;
      }
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
        const res = writePipelineAutosave(serializeProject(useStore.getState()));
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
