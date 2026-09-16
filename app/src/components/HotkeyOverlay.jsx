import { useMemo, useState } from 'react';
import { HELP_SHORTCUTS, HELP_TOPICS } from '../data/helpCopy.js';

export function HotkeyOverlay({ show, onClose, initialTab = 'help' }) {
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState('');
  const topics = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return HELP_TOPICS;
    return HELP_TOPICS.filter((t) =>
      `${t.group} ${t.title} ${t.text}`.toLowerCase().includes(s));
  }, [q]);

  if (!show) return null;

  return (
    <div className="hotkey-overlay" onClick={onClose}>
      <div className="hotkey-card" onClick={(e) => e.stopPropagation()} style={{ minWidth: 360, maxWidth: 440 }}>
        <div className="hotkey-card-header">
          <span>HELP</span>
          <button className="micro-btn" onClick={onClose}>✕</button>
        </div>
        <div className="davis-source-row" style={{ margin: '8px 0' }}>
          {['help', 'keys', 'settings'].map((id) => (
            <button key={id} className={`chip-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {id.toUpperCase()}
            </button>
          ))}
        </div>
        {tab === 'help' && (
          <>
            <input
              type="search"
              placeholder="Search controls…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', marginBottom: 8, fontSize: 11, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', padding: 4 }}
            />
            <div className="hotkey-list" style={{ maxHeight: 280, overflow: 'auto' }}>
              {topics.map((t) => (
                <div key={t.id} className="hotkey-row" style={{ alignItems: 'flex-start' }}>
                  <kbd className="hotkey-key">{t.title}</kbd>
                  <span className="hotkey-desc">{t.group} — {t.text}</span>
                </div>
              ))}
              {topics.length === 0 && <div className="hotkey-desc">No match.</div>}
            </div>
          </>
        )}
        {tab === 'keys' && (
          <div className="hotkey-list">
            {HELP_SHORTCUTS.map((s) => (
              <div key={s.key} className="hotkey-row">
                <kbd className="hotkey-key">{s.key}</kbd>
                <span className="hotkey-desc">{s.desc}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'settings' && (
          <div className="hotkey-desc" style={{ lineHeight: 1.45, padding: '6px 0' }}>
            Quality, gloss, and audio live on the MasterBar and Stimuli.
            There is no second prefs store — that would fight the project document and #107.
          </div>
        )}
      </div>
    </div>
  );
}
