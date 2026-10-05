// stageMirror.js — #607 STAGE Phase B, instrument-window side.
//
// Ships the live frame to the stage window over BroadcastChannel at up to
// STAGE_MIRROR_FPS. Frames come from the loop's grabPresentedFrame() — a
// readback of the already-composited target, NOT a second scene render —
// so the mirror costs one readPixels per stage frame. Control state
// (blackout / test pattern / mapping) rides the control channel; the stage
// applies it locally, so blackout is instant and never re-creates the window.
//
// Everything here is best-effort and silent-safe: the mirror must never
// break the instrument. Loud failures (no loop, worker loop, no channel)
// are reported by the caller (useStageOutput → stageError), not thrown here.

import {
  STAGE_FRAME_CHANNEL, STAGE_CONTROL_CHANNEL, STAGE_MIRROR_FPS,
  makeControlMessage,
} from './stageChannel.mjs';

let timer = 0;
let bcFrames = null;
let bcControl = null;
let lastSentN = -1;
let lastControlJson = '';
let active = false;

export function isStageMirrorActive() {
  return active;
}

function closeChannels() {
  try { bcFrames && bcFrames.close(); } catch { /* already gone */ }
  try { bcControl && bcControl.close(); } catch { /* already gone */ }
  bcFrames = null;
  bcControl = null;
}

/**
 * @param {object} opts
 * @param {() => object|null} opts.getLoop — the live GL loop (glLoopRef.current)
 * @param {() => object} opts.getControl — {blackout, testPattern, mapping, displayName}
 * @returns {{ok:boolean, reason?:string}}
 */
export function startStageMirror({ getLoop, getControl } = {}) {
  stopStageMirror();
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') {
    return { ok: false, reason: 'BroadcastChannel is unavailable in this runtime' };
  }
  if (typeof window.createImageBitmap === 'undefined') {
    return { ok: false, reason: 'createImageBitmap is unavailable in this runtime' };
  }
  bcFrames = new window.BroadcastChannel(STAGE_FRAME_CHANNEL);
  bcControl = new window.BroadcastChannel(STAGE_CONTROL_CHANNEL);
  active = true;

  const pushControl = () => {
    try {
      const msg = makeControlMessage(getControl ? getControl() : {});
      const json = JSON.stringify(msg);
      if (json !== lastControlJson) {
        lastControlJson = json;
        bcControl.postMessage(msg);
      }
    } catch { /* channel gone — the watch will notice */ }
  };
  pushControl(); // the stage needs control state before its first frame

  const intervalMs = Math.max(16, Math.round(1000 / STAGE_MIRROR_FPS));
  timer = window.setInterval(() => {
    try {
      pushControl(); // doubles as the heartbeat the stage watches
      if (typeof document !== 'undefined' && document.hidden) return;
      const loop = getLoop ? getLoop() : null;
      const grab = loop && typeof loop.grabPresentedFrame === 'function'
        ? loop.grabPresentedFrame()
        : null;
      if (!grab || grab.n === lastSentN) return; // paused / nothing new
      lastSentN = grab.n;
      const { width, height, pixels } = grab;
      if (!width || !height || !pixels) return;
      const view = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length);
      const imageData = new ImageData(view, width, height);
      window.createImageBitmap(imageData).then((bitmap) => {
        try {
          bcFrames.postMessage({ type: 'frame', width, height, bitmap }, [bitmap]);
        } catch { /* stage closed mid-post */ }
      }, () => { /* bitmap creation failed — skip the frame */ });
    } catch { /* never break the instrument for the mirror */ }
  }, intervalMs);
  return { ok: true };
}

export function stopStageMirror() {
  active = false;
  if (timer) {
    try { clearInterval(timer); } catch { /* noop */ }
    timer = 0;
  }
  closeChannels();
  lastSentN = -1;
  lastControlJson = '';
}
