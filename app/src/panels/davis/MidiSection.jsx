// MIDI (#617) — connect a controller, see what it says, see what is mapped.
// Fail-out-loud: unsupported / refused / no device / unplugged all read in
// words, never as a silent dead control. Learn mode (mapping a knob or pad)
// arrives in the next PR; until then mappings load from the project file.
import { useStore } from '../../state/store.js';
import { midiStatusView, describeMessage } from '../../midi/status.mjs';
import { MIDI_TARGETS } from '../../midi/targets.mjs';
import { describeKey } from '../../midi/message.mjs';

export function MidiSection() {
  const enabled = useStore((s) => s.midiEnabled);
  const status = useStore((s) => s.midiStatus);
  const last = useStore((s) => s.midiLast);
  const map = useStore((s) => s.midiMap);
  const setMidiEnabled = useStore((s) => s.setMidiEnabled);
  const unbindMidi = useStore((s) => s.unbindMidi);
  const view = midiStatusView(status, enabled);
  const rows = Object.entries(map).map(([key, id]) => ({ key, id, target: MIDI_TARGETS.find((t) => t.id === id) })).filter((r) => r.target);
  return (
    <div className="davis-midi" role="group" aria-label="MIDI">
      <div className="davis-midi-head">
        <i>MIDI</i>
        <button type="button" className={`chip-btn ${enabled ? 'active' : ''}`} aria-pressed={enabled}
          onClick={() => setMidiEnabled(!enabled)}
          title={enabled ? 'Disconnect MIDI' : 'Connect a MIDI controller (the browser will ask for access)'}>
          {enabled ? 'ON' : 'ENABLE'}
        </button>
      </div>
      <div className={`davis-midi-status ${view.tone}`} role="status">{view.line}</div>
      {view.note && <div className={`davis-midi-note ${view.tone}`}>{view.note}</div>}
      {enabled && last && <div className="davis-midi-last" title="The last message seen">{describeMessage(last)}</div>}
      {rows.length > 0 && (
        <ul className="davis-midi-map" aria-label="MIDI mappings">
          {rows.map((r) => (
            <li key={r.key}>
              <span>{r.target.label}</span>
              <code>{describeKey(r.key)}</code>
              <button type="button" className="micro-btn" aria-label={`Unmap ${r.target.label}`} title="Remove this mapping" onClick={() => unbindMidi(r.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
