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

export const AUDIO_SCHEMA = "kc-audio-envelope/1";

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function asFrame(o) {
  if (!o || typeof o !== "object") return null;
  const t = Number(o.t);
  if (!Number.isFinite(t) || t < 0) return null;
  return {
    t,
    rms: clamp01(Number(o.rms)),
    flux: clamp01(Number(o.flux)),
    beat_phase: clamp01(Number(o.beat_phase)),
  };
}

// Legacy alias for the pre-research sketch ({t, rms, beat} flat arrays, where
// beat was a 0/1 flag): beat=1 marks the downbeat instant, i.e. beat_phase 0.
function asLegacyFrame(o) {
  if (!o || typeof o !== "object") return null;
  const t = Number(o.t);
  if (!Number.isFinite(t) || t < 0) return null;
  return {
    t,
    rms: clamp01(Number(o.rms)),
    flux: 0,
    beat_phase: 0,
  };
}

function asBeats(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map(Number)
    .filter((t) => Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b);
}

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
  // Current schema: { schema: "kc-audio-envelope/1", frames: [...], beats: [...] }
  const frames = Array.isArray(raw?.frames) ? raw.frames : null;
  // Legacy sketch: bare array or {envelope: [...]} of {t, rms, beat}.
  const legacy = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.envelope)
      ? raw.envelope
      : null;
  if (!frames && !legacy) {
    process.stderr.write(
      `[accumStill] --audio sidecar ${path} has no frames[] (schema ${AUDIO_SCHEMA}) — continuing without audio\n`
    );
    return null;
  }
  const samples = (frames ? frames.map(asFrame) : legacy.map(asLegacyFrame))
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
  if (samples.length === 0) {
    process.stderr.write(
      `[accumStill] --audio sidecar ${path} has no usable frames — continuing without audio\n`
    );
    return null;
  }
  if (frames && raw.schema && raw.schema !== AUDIO_SCHEMA) {
    process.stderr.write(
      `[accumStill] --audio sidecar ${path} declares schema ${raw.schema} (expected ${AUDIO_SCHEMA}); reading frames[] anyway\n`
    );
  }
  return {
    samples,
    beats: asBeats(raw?.beats),
    tempoBpm: Number(raw?.tempo_bpm) > 0 ? Number(raw.tempo_bpm) : 0,
  };
}

function lerp(a, b, f) {
  return a + (b - a) * f;
}

/** Resample the envelope onto a render frame time (seconds).
 *  rms and flux interpolate linearly; beat_phase takes the nearest sample
 *  (avoids 0↔1 wrap artifacts); beatPulse is derived from the beats[] list:
 *  it fires 1.0 at each beat and decays linearly over one beat interval,
 *  and is 0 before the first beat. */
export function sampleEnvelope(env, time) {
  const s = env.samples;
  if (s.length === 1) {
    return { rms: s[0].rms, flux: s[0].flux, beat_phase: s[0].beat_phase, beatPulse: 0 };
  }
  let i = 0;
  while (i < s.length - 2 && s[i + 1].t <= time) i += 1;
  const a = s[i];
  const b = s[i + 1];
  const span = b.t - a.t;
  const f = span > 0 ? Math.min(1, Math.max(0, (time - a.t) / span)) : 0;
  const beat_phase = (f < 0.5 ? a : b).beat_phase;

  let beatPulse = 0;
  const beats = env.beats;
  if (beats.length > 0) {
    // Most recent beat at or before `time`.
    let lo = 0;
    let hi = beats.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] <= time) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx >= 0) {
      const interval =
        idx + 1 < beats.length
          ? Math.max(1e-3, beats[idx + 1] - beats[idx])
          : env.tempoBpm > 0
            ? 60 / env.tempoBpm
            : 0.5;
      const since = time - beats[idx];
      beatPulse = Math.max(0, 1 - since / interval);
    }
  }

  return {
    rms: lerp(a.rms, b.rms, f),
    flux: lerp(a.flux, b.flux, f),
    beat_phase,
    beatPulse,
  };
}
