// silhouette.js — canvas-based silhouette pipeline for the Asset Studio merge kit.
// No dependencies. Lazy-loaded with the modal: the live bundle never imports
// this file, and only traceSilhouette touches the DOM (canvas rasterizer).
// The boolean union comes free from the canvas: overlapping shapes merge in
// the alpha channel, and marching squares traces the fused outline.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Separable box blur over a binary alpha grid — the metaball "goo".
 * alpha: Uint8Array of w*h (1 = inside). radius: blur radius in pixels.
 * Returns a Float32Array of w*h in [0,1]. radius 0 returns the input
 * as floats (no-op, so goo=0 traces exactly the sharp union).
 */
export function blurAlpha(alpha, w, h, radius) {
  const r = Math.max(0, Math.round(radius));
  const src = Float32Array.from(alpha, (v) => (v ? 1 : 0));
  if (r === 0) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  // Vertical pass.
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Marching squares over a binary alpha grid.
 * alpha: Uint8Array of w*h, 1 = inside, 0 = outside.
 * Returns contour loops as arrays of [x, y] in pixel coordinates.
 * Outer boundaries and holes both come out as loops; tell them apart by area.
 */
export function traceAlpha(alpha, w, h) {
  const inside = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]);
  // Edge midpoints in pixel coords. Bits: TL=1 TR=2 BR=4 BL=8.
  const CASES = {
    1: ['T', 'L'], 2: ['T', 'R'], 3: ['L', 'R'], 4: ['B', 'R'],
    5: ['T', 'R', 'L', 'B'], 6: ['T', 'B'], 7: ['L', 'B'], 8: ['L', 'B'],
    9: ['T', 'B'], 10: ['T', 'L', 'B', 'R'], 11: ['B', 'R'], 12: ['L', 'R'],
    13: ['T', 'R'], 14: ['T', 'L'],
  };
  const segs = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const idx = inside(x, y) | (inside(x + 1, y) << 1) | (inside(x + 1, y + 1) << 2) | (inside(x, y + 1) << 3);
      if (idx === 0 || idx === 15) continue;
      const P = { T: [x + 0.5, y], R: [x + 1, y + 0.5], B: [x + 0.5, y + 1], L: [x, y + 0.5] };
      const e = CASES[idx];
      segs.push([P[e[0]], P[e[1]]]);
      if (e.length === 4) segs.push([P[e[2]], P[e[3]]]);
    }
  }
  return joinSegments(segs);
}

/** Chain raw segments into closed loops by matching shared endpoints. */
function joinSegments(segs) {
  const key = (p) => `${p[0]},${p[1]}`;
  const adj = new Map();
  segs.forEach((s, i) => {
    for (let e = 0; e < 2; e++) {
      const k = key(s[e]);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push({ seg: i, end: e });
    }
  });
  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segs[i][0], segs[i][1]];
    let cur = key(segs[i][1]);
    for (;;) {
      const next = (adj.get(cur) || []).find((c) => !used[c.seg]);
      if (!next) break;
      used[next.seg] = true;
      const s = segs[next.seg];
      const p = next.end === 0 ? s[1] : s[0];
      loop.push(p);
      cur = key(p);
      if (loop.length > segs.length + 2) break; // degenerate guard
    }
    const f = loop[0];
    const l = loop[loop.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/**
 * Render an SVG fragment to an offscreen canvas and trace the fused
 * silhouette. Returns loops in 100x100 viewBox coordinates.
 * Async: the SVG raster has to decode before we can read its pixels.
 *
 * goo (viewBox units, 0..12): metaball melt. The rasterized alpha is
 * blurred by goo*size/100 px and re-thresholded at 0.5 before tracing,
 * so joins come out smooth and gooey instead of sharp-cornered.
 * goo=0 skips the blur and traces the tight sharp union.
 */
export async function traceSilhouette(svgInner, size = 400, goo = 0) {
  const s = Math.max(64, Math.min(1024, Math.round(size) || 400));
  // currentColor has no meaning inside an <img>; pin it to opaque white.
  // Only the alpha channel matters downstream.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${s}" height="${s}">`
    + String(svgInner).replace(/currentColor/g, '#fff') + '</svg>';
  const img = new Image();
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, s, s);
  const px = ctx.getImageData(0, 0, s, s).data;
  const alpha = new Uint8Array(s * s);
  for (let i = 0; i < s * s; i++) alpha[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  const radius = Math.max(0, +goo || 0) * s / 100;
  const field = radius > 0.5 ? blurAlpha(alpha, s, s, radius) : Float32Array.from(alpha);
  const bin = new Uint8Array(s * s);
  for (let i = 0; i < s * s; i++) bin[i] = field[i] > 0.5 ? 1 : 0;
  const k = 100 / s;
  return traceAlpha(bin, s, s).map((loop) => loop.map(([x, y]) => [x * k, y * k]));
}

/**
 * Chamfer every vertex: pull back along both adjacent edges by `amount`
 * (viewBox units) and join with a straight bevel. amount=0 returns the
 * loop unchanged. Pullback is clamped to 45% of each edge so tight
 * corners can't flip inside-out.
 */
export function chamferContour(points, amount) {
  const src = (points || []).map((p) => [p[0], p[1]]);
  const amt = Math.max(0, +amount || 0);
  if (src.length < 3 || amt === 0) return src;
  const n = src.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    const d1 = dist(cur, prev);
    const d2 = dist(cur, next);
    out.push(lerpPt(cur, prev, Math.min(amt, d1 * 0.45) / (d1 || 1)));
    out.push(lerpPt(cur, next, Math.min(amt, d2 * 0.45) / (d2 || 1)));
  }
  return out;
}

