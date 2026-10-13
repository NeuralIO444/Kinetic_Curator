// MotionStrip (#1469) — the always-alive motion made visible, beside the METER. Read-only: it reads the live loop's
// published numbers (gl/motionTap) in its own rAF and writes bar widths straight to the DOM. No events, no store
// writes, no React re-render per frame. Same bar language as the meter's bands.
import { useEffect, useRef } from 'react';
import { readMotion, MOTION_KEYS } from '../../gl/motionTap.mjs';

const LABEL = { life: 'LIFE', drift: 'DRIFT', breath: 'BREATH', pulse: 'PULSE', wind: 'WIND', rhythm: 'RHYTHM', palette: 'PALETTE' };
const TITLE = {
  life: 'The slow life breath (the LIFE dial), plus any breath a route adds',
  drift: 'Kineme drift: marks wander (DRIFT / SWELL / THUMP / ORGANIC / CADENCE re-weight it)',
  breath: 'Kineme breath: marks swell and settle',
  pulse: 'Kineme pulse: a beat-driven swell (THUMP follows the beat)',
  wind: 'The shared wind that carries the swarm',
  rhythm: 'On while ORGANIC or CADENCE shapes the placement',
  palette: 'Palette breath: colour sweeps slowly (off under reduced motion)',
};

export function MotionStrip() {
  const fills = useRef({});
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const m = readMotion();
      for (const k of MOTION_KEYS) {
        const el = fills.current[k];
        if (el) el.style.width = `${Math.round(m[k] * 100)}%`;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="stim-motion" aria-label="motion readout">
      <div className="stim-motion-head"><span>motion</span><span className="stim-motion-hint">the always-alive layer · read only</span></div>
      <div className="stim-motion-bars">
        {MOTION_KEYS.map((k) => (
          <div key={k} className="stim-motion-col" title={TITLE[k]}>
            <div className="stim-motion-track"><div className="stim-motion-fill" ref={(el) => { fills.current[k] = el; }} /></div>
            <div className="stim-motion-label">{LABEL[k]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
