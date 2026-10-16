// motionLive.js — #1469: the live publisher of the MOTION readout. One call per resolved frame
// from App's resolve-frame tap, beside clockLive/audioLive: it reads the resolver's latest
// living-motion read (gl/liveResolve's getLastFrameMotion — the frame's own kineme ctx, after
// pattern re-weighting, beat drive and shed) and republishes it to hooks/motionMeterTap, where
// the STIMULI strip polls it. Nothing is computed here that the engine has not already computed:
// no pattern amounts are re-derived, no simulation runs, no bus event is emitted — a tap, not
// a route (routing motion as inputs was option B, declined).
//
// The merge (Matt's ruling, 2026-10-15): this strip is the panel's only motion readout — the
// #1485 strip retired into it. Its LIFE / PULSE / PALETTE reads fold in here: PULSE and PALETTE
// are the same kineme ctx's amounts (pulse from patternAmounts; paletteBreath the floor's own
// colour sweep, zeroed under reduced motion by the resolver itself, DS rule 7). LIFE is the one
// read the resolver cannot supply — the loop's breath scale is applied after the resolve — so
// the loop notes it to the tap (noteLifeBreath) and the note is folded in verbatim.
import { getLastFrameMotion } from '../gl/liveResolve.mjs';
import { setMotionMeterTap, getLifeBreath } from '../hooks/motionMeterTap.js';

/** The wind dial's full span (data/layout-modes: wind runs 0..3; vortex.mjs normalises the same way). */
const WIND_FULL = 3;
/** The palette-breath dial's display span: the amount at this reads full (the retired #1485 readout's span). */
const PALETTE_FULL = 0.5;

const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/** Publish the latest resolved frame's motion levels to the tap. Safe before the first frame. */
export function observeMotion() {
  const frame = getLastFrameMotion();
  const kineme = frame ? frame.kineme : null;
  const amounts = kineme ? kineme.amounts : null;
  setMotionMeterTap({
    // LIFE: the loop's own noted reading — the breath the frame was actually scaled by.
    life: getLifeBreath(),
    drift: clamp01(amounts ? amounts.drift : 0),
    breath: clamp01(amounts ? amounts.breath : 0),
    pulse: clamp01(amounts ? amounts.pulse : 0),
    // Wind: the scalar the frame resolved with. Voices, macros and patches all write the param
    // itself, and the behave/particle side applies it with no per-frame modulation on top (its
    // only multiplier is the per-organism profile constant in particles.js) — so the resolved
    // param IS the effective wind, normalised by its dial span.
    wind: clamp01(frame && Number.isFinite(frame.wind) ? frame.wind / WIND_FULL : 0),
    // The rhythm layer (#1198) is a static spatial field: it has no temporal phase to sample.
    // The bar reads its presence at full authored depth; rhythmType names the function.
    rhythmPhase: kineme && kineme.rhythm ? 1 : 0,
    rhythmType: kineme && kineme.rhythm ? kineme.rhythm.type : null,
    wobble: clamp01(amounts ? amounts.brushWobble : 0),
    palette: clamp01(amounts ? amounts.paletteBreath / PALETTE_FULL : 0),
    mothBeat: frame && frame.mothBeat != null ? clamp01(frame.mothBeat) : null,
  });
}
