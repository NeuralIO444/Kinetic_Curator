// dishLifeSpike.mjs — DISH LIFE slice 2 evidence spike (#1923).
// Runs the culture over a spread of real compositions (every COMPOSITION_PRESET, several seeds)
// and measures how long each stays interesting, before any UI exists.
//
//   node scripts/dishLifeSpike.mjs [--cols 96] [--rows 54] [--gens 120] [--seeds 3] [--json]
//
// Per run: occupancy (alive+decaying fraction), activity (mean per-cell), and RECOGNISABILITY —
// the IoU between the seed's live cells and the culture's live+decaying cells at generation 3.
// INTERESTING WINDOW = the longest run of generations from gen 1 where occupancy stays within
// [OCC_LO, OCC_HI] and mean activity stays ≥ ACT_FLOOR (something is still happening, nothing
// has boiled or died).
import { buildPlacements } from '../src/engine/buildPlacements.js';
import { COMPOSITION_PRESETS } from '../src/data/presets.js';
import { seedFromMarks, SEED_BAND } from '../src/engine/dishLifeSeed.mjs';
import {
  createCulture,
  stepCulture,
  ellipseMask,
  population,
  totalActivity,
  CULTURE_RULE,
} from '../src/engine/dishLife.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const COLS = arg('cols', 96);
const ROWS = arg('rows', 54);
const GENS = arg('gens', 120);
const SEEDS = arg('seeds', 3);
export const OCC_LO = 0.01;
export const OCC_HI = 0.6;
export const ACT_FLOOR = 0.004;
const W = 1600;
const H = 900;
const CAPS = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
const ASSETS = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };

function iou(seedCells, c) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < seedCells.length; i++) {
    const a = seedCells[i] === 1;
    const b = c.cur[i] >= 1;
    if (a && b) inter++;
    if (a || b) uni++;
  }
  return uni ? inter / uni : 0;
}

export function runOne(items, { cols = COLS, rows = ROWS, gens = GENS, band = SEED_BAND, rule = CULTURE_RULE } = {}) {
  const seed = seedFromMarks(items, { canvasW: W, canvasH: H, cols, rows, band });
  const c = createCulture({ cols, rows, rule, mask: ellipseMask(cols, rows), seed: seed.cells });
  const n = cols * rows;
  let window = 0;
  let broke = false;
  let reco = 0;
  let peak = 0;
  for (let g = 1; g <= gens; g++) {
    stepCulture(c);
    const p = population(c);
    const occ = (p.alive + p.decaying) / n;
    const act = totalActivity(c) / n;
    peak = Math.max(peak, occ);
    if (g === 3) reco = iou(seed.cells, c);
    if (!broke) {
      if (occ >= OCC_LO && occ <= OCC_HI && act >= ACT_FLOOR) window = g;
      else broke = true;
    }
  }
  return { natural: seed.natural, density: seed.density, clamp: seed.clamp, window, reco, peak };
}

export function spike({
  band = SEED_BAND,
  seeds = SEEDS,
  rule = CULTURE_RULE,
  cols = COLS,
  rows: gridRows = ROWS,
  gens = GENS,
} = {}) {
  const rows = [];
  for (const p of COMPOSITION_PRESETS) {
    for (let s = 0; s < seeds; s++) {
      let items;
      try {
        items = buildPlacements({
          layoutParams: p.params,
          seed: 1000 + s * 7919,
          activeAssets: ASSETS,
          palette: PALETTE,
          caps: CAPS,
          canvasW: W,
          canvasH: H,
        }).items;
      } catch {
        continue;
      }
      rows.push({ id: p.id, s, marks: items.length, ...runOne(items, { band, rule, cols, rows: gridRows, gens }) });
    }
  }
  return rows;
}

const q = (a, f) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = spike();
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
  else {
    const w = rows.map((r) => r.window);
    const rc = rows.map((r) => r.reco);
    console.log(`runs ${rows.length}  grid ${COLS}x${ROWS}  gens ${GENS}  band ${JSON.stringify(SEED_BAND)}`);
    console.log(`window  min ${q(w, 0)}  p10 ${q(w, 0.1)}  median ${q(w, 0.5)}  p90 ${q(w, 0.9)}  max ${q(w, 1)}`);
    console.log(`reco@3  min ${q(rc, 0).toFixed(2)}  p10 ${q(rc, 0.1).toFixed(2)}  median ${q(rc, 0.5).toFixed(2)}`);
    const ge30 = rows.filter((r) => r.window >= 30).length;
    console.log(`window >= 30: ${ge30}/${rows.length} (${((100 * ge30) / rows.length).toFixed(0)}%)`);
    console.log(
      `clamped dense ${rows.filter((r) => r.clamp === 'dense').length}, sparse ${rows.filter((r) => r.clamp === 'sparse').length}`,
    );
    for (const r of rows.filter((x) => x.s === 0))
      console.log(
        `${r.id.padEnd(22)} marks ${String(r.marks).padStart(4)} nat ${r.natural.toFixed(2)} dens ${r.density.toFixed(2)} ${(r.clamp || '-').padEnd(6)} window ${String(r.window).padStart(3)} reco ${r.reco.toFixed(2)}`,
      );
  }
}
