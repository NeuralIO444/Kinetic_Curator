// Debounced project autosave + boot restore (#33).
import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { Events, emit } from '../composition/eventBus.js';
import { serializeProject, writePipelineAutosave, readPipelineAutosave } from '../state/projectDocument.js';
import { decideBoot } from '../state/startupBoot.mjs';
import { projectDirty } from '../state/projectWatch.mjs'; // every field the document saves
import { recipeToProjectDoc } from '../state/recipes.js';
import { parseBootHash, describePaletteFallback } from '../state/recipeUrls.js';
import { scopeDecks } from '../state/kineticScope.mjs'; // #1772: START sets the opener's width

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
  // #1772 — the START pill sets how wide the opener deals: KOZ is the full wild roll (#946), WEAK / MED one look +
  // voice pass under their decks (one undo entry either way). OFF never reaches here (decideBoot → factory).
  const open = scopeDecks(st.startupMode).launch === 'open';
  if (open) st.kineticOpenPass();
  else st.kineticRoll();
  st.setRunning(true);
  emit(Events.ROLL_GUARD, { kind: open ? 'open' : 'chaos' }); // #1107: the cold-open roll is judged like any other
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
    fb ? `Opened from link · palette "${fb.requested}" not here — using "${fb.used}"` : 'Opened shared scene from link',
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
    // #1646 — narrowed by progress below: a throw while the saved
    // document is still at risk (the flag read, the hash, the
    // autosave read, the apply) is a lost session and must say so;
    // a throw after the document landed is not, and stays quiet.
    let restoreAtRisk = true;
    try {
      // #946 — in START: CHAOS mode (the default) every cold page load
      // gets its opening roll, even on a same-session reload or second tab
      // (the #33 once-per-session gate below only governs the restore).
      // ?boot=factory and START: FIXED never roll.
      if (sessionStorage.getItem(RESTORED_FLAG)) {
        const st = useStore.getState();
        if (scopeDecks(st.startupMode).launch !== 'factory' && !bootFactoryRequested()) applyStartupChaos();
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
      restoreAtRisk = !!doc; // no document, nothing left to lose
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
        restoreAtRisk = false; // the session landed; what follows is not its loss
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
      // #1646 — the catch-all stays as the last resort, but it is no
      // longer the only record: a boot that could not apply the saved
      // document says so on the channel the quarantine path proved
      // (MasterBar: RESTORE FAILED — "Last autosave could not be
      // read"). Reachable via the session flag's storage access,
      // the hash parse, a parseProject throw inside the autosave
      // read, and applyProject itself — verified, not assumed.
      if (restoreAtRisk) useStore.getState().setPersistStatus('quarantined');
    }
  }, []);

  useEffect(() => {
    // One writer, used by the debounce, the max-wait and the flush on hide/close.
    const doWrite = () => {
      firstChangeAt.current = null;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
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
    // A pending change is written NOW when the page is hidden or closing: the debounce would otherwise never fire.
    const flush = () => {
      if (firstChangeAt.current != null || timer.current) doWrite();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush();
    };

    const unsub = useStore.subscribe((state, prev) => {
      // every field the document saves (state/projectWatch.mjs), not a hand-kept dozen
      if (!projectDirty(state, prev)) return;
      const now = Date.now();
      if (firstChangeAt.current == null) firstChangeAt.current = now;
      if (timer.current) clearTimeout(timer.current);
      if (now - firstChangeAt.current >= MAX_WAIT_MS) {
        doWrite();
      } else {
        timer.current = setTimeout(doWrite, DEBOUNCE_MS);
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flush);
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsub();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', flush);
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
