/**
 * Wet-frame service (#1809, slice A) — the one wet field, owned.
 *
 * Extracted from the live loop per docs/WET_ENGINE.md Phase A. Until now
 * the vortex sim (gl/vortex.mjs) was gated inside liveLoop on ACCUM being
 * on, its slot was destroyed when ACCUM toggled off or faulted, and its
 * freeze was borrowed from ACCUM's controls. The field is a session
 * substance, not a checkbox's private state: this service owns it.
 *
 * The contract every consumer programs against (designed in #1809, not
 * renegotiated per consumer):
 *
 *   · Field — the vortex state itself: packed wet mask + packed velocity
 *     per frame (wetMask / wetVel), at the sim's grid (128 lands in #1810;
 *     the constants stay the sim's). Since #1811 the field also carries
 *     pigment: pigStep / pigDep publish the deposited layer's KM
 *     reflectance pack beside the mask whenever pigment is live in the
 *     field (absent — pigStep 0, pigDep null — until the first coloured
 *     stamp lands; ACCUM is the first reader, the pack is also the
 *     backstage stain read).
 *   · Regime thresholds — WET_REGIMES / wetRegimeAt: named bands over the
 *     mask value (damp / wet / soaked) so display consumers (#1813) read
 *     regimes, never raw floats interpreted ad hoc.
 *   · Control-rate scalars — wetStep / wetGain / wetAmount ride every
 *     frame result beside the field textures, exactly as ACCUM's recipe
 *     has always consumed them.
 *   · Mode — every result names how the field was served: 'live' (full
 *     step or a frozen hold), 'degraded' (governor shed, stamps-only
 *     service), 'shed' (a wanting consumer stood down by the shed,
 *     unserved), 'off' (nobody wants the field, or it is dry). A shed is
 *     reported, never silent (the #1069 rule).
 *
 * Policy, in one place:
 *
 *   · Need-based gate — the sim steps only when a consumer requests the
 *     field this frame (`consumers: { accum: true, … }`). Never for
 *     nothing: no request, no step, no field birth.
 *   · Ownership — the field's lifetime is the session's. It resets only
 *     on seed/size change (ensureVortex, the sim's own rule). A consumer
 *     toggling off, or an ACCUM fault, leaves it standing; dispose() is
 *     the only sanctioned destroy and only the loop's teardown calls it.
 *   · Clock — one transport. `freeze` is an input the caller derives
 *     from the transport (running / FREEZE / slowRender), exactly as the
 *     loop derived it for noteWetFrame; a frozen frame holds the field.
 *   · Governor — at the tier-1 shed the service degrades instead of
 *     dying for consumers that accept degraded service (`degradedOk`):
 *     stamping continues (instances + ambient emit, the mask dries in
 *     place at the sim's own dry factor) and advection is skipped (no
 *     splat / Poisson / velocity / advect, so no velocity is published —
 *     wetVel is null and wetGain is 0; the mask and amount stay honest).
 *     A consumer that does not accept it (slice A's ACCUM, shed as a
 *     tier-1 unit with its chain) is stood down and told so: mode 'shed'.
 *
 * Slice A wires exactly one consumer: ACCUM, through liveLoop, with the
 * same inputs the loop always passed noteWetFrame — the full-step path
 * IS noteWetFrame against the service's slot, so ACCUM consumes
 * byte-identically (the doc's Phase A acceptance, pinned in
 * wetFrame.selfcheck). The dish migration is slice B of #1809 (its own
 * issue, review lane); warm-up exports landed as #1815 — the export
 * paths run this service for a fixed K = 90 warm-up (gl/wetWarmup.mjs),
 * superseding the old live-only header on vortex.mjs.
 *
 * Determinism (#806) is untouched: the sim steps with fixed dt and a
 * seeded RNG, as a function of the frame inputs — never wall clock.
 * Cost: the field's work stays registered once, as 'gl/vortex' (tier 1,
 * shed as a unit with the ACCUM chain); this service is policy over that
 * work, not a second cost centre. Measured step costs live in
 * docs/review/1809/.
 */

import {
  accrueEdgeDarkening,
  advectGain,
  emitAmbientFrom,
  emitFromInstances,
  ensureVortex,
  noteWetFrame,
  packPigmentDeposited,
  packWet,
  transferPigment,
  VORTEX_WET_DRY,
  wetnessStep,
} from './vortex.mjs';

/**
 * Named wetness bands over the mask value (0..1). Threshold provenance:
 * damp 0.05 sits above the dry tail (one landed stamp dries ×0.992 a
 * frame and crosses 0.05 after ≈4 s — the field's visible memory); wet
 * 0.35 is one stationary stamp (emitFromInstances' resting amount);
 * soaked 0.8 nears the stamp clamp, where overlaps saturate.
 */
export const WET_REGIMES = Object.freeze([
  Object.freeze({ id: 'damp', at: 0.05 }),
  Object.freeze({ id: 'wet', at: 0.35 }),
  Object.freeze({ id: 'soaked', at: 0.8 }),
]);

