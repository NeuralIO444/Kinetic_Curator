import { useEffect, useRef } from 'react';

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
  // jpeg: thumbnails don't need the PNG's lossless/alpha guarantee, and
  // compress far smaller — the strip keeps many of these in memory at once.
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
  // Revoking synchronously can cancel the download in Safari/Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * @param {SVGSVGElement} svgNode
 * @param {number} resolution
 * @param {string} seedStr
 * @param {string|null} background - paint behind the art (null = transparent PNG)
 * @param {(dataUrl: string) => void} [onThumbnail] - called with a small jpeg
 *   data URL once the capture succeeds, so callers can attach it to a
 *   history record.
 */
export function exportSnapshot(svgNode, resolution = 1, seedStr = '', background = null, onThumbnail = null) {
  if (!svgNode) {
    console.warn('[exportSnapshot] no SVG node — nothing captured');
    return;
  }

  const { width, height } = svgPixelSize(svgNode);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * resolution);
  canvas.height = Math.round(height * resolution);
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.onload = () => {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        console.warn('[exportSnapshot] canvas.toBlob returned null');
        return;
      }
      download(blob, `kinetic-curator-${seedStr}-${resolution}x.png`);
    }, 'image/png');
    onThumbnail?.(drawThumbnail(img, background));
  };
  img.onerror = (e) => console.warn('[exportSnapshot] SVG rasterization failed', e);
  img.src = getSvgDataUri(svgNode);
}

/**
 * Video recorder with throttled SVG serialization.
 * Re-serializing the full SVG every frame is extremely expensive.
 * We only re-serialize every `serializeEvery` frames and reuse the
 * last successful bitmap for intermediate frames (draft quality).
 * Default fps lowered to 15 for smoother live performance while recording.
 */
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
        // Reuse last successful frame bitmap — keeps stream smooth without full serialize
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
