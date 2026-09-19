// ─────────────────────────────────────────────────────────────
// AudioMapProto.jsx — prototype v2: STIMULI-styled tap-to-map.
//
// Matt's decision: the tap-to-map interaction lives in the STIMULI tab
// only — one global set of 4 assignments, NOT per-track. So this
// prototype wears the real STIMULI panel chrome (P06 header, AUDIO
// toggle + SETUP row, section boxes, colored meter strip) with the new
// big meters + tap popup inside it. Mounted at ?proto=audio-map.
// New files only — nothing here touches the main app, panels, or the
// other agent's lanes (StimulusPanel.jsx is read-only reference).
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader } from '../../components/PanelHeader.jsx';
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
  const [setupOpen, setSetupOpen] = useState(false);
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
      hctx.fillStyle = '#0a0a0a';
      hctx.fillRect(0, 0, hw, hh);
      hctx.strokeStyle = 'rgba(255,255,255,0.05)';
      hctx.lineWidth = 1;
      hctx.beginPath();
      hctx.moveTo(0, hh / 2); hctx.lineTo(hw, hh / 2);
      hctx.stroke();
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
      mctx.fillStyle = '#0a0a0a';
      mctx.fillRect(0, 0, mw, mh);
      LANES.forEach((band, i) => {
        const b = laneOf(band);
        const v = Math.min(1, s.val[band]);
        const pk = Math.min(1, s.peak[band]);
        const x0 = i * laneW;
        const pad = 16;
        const bw = laneW - pad * 2;
        const barH = mh - 52;
        const bh = v * barH;
        // bar
        const g = mctx.createLinearGradient(0, mh - 32, 0, mh - 32 - bh);
        g.addColorStop(0, b.color + '44');
        g.addColorStop(1, b.color);
        mctx.fillStyle = g;
        mctx.fillRect(x0 + pad, mh - 32 - bh, bw, bh);
        // peak-hold tick
        const py = mh - 32 - pk * barH;
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(x0 + pad, py - 1.5, bw, 3);
        // lane frame (highlight when its popup is open)
        mctx.strokeStyle = popupBand === band ? '#ffffff' : 'rgba(255,255,255,0.14)';
        mctx.lineWidth = popupBand === band ? 2 : 1;
        mctx.strokeRect(x0 + 5, 5, laneW - 10, mh - 10);
        // colored label (matches the real STIMULI strip) + current mapping
        mctx.textAlign = 'center';
        mctx.fillStyle = b.color;
        mctx.font = '700 10px ui-monospace, monospace';
        mctx.fillText(b.label, x0 + laneW / 2, 18);
        const tgt = assignRef.current[band];
        mctx.fillStyle = 'rgba(232,232,224,0.5)';
        mctx.font = '9px ui-monospace, monospace';
        mctx.fillText(tgt ? TARGET_LABEL[tgt] : '— tap to map —', x0 + laneW / 2, mh - 12);
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
  const audioOn = mode === 'mic';

  const BallisticSlider = ({ label, value, onChange }) => (
    <div className="am-modslider">
      <div className="am-modslider-row">
        <span>{label}</span>
        <span>{(value / 100).toFixed(2)}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%' }}
      />
    </div>
  );

  return (
    <div className="am-page">
      <div className="panel panel-stimulus am-panel">
        <PanelHeader tag="P06" title="STIMULI" subtitle={mode === 'idle' ? 'idle' : 'active'}>
          <span className="am-proto-badge">prototype</span>
        </PanelHeader>

        <div className="stim-body">
          {/* — toggle row mirrors the real panel: AUDIO stays in performer sight — */}
          <div className="stim-toggle-row">
            <button
              className={`stim-toggle ${audioOn ? 'on' : ''}`}
              style={audioOn ? { background: '#00d9ff', borderColor: '#00d9ff' } : {}}
              onClick={() => startSource(audioOn ? 'off' : 'mic')}
            >
              🎤 AUDIO {audioOn ? 'ON' : 'OFF'}
            </button>
            <button
              className={`stim-toggle ${setupOpen ? 'on' : ''}`}
              onClick={() => setSetupOpen((o) => !o)}
              aria-expanded={setupOpen}
            >
              ⚙ SETUP {setupOpen ? '▾' : '▸'}
            </button>
          </div>

          {setupOpen && (
            <div className="am-setup">
              <span className="am-section-title">AUDIO SRC</span>
              <div className="am-src-row">
                {[
                  ['mic', 'MIC'],
                  ['demo', 'DEMO'],
                  ['off', 'OFF'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`chip-btn ${mode === id ? 'active' : ''}`}
                    onClick={() => startSource(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="am-hint">DEMO synthesizes a sweeping tone + noise bursts — no mic needed.</div>
            </div>
          )}

          {err && <div className="am-err">{err}</div>}

          {/* — ballistics: the only two sliders on the face — */}
          <div className="am-section">
            <div className="am-section-title">BALLISTICS</div>
            <BallisticSlider label="ATTACK" value={attack} onChange={setAttack} />
            <BallisticSlider label="DECAY" value={decay} onChange={setDecay} />
          </div>

          {/* — the new meter section: history + tall tappable meters — */}
          <div className="am-section">
            <div className="am-section-title">
              BANDS → ANIMATION
              <span className="am-title-hint">tap a meter to map it</span>
            </div>
            <div className="am-history-wrap">
              <canvas ref={histRef} className="am-history" />
              <div className="am-legend">
                {LANES.map((b) => (
                  <span key={b} style={{ color: laneOf(b).color }}>{laneOf(b).label}</span>
                ))}
              </div>
            </div>
            <div className="am-meter-wrap">
              <canvas ref={meterRef} className="am-meters" onClick={onMeterClick} />
              {popupBand && (
                <div className="am-popup" style={{ left: `${LANES.indexOf(popupBand) * 25}%` }}>
                  <div className="am-popup-head">
                    <span style={{ color: laneOf(popupBand).color }}>{laneOf(popupBand).label}</span>
                    <span>&nbsp;→</span>
                    <button className="am-x" onClick={() => setPopupBand(null)} aria-label="close">✕</button>
                  </div>
                  {TARGETS.map((t) => (
                    <button
                      key={t.id}
                      className={'chip-btn am-tgt' + (assignments[popupBand] === t.id ? ' active' : '')}
                      onClick={() => assign(t.id)}
                    >
                      <span>{t.label}</span><em>{t.hint}</em>
                    </button>
                  ))}
                  <button className="chip-btn am-tgt" onClick={() => assign(null)}>clear mapping</button>
                  <label className="am-trim">
                    band trim
                    <input
                      type="range" min={20} max={200} value={Math.round(trims[popupBand] * 100)}
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
          </div>

          {/* — current assignments readout — */}
          <div className="am-assign">
            {LANES.map((b) => (
              <div key={b} className="am-chip">
                <i style={{ background: laneOf(b).color }} />
                <span style={{ color: laneOf(b).color }}>{laneOf(b).label}</span>
                → <b>{assignments[b] ? TARGET_LABEL[assignments[b]] : '—'}</b>
              </div>
            ))}
          </div>

          {/* — driven output preview — */}
          <div className="am-section">
            <div className="am-section-title">DRIVEN OUTPUT — preview</div>
            <MapCanvas targetsRef={targetsRef} />
          </div>

          <footer className="am-foot">
            cross-streams: BASS ducks TREBLE ×(1−0.65·bass) · RMS scales all ×(0.30+0.70·rms) — see mapping.js
          </footer>
        </div>
      </div>
    </div>
  );
}
