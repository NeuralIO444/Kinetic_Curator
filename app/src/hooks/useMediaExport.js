/**
 * useMediaExport — stills, batch, and video capture against the live WebGL
 * loop (#224). Every pixel comes from the GPU (the loop's readback path),
 * so captures are what the live canvas actually shows — including ACCUM.
 *
 * The loop handle comes from AppContext's glLoopRef (set by CanvasPanel).
 */

import { useEffect, useRef } from 'react';

function loopOrThrow(loopRef) {
  const loop = loopRef?.current;
  if (!loop) throw new Error('[capture] live GL loop is not running yet');
  return loop;
}

// #270: iOS jetsam guard. A no-ACCUM still export allocates all seven
// frame targets at once (six RGBA16F + the RGBA8 resolve): w*h*8B*7 ≈
// 582MB at 4x (4000×2800) — uncomfortably close to the ~700MB budget that
// has jetsam-killed Safari tabs on older iPhones. Estimate BEFORE
// committing GPU memory and refuse with an honest message instead of
// crashing the tab. 1x/2x (~157MB) stay well under the budget.
// ACCUM-on captures read back the live-size feedback texture, so they
// never hit this path — the guard only runs the re-render branch below.
const EXPORT_TEXTURE_BUDGET_BYTES = 512 * 1024 * 1024; // mobile safety ceiling
const FRAME_TARGET_COUNT = 7; // layerT, scratchT, blendT, maskT, mainA, mainB, outT

export function estimateExportTextureBytes(width, height) {
  return Math.round(width) * Math.round(height) * 8 * FRAME_TARGET_COUNT;
}

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function guardExportMemory(width, height, resolution) {
  if (!isIOSDevice()) return; // desktop GPU budgets are far larger
  const bytes = estimateExportTextureBytes(width, height);
  if (bytes > EXPORT_TEXTURE_BUDGET_BYTES) {
    const mb = Math.round(bytes / (1024 * 1024));
    throw new Error(
      `[capture] ${resolution}× export refused on iOS: it would allocate ~${mb}MB of GPU textures at once, ` +
        `over the ${EXPORT_TEXTURE_BUDGET_BYTES / (1024 * 1024)}MB mobile safety budget ` +
        `(iOS jetsam kills Safari tabs near ~700MB). Use 2× on this device.`
    );
  }
}

function pixelsToCanvas(pixels, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
  return c;
}

function drawThumbnail(canvas) {
  const t = document.createElement('canvas');
  t.width = 160;
  t.height = Math.round((160 * canvas.height) / canvas.width) || 112;
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
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

/**
 * Capture one still from the live GL loop at the requested resolution
 * multiple of the 1000×700 scene (1x/2x/4x). Returns { blob, thumb, width,
 * height }. With ACCUM on, the captured frame is the live feedback image.
 */
export async function captureStill({ loopRef, resolution = 1, seedStr = '', onThumbnail, downloadFile = true }) {
  const loop = loopOrThrow(loopRef);
  // The atlas bake can still be in flight (print desk opens right after
  // boot): wait for resources instead of throwing like captureFrame does.
  await loop.waitForReady();
  const width = Math.round(1000 * resolution);
  const height = Math.round(700 * resolution);
  // #270: refuse the export before any GPU allocation on iOS if it would
  // exceed the mobile texture budget. PrintDeskModal surfaces e.message.
  guardExportMemory(width, height, resolution);
  const { pixels, width: pw, height: ph } = loop.captureFrame({ width, height });
  const canvas = pixelsToCanvas(pixels, pw, ph);
  const thumb = drawThumbnail(canvas);
  if (onThumbnail) onThumbnail(thumb);
  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('still encode failed'))), 'image/png'));
  if (downloadFile) download(blob, `kinetic-curator-${seedStr}-${resolution}x.png`);
  return { blob, thumb, width: pw, height: ph };
}

/**
 * Final render — same capture path as snapshots (one instrument).
 */
export async function renderFinal(opts) {
  return captureStill({ downloadFile: true, ...opts });
}

/**
 * Batch edition: for each seed, settle the loop (seed change -> placements
 * -> atlas rebake -> rendered frames), capture, download PNG + sidecar.
 */
export async function renderBatch({
  loopRef, count, startSeed, resolution, setSeed, getSidecar, onProgress, shouldCancel,
}) {
  const total = Math.max(1, Math.min(99, count || 1));
  for (let i = 0; i < total; i++) {
    if (shouldCancel && shouldCancel()) return { cancelled: true, done: i };
    const seed = (startSeed + i) >>> 0;
    const seedStr = seed.toString(16).padStart(8, '0');
    if (onProgress) onProgress({ done: i + 1, total, seed });
    setSeed(seed);
    // Let the loop settle: placements rebuild, atlas rebakes if the combos
    // changed, and at least two frames render before capture.
    await loopOrThrow(loopRef).waitForSettled();
    if (shouldCancel && shouldCancel()) return { cancelled: true, done: i };
    const { blob, thumb } = await captureStill({
      loopRef, resolution, seedStr, downloadFile: false,
    });
    if (onProgress) onProgress({ done: i + 1, total, seed, thumb });
    const basename = `kc-edition-${seedStr}-${resolution}x`;
    download(blob, `${basename}.png`);
    const sidecar = getSidecar ? getSidecar(seed) : null;
    if (sidecar) {
      download(new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' }), `${basename}.json`);
    }
  }
  return { cancelled: false, done: total };
}

/**
 * Record the visible GL canvas to WEBM via captureStream. Because the live
 * canvas IS the WebGL output, this records exactly what plays — ACCUM
 * included (the old path couldn't record the accum buffer at all).
 */
export function useVideoRecorder({ canvasRef, isRecording, seedStr, fps = 15, onDone, onError }) {
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (!isRecording) {
      // Stop path: finalize the current recording, if any.
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          chunksRef.current = [];
          recRef.current = null;
          download(blob, `kinetic-curator-${seedStr || 'rec'}.webm`);
          if (onDone) onDone(blob);
        };
        try { rec.stop(); } catch (e) { if (onError) onError(e); }
      }
      return;
    }
    const canvas = canvasRef?.current;
    if (!canvas) {
      if (onError) onError(new Error('live canvas not ready'));
      return;
    }
    let stream;
    try {
      stream = canvas.captureStream(fps);
    } catch (e) {
      if (onError) onError(e);
      return;
    }
    chunksRef.current = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8_000_000 });
    } catch {
      try {
        rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      } catch (e) {
        if (onError) onError(e);
        return;
      }
    }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onerror = (e) => { if (onError) onError(e.error || new Error('recorder error')); };
    recRef.current = rec;
    try { rec.start(250); } catch (e) { if (onError) onError(e); }
    return () => {
      // Unmount while recording: stop tracks, leave the blob to the stop path.
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    };
  }, [isRecording, canvasRef, seedStr, fps, onDone, onError]);
}
