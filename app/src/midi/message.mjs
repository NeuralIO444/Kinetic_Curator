// message.mjs — MIDI bytes → a tiny message (#617). Pure.
//
// Only what a performance controller sends: note on / note off (a note-on with
// velocity 0 IS a note-off, per the MIDI spec) and control change. Everything
// else (clock 0xF8, active sensing 0xFE, sysex, pitch bend, …) is ignored on
// purpose: MIDI clock sync is out of scope for #617.

/** @returns {{type:'noteon'|'noteoff'|'cc', channel:number, number:number, value:number}|null} channel 1–16, number/value 0–127 */
export function parseMidi(bytes) {
  if (!bytes || bytes.length < 3) return null;
  const status = bytes[0];
  const number = bytes[1];
  const value = bytes[2];
  if (!(status >= 0x80 && status < 0xf0)) return null; // data byte or a system message
  if (!(number >= 0 && number <= 127 && value >= 0 && value <= 127)) return null;
  const channel = (status & 0x0f) + 1;
  switch (status & 0xf0) {
    case 0x90: return { type: value === 0 ? 'noteoff' : 'noteon', channel, number, value };
    case 0x80: return { type: 'noteoff', channel, number, value };
    case 0xb0: return { type: 'cc', channel, number, value };
    default: return null;
  }
}

/**
 * The key a message is bound under. Notes share one key for on AND off (a pad
 * is one binding); channel-specific, since a Launchpad and a knob bank can share
 * numbers on different channels.
 */
export function bindKey(msg) {
  return msg.type === 'cc' ? `cc:${msg.channel}:${msg.number}` : `note:${msg.channel}:${msg.number}`;
}

const KEY_RE = /^(note|cc):(1[0-6]|[1-9]):(1[0-2][0-7]|[1-9]?[0-9])$/;
/** Is this string a well-formed binding key? */
export function isBindKey(k) {
  return typeof k === 'string' && KEY_RE.test(k);
}

/** "note 36 · ch 1" for the UI. */
export function describeKey(key) {
  const m = KEY_RE.exec(key);
  if (!m) return key;
  return `${m[1] === 'cc' ? 'CC' : 'note'} ${m[3]} · ch ${m[2]}`;
}
