// METER (#613) — STIMULI's hero: live waveform, seven named bands with
// peak-hold, the beat pulse, and the source (MIC / FILE) always named.
// Reads the meter-only analyser tap directly in its own rAF (no store
// traffic). Audio off → the tap is null and the meter reads IDLE: flat line,
// empty bars, no frozen values.
import { useEffect, useRef, useState } from 'react';
import { getAudioMeterTap } from '../../hooks/audioMeterTap.js';
import { METER_BANDS, meterBandLevels, holdPeaks } from '../../gl/meterBands.mjs';
import { useStore } from '../../state/store.js';
import { nextRoute } from '../../data/audioRoutes.js';
import { createBeatTracker } from '../../curator/beatConfidence.mjs';

const H = 132;
const WAVE_H = 52;

export function MeterHero() {
  const canvasRef = useRef(null);
  const [source, setSource] = useState('IDLE');
  const beatRef = useRef(0);
  const sidecarRef = useRef(false); // #618: a loaded sidecar is what's driving a FILE source
  useEffect(() => useStore.subscribe((s) => { beatRef.current = s.beatPulse || 0; sidecarRef.current = !!s.audioSidecar; }), []);

  useEffect(() => {
    let raf = 0;
    let peaks = METER_BANDS.map(() => 0);
    let last = performance.now();
    let freq = null;
    let wave = null;
    let shownSource = 'IDLE';
    // #1139 — beat-lock detector: two confident attacks (≥ 0.62). The amber
    // wash below is beat-lock only, in the DS amber (--kc-davis), never lean.
    const beatTracker = createBeatTracker();
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
      const dim = css.getPropertyValue('--line-2').trim() || '#333';
      const accent = css.getPropertyValue('--accent').trim() || '#ff2d6f';
      const davisRgb = css.getPropertyValue('--kc-davis-rgb').trim() || '255, 205, 130';
      g.clearRect(0, 0, w, h);

      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const tap = getAudioMeterTap();
      const kind = tap ? (tap.kind === 'FILE' && sidecarRef.current ? 'FILE+ENV' : tap.kind) : 'IDLE';
      if (kind !== shownSource) { shownSource = kind; setSource(kind); }

      // waveform
      const wh = WAVE_H * dpr;
      g.strokeStyle = tap ? ink : dim;
      g.lineWidth = 1.2 * dpr;
      g.beginPath();
      if (tap) {
        const n = tap.analyser.fftSize;
        if (!wave || wave.length !== n) wave = new Uint8Array(n);
        tap.analyser.getByteTimeDomainData(wave);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const y = (wave[i] / 255) * wh;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
      } else {
        g.moveTo(0, wh / 2); g.lineTo(w, wh / 2);
      }
      g.stroke();

      // seven bands + peak-hold
      let levels = METER_BANDS.map(() => 0);
      if (tap) {
        const n = tap.analyser.frequencyBinCount;
        if (!freq || freq.length !== n) freq = new Uint8Array(n);
        tap.analyser.getByteFrequencyData(freq);
        levels = meterBandLevels(freq, tap.sampleRate);
      }
      peaks = tap ? holdPeaks(peaks, levels, dt) : levels.map(() => 0);
      const top = wh + 8 * dpr;
      const barH = h - top - 14 * dpr;
      const colW = w / METER_BANDS.length;
      g.font = `${8 * dpr}px ui-monospace, monospace`;
      g.textAlign = 'center';
      METER_BANDS.forEach((b, i) => {
        const x = i * colW + colW * 0.18;
        const bw = colW * 0.64;
        g.fillStyle = dim;
        g.fillRect(x, top, bw, barH);
        g.fillStyle = ink;
        g.fillRect(x, top + barH * (1 - levels[i]), bw, barH * levels[i]);
        if (peaks[i] > 0.01) {
          g.fillStyle = accent;
          g.fillRect(x, top + barH * (1 - peaks[i]) - dpr, bw, 2 * dpr);
        }
        g.fillStyle = tap ? ink : dim;
        g.fillText(b.label, x + bw / 2, h - 3 * dpr);
      });

      // beat pulse
      const beat = tap ? beatRef.current : 0;
      beatTracker.push(beat);
      // #1139 — beat-lock: a faint amber wash behind the beat dot when the
      // last two attacks were confident. Beat-lock only, never lean.
      if (beatTracker.confident) {
        const bx = w - 8 * dpr;
        const by = 8 * dpr;
        const rr = 14 * dpr;
        const grad = g.createRadialGradient(bx, by, 0, bx, by, rr);
        grad.addColorStop(0, `rgba(${davisRgb},0.22)`);
        grad.addColorStop(1, `rgba(${davisRgb},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(bx, by, rr, 0, Math.PI * 2);
        g.fill();
      }
      if (beat > 0.02) {
        g.fillStyle = accent;
        g.globalAlpha = Math.min(1, beat);
        g.beginPath();
        g.arc(w - 8 * dpr, 8 * dpr, 5 * dpr, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // #790 PR4 — "tap a band, pick a target": a click on a band's bar adds a route
  // for that band (first free target); the new row's pickers are right below.
  const routeBand = (e) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (e.clientY - r.top < WAVE_H + 8) return; // the waveform is not a band
    const i = Math.min(METER_BANDS.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * METER_BANDS.length)));
    const input = `band.${METER_BANDS[i].label.toLowerCase()}`;
    useStore.getState().editAudioRoutes((t) => { const n = nextRoute(t, input); return n ? [...t, n] : t; });
  };
  return (
    <div className="stim-meter-hero">
      <div className="stim-meter-head">
        <span className="lbl">meter <em className="stim-meter-hint">click a band to route it</em></span>
        <span className={`stim-source ${source === 'IDLE' ? 'idle' : ''}`} title="Where the sound comes from">{source}</span>
      </div>
      <canvas ref={canvasRef} className="stim-meter-canvas" style={{ height: H, cursor: 'pointer' }} onClick={routeBand} aria-label="Audio meter: waveform, seven bands, beat. Click a band to add a route for it." />
    </div>
  );
}
