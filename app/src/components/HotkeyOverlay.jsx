import { useMemo, useState } from 'react';
import { HELP_SHORTCUTS, HELP_TOPICS } from '../data/helpCopy.js';
import { ABOUT_TITLE, ABOUT_TAGLINE, ABOUT_BIO, ABOUT_LINKS } from '../data/aboutCopy.mjs';
import { KERNEL_VERSION } from '../engine/kernel/version.js';
import aboutPhoto from '../assets/about-matt-ciaglia.jpg';

const TABS = ['help', 'keys', 'settings', 'about'];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.9.0';

// #1043 — the Help modal. Sized in viewport percent (CSS), rows are 44px touch targets,
// no inline style: every look lives in `.hotkey-*` (styles/panels.css).
export function HotkeyOverlay({ show, onClose, initialTab = 'help', onTour }) {
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
      <div className="hotkey-card" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <div className="hotkey-card-header">
          <span className="ttl">help</span>
          <button className="micro-btn hotkey-close" onClick={onClose} aria-label="Close help">×</button>
        </div>
        <div className="hotkey-tabs" role="tablist">
          {TABS.map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`chip-btn act ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {id}
            </button>
          ))}
        </div>
        {tab === 'help' && (
          <>
            <div className="hotkey-tools">
              <input
                type="search"
                className="hotkey-search"
                placeholder="Search controls…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {typeof onTour === 'function' && (
                <button
                  type="button"
                  className="micro-btn act hotkey-tour"
                  onClick={onTour}
                  title="Replay the 4-step first-run tour"
                >
                  ↻ Replay the tour
                </button>
              )}
            </div>
            <div className="hotkey-list">
              {topics.map((t) => (
                <div key={t.id} className="hotkey-row hotkey-row-top">
                  <kbd className="hotkey-key">{t.title}</kbd>
                  <span className="hotkey-desc">{t.group} — {t.text}</span>
                </div>
              ))}
              {topics.length === 0 && <div className="hotkey-desc hotkey-empty">No match.</div>}
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
          <div className="hotkey-desc hotkey-prose">
            Quality lives on the MasterBar; audio lives on STIMULI.
            There is no second prefs store — that would fight the project document and #107.
          </div>
        )}
        {tab === 'about' && (
          <div className="hotkey-about">
            <img className="hotkey-about-photo" src={aboutPhoto} alt="Matt Ciaglia" width="480" height="480" />
            <div className="hotkey-about-body">
              <h2 className="hotkey-about-title name">{ABOUT_TITLE}</h2>
              <p className="hotkey-about-tagline name">{ABOUT_TAGLINE}</p>
              {ABOUT_BIO.map((p) => <p key={p} className="hotkey-desc hotkey-prose">{p}</p>)}
              <div className="hotkey-about-links">
                {ABOUT_LINKS.map((l) => (
                  <div key={l.label} className="hotkey-row">
                    <span className="hotkey-key lbl">{l.label}</span>
                    <a className="hotkey-link name" href={l.href}
                      {...(l.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                      {l.text}
                    </a>
                  </div>
                ))}
              </div>
              <div className="hotkey-desc hotkey-version">KINETIC_CURATOR v{APP_VERSION} · {KERNEL_VERSION} · build {import.meta.env.VITE_BUILD_ID || 'dev'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
