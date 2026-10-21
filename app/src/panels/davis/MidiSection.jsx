// MIDI (#617) — connect a controller, see what it says, map what it controls.
// Fail-out-loud: unsupported / refused / no device / unplugged all read in
// words, never as a silent dead control. Learn is a mode (Ableton pattern):
// LEARN on a row arms it, the next pad or knob you touch binds to that row,
// Esc or CANCEL backs out. Learn needs a connected device — with none there is
// nothing to wiggle, so the button says so instead of waiting forever.
import { useEffect } from 'react';
import { useStore } from '../../state/store.js';
import { midiStatusView, describeMessage } from '../../midi/status.mjs';
import { MIDI_TARGETS } from '../../midi/targets.mjs';
import { keyFor } from '../../midi/map.mjs';
import { describeKey } from '../../midi/message.mjs';
import { learnPrompt } from '../../midi/learn.mjs';
import { emit, Events } from '../../composition/eventBus.js';

export function MidiSection() {
  const enabled = useStore((s) => s.midiEnabled);
  const status = useStore((s) => s.midiStatus);
  const last = useStore((s) => s.midiLast);
  const map = useStore((s) => s.midiMap);
  const learn = useStore((s) => s.midiLearn);
  const refused = useStore((s) => s.midiLearnRefused);
  const unbindMidi = useStore((s) => s.unbindMidi);
  const armMidiLearn = useStore((s) => s.armMidiLearn);
  const cancelMidiLearn = useStore((s) => s.cancelMidiLearn);
  const view = midiStatusView(status, enabled);
  const ready = enabled && status.state === 'ready';
  const armedTarget = learn?.armed ? MIDI_TARGETS.find((t) => t.id === learn.armed) : null;

  // Esc backs out of learn.
  useEffect(() => {
    if (!armedTarget) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') cancelMidiLearn(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedTarget, cancelMidiLearn]);

  // The last device going away must not leave learn armed against nothing.
  useEffect(() => {
    if (armedTarget && !ready) cancelMidiLearn();
  }, [armedTarget, ready, cancelMidiLearn]);

  return (
    <div className="davis-midi" role="group" aria-label="MIDI">
      <div className="davis-midi-head">
        <i className="lbl">midi</i>
        <button type="button" className={`chip-btn ${enabled ? 'active' : ''}`} aria-pressed={enabled}
          onClick={() => emit(Events.MIDI_ENABLED, { on: !enabled })}
          title={enabled ? 'Disconnect MIDI' : 'Connect a MIDI controller (the browser will ask for access)'}>
          {enabled ? 'ON' : 'ENABLE'}
        </button>
      </div>
      <div className={`davis-midi-status ${view.tone}`} role="status">{view.line}</div>
      {view.note && <div className={`davis-midi-note ${view.tone}`}>{view.note}</div>}
      {enabled && last && <div className="davis-midi-last" title="The last message seen">{describeMessage(last)}</div>}
      {armedTarget && (
        <div className={`davis-midi-learn ${refused ? 'bad' : ''}`} role="status" aria-live="polite">
          {learnPrompt(armedTarget, refused)}
        </div>
      )}
      <ul className="davis-midi-map" aria-label="MIDI mappings">
        {MIDI_TARGETS.map((t) => {
          const key = keyFor(map, t.id);
          const armed = armedTarget?.id === t.id;
          return (
            <li key={t.id} className={armed ? 'armed' : ''}>
              <span>{t.label}</span>
              <code>{key ? describeKey(key) : '—'}</code>
              <button type="button" className={`micro-btn ${armed ? 'active' : ''}`} aria-pressed={armed}
                disabled={!ready && !armed}
                title={armed ? 'Cancel learn (Esc)' : ready ? `Learn: then touch a ${t.kind === 'cc' ? 'knob or fader' : 'pad or key'}` : 'Connect a MIDI device to learn'}
                onClick={() => (armed ? cancelMidiLearn() : armMidiLearn(t.id))}>
                {armed ? 'CANCEL' : 'LEARN'}
              </button>
              {key && <button type="button" className="micro-btn" aria-label={`Unmap ${t.label}`} title="Remove this mapping" onClick={() => unbindMidi(t.id)}>×</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
