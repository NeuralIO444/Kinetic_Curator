// motionLive.js — #1469: the live publisher of the MOTION readout. One call per resolved frame
// from App's resolve-frame tap, beside clockLive/audioLive: it reads the resolver's latest
// living-motion read (gl/liveResolve's getLastFrameMotion — the frame's own kineme ctx, after
// pattern re-weighting, beat drive and shed) and republishes it to hooks/motionMeterTap, where
// the STIMULI strip polls it. Nothing is computed here that the engine has not already computed:
// no pattern amounts are re-derived, no simulation runs, no bus event is emitted — a tap, not
// a route (routing motion as inputs was option B, declined).
import { getLastFrameMotion } from '../gl/liveResolve.mjs';
import { setMotionMeterTap } from '../hooks/motionMeterTap.js';

/** The wind dial's full span (data/layout-modes: wind runs 0..3; vortex.mjs normalises the same way). */
const WIND_FULL = 3;

const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/** Publish the latest resolved frame's motion levels to the tap. Safe before the first frame. */
export function observeMotion() {
  const frame = getLastFrameMotion();
  const kineme = frame ? frame.kineme : null;
  const amounts = kineme ? kineme.amounts : null;
  setMotionMeterTap({
    drift: clamp01(amounts ? amounts.drift : 0),
    breath: clamp01(amounts ? amounts.breath : 0),
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
    mothBeat: frame && frame.mothBeat != null ? clamp01(frame.mothBeat) : null,
  });
}
