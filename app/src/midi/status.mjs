// status.mjs — the one honest line the MIDI section shows (#617). Pure.
import { describeKey } from './message.mjs';

/** @returns {{tone:'idle'|'ok'|'warn'|'bad', line:string, note:string}} */
export function midiStatusView(status, enabled) {
  const s = status || { state: 'off', inputs: [], error: '' };
  if (!enabled || s.state === 'off') return { tone: 'idle', line: 'MIDI off — ENABLE to connect a controller', note: '' };
  switch (s.state) {
    case 'connecting': return { tone: 'idle', line: 'asking the browser for MIDI access…', note: '' };
    case 'unsupported': return { tone: 'bad', line: s.error || 'Web MIDI is not available in this browser', note: '' };
    case 'denied': return { tone: 'bad', line: s.error || 'MIDI access refused', note: "allow MIDI for this site in the browser's site settings, then ENABLE again" };
    case 'no-devices': return { tone: 'warn', line: 'no MIDI device found — plug one in', note: s.error || '' };
    case 'ready': {
      const n = s.inputs.length;
      return { tone: s.error ? 'warn' : 'ok', line: `${n} device${n === 1 ? '' : 's'}: ${s.inputs.join(' · ')}`, note: s.error || '' };
    }
    default: return { tone: 'idle', line: String(s.state), note: s.error || '' };
  }
}

/** "note 36 · ch 1 · vel 100" for the monitor line. */
export function describeMessage(msg) {
  if (!msg) return '';
  const key = msg.type === 'cc' ? `cc:${msg.channel}:${msg.number}` : `note:${msg.channel}:${msg.number}`;
  const tail = msg.type === 'noteoff' ? 'off' : `${msg.type === 'cc' ? 'val' : 'vel'} ${msg.value}`;
  return `${describeKey(key)} · ${tail}`;
}
