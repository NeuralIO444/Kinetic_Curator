// dishWeather.mjs — #1183 weather slice 1: the connection between an FX layer's haze and the dish's air.
//
// Mirrors gl/dishGround.mjs. For a content layer whose WEATHER dial is above 0 and that has an FX layer
// ABOVE it carrying haze (amount > 0), weatherArgs() returns the extra arguments buildPlacements already
// understands ({ dish, air, airVeil }); for every other layer it returns the same frozen empty object, so
// nothing is passed and the frame is byte-identical to before. liveResolve.mjs and studio/render.mjs
// (one-writer files) take only this call site; the response maths lives in engine/weatherAir.mjs.
//
// Which FX layer is a layer's weather (Matt's Q2 ruling, 2026-10-19): the NEAREST FX layer above it
// whose sanitized effects include haze with amount > 0 — one weather source per layer, stack order is
// depth, mirroring "nearest PATTERN below" for the ground. An FX layer above without haze does not
// block a higher one that has it.
//
// The air is re-read every frame, like the ground: the field is seeded once from (seed, seedOffsets)
// and its z rides loop time (tSec), so the mist drifts and a mark can sink and surface again; a still
// freezes it at the document's pattern time. Pure functions of resolver inputs only — no clock, no
// RNG-stream consumption, no GPU readback — so a recorded take replays the same fades.
import { WEATHER } from '../engine/kernel/weather/registry.js';
import { isFxLayer, sanitizeFxEffects } from '../fx/fxFilters.js';
import { noiseSeedFor } from '../engine/kernel/rng.js';
import { hazeVeilHex } from '../engine/weatherAir.mjs';

const NONE = Object.freeze({});
const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The WEATHER registry id of the haze-as-air module (its first entry). */
export const HAZE_AIR_ID = 'haze-air';

// The mist's own seed salt, XORed over the noise stream's seed — the formation.js FERTILITY_SALT
// pattern: the air is an independent field that still re-rolls when the NOISE stream is re-rolled.
const AIR_SEED_SALT = 0x48415a45; // 'HAZE'

/** How fast the mist drifts through the field's z axis, per second of loop time. Slow on purpose:
 *  a mark sinks and surfaces over tens of seconds; weather that cannot move reads as a texture. */
export const AIR_DRIFT_PER_SEC = 0.02;

/**
 * The nearest FX layer above `layerId` (bottom -> top order) whose sanitized effects include haze
 * with amount > 0: `{ layer, haze }` with the SANITIZED haze params, or null. Hidden FX layers are
 * not weather (mirrors the ground skipping hidden patterns); MATH layers are not FX layers and
 * their catalog has no haze.
 */
export function nearestWeatherAbove(layers, layerId) {
  if (!Array.isArray(layers)) return null;
  const at = layers.findIndex((l) => l && l.id === layerId);
  if (at < 0) return null;
  for (let i = at + 1; i < layers.length; i++) {
    const l = layers[i];
    if (!l || typeof l !== 'object' || !isFxLayer(l) || l.visible === false) continue;
    const haze = sanitizeFxEffects(l.effects).find((e) => e.kind === 'haze');
    if (haze && haze.params.amount > 0) return { layer: l, haze: haze.params };
  }
  return null;
}

/**
 * Extra buildPlacements arguments for one content layer: `{ dish, air, airVeil }`, or the frozen
 * empty object when the layer's WEATHER dial is 0 or no FX layer above it carries haze. `air` is
 * the EFFECTIVE strength — the haze's own amount (the per-kind strength) × the layer's dial;
 * either being 0 is a hard gate, so no field is built and no maths runs. Sets `dish.air` to this
 * frame's sampler, (x, y) in scene units -> mist 0..1.
 */
export function weatherArgs({ dish, layers, layerId, air, W, H, tSec, seed, seedOffsets = null }) {
  const dial = clamp01(air);
  if (!(dial > 0)) return NONE;
  if (!dish) return NONE;
  const src = nearestWeatherAbove(layers, layerId);
  if (!src) return NONE;
  const decl = WEATHER.get(HAZE_AIR_ID);
  if (!decl) return NONE;
  const fieldSeed = (noiseSeedFor(seed >>> 0, seedOffsets) ^ AIR_SEED_SALT) >>> 0;
  const field = decl.create(fieldSeed, { z: (Number(tSec) || 0) * AIR_DRIFT_PER_SEC });
  const iw = W > 0 ? 1 / W : 0;
  const ih = H > 0 ? 1 / H : 0;
  dish.seed = seed >>> 0 || 0;
  dish.air = (x, y) => field.sample(x * iw, y * ih);
  return { dish, air: src.haze.amount * dial, airVeil: hazeVeilHex(src.haze.lift) };
}
