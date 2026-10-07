// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { Events, emit } from '../composition/eventBus.js';
import {
  serializeProject,
  writePipelineAutosave,
  readPipelineAutosave,
} from '../state/projectDocument.js';
import { decideBoot } from '../state/startupBoot.mjs';
import { recipeToProjectDoc } from '../state/recipes.js';
import { parseBootHash, describePaletteFallback } from '../state/recipeUrls.js';

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
 * #946 — startup chaos: one full wild roll on cold launch. Reuses the #945
 * kineticRoll path (seed, palette, composition, mode, FX chain, blend
 * modes, assets, density/count, behave) — one atomic store update, so the
 * roll is exactly one undo entry. Running is forced on so the canvas is
 * alive on load (same "wakes up playing" contract the living boot had).
 * Heat starts cool: the first KIN tap after boot is a RULES pass.
 */
function applyStartupChaos() {
  const st = useStore.getState();
  st.kineticRoll();
  st.setRunning(true);
  emit(Events.ROLL_GUARD, { kind: 'chaos' }); // #1107: the cold-open roll is judged like any other
}

// Module-scope once-guard: the `restored` ref below already makes the boot
// effect exactly-once per mount (StrictMode-safe), but a hot reload can
// remount the tree without re-executing this module — this flag is the
// cheap distinguisher so HMR doesn't fire a second chaos roll.
let bootFired = false;

/**
 * #534 — share-link boot. A `#r=kc-r/1.…` fragment is an explicit paste: it
 * wins over the autosave restore (and over `?boot=factory`, which only opts
 * out of the *random* living boot). The fragment is consumed (stripped) once
 * applied, so a reload falls back to the autosave instead of re-applying the
 * link over the operator's tweaks. Fail-closed: an unreadable link boots the
 * normal path with a note; an unknown palette falls back via the catalog
 * with a badge.
 *
 * Returns 'applied' (skip the rest of boot), 'bad' (consumed but broken —
 * continue with the normal boot), or 'none' (no fragment).
 */
function bootFromHash() {
  let hash = '';
  try {
    hash = window.location.hash || '';
  } catch {
    // no window (SSR/tests) — normal boot
  }
  const parsed = parseBootHash(hash);
  if (parsed.status === 'none') return 'none';
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    // non-fatal: the link just stays in the bar
  }
  const st = useStore.getState();
  if (parsed.status === 'bad') {
    st.setBootNotice('Share link unreadable — started clean');
    return 'bad';
  }
  const recipe = parsed.recipe;
  st.applyProject({ ...recipeToProjectDoc(recipe), paletteOverrides: recipe.paletteOverrides });
  const fb = describePaletteFallback(recipe.paletteId, st.userPalettes);
  st.setBootNotice(
    fb
      ? `Opened from link · palette "${fb.requested}" not here — using "${fb.used}"`
      : 'Opened shared scene from link',
  );
  try {
    sessionStorage.setItem(RESTORED_FLAG, '1');
  } catch {
    // ignore
  }
  return 'applied';
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
    if (restored.current || bootFired) return;
    restored.current = true;
    bootFired = true;
    try {
      // #946 — in START: CHAOS mode (the default) every cold page load
      // gets its opening roll, even on a same-session reload or second tab
      // (the #33 once-per-session gate below only governs the restore).
      // ?boot=factory and START: FIXED never roll.
      if (sessionStorage.getItem(RESTORED_FLAG)) {
        const st = useStore.getState();
        if (st.startupMode !== 'fixed' && !bootFactoryRequested()) applyStartupChaos();
        return;
      }
      // #534 — a share-link fragment boots the linked scene instead of the
      // autosave. 'bad' was consumed but broken: fall through to the normal
      // boot with the note already set. 'applied' wins over everything —
      // an explicit paste is never rolled over.
      const hashBoot = bootFromHash();
      if (hashBoot === 'applied') return;
      const st = useStore.getState();
      const { doc, quarantined } = readPipelineAutosave();
      const decision = decideBoot({
        shareApplied: false,
        factoryRequested: bootFactoryRequested(),
        startupMode: st.startupMode,
        hasDoc: !!doc,
      });
      if (quarantined) {
        // Boot factory defaults and say so. Never silently apply a document
        // we could not parse (#107 §6).
        st.setPersistStatus('quarantined');
      }
      if (decision.action === 'restore' || decision.action === 'restore-roll') {
        // #33 — the saved project is the undo base the startup roll lands
        // on, so yesterday is one Ctrl+Z away. (START: FIXED skips the
        // restore — the known opener is the factory defaults, not
        // yesterday. ?boot=factory keeps its historical meaning: restore,
        // no roll.)
        st.applyProject(doc);
        sessionStorage.setItem(RESTORED_FLAG, '1');
      }
      if (decision.action === 'roll' || decision.action === 'restore-roll') {
        // #946 — replaces the #707 living boot: one full wild roll, then
        // the instrument settles into normal tap behavior (heat starts
        // cool, so the first KIN tap is a RULES pass).
        // NOTE: the restored-session flag is deliberately NOT set on the
        // fresh-boot roll, so a document written between load and reload
        // (the e2e seedDoc pattern) is still picked up on the next boot,
        // exactly as before.
        applyStartupChaos();
      }
      // 'factory' — do nothing: the initial store state is the known,
      // deterministic opener.
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
        state.assetKineme === prev.assetKineme && // #781
        state.audioRoutes === prev.audioRoutes && // #790
        state.midiMap === prev.midiMap && // #617
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
