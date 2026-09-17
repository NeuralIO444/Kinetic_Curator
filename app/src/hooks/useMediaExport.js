import { useEffect, useRef } from 'react';
import { exportAccumulationCanvas } from './useAccumulationBuffer.js';

// Serializes SVG to a data URI safely
function getSvgDataUri(svgNode) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgNode);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
}

function svgPixelSize(svgNode) {
  const vb = (svgNode.getAttribute('viewBox') || '').trim().split(/\s+/);
  const width = Number.parseFloat(vb[2]);
  const height = Number.parseFloat(vb[3]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  const rect = svgNode.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width) || 1000),
    height: Math.max(1, Math.round(rect.height) || 700),
  };
}

const THUMB_MAX = 96; // px, longest edge

function drawThumbnail(img, background) {
  const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
  const w = ratio >= 1 ? THUMB_MAX : Math.round(THUMB_MAX * ratio);
  const h = ratio >= 1 ? Math.round(THUMB_MAX / ratio) : THUMB_MAX;
  const tc = document.createElement('canvas');
  tc.width = w;
  tc.height = h;
  const tctx = tc.getContext('2d');
  if (background) {
    tctx.fillStyle = background;
    tctx.fillRect(0, 0, w, h);
  }
  tctx.drawImage(img, 0, 0, w, h);
  return tc.toDataURL('image/jpeg', 0.72);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  download(blob, filename);
}

function waitFrames(n = 2) {
  return new Promise((resolve) => {
    let left = n;
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * Rasterize live SVG to PNG. Returns a Promise that resolves with { thumb, width, height } or rejects.
 * When downloadFile=false, only returns canvas data URL (no download) for batch control.
 */
export function exportSnapshot(svgNode, resolution = 1, seedStr = '', background = null, onThumbnail = null, { downloadFile = true } = {}) {
  if (!svgNode) {
    console.warn('[exportSnapshot] no SVG node — nothing captured');
    return Promise.reject(new Error('no SVG node'));
  }

  const { width, height } = svgPixelSize(svgNode);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const ctx = canvas.getContext('2d');

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const thumb = drawThumbnail(img, background);
      onThumbnail?.(thumb);
      canvas.toBlob((blob) => {
        if (!blob) {
          console.warn('[exportSnapshot] canvas.toBlob returned null');
          reject(new Error('toBlob null'));
          return;
        }
        if (downloadFile) {
          download(blob, `kinetic-curator-${seedStr}-${resolution}x.png`);
        }
        resolve({ thumb, width: canvas.width, height: canvas.height, blob });
      }, 'image/png');
    };
    img.onerror = (e) => {
      console.warn('[exportSnapshot] SVG rasterization failed', e);
      reject(e);
    };
    img.src = getSvgDataUri(svgNode);
  });
}

/**
 * Deliberate final still (#24; #191 removed the uncapped flip).
 * Rasterizes the current live SVG — the export matches the live preview by
 * construction. Denser "uncapped" finals come from the GPU export path
 * (`studio.py render --uncapped`, app/src/gl/exportStill.mjs), which renders
 * offscreen at FINAL_CAPS without ever touching the live store.
 */
/**
 * Prefer the accumulation buffer when ACCUM is on (#28) — its trail history
 * lives in pixels on a separate canvas, not the SVG, so it needs its own
 * capture path rather than exportSnapshot's SVG serialization. Was
 * duplicated inline between addSnapshot and runRenderFinal in OutputPanel;
 * this is the one copy both call through now.
 */
export async function captureStill({ accumOn, accumRef, svgNode, resolution, seedStr, background, onThumbnail }) {
  if (accumOn && accumRef?.current) {
    const result = await exportAccumulationCanvas(accumRef.current, resolution, seedStr, background);
    onThumbnail?.(result.thumb);
    return result;
  }
  return exportSnapshot(svgNode, resolution, seedStr, background, onThumbnail);
}

