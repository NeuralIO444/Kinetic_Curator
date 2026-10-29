// trailGrid.selfcheck — #1808 slice 1: the trail grid reads the buffer
// honestly. The acceptance, pinned: on scripted scenes run through the
// recipe's own JS mirror, the derived grid matches an independent
// box-filter reference of the mirror's buffer (energy per cell within
// tolerance; dominant age within one frame of the analytic truth), the
// colour-only fallback carries the channel ratios, and the backstage
// wire stays wired. No steering is tested here — slice 1 ships no
// steering (slice 2 is gated on Matt playing it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { AGE_VOID, accumRecipeParams, createAgeState, mirrorAccumStep } from './accum.mjs';
import { deriveTrailGrid, sampleTrailGrid, summarizeTrailGrid, trailGridDims } from './trailGrid.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));

test('#1808 grid dims: 32 columns, rows from the aspect (32×22 at pair aspect)', () => {
  assert.deepEqual(trailGridDims(1600, 1100), { cols: 32, rows: 22 });
  assert.deepEqual(trailGridDims(1000, 1000), { cols: 32, rows: 32 });
  assert.deepEqual(trailGridDims(800, 1200), { cols: 32, rows: 48 });
});

test('#1808 hand scene: cell energy, means and light-weighted dominant age are exact', () => {
  const w = 64;
  const h = 44; // 32×22 cells, exactly 2×2 px per cell
  const data = new Float64Array(w * h * 4);
  const ageData = new Float64Array(w * h).fill(AGE_VOID);
  const setPx = (x, y, rgb, age) => {
    const o = (y * w + x) * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 1;
    ageData[y * w + x] = age;
  };
  // Cell (0,0): uniform colour, uniform age.
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    setPx(x, y, [0.6, 0.3, 0.15], 2.0);
  // Cell (1,0): two bright young pixels, two dim old pixels.
  setPx(2, 0, [0.9, 0.9, 0.9], 1);
  setPx(3, 0, [0.9, 0.9, 0.9], 1);
  setPx(2, 1, [0.1, 0.1, 0.1], 3);
  setPx(3, 1, [0.1, 0.1, 0.1], 3);
  // Cell (2,0): colour present, ages all void.
  for (const [x, y] of [
    [4, 0],
    [5, 0],
    [4, 1],
    [5, 1],
  ])
    setPx(x, y, [0.3, 0.3, 0.3], AGE_VOID);

  const grid = deriveTrailGrid({ data, ageData, width: w, height: h, stamp: 7 });
  assert.equal(grid.cols, 32);
  assert.equal(grid.rows, 22);
  assert.equal(grid.stamp, 7, 'the stamp rides through untouched');
  assert.equal(grid.hasAge, true);
  const at = (cx, cy) => {
    const c = cy * grid.cols + cx;
    return { energy: grid.energy[c], r: grid.r[c], g: grid.g[c], b: grid.b[c], age: grid.age[c] };
  };
  const c00 = at(0, 0);
  assert.ok(Math.abs(c00.energy - 0.35) < 1e-6, `energy is the mean light, got ${c00.energy}`);
  assert.ok(Math.abs(c00.r - 0.6) < 1e-6 && Math.abs(c00.g - 0.3) < 1e-6 && Math.abs(c00.b - 0.15) < 1e-6);
  assert.ok(Math.abs(c00.age - 2.0) < 1e-6, `uniform age reads back, got ${c00.age}`);
  const c10 = at(1, 0);
  assert.ok(Math.abs(c10.energy - 0.5) < 1e-6, `mixed cell energy, got ${c10.energy}`);
  assert.ok(
    Math.abs(c10.age - 1.2) < 1e-6,
    `dominant age is light-weighted: (0.9·1 + 0.1·3)/1 per px pair = 1.2, got ${c10.age}`,
  );
  const c20 = at(2, 0);
  assert.ok(Math.abs(c20.energy - 0.3) < 1e-6);
  assert.equal(c20.age, AGE_VOID, 'colour without living ages: the cell age is void, not invented');
  assert.equal(at(31, 21).energy, 0, 'untouched cells hold no light');
  assert.equal(at(31, 21).age, AGE_VOID);
});

