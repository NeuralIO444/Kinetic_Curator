// ProjectFolderRow (#1709) — the project folder in PIPELINE · PROJECT. One quiet row, the LootRow's shape: a status
// line and the verbs that apply right now. NEW makes KC1_Loot_<name>/ where the performer picks and saves the scene as
// session 01; OPEN puts a folder's latest session on stage (no roll); NEW SESSION freezes this one and continues in the
// next number; CLOSE goes back to the browser session. When the folder goes away the row says so plainly and offers
// RECONNECT (it came back) and FIND IT (it moved) — saving waits, the work is held, nothing is written anywhere else.
// The browser build shows why it is desktop-only instead of a dead button.
import { useState } from 'react';
import { projectFolderLive, useProjectFolderStatus } from '../../hooks/useProjectFolder.js';
import { projectStatusLine } from '../../project/projectFolderLive.mjs';
import { validateProjectName } from '../../state/projectNaming.mjs';

export function ProjectFolderRow() {
  const live = projectFolderLive();
  const st = useProjectFolderStatus();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const unavailable = live.unavailable();
  const open = st.state !== 'closed';
  const check = name ? validateProjectName(name) : null;

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
            <button type="button" className="chip-btn" disabled={busy} onClick={() => run(() => live.open())}>
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
            <button type="button" className="chip-btn" disabled={busy} onClick={() => run(() => live.open())}>
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
      <div
        className="pipeline-hint"
        role={st.state === 'paused' || st.state === 'unsaved' ? 'status' : undefined}
        style={{ fontSize: 10, opacity: st.state === 'paused' ? 1 : 0.7 }}
      >
        {unavailable
          ? 'One folder per project, sessions saved inside it.'
          : naming && check && !check.ok
            ? check.reason
            : note || projectStatusLine(st)}
      </div>
    </div>
  );
}
