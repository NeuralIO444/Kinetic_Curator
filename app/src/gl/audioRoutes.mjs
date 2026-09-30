// audioRoutes.mjs — the audio → render routes, in one place (#613).
//
// The live loop (liveLoop.mjs) turns the shaped audio envelope into scale,
// alpha, breath and glow. The STIMULI modulation matrix shows those same
// routes live. Both call this function, so the panel can never drift from
// what renders. Pure; the math is exactly the loop's pre-#613 inline code.
//
// Routes today (mid and treble drive nothing — the matrix says so):
//   SCALE  ← beat · 0.38 · scaleMod  +  (bass · 0.55 + level · 0.35) · 0.28   (× depth)
//   ALPHA  ← beat · 18 · alphaMod                                            (× depth)
//   BREATH ← beat · 0.035                                                    (× depth)
//   GLOW   ← min(1, beat · 0.8 + level · 0.4)                                (× depth)

/**
 * @param {{bass:number, rms:number, beatPulse:number}} a shaped audio
 * @param {{depth:number, scaleMod:number, alphaMod:number}} p
 * @returns {{scaleMul:number, alphaBoost:number, breathAudio:number, glow:number}}
 */
export function audioRoutes(a, { depth, scaleMod, alphaMod }) {
  return {
    scaleMul: 1 + (
      a.beatPulse * 0.38 * scaleMod +
      (a.bass * 0.55 + a.rms * 0.35) * 0.28
    ) * depth,
    alphaBoost: a.beatPulse * 18 * alphaMod * depth,
    breathAudio: a.beatPulse * 0.035 * depth,
    glow: Math.min(1, a.beatPulse * 0.8 + a.rms * 0.4) * depth,
  };
}

/**
 * Matrix rows: one per (input → target) term. `depth` is the route's raw
 * gain (the knob side); `live` is what that term contributes right now.
 * Audio off → every live value is 0 (idle, never a frozen ghost).
 * Inputs with no route (mid, treble) are listed with target null.
 */
export function audioMatrixRows(a, { depth, scaleMod, alphaMod }, enabled = true) {
  const on = enabled ? 1 : 0;
  const beat = (a?.beatPulse || 0) * on;
  const bass = (a?.bass || 0) * on;
  const level = (a?.rms || 0) * on;
  const row = (input, target, gain, value) => ({ input, target, depth: gain, live: value * gain });
  return [
    row('BEAT', 'scale', 0.38 * scaleMod * depth, beat),
    row('BASS', 'scale', 0.55 * 0.28 * depth, bass),
    row('LEVEL', 'scale', 0.35 * 0.28 * depth, level),
    row('BEAT', 'alpha', 18 * alphaMod * depth, beat),
    row('BEAT', 'breath', 0.035 * depth, beat),
    row('BEAT', 'glow', 0.8 * depth, beat),
    row('LEVEL', 'glow', 0.4 * depth, level),
    { input: 'MID', target: null, depth: 0, live: 0 },
    { input: 'TREBLE', target: null, depth: 0, live: 0 },
  ];
}
