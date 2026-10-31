import { useSyncExternalStore } from 'react';
import { useStore } from '../../state/store.js';
import {
  PATTERN_MODES,
  PATTERN_DENSITY_MIN,
  PATTERN_DENSITY_MAX,
  PATTERN_KINS,
  PATTERN_FIELD_LIKE,
  sanitizePattern,
  defaultPattern,
} from '../../state/patternTrack.js';
import { QUILT_MAX_GROUT } from '../../pattern/engine.js';
import { requestPatternShuffle, subscribePending, pendingSnapshot } from '../../state/patternShuffle.js';
import { barMs } from '../../pattern/shuffleGate.js';
import { emit, Events } from '../../composition/eventBus.js';
import { ModeRow } from './te/ModeRow.jsx';
import { SliderEditor } from './te/editors.jsx';
import { patternStopsFor } from './blockStops.mjs';

// The PATTERN track's editor (#1099). It opens under the row like the FX editor, and every control
// writes through the slice (which sanitizes). Controls a mode ignores are DISABLED with the reason,
// never hidden and never live: the UI cannot show what the renderer does not read.
// DROP gates SHUFFLE to the bar (state/patternShuffle.js). It never touches DRIFT.
// #1608 (Strata Q Phase 2) — the six continuous params are mode rows now
// (blockStops.mjs PATTERN_STOPS; the shipped per-mode defaults are stops).
// Their exact editors live in the value dock, work in the editor's percent
// space exactly as the bare sliders did, and store fractions — percent in
// the UI, fractions in the store, as before.
const MODE_HINT = {
  QUILT: 'Dense tessellation: grout, 2×2 hero tiles, the full palette.',
  GLYPH: 'A poster: one bold mark per tile on a letterboxed 5:4 grid.',
  FIELD: 'A wallpaper: ten micro-patterns that wrap, and pan.',
  TIDES: 'A display: a still grid of cells that reads out a moving field as three colours and a size.',
  REWRITE: 'A growth: seeded tips rewrite the grid rule by rule into a maze, coloured by the order it grew.',
  BLOCKS:
    'Merged-cell blocks: neighbours fuse first, then one flat colour per block. A still deal — SHUFFLE re-deals it.',
};
const pct = (v) => Math.round(v * 100);
// #1137 — the KINEME motion the pattern's individual elements take while DRIFT is up.
const KIN_HINT =
  "Which KINEME motion a few of the pattern's elements carry while DRIFT is up: spin, rock, pulse, blink, bob, or mix (each its own). Off holds them still.";

function Param({ label, hint, children, readout }) {
  return (
    <div className="fx-param">
      <label className="lbl" title={hint}>
        {label}
      </label>
      {children}
      <span className="fx-param-readout">{readout}</span>
    </div>
  );
}

const setMode = (id, mode) => emit(Events.PATTERN_MODE, { id, mode });
const setParam = (id, key, value) => emit(Events.PATTERN_PARAM, { id, key, value });

