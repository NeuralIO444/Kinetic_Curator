// sourceStatus.mjs — what the STIMULI SOURCE section tells the performer (#618).
//
// Pure. One honest line per state: what is driving reactivity right now, and
// what is NOT. A refused sidecar is named, never silently ignored.

const REASON = {
  'no-frames': 'no frames[] in it',
  'no-usable-frames': 'no usable frames',
  'not-json': 'not valid JSON',
};

/** Human reason for a refused sidecar (problem code from parseAudioEnvelope, or 'not-json'). */
export function sidecarReason(problem) {
  return REASON[problem] || 'unreadable';
}

/** mm:ss for a duration in seconds (0 → 0:00). */
export function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @param {{type:string, name?:string}} source  the audio source
 * @param {{name:string, env:{samples:Array}}|null} sidecar
 * @param {string} note  why the last sidecar pick was refused ('' if none)
 * @returns {{tag:'MIC'|'FILE'|'FILE+ENV', line:string, driving:string}}
 */
export function sourceStatus(source, sidecar, note = '') {
  if (!source || source.type !== 'file') {
    return { tag: 'MIC', line: 'MIC · live analysis', driving: 'The microphone, analysed live.' };
  }
  if (sidecar && sidecar.env) {
    const s = sidecar.env.samples;
    const span = s.length > 1 ? s[s.length - 1].t - s[0].t : 0;
    return {
      tag: 'FILE+ENV',
      line: `FILE · SIDECAR ${sidecar.name} · ${s.length} frames · ${clock(span)}`,
      driving: 'Level and beat come from the sidecar, the same every play. Bass / mid / treble routes are idle (the sidecar has no bands).',
    };
  }
  return {
    tag: 'FILE',
    line: note ? `FILE · sidecar ignored: ${note} — live analysis` : 'FILE · no sidecar — live analysis',
    driving: 'The file, analysed live (not repeatable to the frame). Load a kc-audio-envelope/1 sidecar to drive it from pre-analysed truth.',
  };
}
