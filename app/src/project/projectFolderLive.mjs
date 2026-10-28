// projectFolderLive.mjs — #1709: the project-folder core (state/projectSession.mjs) wired to the running instrument.
//
// One live project at a time. What it does with the store:
//   · create(name)  — the performer picks where; the CURRENT scene becomes session 01 (nothing on screen changes)
//   · open(root?)   — the performer picks (or the last project reopens at launch); the latest session is applied
//                     with applyProject and NOTHING ELSE: no startup roll, no write (opening writes nothing — the first
//                     write is the next edit's autosave)
//   · save()        — autosave in place (useProjectAutosave calls it instead of the browser slot while a project is open)
//   · newSession()  — freeze this session, continue in the next number
//   · reconnect()   — leave pause-and-protect: the folder came back, or the performer points at its new home
//   · close()       — back to the browser's scratch session; refused while work is only held in memory
//
// While a project is open nothing is written to the browser's scratch slot (Matt, #1567: nothing is ever written to a
// fallback location). The one thing kept in browser storage is WHICH folder was open, so the next launch reopens it —
// instrument state, like the loot folder's path, never part of a project.
import { createProjectSession } from '../state/projectSession.mjs';
import { serializeProject } from '../state/projectDocument.js';

export const LAST_PROJECT_KEY = 'kc:project-folder:last';

/**
 * @param fs        a projectFs backend (projectTauri on desktop; memory in the selfcheck)
 * @param getState  () => the store state (applyProject, setBootNotice live on it)
 * @param now       () => ISO string
 * @param mintId    () => a project id
 * @param storage   localStorage-like (getItem/setItem/removeItem), or null
 */
export function createProjectFolderLive({ fs, getState, now, mintId, storage = null, appVersion = null }) {
  const session = createProjectSession({ fs, now, mintId, appVersion });
  const remember = (root) => {
    try {
      if (root) storage?.setItem(LAST_PROJECT_KEY, root);
      else storage?.removeItem(LAST_PROJECT_KEY);
    } catch {
      /* the folder still opens; only the next launch will not reopen it */
    }
  };
  const docNow = () => serializeProject(getState());
  // What the folder holds now, as text: an autosave of an unchanged scene writes nothing. That is what keeps OPEN
  // write-free — applyProject wakes the autosave, and the scene it would write is the one just read.
  let onDisk = null;

  return {
    status: () => session.status(),
    subscribe: (fn) => session.subscribe(fn),
    isOpen: () => session.status().state !== 'closed',
    /** Why folder projects are unavailable here (the browser build), or null. */
    unavailable: () => (typeof fs.unavailable === 'function' ? fs.unavailable() : null),
    lastRoot() {
      try {
        return storage?.getItem(LAST_PROJECT_KEY) || null;
      } catch {
        return null;
      }
    },

    async create(name) {
      if (session.status().state !== 'closed') return { ok: false, reason: 'close this project first' };
      const where = await fs.pickParent();
      if (!where.ok) return where;
      if (!where.path) return { ok: false, cancelled: true };
      const doc = docNow();
      const r = await session.create({ parent: where.path, name, doc });
      if (r.ok) {
        onDisk = JSON.stringify(doc);
        remember(r.root);
      }
      return r;
    },

    /** Open a project folder (picked when `root` is absent). The scene becomes its latest session; no roll, no write. */
    async open(root = null) {
      if (session.status().state !== 'closed') {
        const closed = await session.close();
        if (!closed.ok) return closed;
      }
      let target = root;
      if (!target) {
        const pick = await fs.pickProject();
        if (!pick.ok) return pick;
        if (!pick.path) return { ok: false, cancelled: true };
        target = pick.path;
      }
      const r = await session.open(target);
      if (!r.ok) return r;
      getState().applyProject(r.doc);
      onDisk = JSON.stringify(docNow());
      remember(target);
      return r;
    },

    async save() {
      const doc = docNow();
      const text = JSON.stringify(doc);
      if (text === onDisk && session.status().state === 'saved') return { ok: true, unchanged: true };
      const r = await session.save(doc);
      if (r.ok) onDisk = text;
      return r;
    },
    async newSession() {
      const doc = docNow();
      const r = await session.newSession(doc);
      if (r.ok) onDisk = JSON.stringify(doc);
      return r;
    },

    /** Leave pause: try where it was; `pick: true` asks the performer for its new home. */
    async reconnect({ pick = false } = {}) {
      if (!pick) {
        const r = await session.resume();
        if (r.ok) onDisk = null; // what landed was the held work; the next autosave writes the scene as it is
        return r;
      }
      const p = await fs.pickProject();
      if (!p.ok) return p;
      if (!p.path) return { ok: false, cancelled: true };
      const r = await session.resume(p.path);
      if (r.ok) {
        onDisk = null;
        remember(session.status().root);
      }
      return r;
    },

    async close({ discard = false } = {}) {
      const r = await session.close({ discard });
      if (r.ok) {
        onDisk = null;
        remember(null);
      }
      return r;
    },
  };
}

/** The status line the PROJECT row shows. Plain words; the paused line is the session's own. */
export function projectStatusLine(st) {
  if (!st || st.state === 'closed') return 'No project open: this session lives in the browser.';
  const where = `${st.name} · session ${String(st.session).padStart(2, '0')}`;
  if (st.state === 'paused') return `${where} — ${st.reason}`;
  if (st.state === 'unsaved') return `${where} — not saved: ${st.reason}`;
  return `${where} — saved in its folder`;
}
