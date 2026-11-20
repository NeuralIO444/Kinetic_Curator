// personas/rhythmVision.mjs — #2389 (Persona Kernel P9, spec §4 Q11): the rhythm section's eyes, pure.
//
// The named, narrow exception to "vision verdicts steer nothing" (#1527): she may look at the frame through a LOCAL
// vision-badged model (MegaMind, house Ollama), and a reading may move ONLY her timing sway on the band
// (the M10 lean, hosted by the Director) — never a turn, a seat, a verdict, a selection or the stage. Laws held here:
//   - At most once a phrase, never per frame: shouldLook() is the cadence; queen.knobs.vision.everyPhrases sets it,
//     and null (unruled, as shipped) means she does not look at all.
//   - One coarse reading, fixed schema: { motion: still | flowing | busy }. A malformed, drifted or CJK reply is
//     discarded (no reading), never guessed.
//   - Every reading is RECORDED (personas/rhythmRecord.mjs, the take's band.rhythm.looks) so replay needs no model.
//   - No vision-badged local model linked = she doesn't look (the live driver's gate; a cloud record enables nothing).
// Nothing here names her: the prompt speaks of a frame and its motion, nothing else.
import { hasCjk, parseJsonText } from '../curator/megamindVoice.mjs';
import { RHYTHM_MOTIONS } from './rhythmRecord.mjs';

/** The capability her eyes need: the vision badge on a local record (the registry's existing `stage.describe` gate). */
export const RHYTHM_VISION_CONSUMER = 'stage.describe';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Should she look at this phrase? Pure. Never when unruled (everyPhrases null), never twice in a phrase, never while
 * a look is still out, and never before `everyPhrases` phrases have passed since the last look.
 */
export function shouldLook({ phrase, lastLookPhrase = null, everyPhrases = null, inFlight = false } = {}) {
  if (!Number.isInteger(everyPhrases) || everyPhrases < 1) return false;
  if (!Number.isInteger(phrase) || phrase < 0 || inFlight) return false;
  if (lastLookPhrase === null) return true;
  return phrase > lastLookPhrase && phrase - lastLookPhrase >= everyPhrases;
}

const SYSTEM = [
  'You read the motion of ONE frame from a generative visual instrument: how much the picture appears to be moving.',
  'Answer with exactly one JSON object and nothing else — no prose around it, no reasoning. Answer in English only, every word; never answer in Chinese, Japanese or Korean.',
].join('\n');

/** The ask: the frame (one base64 image) and the fixed one-word schema. */
export function buildLookRequest({ imageBase64 } = {}) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        'Read this frame and answer {"motion": "still"|"flowing"|"busy"}. "still": the marks look settled, little is moving. "flowing": steady, even movement. "busy": crowded, fast, restless movement.',
      images: [imageBase64],
    },
  ];
}

/** One reply as a clean reading { motion }, or null (shape, vocabulary, language). */
export function validateLook(raw) {
  if (!isObj(raw)) return null;
  if (hasCjk(JSON.stringify(raw))) return null;
  if (!RHYTHM_MOTIONS.includes(raw.motion)) return null;
  return { motion: raw.motion };
}

/** Parse a reply's text (json-object mode). */
export const parseLookReply = (text) => parseJsonText(typeof text === 'string' ? text : '');
