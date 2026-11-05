import { useStore } from '../state/store.js';
import { RangeRow } from './RangeRow.jsx';
import { helpText } from '../data/helpCopy.js';
import { BEAST_SETTING_DEFAULTS, BEAST_SETTING_RANGES } from '../engine/beastSettings.mjs';

// BeastSettings — the beast's roam and trace, as controls (#1867, #1868). Lives in the wet lab beside "assemble a beast".
// Every control's detail is hover help copy (data/helpCopy.js, `beast-*`); the dials appear only while their switch is on.

function Switch({ id, on, label, onToggle, testId }) {
  return (
    <button
      type="button"
      className={`chip-btn ${on ? 'act' : ''}`}
      aria-pressed={on}
      data-testid={testId}
      title={helpText(id)}
      onClick={() => onToggle(!on)}
    >
      {label}
    </button>
  );
}

function Dial({ id, label, k, value, scale = 1, unit = '', set }) {
  const r = BEAST_SETTING_RANGES[k];
  const shown = Math.round(value * scale);
  return (
    <RangeRow
      label={label}
      min={Math.round(r.min * scale)}
      max={Math.round(r.max * scale)}
      step={Math.max(1, Math.round(r.step * scale))}
      value={shown}
      readout={`${shown}${unit}`}
      defaultValue={Math.round(BEAST_SETTING_DEFAULTS[k] * scale)}
      hint={helpText(id)}
      onChange={(v) => set(k, Number(v) / scale)}
    />
  );
}

export function BeastSettings() {
  const s = useStore((st) => st.beastSettings) || BEAST_SETTING_DEFAULTS;
  const set = useStore((st) => st.setBeastSetting);
  return (
    <div data-testid="beast-settings" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Switch id="beast-roam" on={s.roam} label="roam" testId="beast-roam" onToggle={(v) => set('roam', v)} />
        <Switch id="beast-trace" on={s.trace} label="trace" testId="beast-trace" onToggle={(v) => set('trace', v)} />
      </div>
      {s.roam ? (
        <Dial id="beast-turn" label="turn" k="turnGain" value={s.turnGain} scale={100} unit="%" set={set} />
      ) : null}
      {s.trace ? (
        <>
          <Dial id="beast-trace-ink" label="ink" k="traceAlpha" value={s.traceAlpha} scale={100} unit="%" set={set} />
          <Dial id="beast-trace-fade" label="fade" k="traceFade" value={s.traceFade} unit="s" set={set} />
          <Dial id="beast-trace-count" label="marks" k="traceCount" value={s.traceCount} set={set} />
        </>
      ) : null}
    </div>
  );
}

/** Davis's role deal: the beam by body fit (#1945, #1960). A single switch; the detail is its hover copy. */
export function DavisRoleDealSwitch() {
  const on = useStore((st) => (st.beastSettings || BEAST_SETTING_DEFAULTS).davisRoleDeal);
  const set = useStore((st) => st.setBeastSetting);
  return (
    <button
      type="button"
      className={`chip-btn ${on ? 'act' : ''}`}
      aria-pressed={on}
      data-testid="davis-role-deal"
      title={helpText('davis-role-deal')}
      onClick={() => set('davisRoleDeal', !on)}
    >
      role deal
    </button>
  );
}
