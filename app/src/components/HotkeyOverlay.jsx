// HotkeyOverlay — keyboard shortcut cheat sheet triggered by '?'
import { useState } from 'react';
import { useHotkeys } from '../hooks/useHotkeys.js';

const SHORTCUTS = [
  { key: 'SPACE', desc: 'Play / Pause' },
  { key: 'S', desc: 'Snapshot current frame' },
  { key: 'F', desc: 'Favorite current seed' },
  { key: 'E', desc: 'Toggle evolve mode' },
  { key: 'N', desc: 'New random seed' },
  { key: 'P', desc: 'Toggle perf mode (caps effects)' },
  { key: '⌘Z', desc: 'Undo last change' },
  { key: '⌘⇧Z', desc: 'Redo' },
  { key: '?', desc: 'Toggle this overlay' },
];

const POINTERS = [
  { key: 'ALT-CLICK', desc: 'Trigger blast at cursor (when Blast effect on)' },
  { key: 'WHEEL', desc: 'Zoom canvas' },
  { key: 'DRAG', desc: 'Pan canvas' },
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
          <div className="hotkey-row" style={{ marginTop: 6, opacity: 0.6, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            <span style={{ width: '100%' }}>Pointer</span>
          </div>
          {POINTERS.map(s => (
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
