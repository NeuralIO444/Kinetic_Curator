// ─────────────────────────────────────────────────────────────
// MapCanvas.jsx — small generative canvas driven by the 4 mapped
// audio values. Vibe over fidelity: flowing particles, a breathing
// blob, drifting hue. Reads targets from a ref each frame so React
// never re-renders the animation loop.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

const COUNT = 260;

export default function MapCanvas({ targetsRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let parts = [];

    const seed = () => {
      parts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        a: Math.random() * Math.PI * 2,
        s: 0.4 + Math.random() * 1.2,
        r: 0.8 + Math.random() * 2.2,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(50, rect.width);
      h = Math.max(50, rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const frame = () => {
      t += 1 / 60;
      const T = targetsRef.current || {};
      const pulse = T.pulse ?? 0.15;
      const sway = T.sway ?? 0.15;
      const glow = T.glow ?? 0.15;
      const hue = T.hue ?? 0.15;
      const speed = T.speed ?? 0.15;
      const breath = T.breath ?? 0.15;

      // Background: near-black, breathing lightness.
      const bgL = 3 + breath * 7;
      ctx.fillStyle = `hsl(230, 30%, ${bgL}%)`;
      ctx.fillRect(0, 0, w, h);

      // The creature: a blob whose radius breathes with `pulse`.
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.16;
      const blobR = baseR * (1 + pulse * 1.6 + 0.06 * Math.sin(t * 1.7));
      const hueBase = 265 + hue * 140; // violet → cyan → green drift
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, blobR * 2.2);
      grad.addColorStop(0, `hsla(${hueBase}, 85%, ${28 + glow * 40}%, ${0.5 + glow * 0.4})`);
      grad.addColorStop(1, 'hsla(230, 60%, 8%, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, blobR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Particles: curl-ish flow field, wobbled by `sway`, sped by `speed`.
      const swayA = sway * 2.2;
      const spd = 0.25 + speed * 3.2;
      for (const p of parts) {
        const flow =
          Math.sin(p.y * 0.012 + t * 0.7) * 1.6 +
          Math.cos(p.x * 0.009 - t * 0.5) * 1.6 +
          Math.sin(t * 2.1) * swayA;
        p.a += (flow - p.a) * 0.06;
        p.x += Math.cos(p.a) * p.s * spd;
        p.y += Math.sin(p.a) * p.s * spd;
        if (p.x < -8) p.x = w + 8;
        if (p.x > w + 8) p.x = -8;
        if (p.y < -8) p.y = h + 8;
        if (p.y > h + 8) p.y = -8;

        const ph = hueBase + Math.sin(p.x * 0.02 + p.y * 0.02) * 40;
        const alpha = 0.25 + glow * 0.65;
        ctx.fillStyle = `hsla(${ph}, 90%, ${55 + glow * 25}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.7 + glow * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [targetsRef]);

  return <canvas ref={canvasRef} className="am-canvas" />;
}
