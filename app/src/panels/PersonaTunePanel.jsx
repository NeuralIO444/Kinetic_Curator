// PersonaTunePanel — DEV panel persona tuning surface (#2382).
//
// The persona tuning table (src/personas/tuning.json, `kc-persona-tuning/1`, spec §3c) made live:
// every ruled persona number — LOIS's brake and cut gates, Davis's caps and openers, the rhythm
// section's M1–M8 magnitudes — is one row here, editable in place. Sections are headed by band
// seat (spec §3b), never by name. An edit goes through tuning.mjs's setTuningValue: it lands only
// if the whole table still validates, and the pure modules read the table in force on their next
// call, so the change is live without a reload.
//
// The table is RIG, never scene: edits live in memory for the session only, nothing is written to a
// project or to storage, and Reset restores the shipped values. The band fields (solo length, odds,
// answer order, relation biases, trade rate, the bandleader's cut) ship unruled (null) — they are
// listed for completeness and are not editable: the rig tunes ruled numbers, it does not invent them.
//
// Registered behind the DEV panel's runtime gate (see PanelRegistry: dev build, or Dev mode on —
// #2077) and loaded via React.lazy, as its own chunk, only when the tab opens.

import { useEffect, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader.jsx';
import {
  TUNING_DEFAULTS,
  TUNING_SEATS,
  TUNING_SEAT_ROLES,
  personaTuning,
  tuningOverrides,
  setTuningValue,
  resetTuning,
  onTuningChange,
} from '../personas/tuning.mjs';
import { DEV_SWITCHES, devSwitchOn, onDevSwitchChange, setDevSwitch } from '../personas/devSwitches.mjs';

// Every editable leaf under a seat's knobs: numbers, and [lo, hi] ranges as a pair. Opener keys are
// move choices (content), so an opener contributes only its amount.
function knobLeaves(knobs, base, out = []) {
  for (const [key, v] of Object.entries(knobs)) {
    const path = `${base}.${key}`;
    if (typeof v === 'number') out.push({ path, kind: 'num' });
    else if (Array.isArray(v)) out.push({ path, kind: 'range' });
    else if (v && typeof v === 'object' && 'key' in v && 'value' in v)
      out.push({ path: `${path}.value`, kind: 'num', note: v.key });
    else if (v && typeof v === 'object') knobLeaves(v, path, out);
  }
  return out;
}

function NumRow({ path, label, note }) {
  const [, setTick] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => onTuningChange(() => setTick((t) => t + 1)), []);
  const value = path.split('.').reduce((o, k) => o[k], personaTuning());
  const shipped = path.split('.').reduce((o, k) => o[k], TUNING_DEFAULTS);
  const edited = path in tuningOverrides();
  const commit = (text) => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v)) {
      setError('not a number');
      return;
    }
    const r = setTuningValue(path, v);
    setError(r.ok ? '' : r.problems[0]);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
      <span style={{ width: 230, color: '#8a93a6' }}>
        {label}
        {note ? <span style={{ color: '#5a6272' }}> ({note})</span> : null}
        {edited ? <span style={{ color: '#e0a458' }}> ●</span> : null}
      </span>
      <input
        type="number"
        key={`${path}:${value}`}
        defaultValue={value}
        step="any"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur();
        }}
        style={{ width: 76, background: '#141414', color: '#fff', border: '1px solid #2a2a2a', padding: '2px 6px' }}
      />
      <span style={{ color: '#5a6272', fontSize: 11 }}>shipped {shipped}</span>
      {error ? <span style={{ color: '#e0685a', fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}

function RangeRow({ path, label }) {
  const [, setTick] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => onTuningChange(() => setTick((t) => t + 1)), []);
  const value = path.split('.').reduce((o, k) => o[k], personaTuning());
  const shipped = path.split('.').reduce((o, k) => o[k], TUNING_DEFAULTS);
  const edited = path in tuningOverrides();
  const commit = (idx, text) => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v)) {
      setError('not a number');
      return;
    }
    const next = [...value];
    next[idx] = v;
    const r = setTuningValue(path, next);
    setError(r.ok ? '' : r.problems[0]);
  };
  const inputStyle = {
    width: 64,
    background: '#141414',
    color: '#fff',
    border: '1px solid #2a2a2a',
    padding: '2px 6px',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
      <span style={{ width: 230, color: '#8a93a6' }}>
        {label}
        {edited ? <span style={{ color: '#e0a458' }}> ●</span> : null}
      </span>
      {[0, 1].map((idx) => (
        <input
          key={`${path}:${idx}:${value[idx]}`}
          type="number"
          defaultValue={value[idx]}
          step="any"
          onBlur={(e) => commit(idx, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur();
          }}
          style={inputStyle}
        />
      ))}
      <span style={{ color: '#5a6272', fontSize: 11 }}>
        shipped {shipped[0]}–{shipped[1]}
      </span>
      {error ? <span style={{ color: '#e0685a', fontSize: 11 }}>{error}</span> : null}
    </div>
  );
}

