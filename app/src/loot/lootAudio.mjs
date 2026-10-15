// lootAudio.mjs — #1479 slice 8: the loot folder's audio. Pure of the store, the bus and the DOM: the caller injects how
// bytes are read and how a blob URL is made.
//
// Audio is never switched on by a scan (that would hijack the mic mid-set). A scan VALIDATES each file (magic bytes, size)
// and marks the good ones "taken"; STIMULI then offers them as a pick, and picking one is the only thing that loads it.
// A file that is not what its extension says (a text file named .wav, a truncated header, zero bytes, too big) is refused
// with a reason and not retried until its bytes change. Nothing throws.
import { markTaken, addRows, sanitizeIndex } from './lootIndex.mjs';

export const MAX_AUDIO_BYTES = 64 * 1024 * 1024; // the native read cap
const MIN_AUDIO_BYTES = 44; // a RIFF/WAVE header alone is 44

const tag = (b, at, s) => b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/** 'wav' | 'aiff' | 'mp3' | null — by the file's own first bytes, never by its name. */
export function sniffAudio(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (tag(bytes, 0, 'RIFF') && tag(bytes, 8, 'WAVE')) return 'wav';
  if (tag(bytes, 0, 'FORM') && (tag(bytes, 8, 'AIFF') || tag(bytes, 8, 'AIFC'))) return 'aiff';
  if (tag(bytes, 0, 'ID3')) return 'mp3';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3'; // an MPEG frame sync
  return null;
}

const MIME = { wav: 'audio/wav', aiff: 'audio/aiff', mp3: 'audio/mpeg' };

/** Why these bytes are refused, or { type } when they pass. */
export function checkAudio(bytes) {
  if (!bytes || bytes.length === 0) return { reason: 'empty file' };
  if (bytes.length > MAX_AUDIO_BYTES) return { reason: 'too big (64 MB max)' };
  if (bytes.length < MIN_AUDIO_BYTES) return { reason: 'too short to be audio' };
  const type = sniffAudio(bytes);
  if (!type) return { reason: 'not an audio file (the bytes are not WAV, AIFF or MP3)' };
  return { type };
}

/** The files taken in, for STIMULI's pick: [{ id, rel, name, size }] in name order. */
export function audioChoices(index) {
  const ix = sanitizeIndex(index);
  return Object.entries(ix.items)
    .filter(([, it]) => it.kind === 'audio' && it.state === 'ok' && it.ingested)
    .map(([id, it]) => ({ id, rel: it.rel, name: it.rel.split('/').pop(), size: it.size }))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/**
 * Validate every new audio file. @param native { read(root, rel) }  @returns { index, summary: { taken, rejected, unreadable } }
 */
export async function takeInAudio({ native, index }) {
  let ix = sanitizeIndex(index);
  const todo = Object.entries(ix.items)
    .filter(([, it]) => it.kind === 'audio' && it.state === 'ok' && !it.ingested && !it.hold)
    .sort((a, b) => (a[1].rel < b[1].rel ? -1 : 1));
  const summary = { taken: 0, rejected: 0, unreadable: 0 };
  const rows = [];
  for (const [id, it] of todo) {
    const read = await native.read(ix.root, it.rel);
    if (!read.ok) {
      summary.unreadable += 1;
      rows.push({ rel: it.rel, kind: 'audio', outcome: 'rejected', reason: `unreadable: ${read.reason}` });
      ix = markTaken(ix, id, { status: 'held', reason: `unreadable: ${read.reason}` });
      continue;
    }
    const c = checkAudio(read.bytes);
    if (c.reason) {
      summary.rejected += 1;
      rows.push({ rel: it.rel, kind: 'audio', outcome: 'rejected', reason: c.reason });
      ix = markTaken(ix, id, { status: 'held', reason: c.reason });
      continue;
    }
    summary.taken += 1;
    rows.push({ rel: it.rel, kind: 'audio', outcome: 'taken-in', reason: `${c.type.toUpperCase()}, pick it in STIMULI` });
    ix = markTaken(ix, id, { status: 'taken' });
  }
  return { index: addRows(ix, rows.reverse()), summary };
}

/**
 * Load one taken-in file for playback: re-checks the bytes (the file may have changed since the scan).
 * @param makeUrl (bytes, mime) => blob URL   @returns { ok, url, name } | { ok:false, reason }
 */
export async function loadAudio({ native, index, id, makeUrl }) {
  const ix = sanitizeIndex(index);
  const it = ix.items[id];
  if (!it || it.kind !== 'audio' || it.state !== 'ok') return { ok: false, reason: 'that file is no longer in the folder' };
  const read = await native.read(ix.root, it.rel);
  if (!read.ok) return { ok: false, reason: `unreadable: ${read.reason}` };
  const c = checkAudio(read.bytes);
  if (c.reason) return { ok: false, reason: c.reason };
  try { return { ok: true, url: makeUrl(read.bytes, MIME[c.type]), name: it.rel.split('/').pop() }; } catch (e) { return { ok: false, reason: String((e && e.message) || e).slice(0, 100) }; }
}
