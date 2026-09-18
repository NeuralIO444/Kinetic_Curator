import { useCallback, useEffect, useState } from 'react';
import { TOUR_STEPS, TOUR_STORAGE_KEY, activateTourTab } from '../data/tour.js';

/**
 * First-run guided tour (#222). Four steps across the panels — pick a
 * preset, move a slider, hit PLAY, render a still. A card, not coach marks
 * (#158: no coach marks); each step flips the panel tab so the operator
 * sees the real control, not a screenshot.
 *
 * Entry points: the first-run card's TAKE THE TOUR button, and the `?`
 * help overlay's replay button. `kc:tour-seen` persists; the tour never
 * auto-starts and never nags.
 */
export function TourOverlay({ open, onClose }) {
  const [step, setStep] = useState(0);

  // External-system sync only: flip the tab strip when the tour opens.
  // Step reset happens in finish(), the single close path.
  useEffect(() => {
    if (open) activateTourTab(TOUR_STEPS[0].tab);
  }, [open ]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, '1');
    } catch { /* ignore */ }
    setStep(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  const go = (next) => {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, next));
    setStep(clamped);
    activateTourTab(TOUR_STEPS[clamped].tab);
  };

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="First-run tour">
      <div className="tour-card">
        <div className="tour-step-title">{s.title}</div>
        <p className="tour-step-body">{s.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((t, i) => (
            <span key={t.id} className={`tour-dot ${i === step ? 'on' : ''}`} />
          ))}
        </div>
        <div className="tour-nav">
          <button type="button" className="tour-skip" onClick={finish}>
            Skip tour
          </button>
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <button type="button" className="chip-btn" onClick={() => go(step - 1)}>
              ← Back
            </button>
          )}
          <button
            type="button"
            className="chip-btn"
            onClick={() => (last ? finish() : go(step + 1))}
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            {last ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
