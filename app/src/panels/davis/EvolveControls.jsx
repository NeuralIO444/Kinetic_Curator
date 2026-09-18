import { useEffect, useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import {
  sanitizeScores,
  levelFor,
  whyCopy,
  ariaNote,
  logShimmer,
} from '../../shimmer/shimmer.js';

// The four EVOLVE mutation targets. Candidate ids match the sidecar's
// scores.json namespace: { "evolve-target:seed": percentile, ... }.
const TARGETS = [
  { value: 'seed', label: 'SEED', hint: 'Evolve jumps the seed only.' },
  { value: 'layout', label: 'LAYOUT', hint: 'Evolve jumps layout params.' },
  { value: 'palette', label: 'PALETTE', hint: 'Evolve jumps the palette.' },
  { value: 'all', label: 'ALL', hint: 'Evolve jumps every parameter.' },
];

export function EvolveControls({ evolveTarget, evolveSource, evolveInterval }) {
  // Shimmer "whisper" prototype: scores load once per session. Absent file
  // or junk content = {} = zero shimmer, real no-op, no errors.
  const [scores, setScores] = useState(null);
  // #310: SHIMMER is a hidden default — the row is gone and the whisper
  // stays ON. The other modes ('quiet','off') are out of performer sight;
  // nothing reaches for them mid-set.
  const mode = 'on';
  const [listening, setListening] = useState(false); // SHIFT held

  useEffect(() => {
    let alive = true;
    const url = `${import.meta.env.BASE_URL}shimmer-scores.json`;
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(raw => {
        if (!alive) return;
        const clean = sanitizeScores(raw);
        setScores(clean);
        logShimmer({ event: 'scores-loaded', source: url, candidates: Object.keys(clean).length });
      })
      .catch(() => {
        if (!alive) return;
        setScores({}); // no shimmer, no error surfaced
        logShimmer({ event: 'scores-unavailable', source: url });
      });
    return () => { alive = false; };
  }, []);

  // LISTEN: hold SHIFT to amplify the shimmer ~3x; release recedes.
  useEffect(() => {
    const down = e => { if (e.key === 'Shift') setListening(true); };
    const up = e => { if (e.key === 'Shift') setListening(false); };
    const blur = () => setListening(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const pickTarget = (value) => {
    const id = `evolve-target:${value}`;
    if (mode !== 'off' && scores) {
      const pct = scores[id] ?? null;
      logShimmer({
        event: 'touch', candidate: id, percentile: pct,
        level: levelFor(scores, id), outcome: 'touched',
        mode, listening,
      });
    }
    emit(Events.DAVIS_EVOLVE, { target: value });
  };

  const rowClass = [
    'davis-source-row',
    'shimmer-row',
    mode === 'quiet' ? 'quiet' : '',
    listening ? 'listening' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={rowClass} title="What jumps when Evolve fires. Shimmer is the taste model's read — a guess, not an order.">
        <span className="davis-label">TARGET</span>
        {TARGETS.map((t, i) => {
          const id = `evolve-target:${t.value}`;
          const level = mode === 'off' ? 0 : levelFor(scores, id);
          const pct = scores ? scores[id] ?? null : null;
          const note = ariaNote(level);
          const cls = [
            'chip-btn',
            evolveTarget === t.value ? 'active' : '',
            level > 0 ? `shimmer-lvl-${level}` : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={t.value}
              className={cls}
              aria-pressed={evolveTarget === t.value}
              aria-label={note ? `${t.label} — ${note}` : t.label}
              title={level > 0 ? whyCopy(t.label.charAt(0) + t.label.slice(1).toLowerCase(), pct) : t.hint}
              style={level > 0 ? { animationDelay: `${-i * 2.5}s` } : undefined}
              onClick={() => pickTarget(t.value)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* #310: SHIMMER row removed — the whisper stays ON as a hidden default.
          AUTO-SNAP removed the same way (hidden default: off). */}
      <div className="davis-source-row">
        <span className="davis-label">SOURCE</span>
        <button className={`chip-btn ${evolveSource === 'time' ? 'active' : ''}`}
          title="Fire Evolve on INTERVAL. No mic."
          onClick={() => emit(Events.DAVIS_EVOLVE, { source: 'time' })}>TIME</button>
        <button className={`chip-btn ${evolveSource === 'beat' ? 'active' : ''}`}
          title="Fire Evolve on a mic attack. Same edge as phrase AUDIO. INTERVAL is ignored."
          onClick={() => emit(Events.DAVIS_EVOLVE, { source: 'beat' })}>BEAT</button>
      </div>

      <div className="davis-interval-row" style={evolveSource !== 'time' ? { opacity: 0.4 } : undefined}
        title={evolveSource !== 'time' ? 'Dead while SOURCE is BEAT. Switch to TIME.' : 'Seconds between Evolve fires.'}>
        <span className="davis-label">INTERVAL</span>
        <input type="range" min={200} max={10000} step={100} value={evolveInterval}
          disabled={evolveSource !== 'time'}
          title={evolveSource !== 'time' ? 'Dead while SOURCE is BEAT. Switch to TIME.' : 'Seconds between Evolve fires.'}
          onChange={e => emit(Events.DAVIS_EVOLVE, { interval: Number(e.target.value) })} />
        <span className="davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
      </div>

      {/* #268: SMOOTHING removed — its only consumer was the retired SVG
          layer's CSS transition; it never touched the GL loop. */}
    </>
  );
}
