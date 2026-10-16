// MotionMeter (#1469) — the always-alive motion made visible, beside the METER in STIMULI: six
// vertical bars in the meter's language (DRIFT, BREATH, WIND, RHYTHM, WOBBLE, MOTH), short names
// only, no numbers, no units, nothing that explains the engine. Read-only in the strict sense:
// it polls the motion tap in its own rAF — the METER's cadence — and writes bar heights straight
// to the DOM. It sends nothing out, touches no store, and holds no per-frame React state. The
// MOTH bar is absent (not zeroed) whenever no moths are on stage. A null read (no frame has
// published yet, or the resolver's living-motion floor is still) shows flat bars: stillness is
// a reading, never a missing panel.
import { useEffect, useRef } from 'react';
import { readMotionLevels } from '../../hooks/motionMeterTap.js';

const BARS = [
  ['drift', 'DRIFT'],
  ['breath', 'BREATH'],
  ['wind', 'WIND'],
  ['rhythmPhase', 'RHYTHM'],
  ['wobble', 'WOBBLE'],
  ['mothBeat', 'MOTH'],
];

export function MotionMeter() {
  const fills = useRef({});
  const mothCol = useRef(null);
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let timer = 0;
    const draw = () => {
      const m = readMotionLevels();
      for (const [key] of BARS) {
        const el = fills.current[key];
        if (el) el.style.height = `${Math.round((m && Number.isFinite(m[key]) ? m[key] : 0) * 100)}%`;
      }
      if (mothCol.current) mothCol.current.style.display = m && m.mothBeat != null ? '' : 'none';
    };
    draw();
    if (reduced) {
      // Reduced motion: the bars hold the last read values, un-animated — a slow poll, no rAF.
      timer = window.setInterval(draw, 1000);
    } else {
      const loop = () => { draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); window.clearInterval(timer); };
  }, []);
  return (
    <div className="stim-motionmeter" aria-label="motion readout">
      <div className="stim-motion-head"><span>motion</span></div>
      <div className="stim-motionmeter-bars">
        {BARS.map(([key, label]) => (
          <div key={key} className="stim-motionmeter-col" ref={key === 'mothBeat' ? mothCol : undefined}>
            <div className="stim-motionmeter-track">
              <div className="stim-motionmeter-fill" ref={(el) => { fills.current[key] = el; }} />
            </div>
            <div className="stim-motion-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