/** Resample a closed loop to exactly n evenly spaced points. */
export function resampleContour(points, n) {
  const pts = (points || []).map((p) => [p[0], p[1]]);
  if (pts.length < 2 || n < 3) return pts;
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i % pts.length]));
  const total = cum[pts.length];
  if (total === 0) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]]);
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (j < pts.length - 1 && cum[j + 1] < target) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    out.push(lerpPt(pts[j], pts[(j + 1) % pts.length], (target - cum[j]) / segLen));
  }
  return out;
}

/** Signed area (shoelace); sign depends on winding, magnitude is the area. */
export function loopArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** The loop with the largest area — the silhouette's outer boundary. */
export function outerLoop(loops) {
  let best = null;
  let bestA = -1;
  for (const l of loops || []) {
    const a = Math.abs(loopArea(l));
    if (a > bestA) { bestA = a; best = l; }
  }
  return best;
}

/**
 * Morph loop a into loop b at parameter t (0..1). Both are resampled to
 * 64 points; b's start index and direction are aligned to a for the
 * smoothest path. Returns the intermediate loop.
 */
export function blendContours(a, b, t) {
  const N = 64;
  const tt = Math.max(0, Math.min(1, +t || 0));
  const ra = resampleContour(a, N);
  const rb = resampleContour(b, N);
  if (!ra.length || !rb.length) return ra.length ? ra : rb;
  let best = rb;
  let bestScore = Infinity;
  for (let rev = 0; rev < 2; rev++) {
    const cand = rev ? rb.slice().reverse() : rb;
    for (let s = 0; s < N; s++) {
      let score = 0;
      for (let i = 0; i < N; i++) {
        const q = cand[(i + s) % N];
        const dx = ra[i][0] - q[0];
        const dy = ra[i][1] - q[1];
        score += dx * dx + dy * dy;
      }
      if (score < bestScore) {
        bestScore = score;
        best = cand.map((_, i) => cand[(i + s) % N]);
      }
    }
  }
  return ra.map((p, i) => [p[0] + (best[i][0] - p[0]) * tt, p[1] + (best[i][1] - p[1]) * tt]);
}

/** Serialize loops to an SVG path `d` string (closed subpaths). */
export function loopsToD(loops) {
  const f = (v) => (+v).toFixed(2);
  return (loops || [])
    .filter((l) => l && l.length >= 3)
    .map((l) => 'M' + l.map((p) => `${f(p[0])},${f(p[1])}`).join('L') + 'Z')
    .join('');
}

/**
 * Loops to a <path> fragment. fill-rule evenodd lets hole loops punch
 * through the outer silhouette with no winding bookkeeping.
 */
export function loopsToPath(loops) {
  return `<path d="${loopsToD(loops)}" fill-rule="evenodd" fill="currentColor"/>`;
}
