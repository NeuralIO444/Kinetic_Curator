// spectrumRecord.js — #1534: a take carries its spectrum, so marks replay what they heard.
//
// Decision 2 of docs/design/spectral-path.md (Matt, 2026-10-14): the marks listen to the live spectrum
// (gl/spectrumLive), and the packed texture enters the resolved frame — and its hash — whenever a dial
// is up. Until now the take recorded the inputs but not the hearing, so a replay heard whatever the room
// was doing at playback time. This records the hearing itself: once per resolved frame, the core's
// smoothed 128 log bins quantized to 32 bins at 8-bit (gl/spectrumCore's quantizeSpectrum — the compact
// record that decision specified), stored as one base64 string beside the clock section.
//
// THE GATE (the acceptance's file discipline): the section exists only if the marks were up for at least
// one frame of the take — any of SCALE / DISPLACE / COLOUR above 0. A take recorded with the dials at 0
// has no spectrum section and its file is exactly what it was before this section existed. The rows are
// recorded regardless (the spectrum exists whether or not the marks listen); the gate only decides
// whether the record ships.
//
// Playback is the mirror: the rows are expanded back to 128 bins and fed to the live core in the
// analyser's place (spectrumLive's playback mode), so peak and flux are re-derived by the core's own
// ballistics from the recorded smoothed levels — derived, never stored, like every other section.
import { quantizeSpectrum, RECORD_BINS } from '../gl/spectrumCore.mjs';
import { beginSpectrumPlayback, stepSpectrumPlayback, endSpectrumPlayback } from '../gl/spectrumLive.mjs';

export const SPECTRUM_RECORD_VERSION = 1;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = new Map([...B64].map((c, i) => [c, i]));

/** Uint8Array -> base64 (chunked string ops only: the same code in the browser and in Node). */
export function bytesToB64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

/** base64 -> Uint8Array, or null for anything that is not clean base64. */
export function b64ToBytes(text) {
  if (typeof text !== 'string' || text.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(text)) return null;
  const out = [];
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (text[i + k] === '=' ? 0 : B64_REV.get(text[i + k])));
    if (v.some((x) => x === undefined)) return null;
    out.push((v[0] << 2) | (v[1] >> 4));
    if (text[i + 2] !== '=') out.push(((v[1] & 15) << 4) | (v[2] >> 2));
    if (text[i + 3] !== '=') out.push(((v[2] & 3) << 6) | v[3]);
  }
  return new Uint8Array(out);
}

/**
 * Recorder. `getFrame()` returns the take's current frame index (an annotation: order is what replays).
 * The spectrum tap calls `sample` with the core's smoothed bins; the caller notes audibility (any dial
 * up) as it changes. Frames the tap skips are carried forward from the previous row — the spectrum at a
 * frame is the last hearing at or before it, which is what the marks resolved with anyway.
 */
export function createSpectrumRecorder({ getFrame = () => 0 } = {}) {
  const rows = []; // frame -> Uint8Array(RECORD_BINS)
  let lastFrame = -1;
  let heard = false;
  const scratch = new Uint8Array(RECORD_BINS);
  return {
    /** The marks are up (call on every dial change; the same value is harmless). */
    note(audible) {
      if (audible) heard = true;
    },
    /** One hearing: the core's smoothed 128 bins at the take's current frame. */
    sample(smooth) {
      const frame = getFrame() | 0;
      if (frame < 0 || frame <= lastFrame) return;
      quantizeSpectrum(smooth, scratch);
      const row = scratch.slice();
      for (let f = lastFrame + 1; f < frame; f++)
        rows[f] = lastFrame >= 0 ? rows[lastFrame] : new Uint8Array(RECORD_BINS);
      rows[frame] = row;
      lastFrame = frame;
    },
    /**
     * The section, or undefined when the marks were never up (the key is then absent from the file:
     * JSON drops undefined). The tail past the last hearing is carried forward to the take's length.
     */
    finish() {
      if (!heard) return undefined;
      const total = Math.max(lastFrame + 1, getFrame() | 0, 1);
      const bytes = new Uint8Array(total * RECORD_BINS);
      for (let f = 0; f < total; f++) {
        const row = rows[f] || (f > 0 ? rows[f - 1] : undefined) || new Uint8Array(RECORD_BINS);
        rows[f] = row;
        bytes.set(row, f * RECORD_BINS);
      }
      return { version: SPECTRUM_RECORD_VERSION, bins: RECORD_BINS, rows: bytesToB64(bytes) };
    },
  };
}

/** Fail-closed shape check: { version, bins, bytes } with the rows decoded, or null. */
export function checkSpectrumRecord(r) {
  if (!r || typeof r !== 'object' || r.version !== SPECTRUM_RECORD_VERSION) return null;
  if (r.bins !== RECORD_BINS) return null;
  const bytes = b64ToBytes(r.rows);
  if (!bytes || bytes.length === 0 || bytes.length % RECORD_BINS !== 0) return null;
  return { version: r.version, bins: r.bins, bytes };
}

// ── playback: the App's playback frame tap drives these, one call per played frame ─────────────────────
let replayingSection = null; // the take section object being fed, or null (identity keys the restart:
// checkSpectrumRecord decodes fresh on every call, so the decoded record cannot be the key)

/** Feed one played frame's hearing to the live core, in the analyser's place. Seeks restart the core. */
export function replaySpectrumFrame(frame, section, { seeked = false } = {}) {
  const rec = section ? checkSpectrumRecord(section) : null;
  if (!rec) {
    if (replayingSection) {
      endSpectrumPlayback();
      replayingSection = null;
    }
    return;
  }
  if (replayingSection !== section || seeked) {
    beginSpectrumPlayback(rec.bytes);
    replayingSection = section;
  }
  stepSpectrumPlayback(frame);
}

/** Playback stopped (or a sectionless take started): the live spectrum is the room's again. */
export function endSpectrumReplay() {
  if (replayingSection) {
    endSpectrumPlayback();
    replayingSection = null;
  }
}