export function PatternEditor({ layer, ordinal }) {
  const bpm = useStore((s) => s.beatBpm);
  const pending = useSyncExternalStore(subscribePending, pendingSnapshot).has(layer.id);
  const p = sanitizePattern(layer.pattern);
  const quilt = p.mode === 'QUILT';
  const blocks = p.mode === 'BLOCKS'; // #1798: a deal is a still — DRIFT has no clock in this mode yet
  const fieldLike = PATTERN_FIELD_LIKE.includes(p.mode); // FIELD, TIDES and BLOCKS have no separate elements to move
  const id = layer.id;
  const defaults = defaultPattern(p.mode);
  // A percent-space param (mix / grout / hero / drift / movers): the mode
  // row speaks stored fractions; its dock editor speaks percents, with the
  // mode's shipped default as the double-click reset target (D2).
  const pctRow = (
    key,
    label,
    hint,
    ariaLabel,
    { disabled, disabledLabel, disabledReason, display, step = 1, max = 100, format } = {},
  ) => (
    <div className="fx-param">
      <ModeRow
        variant="block"
        label={label}
        title={hint}
        display={display ?? `${pct(p[key])}%`}
        value={p[key]}
        stops={patternStopsFor(key)?.stops ?? null}
        ariaLabel={ariaLabel}
        disabled={disabled}
        disabledLabel={disabledLabel}
        disabledReason={disabledReason}
        onSelect={(v) => setParam(id, key, v)}
        onOpen={() => (
          <SliderEditor
            ariaLabel={ariaLabel}
            value={pct(p[key])}
            min={0}
            max={max}
            step={step}
            format={format ?? ((v) => `${Math.round(v)}%`)}
            defaultValue={pct(defaults[key])}
            onChange={(v) => setParam(id, key, v / 100)}
          />
        )}
      />
    </div>
  );
  return (
    <div className="fx-editor pattern-editor" title={`PT-${ordinal} · ${p.mode}`}>
      <div className="pattern-modes" role="tablist" aria-label="Pattern mode">
        {PATTERN_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={p.mode === m}
            title={MODE_HINT[m]}
            className={`chip-btn act${p.mode === m ? ' active' : ''}`}
            onClick={() => setMode(id, m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="fx-param">
        <ModeRow
          variant="block"
          label="density"
          title="Tiles across. GLYPH grows both axes and keeps 5:4."
          display={p.density}
          value={p.density}
          stops={patternStopsFor('density')?.stops ?? null}
          ariaLabel="Pattern density"
          onSelect={(v) => setParam(id, 'density', v)}
          onOpen={() => (
            <SliderEditor
              ariaLabel="Pattern density"
              value={p.density}
              min={PATTERN_DENSITY_MIN}
              max={PATTERN_DENSITY_MAX}
              step={1}
              defaultValue={defaults.density}
              onChange={(v) => setParam(id, 'density', v)}
            />
          )}
        />
      </div>
      {pctRow(
        'mix',
        'mix',
        "Motif entropy. Low repeats a two-motif rhythm; high draws freely from the whole vocabulary. TIDES: the field's grain, broad patches to fine speckle. REWRITE: how freely the growth buds new tips, and how many tips it opens with. BLOCKS: the merge appetite — low is the plain grid, high fuses at every chance.",
        'Pattern mix',
      )}
      {pctRow('grout', 'grout', 'The dark seam between tiles, as a fraction of a tile.', 'Pattern grout', {
        disabled: !quilt,
        disabledLabel: 'Quilt only',
        disabledReason: 'only QUILT has grout',
        display: quilt ? `${(p.grout * 100).toFixed(1)}%` : '—',
        step: 0.5,
        max: QUILT_MAX_GROUT * 100,
        format: (v) => `${v.toFixed(1)}%`,
      })}
      {pctRow(
        'hero',
        'hero',
        'How often a 2×2 hero tile (cube, medallion) is placed, capped and never touching.',
        'Pattern hero',
        {
          disabled: !quilt,
          disabledLabel: 'Quilt only',
          disabledReason: 'only QUILT has hero tiles',
          display: quilt ? `${pct(p.hero)}%` : '—',
        },
      )}
      {pctRow(
        'drift',
        'drift',
        'Motion. QUILT turns pinwheels and medallions, GLYPH pulses the marks, FIELD pans, TIDES runs the field under the grid, REWRITE replays the growth and regrows it. Zero holds still.',
        'Pattern drift',
        {
          disabled: blocks,
          disabledLabel: 'Still deal',
          disabledReason: 'a BLOCKS deal is a still — SHUFFLE re-deals it',
          display: blocks ? '—' : undefined,
        },
      )}
      <Param label="motion" hint={KIN_HINT} readout={fieldLike ? '—' : p.kin}>
        <select
          className="blend-mode-select"
          aria-label="Element motion"
          value={p.kin}
          disabled={fieldLike}
          title={fieldLike ? `${p.mode} is one continuous field: it has no separate elements to move` : KIN_HINT}
          onChange={(e) => setParam(id, 'kin', e.target.value)}
        >
          {PATTERN_KINS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Param>
      {pctRow(
        'movers',
        'movers',
        'How many of the elements move. A few is a composition with accents; all of them is wallpaper.',
        'Pattern movers',
        {
          disabled: fieldLike || p.kin === 'OFF',
          disabledLabel: 'No element motion',
          disabledReason: fieldLike ? `${p.mode} has no separate elements` : 'motion is off',
          display: fieldLike || p.kin === 'OFF' ? '—' : `${pct(p.movers)}%`,
        },
      )}
      <div className="pattern-seed">
        <button
          type="button"
          className={`big-btn act${pending ? ' armed' : ''}`}
          data-armed={pending ? 'true' : undefined}
          title={pending ? 'Armed: the new seed lands on the next bar' : 'A new seed in the same mode'}
          onClick={() => requestPatternShuffle(id)}
        >
          shuffle
        </button>
        <button
          type="button"
          className={`chip-btn act${p.drop ? ' active' : ''}`}
          aria-pressed={p.drop}
          title={`DROP: SHUFFLE waits for the next bar (4 beats, ${(barMs(bpm) / 1000).toFixed(2)} s at ${bpm} BPM) so the change lands on the beat. DRIFT is never affected.`}
          onClick={() => setParam(id, 'drop', !p.drop)}
        >
          drop
        </button>
        <span
          className="fx-param-readout name"
          title="The stored seed: the same seed and settings always draw the same pattern"
        >
          seed {p.seed.toString(16)}
        </span>
      </div>
    </div>
  );
}