/** Independent box-filter reference: cells outer, pixels inner, bounds
 *  from the proportional map's interval form — a structurally different
 *  code path from the derivation's per-pixel scatter. */
function referenceGrid(data, ageData, w, h, cols, rows) {
  const out = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.ceil((cx * w) / cols);
      const x1 = Math.ceil(((cx + 1) * w) / cols);
      const y0 = Math.ceil((cy * h) / rows);
      const y1 = Math.ceil(((cy + 1) * h) / rows);
      let n = 0;
      let sL = 0;
      let sR = 0;
      let sG = 0;
      let sB = 0;
      let sAW = 0;
      let sA = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          const light = (data[o] + data[o + 1] + data[o + 2]) / 3;
          sL += light;
          sR += data[o];
          sG += data[o + 1];
          sB += data[o + 2];
          n += 1;
          if (ageData) {
            const a = ageData[y * w + x];
            if (a >= 0 && light > 0) {
              sAW += light;
              sA += light * a;
            }
          }
        }
      }
      out.push({ energy: sL / n, r: sR / n, g: sG / n, b: sB / n, age: sAW > 0 ? sA / sAW : AGE_VOID });
    }
  }
  return out;
}

/** The scripted scene: two white blocks land in a black field at known
 *  steps and decay under the shipped spectral fade. Returns the final
 *  mirror colour + age field after `steps` steps of dt. */
function runScriptedScene() {
  const w = 128;
  const h = 88;
  const dt = 1 / 30;
  const steps = 30;
  const params = accumRecipeParams({ fade: 0.88, optics: 0, background: '#000000', ageBuffer: true, dt });
  const age = createAgeState(w, h);
  const empty = new Float64Array(w * h * 4);
  const frameWith = (bx, by) => {
    const f = new Float64Array(w * h * 4);
    for (let y = by; y < by + 16; y++) {
      for (let x = bx; x < bx + 16; x++) {
        const o = (y * w + x) * 4;
        f[o] = 1;
        f[o + 1] = 1;
        f[o + 2] = 1;
        f[o + 3] = 1;
      }
    }
    return f;
  };
  let accum = new Float64Array(w * h * 4);
  for (let s = 0; s < steps; s++) {
    const frame = s === 0 ? frameWith(8, 8) : s === 20 ? frameWith(96, 64) : empty;
    accum = mirrorAccumStep({ accum, frame, w, h, params, age });
  }
  return { colour: accum, ageData: age.data, w, h, dt, steps };
}

test('#1808 acceptance: grid vs the mirror buffer on a scripted scene (energy + age)', () => {
  const { colour, ageData, w, h, dt } = runScriptedScene();
  const grid = deriveTrailGrid({ data: colour, ageData, width: w, height: h, stamp: 30 });
  const ref = referenceGrid(colour, ageData, w, h, grid.cols, grid.rows);
  for (let i = 0; i < ref.length; i++) {
    assert.ok(
      Math.abs(grid.energy[i] - ref[i].energy) < 1e-9,
      `cell ${i} energy ${grid.energy[i]} vs reference ${ref[i].energy}`,
    );
    assert.ok(
      Math.abs(grid.r[i] - ref[i].r) < 1e-9 &&
        Math.abs(grid.g[i] - ref[i].g) < 1e-9 &&
        Math.abs(grid.b[i] - ref[i].b) < 1e-9,
      `cell ${i} means`,
    );
    if (ref[i].age === AGE_VOID) assert.equal(grid.age[i], AGE_VOID, `cell ${i} void matches`);
    else
      assert.ok(Math.abs(grid.age[i] - ref[i].age) < 1e-6, `cell ${i} age ${grid.age[i]} vs reference ${ref[i].age}`);
  }
  // Analytic ages, ±1 frame (the issue's tolerance): block A landed at
  // step 0 of 30, block B at step 20 — covered pixels end their landing
  // step at age 0 and advance dt per step after.
  const cellAge = (cx, cy) => grid.age[cy * grid.cols + cx];
  assert.ok(Math.abs(cellAge(3, 3) - 29 * dt) <= dt + 1e-9, `block A cell age ${cellAge(3, 3)} ≈ 29 frames`);
  assert.ok(Math.abs(cellAge(25, 17) - 9 * dt) <= dt + 1e-9, `block B cell age ${cellAge(25, 17)} ≈ 9 frames`);
  // The spectral proxy agrees with the ages: A's light is older, and
  // blue dies fastest under #1800, so A's b/g sits below B's.
  const ratio = (cx, cy) => {
    const c = cy * grid.cols + cx;
    return grid.b[c] / grid.g[c];
  };
  assert.ok(ratio(3, 3) < ratio(25, 17), `older cell's b/g ${ratio(3, 3)} < fresher cell's ${ratio(25, 17)}`);
  const s = summarizeTrailGrid(grid);
  assert.ok(
    s.peak.cx >= 24 && s.peak.cx <= 27 && s.peak.cy >= 16 && s.peak.cy <= 19,
    `peak is the fresh block B, got (${s.peak.cx},${s.peak.cy})`,
  );
  assert.ok(s.litFraction > 0 && s.meanAge > 0, 'the field summary sees living light');
});

