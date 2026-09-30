// audioEnvelope.mjs — B1 audio sidecar loader + per-frame sampler (studio/still path).
//
// Contract: `studio/audio_envelope.py` writes `kc-audio-envelope/1` sidecars:
//   { schema, source, sr, hop_length, fps, duration, tempo_bpm,
//     frames: [{t, rms, flux, beat_phase}], beats: [t…], downbeats: [] }
// studio.py --audio forwards the sidecar path; the still renderer loads and
// resamples it onto its own frame times. A missing or malformed sidecar
// yields null here, and null is a real no-op (off-defaults rule).

// #551 — cost tier: none declared, on purpose. This is the studio/stills
// sidecar loader (node:fs, offline): a one-time file read plus per-frame scalar
// resampling, no GPU pass and nothing in the live frame budget. The per-frame
// scalar modulation it feeds is already declared as 'audio/modulation' (tier 0,
// accum.mjs); a second declaration here would double-count it.
import { existsSync, readFileSync } from "node:fs";
import { AUDIO_SCHEMA, parseAudioEnvelope, sampleEnvelope, envelopeTick } from "./audioEnvelopeCore.mjs";

// Parse + sampling live in audioEnvelopeCore.mjs (browser-safe, shared with the
// live STIMULI file source, #618); this file keeps the node:fs loader.
export { AUDIO_SCHEMA, parseAudioEnvelope, sampleEnvelope, envelopeTick };

/** Load an audio envelope sidecar. Returns {samples, beats, tempoBpm} or null
 *  (null = no audio modulation; malformed input warns on stderr and no-ops). */
export function loadAudioEnvelope(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    process.stderr.write(
      `[accumStill] cannot read --audio sidecar ${path}: ${err.message} — continuing without audio\n`
    );
    return null;
  }
  const { env, problem, note } = parseAudioEnvelope(raw);
  if (!env) {
    process.stderr.write(
      problem === "no-frames"
        ? `[accumStill] --audio sidecar ${path} has no frames[] (schema ${AUDIO_SCHEMA}) — continuing without audio\n`
        : `[accumStill] --audio sidecar ${path} has no usable frames — continuing without audio\n`
    );
    return null;
  }
  if (note) process.stderr.write(`[accumStill] --audio sidecar ${path} ${note}\n`);
  return env;
}
