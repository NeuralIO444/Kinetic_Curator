// formationLive.js — #1355 Phase 3 step 3: the formation rule, fed by the live instrument.
//
// #1694 slice 1 — this module is now the FACADE over the resolver-owned spawn state (curator/spawnState.js).
// The channel moved inside the resolver: liveResolve constructs a spawn state, observes every resolved
// frame itself, and publishes the decisions the loop stamps on the next frame's input. What remains here
// is the surface the rest of the app already speaks — the take recorder's taps (PerformanceButton), the
// room provider and the keep ring (App), the ?debug=stress readout's getters — all forwarded to the
// ACTIVE spawn state: the live resolver's, or a default instance when used standalone (the suites).
// The rules themselves never lived here: formation.js / limbs.js / davisShift.js, unchanged.
import { activeSpawnState, setFormationTap, setShiftTap, setRoomProvider, noteKeep } from './spawnState.js';
import { getStressState } from './stressLive.js';

export { setFormationTap, setShiftTap, setRoomProvider, noteKeep };

/** The latest per-pin states: [{ x, y, hold, formed, attraction, density }] and the band they were judged in. */
export function getFormationState() {
  return activeSpawnState().getFormationView();
}

/** Which pins have formed, per pin, as of the last resolved frame: the NEXT frame's input carries it (the moth reads it). */
export function getFormedPins() {
  return activeSpawnState().getDecisions().dishFormed;
}

/** Pairs of wings per pin (1 or 2) as of the last resolved frame: the NEXT frame's input carries it (the moth reads it). */
export function getLimbPairs() {
  return activeSpawnState().getDecisions().dishLimbs;
}

/**
 * #1634 slice 2 — which pin hosts the DISH creature (the second family): the FIRST formed pin, and only
 * that one (the MVP is one creature; the other formed pins host moths). Computed from the same states the
 * moth reads, so it rides the NEXT frame's input beside dishFormed and replays from the take like it.
 */
export function getDishHosted() {
  return activeSpawnState().getDecisions().dishHosted;
}

/**
 * #1634 slice 3 — each pin's dish pressure (the quantized density the formation rule judged it by), as
 * of the last resolved frame; 0 for an unformed pin. The dish creature's limb reads it on the next
 * frame's input, beside dishHosted: pressure decides whether a limb grows on the pin, and how much.
 */
export function getDishPressures() {
  return activeSpawnState().getDecisions().dishPressure;
}

/** Each formed pin's traits (Davis's shifts, made once at birth), as of the last resolved frame; null for an unformed pin. */
export function getPinTraits() {
  return activeSpawnState().getDecisions().dishTraits;
}

/** Start over (tests; and a take starts from fresh formation state, like the fresh resolver `rec` asks for). */
export function resetFormation() {
  activeSpawnState().resetFormationHalf();
}

/**
 * Observe one resolved frame (the formation half of the channel). Standalone driver for the suites and
 * any non-resolver caller: the live instrument no longer calls this — the resolver observes its own
 * frames. `getBand` is injectable for tests; live it is the stress tracker's band.
 */
export function observeFormation(input, output, getBand = () => getStressState().band) {
  return activeSpawnState().observeFormationOnly(input, output, getBand() ?? null);
}
