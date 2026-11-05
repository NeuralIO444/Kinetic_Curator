// dishLifeQuiet.mjs — DISH LIFE as a SECONDARY read (#1923, Matt's rebalance 2026-11-05).
//
// The first build woke a culture after idle and let it take the dish: the primary read. That is not what KC-1 is. The
// rebalance: the Director, the trio, the KINETIC buttons and the marks stay the primary read; the Game of Life is a
// quiet layer under them — the marks near a living colony breathe a little and fray a little (the Kineme system's new
// culture source, engine/kineme.js), and nothing is replaced, dissolved or covered.
//
// This module is the pure half: the CYCLE clock and the field SAMPLER.
//   CYCLE   the culture blooms, then ends, then re-seeds from whatever the scene is NOW (so it follows the picture
//           and never matures into the maze): cycleGens generations at gps, one cycle after another, on the LOOP
//           clock. The cycle index and the generation are pure functions of loop time, stamped on the input like
//           every other recorded input — the log stays the authority.
//   ENVELOPE a sine over the cycle (0 at the seed, 1 mid-bloom, 0 at the end) multiplies what the marks read, so a
//           re-seed never pops: the layer breathes in and out.
//   STRENGTH one dial (0..1) plus an idle boost: hands off for a while and the layer breathes a little more.
//           Touching never ends it; it only eases the boost back down.
//   SAMPLER the field the marks read: nearest culture cell for a canvas point, envelope-scaled. One-way: it reads
//           the culture, it can never write it.

/** Generations per cycle. At 8 gens/s this is 6 s: the bloom (the rule's useful arc) and out before any maze. */
export const CYCLE_GENS = 48;
/** Generations per second on the loop clock (the same feel parameter the clock uses). */
export const QUIET_GPS = 8;
/** How much more present the layer gets at full idle (a multiple of the dial: 1 + boost). */
export const IDLE_BOOST = 0.6;
/** Default dial: present but never primary. */
export const DEFAULT_STRENGTH = 0.35;

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/**
 * The stamp for loop time `loopMs`, or null when the layer is off (strength 0). Pure.
 *   { mode:'quiet', wakeMs, gen, cycleGens, shed, strength }
 * wakeMs is the cycle's start on the loop clock (the stage re-seeds when it changes); strength is the dial lifted by
 * the idle boost, clamped to 0..1.
 */
export function quietStamp(
  loopMs,
  { strength = DEFAULT_STRENGTH, boost = 0, shed = 0, gps = QUIET_GPS, cycleGens = CYCLE_GENS } = {},
) {
  const dial = clamp01(strength);
  if (!(dial > 0)) return null;
  const t = Number.isFinite(Number(loopMs)) && loopMs > 0 ? Number(loopMs) : 0;
  const cycleMs = (cycleGens / gps) * 1000;
  const cycle = Math.floor(t / cycleMs);
  const wakeMs = cycle * cycleMs;
  const gen = Math.min(cycleGens - 1, Math.floor(((t - wakeMs) / 1000) * gps));
  return {
    mode: 'quiet',
    wakeMs,
    gen,
    cycleGens,
    shed: shed | 0,
    strength: clamp01(dial * (1 + IDLE_BOOST * clamp01(boost))),
  };
}

/** The cycle's envelope at generation `gen`: 0 at the seed, 1 mid-bloom, 0 at the end. */
export function envelope(gen, cycleGens = CYCLE_GENS) {
  if (!(cycleGens > 0)) return 0;
  const g = Math.min(cycleGens, Math.max(0, Number(gen) || 0));
  return Math.sin((Math.PI * g) / cycleGens);
}

/**
 * The read-only sampler over a culture: `sample(x, y, out)` writes { level, activity } (envelope-scaled) for the
 * canvas point and returns true, or false outside the canvas. `strength` and `gen` ride along for the consumer.
 */
export function cultureSampler(culture, { canvasW, canvasH, strength, cycleGens = CYCLE_GENS }) {
  const { cols, rows } = culture;
  const env = envelope(culture.gen, cycleGens);
  const { level, activity } = culture.field;
  const W = Number(canvasW) || 1;
  const H = Number(canvasH) || 1;
  return {
    strength: clamp01(strength) * env,
    gen: culture.gen,
    sample(x, y, out) {
      const cx = Math.floor((x / W) * cols);
      const cy = Math.floor((y / H) * rows);
      if (!(cx >= 0 && cx < cols && cy >= 0 && cy < rows)) return false;
      const i = cy * cols + cx;
      out.level = level[i];
      out.activity = activity[i];
      return true;
    },
  };
}
