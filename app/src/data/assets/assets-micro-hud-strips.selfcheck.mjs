// #705 strip selfcheck — the AUTHORed track: frame-exact, deterministic.
// Cell 0 of every strip is pixel-identical to today's single-cell bake;
// strip length matches the cell kineme's cell count.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MICRO_HUD_STRIPS } from './assets-micro-hud-strips.js';
import { ASSETS_MICRO } from './assets-micro-hud.js';
import { ASSET_CELL_KINEME, getCellKineme } from '../cellKinemes.js';

const assetSvg = (id) => ASSETS_MICRO.find((a) => a.id === id).svg;
const count = (s, sub) => s.split(sub).length - 1;

test('#705 strips: every registry asset has a strip with the kineme cell count', () => {
  assert.deepEqual(new Set(Object.keys(MICRO_HUD_STRIPS)), new Set(Object.keys(ASSET_CELL_KINEME)));
  for (const [asset, kinemeId] of Object.entries(ASSET_CELL_KINEME)) {
    const k = getCellKineme(kinemeId);
    assert.equal(
      MICRO_HUD_STRIPS[asset].length, k.cells,
      `${asset}: strip has ${MICRO_HUD_STRIPS[asset].length} cells, ${kinemeId} wants ${k.cells}`,
    );
  }
});

test('#705 strips: cell 0 is pixel-identical to today\'s bake', () => {
  for (const asset of Object.keys(ASSET_CELL_KINEME)) {
    assert.equal(MICRO_HUD_STRIPS[asset][0], assetSvg(asset), `${asset} cell 0 drifted from today's art`);
  }
});

test('#705 strips: dial sweeps full 360° from today\'s needle', () => {
  const dial = MICRO_HUD_STRIPS.mic_dial;
  assert.ok(dial[0].includes('x2="68" y2="32"'), 'cell 0 keeps today\'s 45° needle');
  // 8 cells at 45° steps: cell 7 points straight up (360°), cell 4 straight down
  assert.ok(dial[7].includes('x2="50" y2="24.5"'), 'cell 7 reaches 360°');
  assert.ok(dial[4].includes('x2="32" y2="68"'), 'cell 4 points down (225°)');
});

test('#705 strips: chevron cell 3 is the accent flash', () => {
  const chev = MICRO_HUD_STRIPS.mic_chevrons;
  assert.equal(count(chev[0], 'stroke="var(--accent)"'), 1, 'cell 0: accent only on chevron 3');
  assert.equal(count(chev[3], 'stroke="var(--accent)"'), 3, 'cell 3: all-accent flash (Matt\'s call)');
  assert.equal(count(chev[3], 'stroke="var(--ink)"'), 0);
});

test('#705 strips: spec-chase slides the 3-bar accent window', () => {
  const h = MICRO_HUD_STRIPS.mic_specbar_h;
  const accents = (cell) =>
    [...cell.matchAll(/x="(\d+)" y="44"[^>]*fill="var\(--accent\)"/g)].map((m) => (Number(m[1]) - 8) / 11);
  assert.deepEqual(accents(h[0]), [5, 6, 7], 'cell 0: today\'s bars 5,6,7');
  assert.deepEqual(accents(h[1]), [0, 6, 7], 'window slides and wraps');
  assert.deepEqual(accents(h[7]), [4, 5, 6]);
  const v = MICRO_HUD_STRIPS.mic_specbar_v;
  const accentsV = (cell) =>
    [...cell.matchAll(/y="(\d+)"[^>]*fill="var\(--accent\)"/g)].map((m) => (Number(m[1]) - 8) / 11);
  assert.deepEqual(accentsV(v[0]), [0, 1, 2], 'cell 0: today\'s bars 0,1,2');
  assert.deepEqual(accentsV(v[7]), [0, 1, 7], 'window wraps');
});

test('#705 strips: wave scrolls one exact 24-unit period', () => {
  const wave = MICRO_HUD_STRIPS.mic_wave;
  assert.equal(wave.length, 6);
  const peaks = (cell) => [...cell.matchAll(/L(-?[\d.]+) 30/g)].map((m) => Number(m[1]));
  // The tooth pattern is 24-periodic in artwork coordinates: cell c shows it
  // shifted left by 4c, so visible peaks sit on x≡(6−4c) (mod 24).
  for (let c = 0; c < 6; c++) {
    const want = (((6 - 4 * c) % 24) + 24) % 24;
    for (const x of peaks(wave[c])) {
      assert.equal((((x % 24) + 24) % 24), want, `cell ${c} peak at x=${x} breaks the scroll`);
    }
  }
  // Consecutive cells shift every peak left by exactly 4 (smooth scroll).
  // Cell 5 sees extension teeth the base lacks, so compare the overlap.
  for (let c = 0; c < 5; c++) {
    const a = peaks(wave[c]).map((x) => x - 4).sort((m, n) => m - n);
    const b = peaks(wave[c + 1]).slice().sort((m, n) => m - n);
    const overlap = a.filter((x) => b.includes(x));
    assert.ok(overlap.length > 0, `cells ${c}→${c + 1} share no teeth`);
    assert.deepEqual(b.filter((x) => a.includes(x)), overlap);
  }
  // Wrap: cell 5 → cell 0 moves interior teeth left by 4 (24-period).
  // (Edge teeth pop: today's finite teeth can't tile the window — the
  // interior pattern is what the eye tracks.)
  const p5in = peaks(wave[5]).map((x) => x - 4);
  const p0 = peaks(wave[0]);
  for (const x of p5in) {
    if (x >= 22 && x <= 74) assert.ok(p0.includes(x), `wrap loses interior tooth at ${x}`);
  }
});

test('#705 mic_needle asset exists (needle-only part)', () => {
  const n = ASSETS_MICRO.find((a) => a.id === 'mic_needle');
  assert.ok(n, 'mic_needle is in the catalog');
  assert.ok(n.svg.includes('x2="50" y2="24.5"'), 'needle points straight up');
});