test('#1808 colour-only read: ages void, ratios carried, energies unchanged', () => {
  const { colour, ageData, w, h } = runScriptedScene();
  const withAge = deriveTrailGrid({ data: colour, ageData, width: w, height: h });
  const noAge = deriveTrailGrid({ data: colour, width: w, height: h });
  assert.equal(noAge.hasAge, false);
  assert.ok(
    noAge.age.every((a) => a === AGE_VOID),
    'no age source: no invented ages',
  );
  assert.deepEqual([...noAge.energy], [...withAge.energy], 'the colour read is identical either way');
  assert.deepEqual([...noAge.b], [...withAge.b], 'channel means ride the colour-only read (the ratio proxy)');
});

test('#1808 sampler: nearest measured cell, clamped at the edges', () => {
  const w = 64;
  const h = 44;
  const data = new Float64Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 0.6;
    data[i * 4 + 1] = 0.3;
    data[i * 4 + 2] = 0.15;
    data[i * 4 + 3] = 1;
  }
  const grid = deriveTrailGrid({ data, width: w, height: h });
  const centre = sampleTrailGrid(grid, 0.5 / 32, 0.5 / 22);
  assert.ok(Math.abs(centre.energy - 0.35) < 1e-6 && Math.abs(centre.r - 0.6) < 1e-6);
  const corner = sampleTrailGrid(grid, 1, 1);
  assert.ok(Math.abs(corner.energy - 0.35) < 1e-6, 'u=v=1 clamps into the last cell');
  const out = sampleTrailGrid(grid, -3, 7);
  assert.ok(Math.abs(out.energy - 0.35) < 1e-6, 'out-of-range samples clamp, never throw');
});

test('#1808 empty buffer: zeros and voids, no invented signal', () => {
  const grid = deriveTrailGrid({ data: new Float64Array(32 * 24 * 4), width: 32, height: 24 });
  assert.ok(grid.energy.every((e) => e === 0));
  assert.ok(grid.age.every((a) => a === AGE_VOID));
  const s = summarizeTrailGrid(grid);
  assert.equal(s.peak.energy, 0);
  assert.equal(s.litFraction, 0);
  assert.equal(s.meanAge, AGE_VOID);
});

test('#1808 the backstage wire stays wired (liveLoop requests + registers; App mounts)', () => {
  const loop = readFileSync(join(DIR, 'liveLoop.mjs'), 'utf8');
  assert.match(loop, /DEBUG_TRAILGRID/, 'liveLoop knows the trailgrid flag');
  assert.match(loop, /ageBuffer: DEBUG_AGE \|\| DEBUG_TRAILGRID/, 'the grid readout is a named age-buffer consumer');
  assert.match(loop, /setTrailGridReader\(accumObj\)/, 'liveLoop registers the accum object for the grid readout');
  const app = readFileSync(join(DIR, '../App.jsx'), 'utf8');
  assert.match(app, /DEBUG_TRAILGRID && <TrailGridReadout \/>/, 'App mounts the readout on the flag only');
  const accum = readFileSync(join(DIR, 'accum.mjs'), 'utf8');
  assert.match(accum, /readTrail\(\)/, 'the accum object offers the trail snapshot read');
});
