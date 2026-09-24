/**
 * useLoopCapture.js — #284 Loop Capture.
 *
 * Deterministic N-second take + seamless-loop export via tail-into-head
 * dissolve. One capture path serves every voice: frames come from the live
 * GL loop's own captureFrame() (real GPU pixels, ACCUM-aware — the same path
 * snapshots and the print desk use), so the take is exactly "what plays".
 * The dissolve happens BEFORE encoding, on a 2D canvas:
 *
 *   1. Pre-roll: record D dissolve-frames of live footage BEFORE the loop
 *      body. These are the dissolve source — they are never in the output
 *      as clean frames.
 *   2. Body: T-D frames drawn straight to the output canvas (being recorded).
 *   3. Tail: D frames where each output frame is the live frame blended
 *      with pre-roll frame j at alpha (j+1)/D.
 *
 * The output's last frame is pre-roll[D-1] at full alpha; the loop then
 * restarts at body frame 0. Pre-roll[D-1] and body[0] are CONSECUTIVE
 * recorded frames (the pre-roll directly precedes the body in time), so the
 * loop point is exact by construction — no jump, no rewind, no decoder.
 *
 * Why captureFrame() and not drawImage(liveCanvas): the live canvas is
 * preserveDrawingBuffer:false, so a 2D drawImage of it can read back a
 * cleared buffer. captureFrame() resolves the persistent ACCUM/offscreen
 * targets and readPixels — always real pixels, rAF-independent.
 *
 * Honest limits: the take is fixed-length and fixed-fps, but the underlying
 * sim runs on the live clock (Date.now drives the noise field), so two
 * captures of the same seed are not bit-identical — the LENGTH and the
 * SEAM are deterministic, the pixels are a performance. Audio-reactive
 * voices capture "what plays", same as REC. The recorder runs in real
 * time: on hardware that renders below the capture fps (e.g. software GL,
 * where a frame can take ~1s) the take stretches with the wall clock — the
 * video is never truncated, but it is only exactly N seconds when the
 * machine keeps up. The e2e asserts the strict length on capable hardware
 * and recorder honesty (never longer than the take) everywhere else.
 */

export const LOOP_CAPTURE_FPS = 30;
export const LOOP_CAPTURE_DISSOLVE_SECONDS = 1;
export const LOOP_CAPTURE_LENGTHS = [2, 4, 8]; // seconds, the UI segmented control
/** Live render size — capture at the canvas's own resolution (no upscale). */
export const LOOP_CAPTURE_WIDTH = 1000;
export const LOOP_CAPTURE_HEIGHT = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pure frame plan for a loop capture. Exported for the selfcheck.
 * Invariants: bodyFrames >= 1, dissolveFrames <= totalFrames / 2,
 * totalFrames === bodyFrames + dissolveFrames.
 */
export function planLoopFrames({ seconds = 4, fps = LOOP_CAPTURE_FPS, dissolveSeconds = LOOP_CAPTURE_DISSOLVE_SECONDS } = {}) {
  const safeFps = Math.max(1, Math.round(fps) || LOOP_CAPTURE_FPS);
  const totalFrames = Math.max(2, Math.round((seconds || 4) * safeFps));
  const dissolveFrames = Math.max(
    1,
    Math.min(Math.round((dissolveSeconds || 0) * safeFps), Math.floor(totalFrames / 2)),
  );
  return {
    fps: safeFps,
    totalFrames,
    dissolveFrames,
    bodyFrames: totalFrames - dissolveFrames,
  };
}

/** Dissolve alpha for tail frame j (0-based) — ramps (0, 1], ending fully on the head. */
export function dissolveAlpha(j, dissolveFrames) {
  return Math.min(1, Math.max(0, (j + 1) / Math.max(1, dissolveFrames)));
}

/** Copy loop.captureFrame() pixels into a 2D canvas of the capture size. */
function frameToCanvas(frame) {
  const c = document.createElement('canvas');
  c.width = frame.width;
  c.height = frame.height;
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height),
    0,
    0,
  );
  return c;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function makeRecorder(stream) {
  try {
    return new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8_000_000 });
  } catch {
    return new MediaRecorder(stream, { mimeType: 'video/webm' });
  }
}

/**
 * Grab one live frame through the loop's own pixel path. A bake can start
 * mid-take (e.g. the performer tweaks something); wait for it once instead
 * of failing the whole capture.
 */
