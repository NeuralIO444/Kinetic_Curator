// BeatButton (#950) — the BEAT master clock in the top bar.
//
// Collapsed `[B]`, expands to `[BEAT · 120]` on hover/focus/active, following
// the bar's breathing rules (the kinetic-btn pattern: max-width transition,
// fixed bar width, tooltips on every abbreviated state). Click opens the
// dropdown: BPM presets, a tap-tempo pad (tap 4×), exact BPM entry.
//
// BPM is the master clock: the store's setBeatBpm derives the transition
// seconds (2 beats) and writes the transition channel, so morph durations
// follow the dial — 60 BPM slow luxury, 180 BPM frenetic, past ~160 BPM the
// glitch ceiling hard-cuts instead of morphing. The pulse dot is the button's
// readout: it flashes on every beat at whatever BPM is dialed.
//
// Tap timestamps are human gestures (like #945's heat) — they live here in
// the component, never in the store.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store.js';
import { helpText } from '../data/helpCopy.js';
import {
  BEAT_DEFAULT_BPM,
  BEAT_PRESETS,
  sanitizeBeatBpm,
  tapBpm,
} from '../gl/beatClock.mjs';

export function BeatButton() {
  const beatBpm = useStore((s) => s.beatBpm) ?? BEAT_DEFAULT_BPM;
  const setBeatBpm = useStore((s) => s.setBeatBpm);
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState([]);
  const [exact, setExact] = useState('');
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // The dropdown renders in a portal on document.body: the top bar's
  // .palette-switch clips overflow (#716), which would swallow an
  // absolutely-positioned menu. Fixed positioning escapes it; the button's
  // rect anchors the menu below.
  useEffect(() => {
    if (!open || !btnRef.current) return undefined;
    const place = () => {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open ]);

  // Close the dropdown on outside click or Escape (the CuratorBar pattern).
  // The menu lives in a portal, so "outside" means outside both the button
  // wrap and the menu itself.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inWrap && !inMenu) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const pick = (bpm) => {
    setBeatBpm(bpm);
    setTaps([]);
    setExact('');
  };

  const onTap = () => {
    const now = Date.now();
    const next = [...taps, now].slice(-8);
    setTaps(next);
    const bpm = tapBpm(next);
    if (bpm != null) setBeatBpm(bpm);
  };

  const onExact = (e) => {
    e.preventDefault();
    const bpm = sanitizeBeatBpm(Number(exact));
    if (exact.trim() !== '') pick(bpm);
  };

  // The pulse readout: one flash per beat at the dialed BPM.
  const beatIntervalS = 60 / sanitizeBeatBpm(beatBpm);
  const bpmLabel = Math.round(sanitizeBeatBpm(beatBpm));

  return (
    <div className="beat-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className={`beat-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={helpText('master-beat')}
        aria-label={`Beat clock ${bpmLabel} BPM. Activate to change tempo.`}
        aria-expanded={open}
      >
        <span
          className="beat-dot"
          style={{ animationDuration: `${beatIntervalS}s` }}
          aria-hidden="true"
        />
        <span className="beat-glyph">B</span>
        <span className="beat-rest" aria-hidden="true">EAT · {bpmLabel}</span>
      </button>
      {open && menuPos && createPortal(
        <div
          className="beat-menu"
          ref={menuRef}
          role="menu"
          aria-label="Beat tempo"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
        >
          <div className="beat-menu-label ttl">tempo</div>
          <div className="beat-presets">
            {BEAT_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="menuitem"
                className={`beat-preset ${bpmLabel === p ? 'active' : ''}`}
                onClick={() => pick(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="beat-tap"
            onClick={onTap}
            title="Tap 4× to set the tempo by feel"
          >
            TAP{taps.length > 1 ? ` · ${bpmLabel}` : ''}
          </button>
          <form className="beat-exact" onSubmit={onExact}>
            <input
              type="number"
              min={30}
              max={300}
              value={exact}
              placeholder="BPM"
              aria-label="Exact BPM"
              onChange={(e) => setExact(e.target.value)}
            />
            <button className="act" type="submit">set</button>
          </form>
          <div className="beat-hint">
            {bpmLabel > 160
              ? 'past the glitch ceiling — transitions cut, they don\u2019t morph'
              : `morphs are 2 beats · ${(120 / bpmLabel).toFixed(2)}s`}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
