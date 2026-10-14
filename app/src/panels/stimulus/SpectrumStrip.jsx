// SpectrumStrip (#1482 P2) — what the engine hears, under the METER: 128 log-spaced bins from 30 Hz to 16 kHz with
// their peaks. Read-only: it draws gl/spectrumLive's state in its own rAF. No events, no store writes, no re-render.
import { useEffect, useRef } from 'react';
import { readSpectrum } from '../../gl/spectrumLive.mjs';
import { LOG_BINS } from '../../gl/spectrumCore.mjs';

const H = 44;

export function SpectrumStrip() {
  const canvasRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      const h = Math.round(H * dpr);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d');
      const css = getComputedStyle(cv);
      const ink = css.getPropertyValue('--ink').trim() || '#e8e8e0';
      const accent = css.getPropertyValue('--accent').trim() || ink;
      g.clearRect(0, 0, w, h);
      const s = readSpectrum();
      const bw = w / LOG_BINS;
      g.fillStyle = ink;
      for (let i = 0; i < LOG_BINS; i++) {
        const v = s.smooth[i];
        if (v > 0.002) g.fillRect(i * bw, h * (1 - v), Math.max(1, bw - dpr * 0.5), h * v);
      }
      g.fillStyle = accent;
      for (let i = 0; i < LOG_BINS; i++) {
        const p = s.peak[i];
        if (p > 0.01) g.fillRect(i * bw, h * (1 - p) - dpr, Math.max(1, bw - dpr * 0.5), dpr * 1.5);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="stim-spectrum" aria-label="spectrum readout">
      <div className="stim-motion-head"><span>spectrum</span><span className="stim-motion-hint">30 Hz – 16 kHz · read only</span></div>
      <canvas ref={canvasRef} className="stim-spectrum-canvas" style={{ height: H }} />
      <div className="stim-spectrum-scale"><span>30</span><span>100</span><span>1k</span><span>16k</span></div>
    </div>
  );
}
