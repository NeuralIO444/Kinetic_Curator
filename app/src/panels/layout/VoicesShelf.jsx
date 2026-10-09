// MY VOICES shelf — extracted from ModeGrid.jsx (UX-5 reorg).
// The performer's own shelf: tap to capture the live state as a user voice
// (VOICE 01, …), long-press a chip to overwrite it, double-click to rename,
// × to delete (confirm).
import { useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { MAX_USER_VOICES } from '../../state/slices/voiceSlice.js';
import { isEarned } from '../../state/earnedVoices.js';

const LONG_PRESS_MS = 650;

function UserChip({ voice, active, onTap, onOverwrite, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const timer = useRef(null);
  const longFired = useRef(false);

  const startPress = () => {
    longFired.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      longFired.current = true;
      onOverwrite();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(timer.current);
  const handleClick = () => {
    if (renaming) return;
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    onTap();
  };
  const commitRename = (value) => {
    setRenaming(false);
    if (value && value.trim() && value.trim() !== voice.name) onRename(value);
  };

  return (
    // #1202 — the shelf renders on the te-cell language (discrete = ink).
    // Interactions unchanged: tap loads, long-press overwrites, double-click
    // renames, × deletes.
    <span className={`te-cell${active ? ' sel' : ''}`} style={{ position: 'relative' }}>
      {renaming ? (
        <input
          className="voice-rename"
          defaultValue={voice.name}
          autoFocus
          maxLength={24}
          aria-label="Rename voice"
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename(e.target.value);
            else if (e.key === 'Escape') setRenaming(false);
            e.stopPropagation();
          }}
          onBlur={(e) => commitRename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          className="te-cell-label"
          style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onClick={handleClick}
          onDoubleClick={() => setRenaming(true)}
          title={`${voice.name} — tap: load · long-press: overwrite with current state · double-click: rename`}
        >
          {voice.name}
        </button>
      )}
      <button
        className="user-chip-x"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={`Delete ${voice.name}`}
        aria-label={`Delete ${voice.name}`}
      >
        ×
      </button>
    </span>
  );
}

export function VoicesShelf() {
  // the shelf is the performer's own hands; finds the triad minted live in DIRECTORS and are frozen history (#1153)
  const userVoices = useStore((s) => s.userVoices).filter((v) => !isEarned(v));
  const activeVoiceId = useStore((s) => s.activeVoiceId);
  const loadVoice = useStore((s) => s.loadVoice);
  const captureUserVoice = useStore((s) => s.captureUserVoice);
  const renameUserVoice = useStore((s) => s.renameUserVoice);
  const overwriteUserVoice = useStore((s) => s.overwriteUserVoice);
  const deleteUserVoice = useStore((s) => s.deleteUserVoice);

  const shelfFull = userVoices.length >= MAX_USER_VOICES;

  const confirmDelete = (voice) => {
    if (window.confirm(`Delete voice "${voice.name}"?`)) deleteUserVoice(voice.id);
  };

  return (
    <div className="voice-shelf">
      <span className="shelf-label ttl">my voices</span>
      <div className="te-matrix" role="group" aria-label="My voices">
        {userVoices.map((v) => (
          <UserChip
            key={v.id}
            voice={v}
            active={activeVoiceId === v.id}
            onTap={() => loadVoice(v.id)}
            onOverwrite={() => overwriteUserVoice(v.id)}
            onRename={(name) => renameUserVoice(v.id, name)}
            onDelete={() => confirmDelete(v)}
          />
        ))}
        <button
          className="te-cell"
          onClick={captureUserVoice}
          disabled={shelfFull}
          title={shelfFull ? 'Voice shelf is full (12)' : 'Capture the current live state as a new voice'}
          aria-label="Capture current state as a voice"
        >
          <span className="te-cell-label" style={{ fontSize: 14 }}>+</span>
        </button>
      </div>
    </div>
  );
}