// The DEV switch for the opt-in persona features (Matt, 2026-11-19/20): one row per console flag, off by default,
// session only, never saved (personas/devSwitches.mjs). Same toggle form as Settings' Dev mode row.
function DevSwitchRows() {
  const [, setTick] = useState(0);
  useEffect(() => onDevSwitchChange(() => setTick((t) => t + 1)), []);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 0 4px' }}>
      {DEV_SWITCHES.map((s) => {
        const on = devSwitchOn(s.id);
        return (
          <button
            key={s.id}
            type="button"
            data-dev-switch={s.id}
            className={`chip-btn act ${on ? 'active' : ''}`}
            aria-pressed={on}
            onClick={() => setDevSwitch(s.id, !on)}
          >
            {s.label}: {on ? 'on' : 'off'}
          </button>
        );
      })}
    </div>
  );
}

export function PersonaTunePanel() {
  const [, setTick] = useState(0);
  useEffect(() => onTuningChange(() => setTick((t) => t + 1)), []);
  const editedCount = Object.keys(tuningOverrides()).length;
  return (
    <div style={{ padding: 12, overflowY: 'auto' }}>
      <PanelHeader
        tag="DEV"
        title="PERSONA TUNE"
        subtitle="kc-persona-tuning/1 · live edits · session only, never saved"
      />
      <DevSwitchRows />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 10px', fontSize: 12 }}>
        <button
          type="button"
          onClick={() => resetTuning()}
          style={{
            background: '#1c1c22',
            color: '#fff',
            border: '1px solid #2a2a2a',
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          Reset to shipped
        </button>
        <span style={{ color: '#5a6272' }}>
          {editedCount === 0
            ? 'the shipped table is in force'
            : `${editedCount} edit${editedCount === 1 ? '' : 's'} in force (●)`}
        </span>
      </div>
      {TUNING_SEATS.map((id) => {
        const section = TUNING_DEFAULTS.personas[id];
        const leaves = section.knobs ? knobLeaves(section.knobs, `personas.${id}.knobs`) : [];
        const labelOf = (leaf) => leaf.path.split('.knobs.')[1].replaceAll('.', ' · ');
        return (
          <div key={id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: '#c8cdd8', padding: '4px 0' }}>
              {TUNING_SEAT_ROLES[id]}
            </div>
            {leaves.map((leaf) =>
              leaf.kind === 'range' ? (
                <RangeRow key={leaf.path} path={leaf.path} label={labelOf(leaf)} />
              ) : (
                <NumRow key={leaf.path} path={leaf.path} label={labelOf(leaf)} note={leaf.note} />
              ),
            )}
          </div>
        );
      })}
      {/* #2501 B21: the band footnote is one standing note for the whole table —
          it used to repeat verbatim under every seat, reading as seven
          identical section lines. It stands once, here, with the relations note. */}
      <div style={{ fontSize: 11, color: '#5a6272', paddingTop: 4 }}>
        band: solo length · step cap · agree / disagree / lay-out odds · heat · answers first — unruled (null), set by
        the band phase
      </div>
      <div style={{ fontSize: 11, color: '#5a6272', paddingTop: 4 }}>
        relations: every seat pair's agreement bias — unruled (null). band: trade rate · max horns per call · bandleader
        cut — unruled (null). Tuning changes how much, never what is allowed: powers, vetoes and laws stay in the
        records.
      </div>
    </div>
  );
}
