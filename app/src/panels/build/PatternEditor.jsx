import { RangeRow } from '../../components/RangeRow.jsx';
import { useStore } from '../../state/store.js';
import {
  PATTERN_MODES, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX, sanitizePattern,
} from '../../state/patternTrack.js';
import { QUILT_MAX_GROUT } from '../../pattern/engine.js';

// The PATTERN track's editor (#1099). It opens under the row like the FX editor, and every control
// writes through the slice (which sanitizes). Controls a mode ignores are DISABLED with the reason,
// never hidden and never live: the UI cannot show what the renderer does not read.
// DROP is not here yet: it gates SHUFFLE to the bar, and the gate arrives with the live loop (#1100).
const MODE_HINT = {
  QUILT: 'Dense tessellation: grout, 2×2 hero tiles, the full palette.',
  GLYPH: 'A poster: one bold mark per tile on a letterboxed 5:4 grid.',
  FIELD: 'A wallpaper: ten micro-patterns that wrap, and pan.',
};
const pct = (v) => Math.round(v * 100);

function Param({ label, hint, children, readout }) {
  return (
    <div className="fx-param">
      <label className="lbl" title={hint}>{label}</label>
      {children}
      <span className="fx-param-readout">{readout}</span>
    </div>
  );
}

export function PatternEditor({ layer, ordinal }) {
  const setMode = useStore((s) => s.setPatternMode);
  const setParam = useStore((s) => s.setPatternParam);
  const shuffle = useStore((s) => s.shufflePattern);
  const p = sanitizePattern(layer.pattern);
  const quilt = p.mode === 'QUILT';
  const id = layer.id;
  return (
    <div className="fx-editor pattern-editor" title={`PT-${ordinal} · ${p.mode}`}>
      <div className="pattern-modes" role="tablist" aria-label="Pattern mode">
        {PATTERN_MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={p.mode === m} title={MODE_HINT[m]}
            className={`chip-btn act${p.mode === m ? ' active' : ''}`} onClick={() => setMode(id, m)}>
            {m}
          </button>
        ))}
      </div>
      <Param label="density" hint="Tiles across. GLYPH grows both axes and keeps 5:4." readout={p.density}>
        <RangeRow layout="bare" tone="build" min={PATTERN_DENSITY_MIN} max={PATTERN_DENSITY_MAX} step={1} value={p.density}
          ariaLabel="Pattern density" onChange={(v) => setParam(id, 'density', v)} />
      </Param>
      <Param label="mix" hint="Motif entropy. Low repeats a two-motif rhythm; high draws freely from the whole vocabulary." readout={`${pct(p.mix)}%`}>
        <RangeRow layout="bare" tone="build" min={0} max={100} step={1} value={pct(p.mix)}
          ariaLabel="Pattern mix" onChange={(v) => setParam(id, 'mix', v / 100)} />
      </Param>
      <Param label="grout" hint="The dark seam between tiles, as a fraction of a tile." readout={quilt ? `${(p.grout * 100).toFixed(1)}%` : '—'}>
        <RangeRow layout="bare" tone="build" min={0} max={QUILT_MAX_GROUT * 100} step={0.5} value={p.grout * 100}
          ariaLabel="Pattern grout" disabled={!quilt} disabledLabel="Quilt only" disabledReason="only QUILT has grout"
          onChange={(v) => setParam(id, 'grout', v / 100)} />
      </Param>
      <Param label="hero" hint="How often a 2×2 hero tile (cube, medallion) is placed, capped and never touching." readout={quilt ? `${pct(p.hero)}%` : '—'}>
        <RangeRow layout="bare" tone="build" min={0} max={100} step={1} value={pct(p.hero)}
          ariaLabel="Pattern hero" disabled={!quilt} disabledLabel="Quilt only" disabledReason="only QUILT has hero tiles"
          onChange={(v) => setParam(id, 'hero', v / 100)} />
      </Param>
      <Param label="drift" hint="Motion. QUILT turns pinwheels and medallions, GLYPH pulses the marks, FIELD pans. Zero holds still." readout={`${pct(p.drift)}%`}>
        <RangeRow layout="bare" tone="build" min={0} max={100} step={1} value={pct(p.drift)}
          ariaLabel="Pattern drift" onChange={(v) => setParam(id, 'drift', v / 100)} />
      </Param>
      <div className="pattern-seed">
        <button type="button" className="big-btn act" title="A new seed in the same mode" onClick={() => shuffle(id)}>shuffle</button>
        <span className="fx-param-readout name" title="The stored seed: the same seed and settings always draw the same pattern">seed {p.seed.toString(16)}</span>
      </div>
    </div>
  );
}
