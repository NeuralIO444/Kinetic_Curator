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
import { parseRecents, touchRecents, removeRecent } from './projectRecents.mjs';

export const LAST_PROJECT_KEY = 'kc:project-folder:last';
export const RECENTS_KEY = 'kc:project-folder:recents';

/**
 * @param fs        a projectFs backend (projectTauri on desktop; memory in the selfcheck)
 * @param getState  () => the store state (applyProject, setBootNotice live on it)
 * @param now       () => ISO string
 * @param mintId    () => a project id
 * @param storage   localStorage-like (getItem/setItem/removeItem), or null
 */
export function createProjectFolderLive({ fs, getState, now, mintId, storage = null, appVersion = null, instanceId = null }) {
  const session = createProjectSession({ fs, now, mintId, appVersion, instanceId: instanceId ?? mintId() });
  const remember = (root) => {
    try {
      if (root) storage?.setItem(LAST_PROJECT_KEY, root);
      else storage?.removeItem(LAST_PROJECT_KEY);
    } catch {
      /* the folder still opens; only the next launch will not reopen it */
    }
  };
  // The recents list (#1711): instrument state in the same storage, same failure posture — a storage hiccup never
  // breaks opening a project; the list just does not learn.
  const loadRecents = () => {
    try {
      return parseRecents(storage?.getItem(RECENTS_KEY));
    } catch {
      return [];
    }
  };
  const saveRecents = (list) => {
    try {
      storage?.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
      /* the project still opened; only the list did not learn */
    }
  };
  const noteOpened = (name, root) => saveRecents(touchRecents(loadRecents(), { name, root }, now()));
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

    /**
     * New project where the performer picks. `doc` defaults to the scene on stage (the PIPELINE row: the current
     * scene becomes session 01, nothing on screen changes). The wizard (#1710) passes the doc instead — the saved
     * autosave doc for adoption, a blank doc for a fresh start — and `land` puts that doc on stage when the project
     * lands, so the stage IS session 01 and the first autosave cannot quietly rewrite it with something else.
     */
    async create(name, { doc: givenDoc = null, land = false } = {}) {
      if (session.status().state !== 'closed') return { ok: false, reason: 'close this project first' };
      const where = await fs.pickParent();
      if (!where.ok) return where;
      if (!where.path) return { ok: false, cancelled: true };
      const doc = givenDoc ?? docNow();
      const r = await session.create({ parent: where.path, name, doc });
      if (r.ok) {
        if (land) {
          getState().applyProject(doc);
          onDisk = JSON.stringify(docNow()); // what the stage holds now (the same contract OPEN keeps)
        } else {
          onDisk = JSON.stringify(doc);
        }
        remember(r.root);
        noteOpened(r.name, r.root);
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
      noteOpened(session.status().name, target);
      return r;
    },

    /** The recent-projects list, most-recent-first (#1711). Unreachable folders stay listed; the row marks them. */
    recents: () => loadRecents(),

    /** Is this folder there right now? (The row checks each recent; the folder itself is never touched.) */
    async recentReachable(root) {
      const r = await fs.reachable(root);
      return !!(r && r.ok && r.reachable);
    },

    /** Remove a recents entry. The folder on disk is untouched. */
    forgetRecent(root) {
      saveRecents(removeRecent(loadRecents(), root));
    },

    /** Rename the open project (#1711): folder, manifest and session files take the new name together. */
    async rename(name) {
      const before = session.status().root;
      const r = await session.rename(name);
      if (r.ok) {
        remember(r.root);
        // the old root's entry goes; the renamed project is the most recent (it may predate the list entirely)
        saveRecents(touchRecents(removeRecent(loadRecents(), before), { name: r.name, root: r.root }, now()));
      }
      return r;
    },

    /** The ownership heartbeat (#1711 PR-2): the hook calls it on an interval while this window owns a project. */
    heartbeat: () => session.heartbeat(),

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
      const before = session.status().root;
      const r = await session.resume(p.path);
      if (r.ok) {
        onDisk = null;
        remember(session.status().root);
        // the project lives at a new home now: the recents entry follows it (#1711)
        saveRecents(
          touchRecents(
            removeRecent(loadRecents(), before),
            { name: session.status().name, root: session.status().root },
            now(),
          ),
        );
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
  if (st.readOnly) return `${where} — read-only: another window has this project open`;
  if (st.state === 'paused') return `${where} — ${st.reason}`;
  if (st.state === 'unsaved') return `${where} — not saved: ${st.reason}`;
  return `${where} — saved in its folder`;
}
