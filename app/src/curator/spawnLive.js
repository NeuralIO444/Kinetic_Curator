// curator/spawnLive.js — #1355: the live side of AUTO SPAWN.
//
// #1694 slice 1 — this module is now the FACADE over the resolver-owned spawn state (curator/spawnState.js),
// where the steady-homes logic lives (transcribed unchanged: a home is kept exactly where it was chosen
// until the DISH changes; while fewer homes stand than the artist asked for, it looks again every
// RETRY_FRAMES; a home whose creature has not formed within PATIENCE_FRAMES is given up and chosen again;
// every window is a count of frames, never a clock). The live instrument no longer calls observeSpawn —
// the resolver observes its own frames and the loop writes the homes to the store when they change —
// but the surface below stays for the suites and any non-resolver caller, driving the ACTIVE spawn state.
import { activeSpawnState } from './spawnState.js';

export { SPAWN_RETRY_FRAMES as RETRY_FRAMES, SPAWN_PATIENCE_FRAMES as PATIENCE_FRAMES } from './spawnState.js';

/** The standing homes, [{x, y}] (a copy, as the singleton's getter always handed out). */
export function getSpawnHomes() {
  return activeSpawnState().getDecisions().dishPins.map((p) => ({ ...p }));
}

/** Start over (a fresh document, tests). */
export function resetSpawn() {
  activeSpawnState().resetSpawnHalf();
}

/**
 * One resolved frame. `count` is the artist's number; `formed` the formation tracker's per-pin flags in the order of
 * the pins this frame's input carried (the homes we last published); `band` the stress band.
 * Returns the new homes [{x, y}] when they changed, else null.
 */
export function observeSpawn(input, output, { count = 0, formed = [], band = null } = {}) {
  return activeSpawnState().observeSpawnOnly(input, output, { count, formed, band });
}
