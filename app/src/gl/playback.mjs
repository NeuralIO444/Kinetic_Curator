// playback.mjs — #1461 step 2: play a recorded take back through the live instrument.
//
// A take is the resolver's input sequence (performanceFile.mjs). The resolver is a pure function of it, so playing a
// take back is: hand the SAME inputs to the loop's resolver, one per frame. This module holds the take and the cursor;
// resolveTap.withResolveTap asks it to substitute the live frame's input (the seam: no change to the one-writer
// liveLoop), and the canvas panel overlays the recorded scene (layers, palette, params) on the store view the loop reads.
//
//   - one recorded frame per RESOLVED frame; the live loop's own pause (slowRender) holds the cursor and the picture
//   - seek(frame): a FRESH resolver, then the frames before the target are resolved without presenting (the resolver
//     carries swarm and feed state, so there is no shortcut: a checkpoint is a hash, not a snapshot)
//   - the personas are muted while it plays: App's frame tap is skipped (isPlaybackActive), and the recorded decisions
//     (homes, formed, limbs, traits, scaleMul) ride the recorded inputs exactly as they did live
import { replayInputs } from '../engine/kernel/replay/inputLog.js';
import { checkPerformance } from './performanceFile.mjs';
import { checkRouteRecord, routesAt } from './routeRecord.mjs';

/** The scene-defining fields of a recorded input that the loop's store view takes from the take while it plays. */
export const SCENE_KEYS = Object.freeze([
  'layers',
  'activeLayerId',
  'layerSnapshots',
  'seed',
  'seedOffsets',
  'paletteId',
  'paletteOverrides',
  'userPalettes',
  'layoutParams',
  'customAssets',
  'enabledAssets',
  'assetWeightOverrides',
  'assetAttach',
  'caGrid',
  'attractor',
  'dishPins',
  'lockedParams',
  'canvasW',
  'canvasH',
]);

let active = null; // { perf, frames, index, ended, pendingSeek, routes }
let frameTap = null;
/**
 * #1462 — observe each PLAYED frame: fn(frame, perf, { seeked }). Called once per frame the cursor plays (not while
 * held). The app uses it to re-publish the take's recorded persona decisions. One listener (or null); a throwing
 * listener is dropped.
 */
export function setPlaybackFrameTap(fn) {
  frameTap = typeof fn === 'function' ? fn : null;
}
const listeners = new Set();
const notify = () => {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must not break the loop */
    }
  }
};

/** Load a take and start from frame 0. Returns false for anything that is not a valid performance. */
export function startPlayback(perf) {
  let p;
  try {
    p = checkPerformance(perf);
  } catch {
    return false;
  }
  const frames = [];
  for (const input of replayInputs(p.inputs)) frames.push(input);
  if (frames.length !== p.frames) return false;
  // #1483 follow-up: a take that carries its route table plays through it (routeRecord.mjs); an older take, or a
  // malformed section, plays through the live table as before
  const routes = checkRouteRecord(p.routes);
  active = { perf: p, frames, index: 0, ended: false, pendingSeek: 0, routes };
  notify();
  return true;
}

/** Leave playback: the live instrument is back on the next frame. */
export function stopPlayback() {
  if (!active) return;
  active = null;
  notify();
}

export function isPlaybackActive() {
  return active !== null;
}

/** { frame, total, ended, perf } or null. */
export function getPlayback() {
  return active ? { frame: active.index, total: active.frames.length, ended: active.ended, perf: active.perf } : null;
}

/** Jump to a frame: a fresh resolver replays up to it on the next resolve (no presenting). */
export function seekPlayback(frame) {
  if (!active) return false;
  const f = Math.max(0, Math.min(active.frames.length - 1, Math.floor(Number(frame) || 0)));
  active.pendingSeek = f;
  active.index = f;
  active.ended = false;
  notify();
  return true;
}

export function subscribePlayback(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The seam. Called by the resolver wrapper with the loop's LIVE input. Returns null when not playing, else
 * { input, rewindTo, catchUp } : the input to resolve now, and (after a seek) the fresh-resolver catch-up frames.
 */
export function playbackStep(liveInput) {
  if (!active) return null;
  const a = active;
  let catchUp = null;
  let rewind = false;
  if (a.pendingSeek !== null) {
    rewind = true;
    catchUp = a.frames.slice(0, a.pendingSeek);
    a.pendingSeek = null;
  }
  const held = !!(liveInput && liveInput.slowRender); // the loop's own pause / shed: hold the cursor and the picture
  const playedIndex = Math.min(a.index, a.frames.length - 1);
  const recorded = a.frames[playedIndex];
  if (!held && frameTap !== null) {
    try {
      frameTap(playedIndex, a.perf, { seeked: rewind });
    } catch {
      frameTap = null;
    }
  }
  const input = held ? { ...recorded, slowRender: true } : recorded;
  if (!held) {
    if (a.index < a.frames.length - 1) {
      a.index += 1;
    } else if (!a.ended) {
      a.ended = true;
      notify();
    }
  }
  return { input, rewind, catchUp };
}

/** The store view the loop reads, with the take's scene laid over it while it plays. Identity when not playing. */
export function overlayScene(state) {
  if (!active || !state) return state;
  const rec = active.frames[Math.min(active.index, active.frames.length - 1)];
  const out = { ...state };
  for (const k of SCENE_KEYS) if (rec[k] !== undefined) out[k] = rec[k];
  if (active.routes) out.audioRoutes = routesAt(active.routes, active.index); // the take's routes, not today's
  return out;
}
