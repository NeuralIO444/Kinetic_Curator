// StageView.jsx — #607 STAGE Phase B, stage-window side.
//
// This is the ENTIRE UI of the stage window (`?stage=1`): one fullscreen
// black canvas fed by the instrument window's mirror over BroadcastChannel.
// No store, no panels, no instrument chrome — the stage shows the signal,
// the test pattern, black, or an honest NO SIGNAL splash. Nothing else.

import { useEffect, useRef } from 'react';
import {
  STAGE_FRAME_CHANNEL, STAGE_CONTROL_CHANNEL, STAGE_HEARTBEAT_TIMEOUT_MS,
  isControlMessage, isFrameMessage, isCloseMessage,
} from './stageChannel.mjs';
import { computeStageRect, sanitizeStageMapping } from './stageMapping.mjs';
import { testPatternLayout } from './stageTestPattern.mjs';

const NO_SIGNAL_MS = 2500;

function drawSplash(ctx, W, H, title, sub) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = Math.max(14, Math.min(28, W / 48));
  ctx.font = `600 ${s}px system-ui, sans-serif`;
  ctx.fillText(title, W / 2, H / 2 - s * 0.8);
  if (sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `400 ${Math.round(s * 0.62)}px system-ui, sans-serif`;
    ctx.fillText(sub, W / 2, H / 2 + s * 0.6);
  }
}

function drawTestPattern(ctx, W, H, control) {
  const { bars, strip } = testPatternLayout(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  for (const b of bars) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  for (const s of strip) {
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  // Center crosshair.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, W / 960);
  const cx = W / 2;
  const cy = Math.floor(H * 0.335);
  const arm = Math.min(W, H) / 12;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, arm / 3, 0, Math.PI * 2);
  ctx.stroke();
  // Label: display + mapping.
  const s = Math.max(13, Math.min(24, W / 64));
  ctx.font = `600 ${s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const label = `${control.displayName || 'KC STAGE'} · ${sanitizeStageMapping(control.mapping).toUpperCase()}`;
  ctx.fillText(label, W / 2, H - s * 0.9);
}

export function StageView() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let bitmap = null;
    let bw = 0;
    let bh = 0;
    let lastFrameAt = 0;
    let lastControlAt = Date.now();
    let dead = false;
    const control = { blackout: false, testPattern: false, mapping: 'fit', displayName: '' };

    const draw = () => {
      if (dead) return;
      const W = canvas.width;
      const H = canvas.height;
      if (control.blackout) {
        // Blackout wins over everything — instant, and recovery never
        // re-creates the window.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        return;
      }
      if (control.testPattern) {
        drawTestPattern(ctx, W, H, control);
        return;
      }
      if (bitmap) {
        if (Date.now() - lastFrameAt > 5000) {
          drawSplash(ctx, W, H, 'KC STAGE — SIGNAL STALE',
            'the instrument stopped sending frames');
          return;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const r = computeStageRect(bw, bh, W, H, control.mapping);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        try {
          ctx.drawImage(bitmap, r.dx, r.dy, r.dw, r.dh);
        } catch { /* bitmap neutered mid-draw — next frame recovers */ }
        return;
      }
      drawSplash(ctx, W, H, 'KC STAGE — NO SIGNAL',
        Date.now() - lastControlAt > NO_SIGNAL_MS
          ? 'waiting for the instrument window…'
          : 'linking…');
    };

    const fit = () => {
      canvas.width = Math.max(1, window.innerWidth);
      canvas.height = Math.max(1, window.innerHeight);
      draw();
    };
    fit();
    window.addEventListener('resize', fit);

    let bcFrames = null;
    let bcControl = null;
    try {
      bcFrames = new BroadcastChannel(STAGE_FRAME_CHANNEL);
      bcControl = new BroadcastChannel(STAGE_CONTROL_CHANNEL);
    } catch {
      drawSplash(ctx, canvas.width, canvas.height, 'KC STAGE — NO CHANNEL',
        'BroadcastChannel unavailable in this runtime');
      return () => window.removeEventListener('resize', fit);
    }

    const kill = (title, sub) => {
      if (dead) return;
      dead = true;
      drawSplash(ctx, canvas.width, canvas.height, title, sub);
      try { bitmap && bitmap.close(); } catch { /* noop */ }
      bitmap = null;
      window.setTimeout(() => { try { window.close(); } catch { /* noop */ } }, 2500);
    };

    bcFrames.onmessage = (ev) => {
      const m = ev && ev.data;
      if (!isFrameMessage(m)) return;
      try { bitmap && bitmap.close(); } catch { /* noop */ }
      bitmap = m.bitmap;
      bw = m.width;
      bh = m.height;
      lastFrameAt = Date.now();
      draw();
    };
    bcControl.onmessage = (ev) => {
      const m = ev && ev.data;
      if (isCloseMessage(m)) {
        kill('KC STAGE — CLOSED', 'the instrument closed the stage');
        return;
      }
      if (!isControlMessage(m)) return;
      lastControlAt = Date.now();
      control.blackout = m.blackout;
      control.testPattern = m.testPattern;
      control.mapping = sanitizeStageMapping(m.mapping);
      control.displayName = m.displayName;
      draw();
    };

    // Fails out loud, both directions: if the instrument window dies or
    // hangs up, the stage says so and closes itself — no zombie window.
    const heartbeat = window.setInterval(() => {
      if (dead) return;
      if (Date.now() - lastControlAt > STAGE_HEARTBEAT_TIMEOUT_MS) {
        kill('KC STAGE — MAIN WINDOW GONE', 'no heartbeat for 10s — closing');
      }
    }, 1000);

    // Keep the cursor out of the signal.
    const hideCursor = () => { canvas.style.cursor = 'none'; };
    hideCursor();

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('resize', fit);
      try { bcFrames && bcFrames.close(); } catch { /* noop */ }
      try { bcControl && bcControl.close(); } catch { /* noop */ }
      try { bitmap && bitmap.close(); } catch { /* noop */ }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        background: '#000', display: 'block',
      }}
    />
  );
}
