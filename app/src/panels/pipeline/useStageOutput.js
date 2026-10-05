// useStageOutput.js — #607 STAGE Phase B, instrument-window orchestration.
//
// Owns the stage lifecycle: enumerate displays, open the stage window on the
// selected display, run the frame mirror, watch for the display vanishing
// mid-stage (fails OUT LOUD — no silent freeze, no zombie window), and tear
// everything down when the mode returns to preview or the instrument closes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { useStore } from '../../state/store.js';
import {
  isTauriRuntime, listStageDisplays, openStageWindow, closeStageWindow,
  watchStageDisplay,
} from './stageWindow.js';
import { startStageMirror, stopStageMirror } from './stageMirror.js';
import { resolveStageDisplay } from './stageDisplays.mjs';

export function useStageOutput() {
  const { glLoopRef } = useApp();
  const watchStop = useRef(null);
  const [displays, setDisplays] = useState([]);
  const [displaysBusy, setDisplaysBusy] = useState(false);

  const teardown = useCallback(async () => {
    if (watchStop.current) {
      watchStop.current();
      watchStop.current = null;
    }
    stopStageMirror();
    if (isTauriRuntime()) {
      try { await closeStageWindow(); } catch { /* best-effort on the way out */ }
    }
  }, []);

  const refreshDisplays = useCallback(async () => {
    if (!isTauriRuntime()) return;
    setDisplaysBusy(true);
    try {
      const listed = await listStageDisplays();
      if (listed.ok) {
        setDisplays(listed.displays);
        useStore.getState().setStageError(null);
      } else {
        useStore.getState().setStageError(`Display list failed: ${listed.reason}`);
      }
    } finally {
      setDisplaysBusy(false);
    }
  }, []);

  useEffect(() => {
    // Deferred past the commit phase — the enumeration is async I/O anyway.
    const t = window.setTimeout(() => { if (isTauriRuntime()) refreshDisplays(); }, 0);
    // No zombie window: if the instrument window closes first, drop the
    // mirror; the stage self-closes on heartbeat timeout as the backstop.
    const onUnload = () => { stopStageMirror(); };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('beforeunload', onUnload);
      teardown();
    };
  }, [refreshDisplays, teardown]);

  const begin = useCallback(async () => {
    const s = useStore.getState();
    if (!isTauriRuntime()) {
      s.setStageError('Stage needs the desktop (Tauri) app — this browser cannot open a fullscreen stage window.');
      return;
    }
    const loop = glLoopRef.current;
    if (!loop || typeof loop.grabPresentedFrame !== 'function') {
      s.setStageError('Stage mirror needs the in-thread render loop — the render worker path cannot feed the stage.');
      return;
    }
    const listed = await listStageDisplays();
    if (!listed.ok || listed.displays.length === 0) {
      s.setStageError(listed.ok
        ? 'No displays found. Attach a display and hit REFRESH.'
        : `Could not list displays: ${listed.reason}`);
      return;
    }
    setDisplays(listed.displays);
    const { display, note } = resolveStageDisplay(listed.displays, s.stageDisplayId);
    if (!display) {
      s.setStageError('No displays found. Attach a display and hit REFRESH.');
      return;
    }
    if (display.id !== s.stageDisplayId) s.setStageDisplayId(display.id);

    const opened = await openStageWindow(display);
    if (!opened.ok) {
      s.setStageError(`Stage window failed to open: ${opened.reason || 'unknown error'}`);
      return;
    }
    const mirrored = startStageMirror({
      getLoop: () => glLoopRef.current,
      getControl: () => {
        const st = useStore.getState();
        return {
          blackout: st.stageBlackout,
          testPattern: st.stageTestPattern,
          mapping: st.stageMapping,
          displayName: display.name,
        };
      },
    });
    if (!mirrored.ok) {
      await closeStageWindow().catch(() => {});
      s.setStageError(`Stage mirror failed: ${mirrored.reason}`);
      return;
    }
    s.setStageError(note); // the fallback note, or null when the pick was clean
    if (opened.fullscreenFailed) {
      s.setStageError(`Stage opened but fullscreen failed (${opened.fullscreenFailed}) — showing windowed.`);
    }

    watchStop.current = watchStageDisplay({
      getDisplayId: () => useStore.getState().stageDisplayId,
      onGone: () => {
        // Unplugged mid-stage: close the stage, park the mode, say so LOUD.
        teardown();
        const st = useStore.getState();
        st.setStageMode('preview');
        st.setStageError('Display unplugged mid-stage — stage closed, nothing frozen. Reattach it and hit FULLSCREEN to resume.');
      },
      onWindowClosed: () => {
        // The performer closed the stage window directly — stop the mirror
        // and stop the mode chip from lying.
        stopStageMirror();
        if (watchStop.current) {
          watchStop.current();
          watchStop.current = null;
        }
        useStore.getState().setStageMode('preview');
      },
    });
  }, [glLoopRef, teardown]);

  const end = useCallback(async () => {
    await teardown();
    useStore.getState().setStageError(null);
  }, [teardown]);

  return { begin, end, teardown, displays, displaysBusy, refreshDisplays };
}