export async function renderFinal({
  svgNode,
  resolution = 1,
  seedStr = '',
  background = null,
  onThumbnail,
  downloadFile = true,
}) {
  return exportSnapshot(svgNode, resolution, seedStr, background, onThumbnail, { downloadFile });
}

/**
 * Batch edition (#29; #191 removed the uncapped flip) — loop N seeds,
 * download PNG + JSON sidecar per frame. Seeds are applied to the live
 * store one at a time (batch navigation, not a flip); nothing else is
 * mutated, so there is nothing to stash or restore.
 *
 * @param {object} opts
 * @param {SVGSVGElement} opts.svgNode
 * @param {number} opts.count - number of editions (1–48)
 * @param {number} opts.startSeed - first seed (inclusive)
 * @param {number} opts.resolution
 * @param {string|null} opts.background
 * @param {(seed: number) => void} opts.setSeed - apply seed to live state
 * @param {() => object} opts.getSidecar - snapshot metadata for current frame
 * @param {(progress: { done: number, total: number, seed: number }) => void} [opts.onProgress]
 * @param {() => boolean} [opts.shouldCancel] - return true to abort
 */
export async function renderBatch({
  svgNode,
  count = 8,
  startSeed = 0,
  resolution = 1,
  background = null,
  setSeed,
  getSidecar,
  onProgress,
  shouldCancel,
}) {
  const n = Math.max(1, Math.min(48, Math.floor(Number(count) || 1)));
  const base = (Number(startSeed) >>> 0);
  const results = [];

  for (let i = 0; i < n; i++) {
    if (shouldCancel?.()) break;
    const seed = (base + i) >>> 0;
    setSeed(seed);
    await waitFrames(3);

    const seedStr = seed.toString(16).padStart(6, '0');
    const { blob, thumb, width, height } = await exportSnapshot(
      svgNode,
      resolution,
      seedStr,
      background,
      null,
      { downloadFile: false },
    );

    const basename = `kc-edition-${String(i + 1).padStart(3, '0')}-s${seedStr}`;
    download(blob, `${basename}.png`);

    const sidecar = {
      edition: i + 1,
      of: n,
      seed,
      seedHex: seedStr,
      resolution,
      width,
      height,
      ...(typeof getSidecar === 'function' ? getSidecar() : {}),
      timestamp: new Date().toISOString(),
    };
    downloadJson(sidecar, `${basename}.json`);

    results.push({ seed, thumb, width, height, sidecar });
    onProgress?.({ done: i + 1, total: n, seed, thumb });

    // Brief pause so browser can flush downloads without choking
    await new Promise((r) => setTimeout(r, 120));
  }

  return results;
}

export function useVideoRecorder({
  svgRef,
  isRecording,
  seedStr = '',
  fps = 15,
  serializeEvery = 2,
}) {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);
  const lastImgRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastImgRef.current = null;
      return;
    }

    const svgNode = svgRef.current;
    if (!svgNode) return;

    const { width, height } = svgPixelSize(svgNode);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(fps);
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      chunksRef.current = [];
      download(blob, `kinetic-curator-${seedStr}.webm`);
      mediaRecorderRef.current = null;
    };

    mediaRecorder.start();

    let lastTime = 0;
    let frameCounter = 0;
    const frameInterval = 1000 / fps;

    const drawFrame = (time) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
      rafRef.current = requestAnimationFrame(drawFrame);

      if (time - lastTime < frameInterval) return;
      lastTime = time;
      frameCounter++;

      const shouldSerialize = frameCounter % serializeEvery === 0 || !lastImgRef.current;

      if (shouldSerialize) {
        const img = new Image();
        img.onload = () => {
          lastImgRef.current = img;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        };
        img.src = getSvgDataUri(svgRef.current);
      } else if (lastImgRef.current) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(lastImgRef.current, 0, 0, width, height);
      }
    };

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastImgRef.current = null;
    };
  }, [isRecording, svgRef, seedStr, fps, serializeEvery]);
}
