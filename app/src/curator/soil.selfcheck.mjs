// node src/curator/soil.selfcheck.mjs
// #1355 — the soil map the PIN tool shows while armed: the formation rule's own fertility against the band's bar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soilGrid, SOIL_COLS, SOIL_DIM, SOIL_LIFT } from './soil.js';
import { fertilityField, thresholdsFor, conditionsHold, FORM_THRESHOLDS } from './formation.js';
import { BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN } from './stress.js';

const alphaAt = (g, i, j) => g.rgba[(j * g.cols + i) * 4 + 3];
const isLift = (g, i, j) => g.rgba[(j * g.cols + i) * 4] === 255;

// 1. shape: the canvas aspect, top to bottom, deterministic
{
  const f = fertilityField(7, null, 1000, 700);
  const g = soilGrid(f.at, 1000, 700, 0.55);
  assert.equal(g.cols, SOIL_COLS);
  assert.equal(g.rows, 112, '160 columns of a 1000 x 700 canvas is 112 rows');
  assert.equal(g.rgba.length, g.cols * g.rows * 4);
  assert.deepEqual(soilGrid(f.at, 1000, 700, 0.55).rgba, g.rgba, 'deterministic');
  const sq = soilGrid(f.at, 800, 800, 0.55, 40);
  assert.equal(sq.rows, 40);
}

// 2. HONEST: a cell is clear exactly where the formation rule's own fertility test passes at that point and band
{
  for (const band of [BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN]) {
    const f = fertilityField(21, null, 1000, 700);
    const bar = thresholdsFor(band).attraction;
    const g = soilGrid(f.at, 1000, 700, bar);
    let clear = 0; let dim = 0;
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const x = ((i + 0.5) / g.cols) * 1000; const y = ((j + 0.5) / g.rows) * 700;
        const rule = conditionsHold(Math.min(1, Math.max(0, f.at(x, y))), 1, band); // a full crowd: only fertility decides
        assert.equal(isLift(g, i, j), rule, `${band}: the cell (${i},${j}) agrees with the rule`);
        if (rule) clear++; else dim++;
      }
    }
    assert.ok(clear > 0 && dim > 0, `${band}: a real mix of fertile and barren ground (${clear} clear, ${dim} dim)`);
  }
  // the bars order the maps: relaxed lights more ground than tight
  const f = fertilityField(21, null, 1000, 700);
  const clearCount = (band) => { const g = soilGrid(f.at, 1000, 700, thresholdsFor(band).attraction); let n = 0; for (let k = 3; k < g.rgba.length; k += 4) if (g.rgba[k - 3] === 255) n++; return n; };
  assert.ok(clearCount(BAND_RELAX) > clearCount(BAND_NORMAL) && clearCount(BAND_NORMAL) > clearCount(BAND_TIGHTEN));
  assert.equal(FORM_THRESHOLDS[BAND_NORMAL].attraction, thresholdsFor(BAND_NORMAL).attraction);
}

// 3. a value exactly on the bar is NOT fertile (strictly above, as the rule), and poorer ground is dimmer
{
  const flat = (v) => () => v;
  assert.equal(isLift(soilGrid(flat(0.55), 100, 70, 0.55), 0, 0), false, 'on the bar waits');
  assert.equal(isLift(soilGrid(flat(0.5501), 100, 70, 0.55), 0, 0), true);
  const dimAt = (v) => alphaAt(soilGrid(flat(v), 100, 70, 0.55), 0, 0);
  assert.ok(dimAt(0.5) < dimAt(0.35) && dimAt(0.35) < dimAt(0.1), 'the poorer the ground, the deeper the dimming');
  assert.ok(dimAt(0) <= Math.round(255 * SOIL_DIM), 'never darker than the cap');
  assert.equal(soilGrid(flat(0.9), 100, 70, 0.55).rgba[3], Math.round(255 * SOIL_LIFT), 'fertile ground gets a faint lift');
}

// 4. junk never breaks it
{
  assert.doesNotThrow(() => soilGrid(() => NaN, 0, 0, NaN, 1));
  const g = soilGrid(() => NaN, 1000, 700, 0.55, 10);
  assert.ok(g.rgba.every((v) => Number.isFinite(v)));
}

// 5. the panel: only while PIN is armed, from the rule's own field and bar, under the marks, and it says what it is
{
  const panel = readFileSync(new URL('../panels/CanvasPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/if \(!pinArmed \|\| typeof document === 'undefined'\) return null;/.test(panel), 'no map unless armed');
  assert.ok(/fertilityField\(dishSeed, dishSeedOffsets, canvasW, canvasH\)/.test(panel), 'the rule\'s own field and seed');
  assert.ok(/thresholdsFor\(getStressState\(\)\.band\)\.attraction/.test(panel), 'the current band\'s bar');
  assert.ok(/data-testid="soil-map"/.test(panel) && /data-testid="soil-note"/.test(panel));
  assert.ok(panel.indexOf('soil-map') < panel.indexOf('data-pin-state'), 'drawn under the marks');
}

console.log('soil.selfcheck: ok (#1355 soil map)');
