// Voice row (#280) — curated mode personas + the performer's own shelf.
//
// Three flagship voices (SWARM / HYPE / MURM) load complete curated states
// through a MIX crossfade. The twelve stub modes keep their current bare
// mode-switch behavior until they are voiced. The row ends with the + chip:
// tap to capture the live state as a user voice (VOICE 01, …), long-press a
// user chip to overwrite it, double-click to rename, × to delete (confirm).
import { useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { FLAGSHIP_VOICES, STUB_VOICES } from '../../data/voices.js';
import { MAX_USER_VOICES } from '../../state/slices/voiceSlice.js';
import { emit, Events } from '../../composition/eventBus.js';
import { MixBar } from './MixBar.jsx';

const LONG_PRESS_MS = 650;

function FlagshipChip({ voice, active, onTap }) {
  const dots = voice.palette.swatches.slice(0, 4);
  return (
    <button
      className={`voice-chip flagship${active ? ' active' : ''}`}
      onClick={onTap}
      title={`${voice.title} — ${voice.vibe}`}
    >
      <span className="voice-dots" aria-hidden="true">
        {dots.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
      <span className="voice-name">{voice.name}</span>
      <span className="voice-title">{voice.title}</span>
    </button>
  );
}

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
    <span className={`voice-chip user${active ? ' active' : ''}`}>
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
          className="user-chip-main"
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

export function ModeGrid({ mode }) {
  const userVoices = useStore((s) => s.userVoices);
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
    <div className="voice-row">
      <div className="voice-flagships">
        {FLAGSHIP_VOICES.map((v) => (
          <FlagshipChip
            key={v.id}
            voice={v}
            active={activeVoiceId === v.id}
            onTap={() => loadVoice(v.id)}
          />
        ))}
      </div>

      <div className="mode-grid">
        {STUB_VOICES.map((m) => (
          <button
            key={m.id}
            className={`mode-tile${mode === m.id ? ' active' : ''}`}
            onClick={() => emit(Events.LAYOUT_PARAM, { key: 'mode', value: m.id })}
            title={m.vibe}
          >
            <span style={{ fontSize: '11px' }}>{m.glyph}</span>
            {m.name}
          </button>
        ))}
      </div>

      <div className="voice-shelf">
        <span className="shelf-label">MY VOICES</span>
        <div className="shelf-chips">
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
            className="voice-chip plus-chip"
            onClick={captureUserVoice}
            disabled={shelfFull}
            title={shelfFull ? 'Voice shelf is full (12)' : 'Capture the current live state as a new voice'}
            aria-label="Capture current state as a voice"
          >
            +
          </button>
        </div>
      </div>

      <MixBar />
    </div>
  );
}
