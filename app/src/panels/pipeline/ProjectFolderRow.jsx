// ProjectFolderRow (#1709) — the project folder in PIPELINE · PROJECT. One quiet row, the LootRow's shape: a status
// line and the verbs that apply right now. NEW makes KC1_Loot_<name>/ where the performer picks and saves the scene as
// session 01; OPEN puts a folder's latest session on stage (no roll); NEW SESSION freezes this one and continues in the
// next number; CLOSE goes back to the browser session. When the folder goes away the row says so plainly and offers
// RECONNECT (it came back) and FIND IT (it moved) — saving waits, the work is held, nothing is written anywhere else.
// The browser build shows why it is desktop-only instead of a dead button.
//
// #1711 adds the management surface: RECENT lists the projects this machine has opened (most recent first, capped);
// a folder that is not reachable stays listed, marked, with a remove — nothing is dropped silently, and opening one
// answers plainly. RENAME renames the open project: folder, manifest and session files take the new name together.
import { useEffect, useState } from 'react';
import { projectFolderLive, useProjectFolderStatus } from '../../hooks/useProjectFolder.js';
import { projectStatusLine } from '../../project/projectFolderLive.mjs';
import { validateProjectName } from '../../state/projectNaming.mjs';

export function ProjectFolderRow() {
  const live = projectFolderLive();
  const st = useProjectFolderStatus();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [recents, setRecents] = useState([]);
  const [reach, setReach] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const unavailable = live.unavailable();
  const open = st.state !== 'closed';
  const check = name ? validateProjectName(name) : null;
  const renameCheck = newName ? validateProjectName(newName) : null;

  const refreshRecents = async () => {
    const list = live.recents();
    const states = {};
    await Promise.all(
      list.map(async (e) => {
        states[e.root] = await live.recentReachable(e.root);
      }),
    );
    setRecents(list);
    setReach(states);
  };

  useEffect(() => {
    if (open || unavailable) return;
    let live1 = true;
    (async () => {
      const list = live.recents();
      const states = {};
      await Promise.all(
        list.map(async (e) => {
          states[e.root] = await live.recentReachable(e.root);
        }),
      );
      if (!live1) return;
      setRecents(list);
      setReach(states);
    })();
    return () => {
      live1 = false;
    };
  }, [open, unavailable, live]);

  const run = async (fn) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fn();
      if (r && !r.ok && !r.cancelled) setNote(r.reason || 'that did not work');
      return r;
    } catch (e) {
      setNote(String((e && e.message) || e).slice(0, 160));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    const r = await run(() => live.create(name));
    if (r && r.ok) {
      setNaming(false);
      setName('');
    }
  };
  const doRename = async () => {
    const r = await run(() => live.rename(newName));
    if (r && r.ok) {
      setRenaming(false);
      setNewName('');
    }
  };
  const openVia = async (fn) => {
    const r = await run(fn);
    if (r && r.ok && r.tookOver) setNote('Took over this project from another window — its heartbeat had stopped.');
    return r;
  };
  const openRecent = async (entry) => {
    if (reach[entry.root] === false) {
      setNote('that folder is not reachable');
      return;
    }
    await openVia(() => live.open(entry.root));
  };
  const forget = async (entry) => {
    live.forgetRecent(entry.root);
    refreshRecents();
  };

  return (
    <div className="pipeline-project-folder" aria-label="Project folder">
      <div className="pipeline-row">
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          PROJECT FOLDER
        </span>
        {unavailable ? (
          <span className="pipeline-status lbl">{unavailable}</span>
        ) : st.state === 'paused' ? (
          <>
            <button type="button" className="chip-btn act" disabled={busy} onClick={() => run(() => live.reconnect())}>
              RECONNECT
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={busy}
              onClick={() => run(() => live.reconnect({ pick: true }))}
            >
              FIND IT
            </button>
          </>
        ) : open ? (
          <>
            <button type="button" className="chip-btn act" disabled={busy} onClick={() => run(() => live.newSession())}>
              NEW SESSION
            </button>
            <button
              type="button"
              className="chip-btn"
              disabled={busy}
              aria-expanded={renaming}
              onClick={() => setRenaming((v) => !v)}
            >
              RENAME
            </button>
            <button type="button" className="chip-btn" disabled={busy} onClick={() => openVia(() => live.open())}>
              OPEN
            </button>
            <button type="button" className="chip-btn" disabled={busy} onClick={() => run(() => live.close())}>
              CLOSE
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="chip-btn act"
              disabled={busy}
              aria-expanded={naming}
              onClick={() => setNaming((v) => !v)}
            >
              NEW
            </button>
            <button type="button" className="chip-btn" disabled={busy} onClick={() => openVia(() => live.open())}>
              OPEN
            </button>
          </>
        )}
      </div>
      {!unavailable && naming && !open && (
        <div className="pipeline-row">
          <input
            type="text"
            aria-label="Project name"
            placeholder="Project name"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check?.ok && !busy && create()}
            style={{ flex: 1, fontSize: 11 }}
          />
          <button type="button" className="chip-btn act" disabled={busy || !check?.ok} onClick={create}>
            CREATE
          </button>
        </div>
      )}
      {!unavailable && renaming && open && (
        <div className="pipeline-row">
          <input
            type="text"
            aria-label="New project name"
            placeholder="New name"
            value={newName}
            maxLength={64}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && renameCheck?.ok && !busy && doRename()}
            style={{ flex: 1, fontSize: 11 }}
          />
          <button type="button" className="chip-btn act" disabled={busy || !renameCheck?.ok} onClick={doRename}>
            SAVE
          </button>
        </div>
      )}
      {!unavailable && !open && recents.length > 0 && (
        <>
          <div className="pipeline-row">
            <span className="lbl" style={{ flex: 1, fontSize: 10, opacity: 0.7 }}>
              RECENT
            </span>
          </div>
          {recents.map((e) => (
            <div className="pipeline-row" key={e.root}>
              <button
                type="button"
                className="chip-btn"
                disabled={busy}
                onClick={() => openRecent(e)}
                style={{ flex: 1, textAlign: 'left', opacity: reach[e.root] === false ? 0.55 : 1 }}
                title={e.root}
              >
                {e.name}
                {reach[e.root] === false ? ' — not reachable' : ''}
              </button>
              <button
                type="button"
                className="chip-btn"
                disabled={busy}
                aria-label={`Remove ${e.name} from recents`}
                onClick={() => forget(e)}
              >
                ✕
              </button>
            </div>
          ))}
        </>
      )}
      <div
        className="pipeline-hint"
        role={st.state === 'paused' || st.state === 'unsaved' ? 'status' : undefined}
        style={{ fontSize: 10, opacity: st.state === 'paused' ? 1 : 0.7 }}
      >
        {unavailable
          ? 'One folder per project, sessions saved inside it.'
          : naming && check && !check.ok
            ? check.reason
            : renaming && renameCheck && !renameCheck.ok
              ? renameCheck.reason
              : note || projectStatusLine(st)}
      </div>
    </div>
  );
}
