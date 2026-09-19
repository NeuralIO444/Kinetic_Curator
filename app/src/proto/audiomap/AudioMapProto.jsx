// ─────────────────────────────────────────────────────────────
// AudioMapProto.jsx — prototype: tap an audio band, map it to an
// animation target, watch the canvas breathe. Mounted at
// ?proto=audio-map (see main.jsx). New files only — nothing here
// touches the main app, panels, or the other agent's lanes.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { createAudioEngine, BANDS } from './audioEngine.js';
import { TARGETS, TARGET_LABEL, DEFAULT_ASSIGNMENTS, applyCrossStreams, resolveTargets } from './mapping.js';
import MapCanvas from './MapCanvas.jsx';
import './audiomap.css';

const LANES = ['bass', 'mid', 'treble', 'rms'];
const laneOf = (id) => BANDS.find((b) => b.id === id);

export default function AudioMapProto() {
  const engine = useMemo(() => createAudioEngine(), []);
  const targetsRef = useRef({});
  const [attack, setAttack] = useState(80);
  const [decay, setDecay] = useState(55);
  const [assignments, setAssignments] = useState({ ...DEFAULT_ASSIGNMENTS });
  const [popupBand, setPopupBand] = useState(null);
  const [trims, setTrims] = useState({ bass: 1, mid: 1, treble: 1, rms: 1 });
  const [err, setErr] = useState('');
  const [modeTick, setModeTick] = useState(0); // re-render source button state

  const histRef = useRef(null);
  const meterRef = useRef(null);
  const atkRef = useRef(attack / 100);
  const decRef = useRef(decay / 100);
  atkRef.current = attack / 100;
  decRef.current = decay / 100;
  const assignRef = useRef(assignments);
  assignRef.current = assignments;

  // ── one rAF loop: analyze → cross-streams → draw meters + history ──
  useEffect(() => {
    const hist = histRef.current;
    const meters = meterRef.current;
    const hctx = hist.getContext('2d');
    const mctx = meters.getContext('2d');
    let raf = 0;
    const t0 = performance.now();

    const fit = (c) => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(50, r.width * dpr);
      c.height = Math.max(50, r.height * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: r.width, h: r.height };
    };
    let hg = fit(hist);
    let mg = fit(meters);
    const onResize = () => {
      hg = fit(hist);
      mg = fit(meters);
    };
    window.addEventListener('resize', onResize);

    const frame = () => {
      const s = engine.tick(atkRef.current, decRef.current);
      const crossed = applyCrossStreams(s.val);
      const tSec = (performance.now() - t0) / 1000;
      targetsRef.current = resolveTargets(assignRef.current, crossed, tSec);

      // — history strip: 4 scrolling traces —
      const { w: hw, h: hh } = hg;
      hctx.fillStyle = '#0a0c14';
      hctx.fillRect(0, 0, hw, hh);
      const H = s.history;
      const n = H.length;
      for (const band of LANES) {
        const b = laneOf(band);
        hctx.strokeStyle = b.color;
        hctx.lineWidth = 1.5;
        hctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (319)) * hw;
          const y = hh - 6 - Math.min(1, H[i][band]) * (hh - 14);
          if (i === 0) hctx.moveTo(x, y);
          else hctx.lineTo(x, y);
        }
        hctx.stroke();
      }

      // — meters: tall bars + peak-hold ticks, fast attack / slow release —
      const { w: mw, h: mh } = mg;
      const laneW = mw / 4;
      mctx.fillStyle = '#0a0c14';
      mctx.fillRect(0, 0, mw, mh);
      LANES.forEach((band, i) => {
        const b = laneOf(band);
        const v = Math.min(1, s.val[band]);
        const pk = Math.min(1, s.peak[band]);
        const x0 = i * laneW;
        const pad = 14;
        const bw = laneW - pad * 2;
        const bh = v * (mh - 46);
        // bar
        const g = mctx.createLinearGradient(0, mh - 28, 0, mh - 28 - bh);
        g.addColorStop(0, b.color + '55');
        g.addColorStop(1, b.color);
        mctx.fillStyle = g;
        mctx.fillRect(x0 + pad, mh - 28 - bh, bw, bh);
        // peak-hold tick
        const py = mh - 28 - pk * (mh - 46);
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(x0 + pad, py - 1.5, bw, 3);
        // lane frame + label
        mctx.strokeStyle = popupBand === band ? '#ffffff' : '#2a2f45';
        mctx.lineWidth = popupBand === band ? 2 : 1;
        mctx.strokeRect(x0 + 4, 4, laneW - 8, mh - 8);
        mctx.fillStyle = '#cfd4ea';
        mctx.font = '11px ui-monospace, monospace';
        mctx.textAlign = 'center';
        mctx.fillText(b.label, x0 + laneW / 2, mh - 10);
        const tgt = assignRef.current[band];
        mctx.fillStyle = '#8a90ad';
        mctx.font = '10px ui-monospace, monospace';
        mctx.fillText(tgt ? TARGET_LABEL[tgt] : '— tap to map —', x0 + laneW / 2, 20);
      });

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [engine, popupBand]);

  const onMeterClick = (e) => {
    const r = meterRef.current.getBoundingClientRect();
    const i = Math.min(3, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 4)));
    setPopupBand(LANES[i]);
  };

  const startSource = async (which) => {
    setErr('');
    try {
      if (which === 'mic') await engine.startMic();
      else if (which === 'demo') engine.startDemo();
      else engine.stop();
    } catch {
      setErr('Mic blocked — allow microphone access, or use DEMO mode.');
    }
    setModeTick((x) => x + 1);
  };

  const assign = (targetId) => {
    setAssignments((a) => ({ ...a, [popupBand]: targetId }));
    setPopupBand(null);
  };

  const setTrim = (v) => {
    setTrims((t) => {
      const next = { ...t, [popupBand]: v };
      engine.state.trims[popupBand] = v;
      return next;
    });
  };

  const mode = engine.getMode();

  return (
    <div className="am-root">
      <header className="am-top">
        <div>
          <div className="am-title">AUDIO MAP <span className="am-proto">prototype</span></div>
          <div className="am-sub">tap a band → map it → the canvas breathes</div>
        </div>
        <div className="am-src">
          <button className={mode === 'mic' ? 'on' : ''} onClick={() => startSource('mic')}>MIC</button>
          <button className={mode === 'demo' ? 'on' : ''} onClick={() => startSource('demo')}>DEMO</button>
          <button className={mode === 'idle' ? 'on' : ''} onClick={() => startSource('off')}>OFF</button>
        </div>
        <div className="am-sliders">
          <label>ATTACK <input type="range" min="0" max="100" value={attack} onChange={(e) => setAttack(+e.target.value)} /></label>
          <label>DECAY <input type="range" min="0" max="100" value={decay} onChange={(e) => setDecay(+e.target.value)} /></label>
        </div>
      </header>
      {err && <div className="am-err">{err}</div>}

      <div className="am-history-wrap">
        <canvas ref={histRef} className="am-history" />
        <div className="am-legend">
          {LANES.map((b) => (
            <span key={b} style={{ color: laneOf(b).color }}>■ {laneOf(b).label}</span>
          ))}
        </div>
      </div>

      <div className="am-meter-wrap">
        <canvas ref={meterRef} className="am-meters" onClick={onMeterClick} />
        {popupBand && (
          <div className="am-popup" style={{ left: `${LANES.indexOf(popupBand) * 25}%` }}>
            <div className="am-popup-head">
              {laneOf(popupBand).label} → <button className="am-x" onClick={() => setPopupBand(null)}>✕</button>
            </div>
            {TARGETS.map((t) => (
              <button
                key={t.id}
                className={'am-tgt' + (assignments[popupBand] === t.id ? ' sel' : '')}
                onClick={() => assign(t.id)}
              >
                <span>{t.label}</span><em>{t.hint}</em>
              </button>
            ))}
            <button className="am-tgt clear" onClick={() => assign(null)}>clear mapping</button>
            <label className="am-trim">
              band trim
              <input
                type="range" min="20" max="200" value={Math.round(trims[popupBand] * 100)}
                onChange={(e) => setTrim(+e.target.value / 100)}
              />
              <span>{Math.round(trims[popupBand] * 100)}%</span>
            </label>
            <div className="am-mlx" title="Honest placeholder — no fake intelligence">
              🔒 curator suggestions<br /><em>arrive after MLX training</em>
            </div>
          </div>
        )}
      </div>

      <div className="am-assign">
        {LANES.map((b) => (
          <div key={b} className="am-chip">
            <i style={{ background: laneOf(b).color }} />
            {laneOf(b).label} → <b>{assignments[b] ? TARGET_LABEL[assignments[b]] : '—'}</b>
          </div>
        ))}
      </div>

      <MapCanvas targetsRef={targetsRef} />

      <footer className="am-foot">
        cross-streams: BASS ducks TREBLE ×(1−0.65·bass) · RMS scales all ×(0.30+0.70·rms) — see mapping.js
      </footer>
    </div>
  );
}
