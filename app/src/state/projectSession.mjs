// projectSession.mjs — #1709: the project-folder core. Create, open, save in place, new session, close — and pause and
// protect when the folder goes away. Pure logic over an injected projectFs (projectFs.mjs), an injected clock and an
// injected id minter, so it is proven on the memory backend and runs unchanged on Tauri.
//
// Matt's rulings (#1567, 2026-10-14 / 2026-10-20) this module enforces:
//   · a project is ONE folder, KC1_Loot_<name>/, sessions numbered inside sessions/ (projectNaming.mjs)
//   · strict naming, refuse on collision — create never merges into an existing folder, never suffixes
//   · autosave IN PLACE (save rewrites the current session), `new session` on demand (max+1, gaps never reused, the
//     previous session is left exactly as it was)
//   · the file is versioned (projectFile.mjs): an older one opens and the next save writes the current version; a newer
//     one is refused and never written
//   · PAUSE AND PROTECT: the moment the folder is unreachable, saving stops, the session is held in memory, the status
//     says so plainly, and saving resumes only when the folder returns or the performer points at its new home. Nothing
//     is ever written anywhere else.
//   · opening writes nothing (no startup roll over a session: the first write is the first save the caller asks for)
import { validateProjectName, folderNameFor, nameCollides, projectNameFromFolder } from './projectNaming.mjs';
import { sessionFileName, parseSessionNumber, nextSessionNumber } from './projectNaming.mjs';
import { readSessionFile, writeSessionFile, readManifest, writeManifest, MANIFEST_FILE } from './projectFile.mjs';

export const SESSIONS_DIR = 'sessions';
/** The plain line the status carries while paused (the UI shows it as is). */
export const PAUSED_LINE =
  'The project folder is gone — saving is paused and your work is held here. Reconnect the folder to save.';

const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);

/**
 * @param fs          a projectFs backend
 * @param now         () => ISO string (the caller owns the clock)
 * @param mintId      () => a project id (8–64 of [A-Za-z0-9_-])
 * @param appVersion  string written into each session file
 */
