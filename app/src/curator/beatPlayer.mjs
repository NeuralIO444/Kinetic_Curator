// beatPlayer.mjs — #1475: a pattern at a beat position -> the seven band levels and the beat pulse, in the same shape
// the live meter gives. Pure and stateless: a function of (pattern, beatPos), so a given bar always sounds the same,
// the same dish gives the same set, and a take replays it from the inputs it already records.
import { STEPS } from './beatLibrary.js';

const BANDS = ['sub', 'bass', 'mud', 'mids', 'edge', 'pres', 'air'];

/** How each lane lands on the seven bands (weights), and how long its hit rings (in sixteenth steps). */
const LANE = {
  kick: { w: { sub: 0.95, bass: 0.85, mud: 0.25 }, tau: 0.9 },
  snare: { w: { mud: 0.45, mids: 0.75, edge: 0.55 }, tau: 1.0 },
  hat: { w: { edge: 0.3, pres: 0.65, air: 0.75 }, tau: 0.5 },
  bass: { w: { sub: 0.5, bass: 0.7, mud: 0.4 }, tau: 1.8 },
};
const AMP = { x: 1, o: 0.5 };
const MAX_BACK = STEPS; // look back up to one bar for the most recent hit

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Time (in steps) a hit on step k lands at: the odd sixteenths are delayed by the swing. */
const hitTime = (k, swing) => k + ((k % 2 + 2) % 2 === 1 ? swing : 0);

/** Envelope of the lane at step-time t: the most recent hit's amplitude, decayed. 0 before any hit. */
function laneLevel(pattern, lane, t) {
  const pat = pattern.lanes[lane];
  const floor = Math.floor(t);
  for (let back = 0; back <= MAX_BACK; back++) {
    const k = floor - back;
    const c = pat[((k % STEPS) + STEPS) % STEPS];
    if (c === '.') continue;
    const at = hitTime(k, pattern.swing);
    if (at > t) continue; // a swung hit that has not landed yet
    return AMP[c] * Math.exp(-(t - at) / LANE[lane].tau);
  }
  return 0;
}

/**
 * @param pattern   a sanitized kc-beat/1 pattern
 * @param beatPos   beats since the clock started (fractional), from the musical clock
 * @param opts      { intensity } 0..1, the stage's ask (the room and band choose it)
 * @returns { bands: {sub..air}, coarse: { rms, bass, mid, treble, beatPulse } }  all 0..1
 */
export function playLevels(pattern, beatPos, { intensity = 0.6 } = {}) {
  const t = (Number.isFinite(beatPos) ? beatPos : 0) * 4; // sixteenths
  const gain = clamp01(intensity) * (0.5 + 0.5 * pattern.intensity);
  const raw = Object.fromEntries(BANDS.map((b) => [b, 0]));
  let kick = 0;
  for (const lane of Object.keys(LANE)) {
    const lv = laneLevel(pattern, lane, t);
    if (lane === 'kick') kick = lv;
    if (lv === 0) continue;
    for (const [b, w] of Object.entries(LANE[lane].w)) raw[b] += lv * w;
  }
  // a slow bed under the hits: it breathes over 16 beats so a gap in the pattern is never dead
  const bed = pattern.bed * (0.6 + 0.4 * Math.sin((Number.isFinite(beatPos) ? beatPos : 0) * (Math.PI * 2) / 16));
  const bands = {};
  for (const b of BANDS) bands[b] = clamp01((raw[b] + bed) * gain);
  const mean = (...k) => k.reduce((s, x) => s + bands[x], 0) / k.length;
  return {
    bands,
    coarse: {
      rms: mean(...BANDS),
      bass: mean('sub', 'bass'),
      mid: mean('mud', 'mids'),
      treble: mean('edge', 'pres', 'air'),
      beatPulse: clamp01(kick * gain * 1.1),
    },
  };
}
