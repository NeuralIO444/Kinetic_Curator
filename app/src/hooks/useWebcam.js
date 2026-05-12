// useWebcam — captures webcam frames and emits a normalized motion energy
// (0..1) via the onMotion callback. Motion energy = frame-difference luma
// per pixel, averaged and EMA-smoothed.

import { useEffect, useRef } from 'react';

const SAMPLE_W = 64;
const SAMPLE_H = 48;
const SMOOTHING = 0.4; // EMA factor on smoothed motion
// Dispatch throttle — analyze runs at rAF rate, but store updates land at
// ~15 Hz to avoid waking every store subscriber 60x/sec.
const DISPATCH_INTERVAL_MS = 66;
// Only dispatch if motion changed by more than this — kills idle re-renders
// when the camera is staring at a static scene.
const DISPATCH_THRESHOLD = 0.005;

export function useWebcam({ enabled, onMotion }) {
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const prevFrameRef = useRef(null);
  const smoothedRef = useRef(0);
  const lastDispatchRef = useRef(0);
  const lastReportedRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      videoRef.current = null;
      prevFrameRef.current = null;
      smoothedRef.current = 0;
      onMotion?.(0);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        videoRef.current = video;

        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_W;
        canvas.height = SAMPLE_H;
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const loop = () => {
          if (cancelled || !videoRef.current) return;
          ctx.drawImage(videoRef.current, 0, 0, SAMPLE_W, SAMPLE_H);
          const frame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
          const prev = prevFrameRef.current;
          if (prev) {
            let sum = 0;
            // Sample every 4th pixel (RGBA = 4 bytes each → step 16 across pixels)
            for (let i = 0; i < frame.length; i += 16) {
              const lumaCur = (frame[i] + frame[i + 1] + frame[i + 2]) * 0.333;
              const lumaPrev = (prev[i] + prev[i + 1] + prev[i + 2]) * 0.333;
              sum += Math.abs(lumaCur - lumaPrev);
            }
            const sampleCount = frame.length / 16;
            // 255 is per-channel max diff; normalize and clamp
            const raw = Math.min(1, sum / sampleCount / 80);
            smoothedRef.current = SMOOTHING * raw + (1 - SMOOTHING) * smoothedRef.current;
            const now = performance.now();
            const v = smoothedRef.current;
            if (now - lastDispatchRef.current >= DISPATCH_INTERVAL_MS &&
                Math.abs(v - lastReportedRef.current) > DISPATCH_THRESHOLD) {
              lastDispatchRef.current = now;
              lastReportedRef.current = v;
              onMotion?.(v);
            }
          }
          prevFrameRef.current = frame;
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.warn('[useWebcam] camera access failed:', err.message);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      videoRef.current = null;
      prevFrameRef.current = null;
      smoothedRef.current = 0;
    };
  }, [enabled, onMotion]);
}
