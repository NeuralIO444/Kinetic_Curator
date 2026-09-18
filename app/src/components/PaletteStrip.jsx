import { useState, useRef, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import * as A from '../state/actions.js';
import { emit, Events } from '../composition/eventBus.js';
import { SCHEME_IDS } from '../engine/harmony.js';
import { MIX_DEFAULT } from '../gl/paletteMix.mjs';

const COLOR_MODES = ['FADE', 'WASH', 'INJECT'];
const COLOR_MODE_HINT = {
  FADE: 'Whole picture melts. Slider is seconds.',
  WASH: 'Color soaks from the front marks back through the trail. Same slider. Feel lands next.',
  INJECT: 'New swatch dyes the field; agents pick it up as they pass. Same slider. Feel lands next.',
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
const SWATCH_STEP = 10;
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
        <span className="palette-meta-label">BG</span>
        <input type="color" className="palette-color-input" value={palette.bg} onChange={(e) => onBg(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      <label className="palette-meta-sw palette-sw-edit" style={{ background: palette.ink }} title={`INK ${palette.ink}`} onClick={(e) => e.stopPropagation()}>
        <span className="palette-meta-label">INK</span>
        <input type="color" className="palette-color-input" value={palette.ink} onChange={(e) => onInk(e.target.value)} onClick={(e) => e.stopPropagation()} />
      </label>
      {dirty && (<button type="button" className="palette-reset-btn" title="Reset to catalog colors" onClick={(e) => { e.stopPropagation(); onReset(); }}>↻</button>)}
    </span>
  );
}

export function PaletteStrip() {
  const { dispatch, palette, palettes, paletteLocks } = useApp();
  const paletteMixSeconds = useStore((s) => s.paletteMixSeconds) ?? MIX_DEFAULT;
  const [harmonyScheme, setHarmonyScheme] = useState('analogous');
  const [colorMode, setColorMode] = useState('FADE');
  const visible = (palettes || []).slice(0, CHIP_CAP);
  const activeChipRef = useRef(null);

  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [palette.id]);

  const cycleColorMode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const i = COLOR_MODES.indexOf(colorMode);
    setColorMode(COLOR_MODES[(i + 1) % COLOR_MODES.length]);
  };

  const chips = visible.map((p) => {
    const active = p.id === palette.id;
    if (active) {
      return (
        <div key={p.id} ref={activeChipRef} className={`palette-chip active ${palette.dirty ? 'dirty' : ''}`} title={`${p.name}`}>
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
          {p.name}
        </div>
      );
    }
    return (
      <span key={p.id} className="palette-chip-wrap">
        <button type="button" className="palette-chip" onClick={() => dispatch({ type: A.SET_PALETTE_ID, payload: p.id })} title={p.name}>
          <CompactSwatches swatches={p.swatches || []} />
          {p.name}
        </button>
      </span>
    );
  });

  return (
    <div className="palette-strip">
      <div className="kc-logo" title="KINETIC_CURATOR v0.9.0">
        <span className="logo-mark">◈</span>
        <span className="kc-name kc-compact">KC-1</span>
        <span className="kc-name kc-full">
          <span className="logo-text">KINETIC<span className="logo-accent">_</span>CURATOR</span>
          <span className="logo-version">v0.9.0</span>
        </span>
      </div>
      <div className="palette-switch" style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center' }}>
        <span className="palette-switch-label">PALETTE</span>
        <select className="palette-harmony-select" value={harmonyScheme} onChange={(e) => setHarmonyScheme(e.target.value)} title="Colour harmony scheme" onClick={(e) => e.stopPropagation()}>
          {SCHEME_IDS.map((id) => (<option key={id} value={id}>{id.toUpperCase()}</option>))}
        </select>
        <button type="button" className="palette-save-btn" title="Shuffle unlocked swatches" onClick={() => emit(Events.PALETTE_HARMONY, { scheme: harmonyScheme })}>⟳ SHUFFLE</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div className="palette-chip-track" style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
            {chips}
          </div>
          <label className="palette-mix" style={{ flexShrink: 0 }} title={COLOR_MODE_HINT[colorMode]}>
            <button
              type="button"
              className="palette-mix-label"
              onClick={cycleColorMode}
              title={COLOR_MODE_HINT[colorMode]}
              style={{ background: 'transparent', border: 0, padding: 0, color: 'inherit', letterSpacing: '0.1em', fontSize: 9, cursor: 'pointer', minWidth: '4.6em', textAlign: 'left' }}
            >
              {colorMode}
            </button>
            <input
              type="range"
              className="single-slider palette-mix-slider"
              min={0}
              max={8}
              step={0.5}
              value={paletteMixSeconds}
              onChange={(e) => dispatch({ type: A.SET_PALETTE_MIX, payload: Number(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
              aria-label="Palette color time in seconds"
            />
            <span className="range-readout palette-mix-readout" style={{ display: 'inline-block', width: '3.6em', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {Number(paletteMixSeconds).toFixed(1)}s
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
