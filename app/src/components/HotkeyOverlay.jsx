// HotkeyOverlay — keyboard shortcut cheat sheet triggered by '?'
import { useState } from 'react';
import { useHotkeys } from '../hooks/useHotkeys.js';

const SHORTCUTS = [
  { key: 'SPACE', desc: 'Play / Pause' },
  { key: 'S', desc: 'Snapshot current frame' },
  { key: 'F', desc: 'Favorite current seed' },
  { key: 'E', desc: 'Toggle evolve mode' },
  { key: 'N', desc: 'New random seed' },
  { key: '⌘Z', desc: 'Undo last change' },
  { key: '⌘⇧Z', desc: 'Redo' },
  { key: '?', desc: 'Toggle this overlay' },
];

export function HotkeyOverlay() {
  const [show, setShow] = useState(false);

  useHotkeys({
    '?': () => setShow(s => !s),
  });

  if (!show) return null;

  return (
    <div className="hotkey-overlay" onClick={() => setShow(false)}>
      <div className="hotkey-card" onClick={e => e.stopPropagation()}>
        <div className="hotkey-card-header">
          <span>⌨ KEYBOARD SHORTCUTS</span>
          <button className="micro-btn" onClick={() => setShow(false)}>✕</button>
        </div>
        <div className="hotkey-list">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="hotkey-row">
              <kbd className="hotkey-key">{s.key}</kbd>
              <span className="hotkey-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
