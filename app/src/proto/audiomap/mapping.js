// ─────────────────────────────────────────────────────────────
// mapping.js — the "cross the streams" math + animation target list.
// Prototype only. The math is deliberately simple and commented so
// Matt can see exactly what each stream does to the others.
// ─────────────────────────────────────────────────────────────

export const TARGETS = [
  { id: 'pulse', label: 'creature pulse', hint: 'the blob breathes' },
  { id: 'sway', label: 'tentacle sway', hint: 'flow field wobbles' },
  { id: 'glow', label: 'glow intensity', hint: 'particles get brighter' },
  { id: 'hue', label: 'hue drift', hint: 'color cycles with level' },
  { id: 'speed', label: 'particle speed', hint: 'everything moves faster' },
  { id: 'breath', label: 'background breathing', hint: 'the void inhales' },
];

export const TARGET_LABEL = Object.fromEntries(TARGETS.map((t) => [t.id, t.label]));

// Default: one sensible mapping per band so the canvas is alive immediately.
export const DEFAULT_ASSIGNMENTS = {
  bass: 'pulse',
  mid: 'sway',
  treble: 'glow',
  rms: 'speed',
};

/**
 * Cross-stream modulation. Input: smoothed band levels 0..1.
 *
 *   1. BASS ducks TREBLE — when the kick hits, the highs recoil:
 *        trebleX = treble × (1 − 0.65 × bass)
 *
 *   2. RMS scales EVERYTHING — overall loudness is overall intensity:
 *        master = 0.30 + 0.70 × rms     (never fully dead, never clipped)
 */
export function applyCrossStreams(val) {
  const bass = Math.min(1, val.bass);
  const trebleDucked = val.treble * (1 - 0.65 * bass);
  const master = 0.3 + 0.7 * Math.min(1, val.rms);
  return {
    bass: Math.min(1, val.bass * master),
    mid: Math.min(1, val.mid * master),
    treble: Math.min(1, trebleDucked * master),
    rms: Math.min(1, val.rms * master),
  };
}

/**
 * assignments: { bass: targetId|null, mid: …, treble: …, rms: … }
 * crossed: output of applyCrossStreams
 * → { targetId: 0..1 } — summed when two bands share a target.
 * Unmapped targets idle on a slow LFO so the canvas never looks dead.
 */
export function resolveTargets(assignments, crossed, timeSec) {
  const out = {};
  for (const t of TARGETS) {
    // gentle idle drift for unassigned targets: 0.12 ± 0.08
    out[t.id] = 0.12 + 0.08 * Math.sin(timeSec * 0.6 + t.id.length);
  }
  for (const band of ['bass', 'mid', 'treble', 'rms']) {
    const targetId = assignments[band];
    if (targetId && out[targetId] !== undefined) {
      out[targetId] = Math.min(1, out[targetId] + crossed[band]);
    }
  }
  return out;
}