/** The regime a mask value sits in: 'dry' | 'damp' | 'wet' | 'soaked'. */
export function wetRegimeAt(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < WET_REGIMES[0].at) return 'dry';
  if (v < WET_REGIMES[1].at) return 'damp';
  if (v < WET_REGIMES[2].at) return 'wet';
  return 'soaked';
}

const absent = () => ({ wetStep: 0, wetGain: 0, wetAmount: 0, wetVel: null, wetMask: null, pigStep: 0, pigDep: null });

/**
 * @returns {{
 *   frame: (req?: object) => {wetStep: number, wetGain: number, wetAmount: number,
 *     wetVel: object|null, wetMask: object|null, wetMode: string, wetShed: string|null},
 *   stats: () => {frames: number, fullSteps: number, degradedSteps: number,
 *     shedFrames: number, heldFrames: number, births: number},
 *   field: () => object|null,
 *   dispose: () => void,
 * }}
 */
export function createWetFrameService() {
  // The sim's slot protocol shape; the service is its only owner now.
  const slot = { vortex: null };
  let frames = 0;
  let fullSteps = 0;
  let degradedSteps = 0;
  let shedFrames = 0;
  let heldFrames = 0;
  let births = 0;

  /**
   * Serve one frame. `req`:
   *   consumers  — { name: bool } who needs the field this frame.
   *   shed       — governor shed id (e.g. 'perfTier1') or null.
   *   degradedOk — the wanting consumer accepts stamps-only service
   *                under the shed.
   *   wetness, freeze, seed, width, height, instances, behave, motion —
   *                the sim inputs, unchanged from noteWetFrame's.
   */
  function frame(req = {}) {
    frames += 1;
    const consumers = req.consumers || {};
    const wants = Object.values(consumers).some(Boolean);
    const shed = req.shed || null;
    if (!wants) return { ...absent(), wetMode: 'off', wetShed: shed };
    if (shed && !req.degradedOk) {
      // Shed as a unit and stood down — named, never silent.
      shedFrames += 1;
      return { ...absent(), wetMode: 'shed', wetShed: shed };
    }
    if (wetnessStep(req.wetness) === 0) return { ...absent(), wetMode: 'off', wetShed: shed };
    if (shed) {
      // Degraded service: stamps land, the mask dries in place, nothing
      // advects and no velocity is published. A frozen transport holds
      // instead — the sim's own hold, published as on the full path.
      if (req.freeze) {
        const held = noteWetFrame(slot, {
          wetness: req.wetness,
          freeze: true,
          seed: req.seed,
          width: req.width,
          height: req.height,
          instances: req.instances,
          behave: req.behave,
          motion: req.motion,
        });
        if (held.wetStep === 1) heldFrames += 1;
        return { ...held, wetMode: 'degraded', wetShed: shed };
      }
      const before = slot.vortex;
      const state = ensureVortex(slot, { seed: req.seed, width: req.width, height: req.height });
      if (slot.vortex !== before) births += 1;
      emitFromInstances(state, req.instances || []);
      emitAmbientFrom(state, { behave: req.behave, motion: req.motion });
      const wet = state.wet;
      for (let i = 0; i < wet.length; i++) wet[i] *= VORTEX_WET_DRY;
      // #1811: pigment stamps rode the emit above; the compartment
      // transfer is local (no advection — advection is what the shed
      // sheds), so deposits keep settling under degraded service.
      // #1812: edge darkening is local too — the mask just dried in
      // place above, so deposits keep darkening on schedule under the
      // shed (null wetPrev: the uniform dry reconstructs it).
      if (state.pigmentLive) {
        transferPigment(state);
        accrueEdgeDarkening(state, null);
      }
      degradedSteps += 1;
      return {
        wetStep: 1,
        wetGain: 0,
        wetAmount: advectGain(req.wetness),
        wetVel: null,
        wetMask: packWet(state),
        pigStep: state.pigmentLive ? 1 : 0,
        pigDep: state.pigmentLive ? packPigmentDeposited(state) : null,
        wetMode: 'degraded',
        wetShed: shed,
      };
    }
    // Full service — the sim's own frame entry against the service's
    // slot, so a served frame is byte-identical to the pre-service path.
    const before = slot.vortex;
    const out = noteWetFrame(slot, {
      wetness: req.wetness,
      freeze: req.freeze,
      seed: req.seed,
      width: req.width,
      height: req.height,
      instances: req.instances,
      behave: req.behave,
      motion: req.motion,
    });
    if (slot.vortex && slot.vortex !== before) births += 1;
    if (out.wetStep === 1) {
      if (slot.vortex.held) heldFrames += 1;
      else fullSteps += 1;
    }
    return { ...out, wetMode: out.wetStep === 1 ? 'live' : 'off', wetShed: shed };
  }

  return {
    frame,
    /** Frame-profile counters — the need-based gate's proof surface. */
    stats: () => ({ frames, fullSteps, degradedSteps, shedFrames, heldFrames, births }),
    /** The live field state, or null before its first served frame. Read-only probe surface. */
    field: () => slot.vortex,
    /** Session end — the only sanctioned destroy. Toggles and faults never call this. */
    dispose: () => {
      slot.vortex = null;
    },
  };
}
