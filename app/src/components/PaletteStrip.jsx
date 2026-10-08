import { useState, useRef, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { useHotkeys } from '../hooks/useHotkeys.js';
import * as A from '../state/actions.js';
import { emit, Events } from '../composition/eventBus.js';
import { SCHEME_IDS } from '../engine/harmony.js';
import { chipWindowStart } from './paletteChipWindow.mjs';
import { paletteTasteFit, fitLevel } from './paletteTasteFit.mjs';
import { getTaste } from '../curator/tasteStore.js';
import { tasteLevel } from '../curator/topbarTaste.mjs';
import { CuratorBar } from '../panels/layout/CuratorBar.jsx';
import { PaletteWing } from './PaletteWing.jsx';

const COLOR_MODES = ['FADE', 'WASH', 'INJECT'];
const COLOR_MODE_HINT = {
  FADE: 'Whole picture melts. BEAT is the clock — BPM sets how long.',
  WASH: 'Color soaks from the middle outward — the dye front chases through the marks. BEAT is the clock.',
  INJECT: 'The field dyes first, then the swarm catches up — the new color spreads through the moving marks. BEAT is the clock.',
};
const CHIP_CAP = 4;

function CompactSwatches({ swatches }) {
  return (
    <span className="palette-chip-swatches">
      {swatches.slice(0, 5).map((s, i) => (
        <span key={i} className="palette-chip-sw" style={{ background: s }} title={s} />
      ))}
    </span>
  );
}

const SWATCH_WIN = 5;
const SWATCH_STEP = 12;
function ActivePaletteStrip({ palette, dirty, locks, onSwatch, onBg, onInk, onReset, onLock }) {
  const swatches = palette.swatches || [];
  const [start, setStart] = useState(0);
  const maxStart = Math.max(0, swatches.length - SWATCH_WIN);
  const s = Math.min(start, maxStart);
  const overflow = swatches.length > SWATCH_WIN;
  const slide = (d) => (e) => {
    e.stopPropagation();
    setStart(Math.max(0, Math.min(maxStart, s + d)));
  };
  const cell = (sw, i) => (
    <span key={i} className={`palette-sw-cell ${locks?.[i] ? 'locked' : ''}`}>
      <label className="palette-sw-edit" title={`S${i + 1} ${sw} — click to edit`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-chip-sw palette-sw-full" style={{ background: sw }} />
        <input type="color" className="palette-color-input" value={sw} onChange={(e) => onSwatch(i, e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      <button type="button" className="palette-lock-pip" title={locks?.[i] ? `S${i + 1} locked` : `Lock S${i + 1}`} aria-pressed={!!locks?.[i]} onClick={(e) => { e.stopPropagation(); onLock(i); }}>
        {locks?.[i] ? '▪' : ''}
      </button>
    </span>
  );
  return (
    <span className="palette-active-strip" aria-label={`${palette.name} palette editor`}>
      {overflow && (<button type="button" className="palette-nav-btn" title="Previous swatches" disabled={s <= 0} onClick={slide(-1)}>‹</button>)}
      {overflow ? (
        <span className="palette-sw-viewport"><span className="palette-sw-track" style={{ transform: `translateX(${-s * SWATCH_STEP}px)` }}>{swatches.map(cell)}</span></span>
      ) : (
        <span className="palette-active-swatches">{swatches.map(cell)}</span>
      )}
      {overflow && (<button type="button" className="palette-nav-btn" title="Next swatches" disabled={s >= maxStart} onClick={slide(1)}>›</button>)}
      <label className="palette-meta-sw palette-sw-edit" style={{ background: palette.bg }} title={`BG ${palette.bg}`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-meta-label lbl">bg</span>
        <input type="color" className="palette-color-input" value={palette.bg} onChange={(e) => onBg(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      <label className="palette-meta-sw palette-sw-edit" style={{ background: palette.ink }} title={`INK ${palette.ink}`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-meta-label lbl">ink</span>
        <input type="color" className="palette-color-input" value={palette.ink} onChange={(e) => onInk(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      {dirty && (<button type="button" className="palette-reset-btn" title="Reset to catalog colors" onClick={(e) => { e.stopPropagation(); onReset(); }}>↻</button>)}
    </span>
  );
}

// #1122 — the ◆ diamond: LOIS presence. Reads the imported taste's fidelity
// (tasteStore); re-renders when a taste is imported/cleared (tasteRev).
function TasteDiamond() {
  useStore((s) => s.tasteRev);
  const level = tasteLevel(getTaste());
  return (
    <span
      className={`taste-diamond lvl${level}`}
      role="img"
      aria-label={level === 0 ? 'no taste signal' : `taste confidence level ${level} of 4`}
      title={level === 0 ? 'taste: no signal — the diamond stays dark until a real taste.json clears fidelity 0.3' : `taste confidence ${level}/4`}
    />
  );
}

export function PaletteStrip() {
  const { dispatch, palette, palettes, paletteLocks } = useApp();
  const [harmonyScheme, setHarmonyScheme] = useState('analogous');
  const [wingOpen, setWingOpen] = useState(false); // #953 — the palette lab wing
  // #624 + #625 — the color mode lives in the store now: the GL loop reads it to
  // drive the WASH/INJECT soaks. (It used to be component-local and never left.)
  const colorMode = useStore((s) => s.colorMode) || 'FADE';
  // #1123 — KC-1 DS: FADE is Davis (continuous). The dot breathes while a
  // fade is in transit. The real dissolve runs in the GL crossfade state
  // machine (gl/paletteMix.mjs) for paletteMixSeconds after a palette
  // change — this mirrors that duration (rAF-driven --fade-depth, 1 at
  // strike → 0 at land) so the dot lands when the dissolve does. MIX=0 is
  // a hard cut: no transit, no breath.
  const paletteId = useStore((s) => s.paletteId);
  const paletteOverrides = useStore((s) => s.paletteOverrides);
  const mixSeconds = useStore((s) => s.paletteMixSeconds) ?? 0;
  const [fadeDepth, setFadeDepth] = useState(0);
  const palSigRef = useRef(null);
  const transitRef = useRef(null);
  useEffect(() => {
    const sig = `${paletteId}|${paletteOverrides ? 'o' : ''}`;
    if (palSigRef.current === sig) return;
    const first = palSigRef.current === null;
    palSigRef.current = sig;
    if (transitRef.current) { cancelAnimationFrame(transitRef.current); transitRef.current = null; }
    if (!first && colorMode === 'FADE' && mixSeconds > 0) {
      const durMs = mixSeconds * 1000;
      const t0 = performance.now();
      let last = -1;
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / durMs);
        // Quantize: the glow depth moves slowly, so only re-render when the
        // displayed value actually changes — not 60fps for a cosmetic dot.
        const d = Math.round((1 - t) * 40) / 40;
        if (d !== last) { last = d; setFadeDepth(d); }
        transitRef.current = t < 1 ? requestAnimationFrame(tick) : null;
      };
      transitRef.current = requestAnimationFrame(tick);
    } else {
      setFadeDepth(0);
    }
    return () => {
      if (transitRef.current) { cancelAnimationFrame(transitRef.current); transitRef.current = null; }
    };
  }, [paletteId, paletteOverrides, colorMode, mixSeconds]);
  // #1123 — KC-1 DS rule 3: chip taste-fit shimmer only on a real taste
  // signal. paletteTasteFit returns null until a real per-palette scorer
  // lands (#762), so the row stays quiet; when it lands, the strip gets
  // .taste-on and chips get data-fit 1..4.
  useStore((s) => s.tasteRev); // re-render on taste import/clear
  const taste = getTaste();
  const fits = {};
  let anyFit = false;
  if (taste) {
    for (const p of (palettes || [])) {
      const lvl = fitLevel(paletteTasteFit(p.id, taste));
      if (lvl > 0) { fits[p.id] = lvl; anyFit = true; }
    }
  }
  // #952 — the roll can land on any of the 37+ palettes, but the strip only
  // shows CHIP_CAP chips. Slide the window so the active palette is always
  // visible: highlight + name in the readout, tracking every KIN tap.
  const all = palettes || [];
  const activeIndex = all.findIndex((p) => p.id === palette.id);
  const winStart = chipWindowStart(all.length, activeIndex, CHIP_CAP);
  const visible = all.slice(winStart, winStart + CHIP_CAP);
  const activeChipRef = useRef(null);

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [palette.id]);

  const cycleColorMode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const i = COLOR_MODES.indexOf(colorMode);
    dispatch({ type: A.SET_COLOR_MODE, payload: COLOR_MODES[(i + 1) % COLOR_MODES.length] });
  };

  const chips = visible.map((p, i) => {
    const active = p.id === palette.id;
    const num = <span className="palette-chip-num" aria-hidden="true">{i + 1}</span>;
    const fit = fits[p.id] || 0;
    if (active) {
      return (
        <div key={p.id} ref={activeChipRef} className={`palette-chip active ${palette.dirty ? 'dirty' : ''}`} data-fit={fit > 0 ? fit : undefined} title={`${p.name} — key ${i + 1}`}>
          {num}
          <ActivePaletteStrip
            key={palette.id}
            palette={palette}
            dirty={!!palette.dirty}
            locks={paletteLocks}
            onLock={(i) => emit(Events.PALETTE_LOCK, { index: i })}
            onSwatch={(i, hex) => dispatch({ type: A.SET_PALETTE_SWATCH, index: i, hex })}
            onBg={(hex) => dispatch({ type: A.SET_PALETTE_BG, payload: hex })}
            onInk={(hex) => dispatch({ type: A.SET_PALETTE_INK, payload: hex })}
            onReset={() => dispatch({ type: A.CLEAR_PALETTE_OVERRIDES })}
          />
          <span className="palette-chip-name">{p.name}</span>
        </div>
      );
    }
    return (
      <span key={p.id} className="palette-chip-wrap">
        <button type="button" className="palette-chip" data-fit={fit > 0 ? fit : undefined} onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })} title={`${p.name} — key ${i + 1}`}>
          {num}
          <CompactSwatches swatches={p.swatches || []} />
          <span className="palette-chip-name">{p.name}</span>
        </button>
      </span>
    );
  });

  // #357 — keys 1–4 select the visible palette chips, exactly as if clicked.
  // The active chip is never re-selected (a click on it isn't possible either,
  // and setPaletteId clears overrides — must not fire on the active palette).
  // The favorites tray owns 1–9 while it has focus; let it keep them.
  const selectChipByIndex = (e, i) => {
    if (e.target?.closest?.('.favorites-tray')) return;
    const p = visible[i];
    if (!p || p.id === palette.id) return;
    dispatch({ type: A.SET_PALETTE_ID, payload: p.id });
  };
  useHotkeys({
    1: (e) => selectChipByIndex(e, 0),
    2: (e) => selectChipByIndex(e, 1),
    3: (e) => selectChipByIndex(e, 2),
    4: (e) => selectChipByIndex(e, 3),
  });

  return (
    <div className={`palette-strip${anyFit ? ' taste-on' : ''}`}>
      <div className="kc-logo" title="KINETIC_CURATOR v0.9.0">
        {/* #1122 — ◆ is LOIS presence → Davis: amber shimmer at the taste model's
            confidence, dark/silent until a real taste.json clears the 0.3 bar (rule 3). */}
        <TasteDiamond />
        <span className="logo-mark">◈</span>
        <span className="kc-name kc-compact">KC-1</span>
        <span className="kc-name kc-full">
          <span className="logo-text">KINETIC<span className="logo-accent">_</span>CURATOR</span>
          <span className="logo-version">v0.9.0</span>
        </span>
      </div>
      {/* #716 — the Curator is the instrument's main verb: a global control,
          not a BUILD-panel one. Same popups, new address. */}
      <CuratorBar />
      <div className="palette-switch" style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="palette-mix" style={{ flexShrink: 0, marginLeft: 0 }}>
            <button
              type="button"
              className={`palette-mix-label act${fadeDepth > 0 ? ' fading' : ''}`}
              onClick={cycleColorMode}
              title={COLOR_MODE_HINT[colorMode]}
              style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', letterSpacing: '0.1em', fontSize: 9, cursor: 'pointer', minWidth: '4.6em', textAlign: 'left', '--fade-depth': fadeDepth.toFixed(3) }}
            >
              <span className="palette-fade-dot" aria-hidden="true" />
              {colorMode}
            </button>
          </span>
          <div className="palette-chip-track" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {chips}
          </div>
          <span className="palette-controls" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span className="palette-switch-label lbl">palette</span>
            <button type="button" className="palette-save-btn" title="Palette lab — generate, edit, save, import, export" onClick={() => setWingOpen((v) => !v)} aria-expanded={wingOpen}>◈<span className="palette-shuffle-word lbl"> lab</span></button>
            <select className="palette-harmony" data-scheme={harmonyScheme} value={harmonyScheme} onChange={(e) => setHarmonyScheme(e.target.value)} title="Colour harmony scheme" onClick={(e) => e.stopPropagation()}>
              {SCHEME_IDS.map((id) => (<option key={id} value={id}>{id.toUpperCase()}</option>))}
            </select>
            <button type="button" className="palette-save-btn" title="Shuffle unlocked swatches" onClick={() => emit(Events.PALETTE_HARMONY, { scheme: harmonyScheme })}>⟳<span className="palette-shuffle-word lbl"> shuffle</span></button>
          </span>
        </div>
      </div>
      <PaletteWing open={wingOpen} onClose={() => setWingOpen(false)} />
    </div>
  );
}
