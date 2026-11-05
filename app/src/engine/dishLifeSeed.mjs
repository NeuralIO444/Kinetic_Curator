// dishLifeSeed.mjs — DISH LIFE slice 2 (#1923): picture → grid, with density normalisation.
//
// The culture's seed is the performer's finished composition. This module turns a list of
// marks (any item with x, y, scale, alpha — whoever dealt them) into the 0/1 seed grid the
// core (dishLife.mjs) grows from. Raw Conway on an arbitrary picture boils (too dense) or
// dies (too sparse) in seconds, so the mapping — not the rule — is the build:
//
//   COVERAGE — each mark paints a soft disc (radius = scale × MARK_FRAC × the short canvas
//   side, alpha-weighted) into a per-cell coverage field. Overlaps add, so a pile of marks
//   reads denser than a lone one: the picture's own weight survives into the grid.
//
//   NORMALISATION — the cells that go alive are the top-coverage cells, never a random
//   sample, so the scene's shape is kept: the natural fraction (cells the marks really
//   cover) is clamped into the viable BAND. Too dense → only the strongest cores stay alive
//   (shapes thin but keep their places); too sparse → every covered cell is alive and the
//   result is flagged `sparse` rather than faked with noise.
//
//   PURE — a function of (items, canvas, grid, options). No clock, no random: same
//   composition = same seed. Marks outside the canvas paint what falls on the grid.
//   Bedrock cells (locked elements) are never seeded alive.

/** Mark radius as a fraction of the short canvas side, at scale 1. A tunable (the spike reads it). */
export const MARK_FRAC = 0.05;

/**
 * The viable alive-fraction band for a seed (spike-tuned for CULTURE_RULE, see scripts/dishLifeSpike.mjs):
 * below it the culture has nothing to grow from, above it the first generations are a blob, not the scene.
 */
export const SEED_BAND = Object.freeze({ lo: 0.05, hi: 0.18 });

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Item alpha as 0..1 (the placement engine uses 0..100; 0..1 is also accepted). */
function alpha01(a) {
  const v = num(a, 1);
  return Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
}

/**
 * Paint the marks into a cols×rows coverage field (Float32Array, 0..∞ — overlaps add).
 */
export function coverageField(items, { canvasW, canvasH, cols, rows, markFrac = MARK_FRAC }) {
  const cov = new Float32Array(cols * rows);
  const W = Math.max(1, canvasW);
  const H = Math.max(1, canvasH);
  const cellW = W / cols;
  const cellH = H / rows;
  const short = Math.min(W, H);
  if (!Array.isArray(items)) return cov;
  for (const it of items) {
    if (!it) continue;
    const a = alpha01(it.alpha);
    if (a <= 0) continue;
    const rPx = Math.max(0.5 * Math.min(cellW, cellH), Math.abs(num(it.scale, 1)) * markFrac * short);
    const cx = num(it.x, NaN) / cellW - 0.5;
    const cy = num(it.y, NaN) / cellH - 0.5;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const rx = rPx / cellW;
    const ry = rPx / cellH;
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(cols - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(rows - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1) cov[y * cols + x] += a * (1 - Math.sqrt(d2) * 0.5);
      }
    }
  }
  return cov;
}

/**
 * Seed a culture grid from a composition.
 * Returns { cells (Uint8Array 0/1), coverage, natural, density, clamp, marks }:
 *   natural — fraction of cells the marks genuinely cover (before normalisation)
 *   density — fraction alive in `cells` (after)
 *   clamp   — 'dense' | 'sparse' | null: which side of the band the picture was pulled from
 */
export function seedFromMarks(items, opts) {
  const { cols, rows } = opts;
  const band = opts.band || SEED_BAND;
  const n = cols * rows;
  const cov = coverageField(items, opts);
  const bedrock = opts.bedrock && opts.bedrock.length === n ? opts.bedrock : null;
  // candidate cells: covered and not terrain
  const covered = [];
  for (let i = 0; i < n; i++) if (cov[i] > 0 && !(bedrock && bedrock[i])) covered.push(i);
  const natural = covered.length / n;
  let clamp = null;
  let want = covered.length;
  if (natural > band.hi) {
    clamp = 'dense';
    want = Math.round(band.hi * n);
  } else if (natural < band.lo) {
    clamp = 'sparse'; // every covered cell is alive; sparse pictures are reported, not padded with noise
  }
  // strongest coverage first; index breaks ties so the result is deterministic
  covered.sort((a, b) => cov[b] - cov[a] || a - b);
  const cells = new Uint8Array(n);
  for (let k = 0; k < want; k++) cells[covered[k]] = 1;
  return { cells, coverage: cov, natural, density: want / n, clamp, marks: Array.isArray(items) ? items.length : 0 };
}
