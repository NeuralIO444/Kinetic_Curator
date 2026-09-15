// useAccumulationBuffer — HYPE BitmapCanvas-style trails (#28)
// Persistent offscreen canvas: each frame fade previous pixels, then composite live SVG.
// History lives in the pixel buffer only — export must read this canvas when ACCUM is on.

import { useEffect, useRef, useCallback } from 'react';
import { CANVAS_W, CANVAS_H } from './useCanvasViewport.js';

function serializeSvg(svgNode) {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgNode);
  if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
}

/**
 * @param {object} opts
 * @param {React.RefObject<SVGSVGElement>} opts.svgRef
 * @param {React.RefObject<HTMLCanvasElement>} opts.accumRef - display canvas
 * @param {boolean} opts.enabled
 * @param {number} opts.fade - 0–0.99 fraction of previous frame kept (higher = longer trails)
 * @param {string} [opts.background] - initial fill when buffer is cleared
 * @param {boolean} [opts.running]
 */
export function useAccumulationBuffer({
  svgRef,
  accumRef,
  enabled,
  fade = 0.88,
  background = '#000000',
  running = true,
}) {
  const bufRef = useRef(null); // offscreen working buffer
  const imgRef = useRef(null);
  const rafRef = useRef(null);
  const fadeRef = useRef(fade);
  const bgRef = useRef(background);
  // Live values for the rAF loop, updated after commit rather than during
  // render so the loop never re-subscribes on a slider drag.
  useEffect(() => {
    fadeRef.current = fade;
    bgRef.current = background;
  });

  const ensureBuffer = useCallback(() => {
    if (!bufRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      bufRef.current = c;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bgRef.current || '#000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    return bufRef.current;
  }, []);

  const clear = useCallback(() => {
    const buf = ensureBuffer();
    const ctx = buf.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgRef.current || '#000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const display = accumRef?.current;
    if (display) {
      const dctx = display.getContext('2d');
      dctx.clearRect(0, 0, display.width, display.height);
      dctx.drawImage(buf, 0, 0);
    }
  }, [ensureBuffer, accumRef]);

  // Reset buffer when toggled on
  useEffect(() => {
    if (enabled) clear();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    // Display canvas dimensions come from the JSX width/height attributes
    // in CanvasPanel; setting them here again only re-cleared it.

    let lastSerialize = 0;
    const SERIALIZE_MS = 48; // ~20fps composite is enough for trails

    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);
      if (!running) return;

      const svg = svgRef?.current;
      const disp = accumRef?.current;
      if (!svg || !disp) return;

      if (now - lastSerialize < SERIALIZE_MS && imgRef.current) {
        // still paint last img if we have one after fade
        return;
      }
      lastSerialize = now;

      const buf = ensureBuffer();
      const bctx = buf.getContext('2d');

      // Fade previous content toward transparent via destination-in alpha
      const keep = Math.max(0, Math.min(0.99, Number(fadeRef.current) || 0.88));
      bctx.save();
      bctx.globalCompositeOperation = 'destination-in';
      bctx.fillStyle = `rgba(0,0,0,${keep})`;
      bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      bctx.restore();

      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        bctx.globalCompositeOperation = 'source-over';
        bctx.globalAlpha = 1;
        bctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        const dctx = disp.getContext('2d');
        dctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        dctx.drawImage(buf, 0, 0);
      };
      img.src = serializeSvg(svg);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, running, svgRef, accumRef, ensureBuffer]);

  return { clear, bufferCanvas: bufRef };
}

/**
 * Rasterize accumulation buffer (or fall back) to PNG blob + download.
 */
export function exportAccumulationCanvas(canvas, resolution = 1, seedStr = '', background = null) {
  if (!canvas) return Promise.reject(new Error('no accumulation canvas'));
  const w = Math.round(canvas.width * resolution);
  const h = Math.round(canvas.height * resolution);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (!blob) {
        reject(new Error('toBlob null'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kinetic-curator-accum-${seedStr}-${resolution}x.png`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      // thumb
      const tw = Math.min(96, w);
      const th = Math.round((h / w) * tw);
      const tc = document.createElement('canvas');
      tc.width = tw;
      tc.height = th;
      tc.getContext('2d').drawImage(out, 0, 0, tw, th);
      const thumb = tc.toDataURL('image/jpeg', 0.72);
      resolve({ thumb, width: w, height: h, blob });
    }, 'image/png');
  });
}
