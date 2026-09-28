// node src/data/palettes.selfcheck.mjs
import assert from 'node:assert';
import { PALETTES, resolvePalette, normalizeHex, getCatalogPalette } from './palettes.js';

const id = 'praystation';
const base = getCatalogPalette(id);

const clean = resolvePalette(id, null);
assert.deepStrictEqual(clean.swatches, base.swatches);
assert.strictEqual(clean.bg, base.bg);
assert.strictEqual(clean.dirty, false);

const ov = resolvePalette(id, { swatches: ['#ffffff'] });
assert.strictEqual(ov.swatches[0], '#ffffff');
assert.strictEqual(ov.swatches[1], base.swatches[1]);
assert.strictEqual(ov.dirty, true);

const mutated = resolvePalette(id, { swatches: ['#111111'] });
mutated.swatches[0] = '#dead00';
assert.strictEqual(PALETTES.find(p => p.id === id).swatches[0], base.swatches[0]);

assert.strictEqual(normalizeHex('abc'), '#aabbcc');
assert.strictEqual(normalizeHex('#FF00AA'), '#ff00aa');
assert.strictEqual(normalizeHex('nope'), null);

// #287 — leak rides resolvePalette: declared values pass through, every
// other palette defaults to 0 (colors hold).
assert.strictEqual(resolvePalette('kiln-columns', null).leak, 0.5);
assert.strictEqual(resolvePalette('petri-bloom', null).leak, 0.35);
assert.strictEqual(resolvePalette('sepia-plate', null).leak, 0.5);
assert.strictEqual(resolvePalette('lithograph', null).leak, 0);
assert.strictEqual(resolvePalette('cyanotype', null).leak, 0.3);
assert.strictEqual(resolvePalette('praystation', null).leak, 0);
for (const p of PALETTES) {
  const r = resolvePalette(p.id, null);
  assert.ok(typeof r.leak === 'number' && r.leak >= 0 && r.leak <= 1, `${p.id}: leak must be 0..1`);
}
// The three plate palettes exist with light grounds (fade-to-paper).
for (const [pid, name] of [['sepia-plate', 'SEPIA PLATE'], ['lithograph', 'LITHOGRAPH'], ['cyanotype', 'CYANOTYPE']]) {
  const r = resolvePalette(pid, null);
  assert.strictEqual(r.name, name);
}

// ── #704 CHIAROSCURO ────────────────────────────────────────────────────────
// The mode is a LOOK, so its palette has measurable properties, not just taste.
{
  const cs = PALETTES.find((p) => p.id === 'chiaroscuro');
  assert.ok(cs, 'the chiaroscuro palette must exist');

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => {
    const c = rgb(h).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (h) => (lum(h) + 0.05) / (lum(cs.bg) + 0.05);
  const hueOf = (h) => {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    if (!d) return -1;
    const deg = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (deg * 60 + 360) % 360;
  };

  // NEAR-BLACK, and WARM. A cool ground kills the amber — that is the whole
  // reason this is not #000.
  assert.ok(lum(cs.bg) < 0.01, `the ground must be near-black (lum ${lum(cs.bg).toFixed(4)})`);
  const [br, , bb] = rgb(cs.bg);
  assert.ok(br > bb, `the ground must be WARM, not neutral black (${cs.bg})`);

  // AMBER ink.
  const inkHue = hueOf(cs.ink);
  assert.ok(inkHue >= 20 && inkHue <= 50, `the ink must be amber (hue ${inkHue.toFixed(0)})`);

  // A BLUE-VIOLET accent must be in the ramp — the only cool light here.
  assert.ok(cs.swatches.some((sw) => { const h = hueOf(sw); return h >= 240 && h <= 285; }),
    'chiaroscuro needs a blue-violet accent');

  // Chiaroscuro is a RANGE, not a flat poster: the ramp has to run from
  // something that recedes into the ground to something that catches light.
  const cons = cs.swatches.map(contrast);
  assert.ok(Math.min(...cons) < 3.5, 'something must recede toward the ground');
  assert.ok(Math.max(...cons) > 8, 'something must catch the light');
  assert.ok(Math.max(...cons) / Math.min(...cons) > 3, 'the ramp must actually be a ramp');

  // Every swatch stays legible against this ground — nothing disappears.
  for (const sw of cs.swatches) {
    assert.ok(contrast(sw) > 2, `${sw} vanishes into the ground (contrast ${contrast(sw).toFixed(2)})`);
  }
  // The ink is in the ramp, so a lit facet and its own fill agree.
  assert.ok(cs.swatches.includes(cs.ink), 'the ink must also be a swatch');
}

console.log('palettes.selfcheck: OK');
