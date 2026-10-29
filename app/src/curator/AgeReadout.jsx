// AgeReadout.jsx — #1805: the DEV-ONLY age-buffer readout. It mounts only with ?debug=age on the URL (the
// StressReadout pattern, #1354), so the shipped instrument has no extra chrome. While it is mounted the live
// loop requests the ACCUM age buffer (ageLive.mjs) and this paints it as a false-colour age map — Davis-
// continuous, per the DS: fresh light pale gold, cooling through amber to deep ember; void is ink. It shows
// measurements only: the map, the oldest living age, and how much of the field holds light.
import { useEffect, useRef, useState } from 'react';
import { readAgeFrame } from '../gl/ageLive.mjs';
import { ageFalseColour } from '../gl/accum.mjs';

/** The ramp's deep end, in seconds: ages past it read as the oldest ember. */
const AGE_WINDOW_S = 5;

export function AgeReadout() {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState({ oldest: 0, alivePct: 0, live: false });

  // The age source is a registered getter with no subscription API: a
  // light poll keeps the readout current (and the readback cheap — the
  // field is pair-resolution, read a few times a second, backstage only).
  useEffect(() => {
    const draw = () => {
      const frame = readAgeFrame();
      const canvas = canvasRef.current;
      if (!frame || !canvas) {
        setStats((s) => (s.live ? { oldest: 0, alivePct: 0, live: false } : s));
        return;
      }
      const { data, width, height } = frame;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rgba = ageFalseColour(data, width, height, { maxAge: AGE_WINDOW_S, flip: true });
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
      let oldest = 0;
      let alive = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] >= 0) {
          alive++;
          if (data[i] > oldest) oldest = data[i];
        }
      }
      setStats({ oldest, alivePct: data.length ? (alive / data.length) * 100 : 0, live: true });
    };
    draw();
    const id = setInterval(draw, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-label="Trail age (debug)"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 44,
        zIndex: 9999,
        padding: '8px 10px',
        background: 'rgba(12,12,14,0.92)',
        border: '1px solid rgba(255,255,255,0.18)',
        font: '11px ui-monospace, Menlo, monospace',
        color: '#e8e8ea',
      }}
    >
      <div style={{ marginBottom: 6, whiteSpace: 'pre' }}>
        {stats.live
          ? `AGE  oldest ${stats.oldest.toFixed(2)}s  field ${stats.alivePct.toFixed(1)}% lit  ramp 0–${AGE_WINDOW_S}s`
          : 'AGE  no age buffer (ACCUM off, or no consumer yet)'}
      </div>
      <canvas ref={canvasRef} style={{ width: 320, height: 'auto', display: 'block', background: '#0a0a0e' }} />
    </div>
  );
}
