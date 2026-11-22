// useProjectFolder.js — #1709: the app's one live project folder (project/projectFolderLive.mjs) and a hook that
// re-renders on its status. Desktop reaches the folder through the native project commands (state/projectTauri.mjs);
// the browser build answers "desktop only" and the instrument keeps its browser session exactly as before.
import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { createTauriProjectFs } from '../state/projectTauri.mjs';
import { createProjectFolderLive } from '../project/projectFolderLive.mjs';

const storage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};
const mintId = () => {
  try {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  } catch {
    // identity only, never a sim input: an old webview without randomUUID still gets a unique-enough id
    return `p${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36)}`;
  }
};

let live = null;
/** The one live project folder (created on first use). */
export function projectFolderLive() {
  if (!live) {
    live = createProjectFolderLive({
      fs: createTauriProjectFs(),
      getState: useStore.getState,
      now: () => new Date().toISOString(),
      mintId,
      storage: storage(),
      appVersion: import.meta.env?.VITE_APP_VERSION ?? null,
    });
  }
  return live;
}

/** The live project's status ({ state, reason, root, name, session, held, readOnly }), re-rendered on every change. */
export function useProjectFolderStatus() {
  const lp = projectFolderLive();
  const [status, setStatus] = useState(() => lp.status());
  useEffect(() => lp.subscribe(setStatus), [lp]);
  // #1711 — the ownership heartbeat: while this window owns a project, refresh its lock every 10 s (the stale
  // window is 30 s, so two missed beats still hold). A read-only window does not heartbeat — it does not own.
  const owning = status.state !== 'closed' && !status.readOnly;
  useEffect(() => {
    if (!owning) return;
    const t = setInterval(() => {
      lp.heartbeat().catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [lp, owning]);
  return status;
}