export function createProjectSession({ fs, now, mintId, appVersion = null }) {
  if (!fs || typeof now !== 'function' || typeof mintId !== 'function')
    throw new Error('createProjectSession: fs, now, mintId');
  let cur = null; // { root, name, projectId, session }
  let state = 'closed'; // closed | saved | unsaved | paused
  let reason = null;
  let pending = null; // the doc not yet on disk (held in memory while unsaved or paused)
  const listeners = new Set();

  const set = (s, why = null) => {
    state = s;
    reason = why;
    for (const fn of listeners) {
      try {
        fn(status());
      } catch {
        /* a listener never breaks saving */
      }
    }
  };
  function status() {
    return {
      state,
      reason,
      root: cur ? cur.root : null,
      name: cur ? cur.name : null,
      session: cur ? cur.session : null,
      held: pending !== null,
    };
  }
  const sessionRel = (name, n) => `${SESSIONS_DIR}/${sessionFileName(name, n)}`;
  const fileText = (doc, n) =>
    writeSessionFile({ doc, projectId: cur.projectId, session: n, savedAt: now(), appVersion });

  /** Write `doc` as the current session. On an unreachable folder: pause (held, nothing written anywhere). */
  async function put(doc) {
    pending = doc;
    const r = await fs.write(cur.root, sessionRel(cur.name, cur.session), fileText(doc, cur.session));
    if (r.ok) {
      pending = null;
      set('saved');
      return { ok: true };
    }
    if (r.unreachable) {
      set('paused', PAUSED_LINE);
      return { ok: false, paused: true, reason: PAUSED_LINE };
    }
    set('unsaved', r.reason || 'the save failed');
    return { ok: false, reason: r.reason || 'the save failed' };
  }

  return {
    status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** A new project: KC1_Loot_<name>/ in `parent`, its manifest, and session 01 holding `doc`. */
    async create({ parent, name, doc }) {
      if (cur) return { ok: false, reason: 'a project is open: close it first' };
      const v = validateProjectName(name);
      if (!v.ok) return { ok: false, reason: v.reason };
      const listing = await fs.listNames(parent);
      if (!listing.ok) return { ok: false, reason: listing.reason };
      if (
        nameCollides(
          v.name,
          listing.names.map((e) => e.name),
        )
      )
        return { ok: false, exists: true, reason: `A project named "${v.name}" is already there. Pick another name.` };
      const made = await fs.makeFolder(parent, folderNameFor(v.name));
      if (!made.ok) return { ok: false, exists: made.exists, reason: made.reason };
      const projectId = mintId();
      const at = now();
      const steps = [
        () => fs.makeSubfolder(made.path, SESSIONS_DIR),
        () =>
          fs.write(made.path, MANIFEST_FILE, writeManifest({ projectId, name: v.name, createdAt: at }), {
            create: true,
          }),
      ];
      for (const step of steps) {
        const r = await step();
        if (!r.ok) return { ok: false, reason: r.reason, partial: made.path };
      }
      cur = { root: made.path, name: v.name, also: v.name, projectId, session: 1 };
      const first = await fs.write(cur.root, sessionRel(cur.name, 1), fileText(doc, 1), { create: true });
      if (!first.ok) {
        const r = { ok: false, reason: first.reason, partial: made.path };
        cur = null;
        return r;
      }
      set('saved');
      return { ok: true, root: cur.root, name: cur.name, session: 1 };
    },

    /**
     * Open a project folder at its latest session. Writes nothing. A newer file is refused, never touched.
     * @returns {{ ok: true, doc, session, migratedFrom, sanitized } | { ok: false, reason, newer? }}
     */
    async open(root) {
      if (cur) return { ok: false, reason: 'a project is open: close it first' };
      const there = await fs.reachable(root);
      if (!there.ok || !there.reachable)
        return { ok: false, unreachable: true, reason: 'that folder is not reachable' };
      const mf = await fs.read(root, MANIFEST_FILE);
      if (!mf.ok) return { ok: false, reason: 'not a KC-1 project folder (no project.kc.json)' };
      const m = readManifest(mf.text);
      if (!m.ok) return { ok: false, newer: m.newer, reason: m.error };
      // the folder name is the project's name (rename renames the folder); the manifest's name is the fallback
      const name = projectNameFromFolder(baseOf(root)) || m.manifest.name;
      const ls = await fs.list(root, SESSIONS_DIR);
      if (!ls.ok) return { ok: false, reason: 'the project has no sessions folder' };
      const files = ls.names.filter((e) => !e.dir).map((e) => e.name);
      // sessions written under the manifest's name still count (a folder renamed outside KC-1)
      const names = [...new Set([name, m.manifest.name])];
      let best = null;
      for (const nm of names)
        for (const f of files) {
          const n = parseSessionNumber(nm, f);
          if (n !== null && (!best || n > best.n)) best = { n, file: f };
        }
      if (!best) return { ok: false, reason: 'the project has no sessions' };
      const rd = await fs.read(root, `${SESSIONS_DIR}/${best.file}`);
      if (!rd.ok) return { ok: false, unreachable: rd.unreachable, reason: rd.reason };
      const s = readSessionFile(rd.text);
      if (!s.ok) return { ok: false, newer: s.newer, reason: `${best.file}: ${s.error}` };
      cur = { root, name, also: m.manifest.name, projectId: m.manifest.projectId, session: best.n };
      pending = null;
      set('saved');
      return { ok: true, doc: s.doc, session: best.n, migratedFrom: s.meta.migratedFrom, sanitized: s.sanitized };
    },

    /** Autosave in place: rewrite the current session with `doc`. While paused the doc is only held. */
    async save(doc) {
      if (!cur) return { ok: false, reason: 'no project is open' };
      if (state === 'paused') {
        pending = doc;
        return { ok: false, paused: true, reason: PAUSED_LINE };
      }
      return put(doc);
    },

    /**
     * Leave pause: `root` absent → the folder came back where it was; `root` given → the performer points at its new
     * home, which must be THIS project (same projectId) — another project is refused, never written into.
     */
    async resume(root = null) {
      if (!cur) return { ok: false, reason: 'no project is open' };
      const target = root || cur.root;
      const there = await fs.reachable(target);
      if (!there.ok || !there.reachable) return { ok: false, unreachable: true, reason: PAUSED_LINE };
      if (root && root !== cur.root) {
        const mf = await fs.read(root, MANIFEST_FILE);
        const m = mf.ok ? readManifest(mf.text) : { ok: false };
        if (!m.ok || m.manifest.projectId !== cur.projectId)
          return { ok: false, reason: 'that folder is a different project — nothing was written to it' };
        cur = { ...cur, root, name: projectNameFromFolder(baseOf(root)) || cur.name };
      }
      if (pending === null) {
        set('saved');
        return { ok: true };
      }
      set('unsaved', null);
      return put(pending);
    },

    /** Freeze the current session as it stands and continue in the next number (max+1), starting from `doc`. */
    async newSession(doc) {
      if (!cur) return { ok: false, reason: 'no project is open' };
      if (state === 'paused') return { ok: false, paused: true, reason: PAUSED_LINE };
      if (pending !== null) {
        const flushed = await put(pending);
        if (!flushed.ok) return flushed;
      }
      const ls = await fs.list(cur.root, SESSIONS_DIR);
      if (!ls.ok) {
        if (ls.unreachable) set('paused', PAUSED_LINE);
        return { ok: false, paused: !!ls.unreachable, reason: ls.reason };
      }
      // max+1 over every session in the folder — under the manifest's name too (a folder renamed outside KC-1)
      const files = ls.names.filter((e) => !e.dir).map((e) => e.name);
      const n = Math.max(nextSessionNumber(cur.name, files), nextSessionNumber(cur.also, files));
      const r = await fs.write(cur.root, sessionRel(cur.name, n), fileText(doc, n), { create: true });
      if (!r.ok) {
        if (r.unreachable) set('paused', PAUSED_LINE);
        return { ok: false, paused: !!r.unreachable, reason: r.reason };
      }
      cur = { ...cur, session: n };
      pending = null;
      set('saved');
      return { ok: true, session: n };
    },

    /** Close. Work that is only held (unsaved or paused) keeps the project open unless `discard` is said out loud. */
    async close({ discard = false } = {}) {
      if (!cur) return { ok: true };
      if (pending !== null && !discard) {
        if (state !== 'paused') {
          const r = await put(pending);
          if (r.ok) return this.close();
        }
        return { ok: false, held: true, reason: 'work is not saved yet — reconnect the folder, or close with discard' };
      }
      cur = null;
      pending = null;
      set('closed');
      return { ok: true };
    },
  };
}
