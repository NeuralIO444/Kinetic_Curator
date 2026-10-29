// TrailGridReadout.jsx — #1808 slice 1: the DEV-ONLY trail-grid readout. It mounts only with
// ?debug=trailgrid on the URL (the StressReadout pattern, #1354), beside the AGE view (#1805) in the
// backstage family. While it is mounted the live loop requests the ACCUM age buffer (trailGridLive.mjs)
// and registers its ACCUM object; this polls the derived 32-wide trail grid and paints it as what it is —
// a coarse thumbnail of the buffer: each cell in its own mean colour — with the measured headline numbers:
// the grid's stamp (buffer steps since CLEAR, the deterministic clock a steering consumer will label
// staleness by), the peak cell and its dominant age, and how much of the field holds living light.
// It shows measurements only; nothing reads the grid back into the show in this slice.
import { useEffect, useRef, useState } from 'react';
import { readTrailGridFrame } from '../gl/trailGridLive.mjs';
import { summarizeTrailGrid } from '../gl/trailGrid.mjs';
import { AGE_VOID } from '../gl/accum.mjs';

export function TrailGridReadout() {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState({ live: false });

  // The grid source is a registered getter with no subscription API: a
  // light poll keeps the readout current (and the readback throttled —
  // a pair-resolution snapshot a few times a second, backstage only).
  useEffect(() => {
    const draw = () => {
      const grid = readTrailGridFrame();
      const canvas = canvasRef.current;
      if (!grid || !canvas) {
        setStats((s) => (s.live ? { live: false } : s));
        return;
      }
      const { cols, rows } = grid;
      if (canvas.width !== cols) canvas.width = cols;
      if (canvas.height !== rows) canvas.height = rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rgba = new Uint8ClampedArray(cols * rows * 4);
      for (let dy = 0; dy < rows; dy++) {
        // The buffer (and so the grid) is bottom-first; the display is not.
        const cy = rows - 1 - dy;
        for (let cx = 0; cx < cols; cx++) {
          const cell = cy * cols + cx;
          const o = (dy * cols + cx) * 4;
          rgba[o] = Math.round(Math.min(1, Math.max(0, grid.r[cell])) * 255);
          rgba[o + 1] = Math.round(Math.min(1, Math.max(0, grid.g[cell])) * 255);
          rgba[o + 2] = Math.round(Math.min(1, Math.max(0, grid.b[cell])) * 255);
          rgba[o + 3] = 255;
        }
      }
      ctx.putImageData(new ImageData(rgba, cols, rows), 0, 0);
      const s = summarizeTrailGrid(grid);
      setStats({
        live: true,
        cols,
        rows,
        stamp: grid.stamp,
        hasAge: grid.hasAge,
        peak: s.peak,
        litPct: s.litFraction * 100,
        meanAge: s.meanAge,
      });
    };
    draw();
    const id = setInterval(draw, 250);
    return () => clearInterval(id);
  }, []);

  const fmtAge = (a) => (a === AGE_VOID || a == null ? '—' : `${a.toFixed(2)}s`);
  return (
    <div
      role="status"
      aria-label="Trail grid (debug)"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 44,
        zIndex: 9999,
        padding: '8px 10px',
        background: 'rgba(12,12,14,0.92)',
        border: '1px solid rgba(255,255,255,0.18)',
        font: '11px ui-monospace, Menlo, monospace',
        color: '#e8e8ea',
      }}
    >
      <div style={{ marginBottom: 6, whiteSpace: 'pre' }}>
        {stats.live
          ? `TRAILGRID ${stats.cols}×${stats.rows}  stamp ${stats.stamp}  peak ${stats.peak.energy.toFixed(3)} @ (${stats.peak.cx},${stats.peak.cy}) age ${fmtAge(stats.peak.age)}\nfield ${stats.litPct.toFixed(1)}% lit  mean age ${stats.hasAge ? fmtAge(stats.meanAge) : '— (ratios only)'}`
          : 'TRAILGRID  no buffer (ACCUM off, or no consumer yet)'}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: 320, height: 'auto', display: 'block', background: '#0a0a0e', imageRendering: 'pixelated' }}
      />
    </div>
  );
}