async function grabFrame(loop) {
  try {
    return await loop.captureFrame({ width: LOOP_CAPTURE_WIDTH, height: LOOP_CAPTURE_HEIGHT });
  } catch (e) {
    if (/baking/i.test(e && e.message ? e.message : '')) {
      await loop.waitForReady(15000);
      return await loop.captureFrame({ width: LOOP_CAPTURE_WIDTH, height: LOOP_CAPTURE_HEIGHT });
    }
    throw e;
  }
}

/**
 * Capture a seamless N-second loop from the live instrument.
 *
 * @param {object} opts
 * @param {object} opts.loopRef ref holding the live GL loop (from CanvasPanel)
 * @param {number} opts.seconds output loop length
 * @param {number} opts.fps capture frame rate
 * @param {number} opts.dissolveSeconds tail-into-head dissolve length
 * @param {string} opts.seedStr seed tag for the filename
 * @param {(p:{phase:string,done:number,total:number})=>void} opts.onProgress
 * @param {()=>boolean} opts.shouldCancel
 * @param {boolean} opts.downloadFile
 * @returns {Promise<{blob: Blob|null, cancelled: boolean}>}
 */
export async function captureLoop({
  loopRef,
  seconds = 4,
  fps = LOOP_CAPTURE_FPS,
  dissolveSeconds = LOOP_CAPTURE_DISSOLVE_SECONDS,
  seedStr = '',
  onProgress,
  shouldCancel,
  downloadFile = true,
} = {}) {
  const loop = loopRef && loopRef.current;
  if (!loop) {
    throw new Error('[loop] live GL loop is not running yet');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('[loop] MediaRecorder unavailable in this browser');
  }
  const { dissolveFrames, bodyFrames } = planLoopFrames({ seconds, fps, dissolveSeconds });
  const frameMs = 1000 / fps;
  const cancelled = () => !!(shouldCancel && shouldCancel());

  // Settle the atlas bake before the first frame so the take never starts
  // on a "textures baking" error.
  await loop.waitForReady(30000);
  if (cancelled()) return { blob: null, cancelled: true };

  // Phase 1 — pre-roll: the dissolve source, D frames before the loop body.
  const preRoll = [];
  for (let j = 0; j < dissolveFrames; j++) {
    if (cancelled()) return { blob: null, cancelled: true };
    preRoll.push(frameToCanvas(await grabFrame(loop)));
    if (onProgress) onProgress({ phase: 'preroll', done: j + 1, total: dissolveFrames });
    await sleep(frameMs);
  }

  // Output canvas + the existing VP9 WebM recorder path.
  const out = document.createElement('canvas');
  out.width = LOOP_CAPTURE_WIDTH;
  out.height = LOOP_CAPTURE_HEIGHT;
  const octx = out.getContext('2d');
  const stream = out.captureStream(fps);
  let rec;
  try {
    rec = makeRecorder(stream);
  } catch (e) {
    stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    throw new Error(`[loop] recorder failed: ${e && e.message ? e.message : e}`, { cause: e });
  }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve, reject) => {
    rec.onstop = resolve;
    rec.onerror = (e) => reject((e && e.error) || new Error('[loop] recorder error'));
  });

  const drawLive = async () => {
    const frame = await grabFrame(loop);
    octx.globalAlpha = 1;
    octx.putImageData(
      new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height),
      0,
      0,
    );
  };

  let failed = null;
  try {
    rec.start(250);
    // Phase 2 — body: straight frames.
    for (let i = 0; i < bodyFrames; i++) {
      if (cancelled()) break;
      await drawLive();
      if (onProgress) onProgress({ phase: 'body', done: i + 1, total: bodyFrames });
      await sleep(frameMs);
    }
    // Phase 3 — tail: dissolve into the pre-roll (the head).
    if (!cancelled()) {
      for (let j = 0; j < dissolveFrames; j++) {
        if (cancelled()) break;
        await drawLive();
        octx.globalAlpha = dissolveAlpha(j, dissolveFrames);
        octx.drawImage(preRoll[j], 0, 0);
        octx.globalAlpha = 1;
        if (onProgress) onProgress({ phase: 'tail', done: j + 1, total: dissolveFrames });
        await sleep(frameMs);
      }
    }
  } catch (e) {
    failed = e;
  }
  try { if (rec.state !== 'inactive') rec.stop(); } catch { /* noop */ }
  try { await stopped; } catch (e) { if (!failed) failed = e; }
  stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });

  if (failed) throw failed;
  if (cancelled()) return { blob: null, cancelled: true };

  const blob = new Blob(chunks, { type: 'video/webm' });
  if (!blob.size) throw new Error('[loop] recorder produced no data');
  if (downloadFile) download(blob, `kinetic-curator-loop-${seedStr || 'rec'}-${seconds}s.webm`);
  return { blob, cancelled: false };
}
