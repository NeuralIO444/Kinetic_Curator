import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'kc:first-run-seen';

/**
 * First-run “Play Me” intro overlay (#12).
 * Lightweight manifesto + one action that enables audio + Evolve.
 */
export function FirstRunOverlay({ onPlay }) {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });

  const dismiss = useCallback((play) => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* ignore */ }
    setVisible(false);
    if (play && typeof onPlay === 'function') onPlay();
  }, [onPlay]);

  // #107 §7: Escape is the app's one panic key — it must close this too,
  // not just the things App.jsx's central hotkey map already owns.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => { if (e.key === 'Escape') dismiss(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div className="first-run-overlay" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="first-run-card">
        <div className="first-run-mark">◈</div>
        <h2 id="first-run-title" className="first-run-title">KINETIC_CURATOR</h2>
        <p className="first-run-manifesto">
          Curated chaos. Breed variations in a living terrarium —
          listen, evolve, and hunt for hits.
        </p>
        <button
          type="button"
          className="first-run-play"
          onClick={() => dismiss(true)}
        >
          ▶ PLAY ME
        </button>
        <button
          type="button"
          className="first-run-skip"
          onClick={() => dismiss(false)}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
