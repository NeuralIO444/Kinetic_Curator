// stageChannel.mjs — #607 STAGE Phase B.
// The two BroadcastChannels between the instrument window and the stage
// window, and the shape of every message on them. Pure: no DOM.
import { sanitizeStageMapping } from './stageMapping.mjs';

export const STAGE_FRAME_CHANNEL = 'kc-stage-frames';
export const STAGE_CONTROL_CHANNEL = 'kc-stage-control';

/** Mirror frame rate cap — the stage is a mirror, not a second render. */
export const STAGE_MIRROR_FPS = 30;

/** Heartbeat: the stage self-closes if the instrument goes quiet this long. */
export const STAGE_HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * Build a sanitized control message. The stage window applies it verbatim;
 * hostile shapes degrade to safe defaults (never throws).
 */
export function makeControlMessage(raw = {}) {
  return {
    type: 'control',
    blackout: !!raw.blackout,
    testPattern: !!raw.testPattern,
    mapping: sanitizeStageMapping(raw.mapping),
    displayName: typeof raw.displayName === 'string' ? raw.displayName.slice(0, 80) : '',
    at: Date.now(),
  };
}

/** Guard for inbound control messages. */
export function isControlMessage(m) {
  return !!m && typeof m === 'object' && m.type === 'control'
    && typeof m.blackout === 'boolean' && typeof m.testPattern === 'boolean';
}

/** Guard for inbound frame messages (the bitmap travels in the transfer list). */
export function isFrameMessage(m) {
  return !!m && typeof m === 'object' && m.type === 'frame'
    && Number.isFinite(m.width) && Number.isFinite(m.height) && !!m.bitmap;
}

/** The stage window listens for this to close itself on command. */
export function makeCloseMessage() {
  return { type: 'close', at: Date.now() };
}

export function isCloseMessage(m) {
  return !!m && typeof m === 'object' && m.type === 'close';
}
