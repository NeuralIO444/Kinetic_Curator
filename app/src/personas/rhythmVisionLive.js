// personas/rhythmVisionLive.js — #2389 (Persona Kernel P9, spec §4 Q11): the rhythm section's eyes, wired.
//
// One look = the stage's exact current frame (the registered frame provider, the stage-description seam), a model
// copy capped like every MegaMind vision ask, one ask through the surface chat, one validated reading — or null.
// Gate: a LOCAL vision-badged record (surfaceRecord: a cloud badge enables nothing). No record, no frame, a slow or
// bad reply: null, silently — she simply did not look. This driver decides nothing about WHEN (the band's adapter
// asks at most once a phrase, rhythmVision.shouldLook) and records nothing itself (the adapter notes the reading).
import { SURFACE_TIMEOUT_MS, askSurfaceText, surfaceRecord } from '../curator/megamindVoice.mjs';
import { getStageFrameProvider, prepareImageCopy } from '../curator/megamindVisionLive.js';
import { RHYTHM_VISION_CONSUMER, buildLookRequest, parseLookReply, validateLook } from './rhythmVision.mjs';

/**
 * @returns look(): Promise<{ motion } | null>
 */
export function createRhythmEyes({
  fetchImpl = (...a) => globalThis.fetch(...a),
  getRecord = () => surfaceRecord(RHYTHM_VISION_CONSUMER),
  getFrame = () => {
    const p = getStageFrameProvider();
    return p ? p() : null;
  },
  prepareImage = prepareImageCopy,
} = {}) {
  /** Can she look at all right now? (a local vision-badged model is linked) */
  const canLook = () => {
    try {
      return !!getRecord();
    } catch {
      return false;
    }
  };
  const look = async () => {
    try {
      const rec = getRecord();
      if (!rec) return null;
      const frame = await getFrame();
      if (!frame || !frame.bytes || !frame.bytes.length) return null;
      const bytes = frame.bytes instanceof Uint8Array ? frame.bytes : new Uint8Array(frame.bytes);
      const sent = await prepareImage(bytes, frame.mime || 'image/png');
      const text = await askSurfaceText({
        fetchImpl,
        record: rec,
        messages: buildLookRequest({ imageBase64: sent.base64 }),
        timeoutMs: SURFACE_TIMEOUT_MS,
        numPredict: 60,
      });
      return validateLook(parseLookReply(text));
    } catch {
      return null;
    }
  };
  return { canLook, look };
}
