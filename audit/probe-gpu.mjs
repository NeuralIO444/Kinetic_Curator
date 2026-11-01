// AUDIT (read-only) — Level 1: GPU feedback-loop persistence via the repo's
// own accum probe page (createAccum + accumRecipeParams + accum.step, the
// same calls the live loop makes), at the composed keeps for Matt's states.
// One bright disc is stamped in frame 0; N empty frames follow; the held
// buffer's disc-centre green value is read back per N and the per-step
// decay factor fitted. No app code is touched.
import { openHarnessPage, closeGlDriver } from '../app/src/gl/parity/glDriver.mjs';
import { writeFileSync } from 'node:fs';

const W = 64;
const H = 64;

function discFrame(w, h, cx, cy, r) {
  const f = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        const i = (y * w + x) * 4;
        f[i] = 255;
        f[i + 1] = 255;
        f[i + 2] = 255;
        f[i + 3] = 255; // premultiplied opaque white
      }
    }
  }
  return Array.from(f);
}
const emptyFrame = (w, h) => new Array(w * h * 4).fill(0);

const { page, close } = await openHarnessPage('/parity/accumProbe.html');

async function runSeries({ keep, resDiv = 1 }) {
  const fw = W * resDiv;
  const fh = H * resDiv;
  const disc = discFrame(fw, fh, 24 * resDiv, 32 * resDiv, 9 * resDiv);
  const empty = emptyFrame(fw, fh);
  const Ns = [0, 1, 2, 4, 7, 10, 14, 20, 28, 40];
  const peaks = [];
  let trackIdx = null;
  for (const n of Ns) {
    const frames = [disc, ...Array.from({ length: n }, () => empty)];
    const res = await page.evaluate(
      (p) => window.__kcAccumProbe(p),
      { w: W, h: H, bg: '#000000', fade: keep, optics: 0, echoes: 0, echoWidth: W, resDiv, frames },
    );
    const px = res.pixels;
    if (trackIdx === null) {
      // locate the peak green in the N=0 buffer and track that texel
      let best = -1;
      for (let i = 0; i < W * H; i++) {
        const g = px[i * 4 + 1];
        if (g > best) {
          best = g;
          trackIdx = i;
        }
      }
    }
    peaks.push({ n, peak: px[trackIdx * 4 + 1] });
  }
  // log-linear fit of peak vs n (skip any zero points)
  const pts = peaks.filter((p) => p.peak > 0);
  const xs = pts.map((p) => p.n);
  const ys = pts.map((p) => Math.log(p.peak));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const fitted = Math.exp(num / den);
  return { keep, resDiv, peaks, fittedKeep: fitted };
}

const out = [];
for (const cfg of [
  { keep: 0.95, resDiv: 1 }, // states (a)+(b): LEAVE trail 0.05, accum 3.0f/5.4f
  { keep: 0.96, resDiv: 1 }, // state (c): RIBBON accum 3.0f
  { keep: 0.8795, resDiv: 1 }, // state (d): plain accum 5.4f
  { keep: 0.95, resDiv: 2 }, // state (a) on the retina path (Matt's Mac, DPR 2)
]) {
  const r = await runSeries(cfg);
  out.push(r);
  console.log(
    `keep=${cfg.keep} resDiv=${cfg.resDiv}  fitted/step=${r.fittedKeep.toFixed(4)}  peaks: ` +
      r.peaks.map((p) => `${p.n}:${p.peak}`).join(' '),
  );
}
writeFileSync(new URL('./probe-gpu-results.json', import.meta.url), JSON.stringify(out, null, 2));
await close();
await closeGlDriver();
