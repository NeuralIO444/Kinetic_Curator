// audioEnvelopeCore.mjs — the kc-audio-envelope/1 sidecar: parse + sample (#618).
//
// Browser-safe (no node:fs). The studio/stills loader (audioEnvelope.mjs) and
// the live STIMULI file source both read sidecars through this one parser, so
// a malformed file is refused the same way everywhere: null = no audio
// modulation, never a crash and never a made-up value (#236, off-defaults rule).
//
// Contract: `studio/audio_envelope.py` writes
//   { schema, source, sr, hop_length, fps, duration, tempo_bpm,
//     frames: [{t, rms, flux, beat_phase}], beats: [t…], downbeats: [] }

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


/**
 * Parse an already-JSON-decoded sidecar.
 * @returns {{env: {samples, beats, tempoBpm}|null, problem: string|null, note: string|null}}
 *   env null = refuse (problem says why); note = a non-fatal warning (schema drift).
 */
export function parseAudioEnvelope(raw) {
  // Current schema: { schema: "kc-audio-envelope/1", frames: [...], beats: [...] }
  const frames = Array.isArray(raw?.frames) ? raw.frames : null;
  // Legacy sketch: bare array or {envelope: [...]} of {t, rms, beat}.
  const legacy = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.envelope)
      ? raw.envelope
      : null;
  if (!frames && !legacy) return { env: null, problem: "no-frames", note: null };
  const samples = (frames ? frames.map(asFrame) : legacy.map(asLegacyFrame))
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
  if (samples.length === 0) return { env: null, problem: "no-usable-frames", note: null };
  const note =
    frames && raw.schema && raw.schema !== AUDIO_SCHEMA
      ? `declares schema ${raw.schema} (expected ${AUDIO_SCHEMA}); reading frames[] anyway`
      : null;
  return {
    env: {
      samples,
      beats: asBeats(raw?.beats),
      tempoBpm: Number(raw?.tempo_bpm) > 0 ? Number(raw.tempo_bpm) : 0,
    },
    problem: null,
    note,
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

/**
 * One deterministic live tick (#618): the envelope sampled at playback time `t`
 * (seconds), plus how many beats were crossed since `prevT`. Pure: the same
 * (env, t, prevT) is the same answer every time, so the same file plays the
 * same visuals twice in a row. `prevT` null = first tick (no beats crossed).
 * A backwards jump (the file looped, or the user seeked back) counts the beats
 * to the end of the envelope and from the start, so a loop never drops a beat.
 */
export function envelopeTick(env, t, prevT = null) {
  const time = Number.isFinite(t) && t >= 0 ? t : 0;
  const { rms } = sampleEnvelope(env, time);
  let beats = 0;
  if (prevT != null && env.beats.length) {
    const inRange = (lo, hi) => env.beats.filter((b) => b > lo && b <= hi).length;
    beats = time >= prevT ? inRange(prevT, time) : inRange(prevT, Infinity) + inRange(-1, time);
  }
  return { rms, beats };
}
