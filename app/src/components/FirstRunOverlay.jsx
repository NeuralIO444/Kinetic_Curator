import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'kc:first-run-seen';

/**
 * First-run “Play Me” intro overlay (#12).
 * Lightweight manifesto + one action that enables audio + Evolve.
 * Also the front door to the guided tour (#222).
 */
export function FirstRunOverlay({ onPlay, onTour }) {
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

  const startTour = useCallback(() => {
    dismiss(false);
    if (typeof onTour === 'function') onTour();
  }, [dismiss, onTour]);

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
          className="first-run-play"
          onClick={startTour}
          title="A 4-step guided tour: pick a recipe, move a slider, hit PLAY, render a still"
          style={{ background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink)' }}
        >
          TAKE THE TOUR
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
