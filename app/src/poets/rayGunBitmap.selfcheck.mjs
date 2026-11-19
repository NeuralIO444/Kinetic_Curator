// rayGunBitmap.selfcheck.mjs — Persona Kernel P5 (#2385): HYBRID's baked bitmap letters and her three record moves.
//
// Pins:
//   A  the pack: one coarse-pixel variant of every treatable Latin letter (104), each naming its source and its own
//      letter, ink on a shared lattice, no random draw, and the pack is exactly what the generator bakes (a regen is
//      byte-identical — scripts/gen-bitmap.mjs): bake determinism
//   B  poem-only: in the catalogue (citizen still last), in the poem-only union, excluded on every dealing surface,
//      never resolved by any placement; bitmap stamps measure with their source's ruler
//   C  the moves, each NAMED in the record and read only at mode 'greiman':
//      BITMAP   every treatable letter moves to ITS OWN letter's variant — geometry, `ch`, count, order identical
//      PLANES   words sit in translucent depth planes (a stamp alpha from the table); geometry identical
//      SPECTRUM each word carries a swatch-pair gradient (`spec`); geometry identical
//      FLOAT    no axis named: exactly the pre-P5 float (and the other modes ignore the axes entirely)
//   D  the door carries the three axes as `1` or absent, adds no key without them, refuses any other value
//   E  the draw seam: a spectrum stamp's colour lies on the line between two palette swatches; a plane stamp's item
//      alpha is the form's alpha times the plane's; an unnamed record draws exactly as before; deterministic per seed
import assert from 'node:assert';
import fs from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { ASSETS_BITMAP } from '../data/assets/assets-bitmap.js';
import { RESVG_FONT } from '../assets/resvgFont.mjs';
import {
  BITMAP_STAMP_IDS,
  BITMAP_SOURCE_BY_ID,
  POEM_ONLY_STAMP_IDS,
  bitmapStampIdFor,
  stampWidthEm,
  glyphWidthEm,
  stampIdForGlyph,
  serifStampIdForChar,
} from './placement.js';
import { rayGunForm, HYBRID_PLANE_ALPHA, HYBRID_SPECTRUM_SPAN } from './rayGunForm.js';
import { fieldFormForDeal, sanitizeFieldForm } from './fieldForm.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { mkRng } from '../engine/prng.js';
import { poolDescriptors } from '../panels/assetPoolLogic.mjs';
import { chapterAssets } from '../data/chapters.js';
import { dealableRecords } from '../state/rollPool.mjs';
import { hexToRgb255 } from '../engine/colorHex.mjs';
import { bitmapPackSource, BITMAP_CAP_ROWS, BITMAP_PITCH } from '../../../scripts/gen-bitmap.mjs';

void RESVG_FONT;
let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('rayGunBitmap.selfcheck');

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));

// ── A · the pack ────────────────────────────────────────────────────────
ok('A1 104 variants: Anton caps, Anton lowercase, PT Serif — each its own letter, path data on one lattice', () => {
  assert.equal(ASSETS_BITMAP.length, 104);
  assert.equal(new Set(ASSETS_BITMAP.map((a) => a.id)).size, 104, 'ids unique');
  assert.equal(BITMAP_CAP_ROWS, 16);
  for (const a of ASSETS_BITMAP) {
    const src = BY_ID.get(a.bitmapOf);
    assert.ok(src, `${a.id}: its source ${a.bitmapOf} is a catalogue stamp`);
    assert.equal(a.id, `typ_bm_${a.bitmapOf.slice(4)}`);
    assert.equal(a.glyph, src.glyph ?? src.id.slice(4), `${a.id}: its own letter`);
    assert.ok(a.tags.includes('bitmap') && a.tags.includes('type') && a.tags.includes('letter'));
    assert.ok(!a.svg.includes('<text') && !a.svg.includes('url('), `${a.id}: plain path data`);
    assert.equal(BITMAP_SOURCE_BY_ID.get(a.id), a.bitmapOf);
    // every run is a whole number of lattice cells (a coarse pixel, never a sliver)
    const runs = [...a.svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h/g)];
    assert.ok(runs.length >= 3, `${a.id}: it has ink`);
    for (const r of runs) {
      assert.ok(Math.abs(Number(r[4]) - BITMAP_PITCH) < 0.011, `${a.id}: one pixel tall`);
      const cells = Number(r[3]) / BITMAP_PITCH;
      assert.ok(Math.abs(cells - Math.round(cells)) < 0.05, `${a.id}: runs are whole pixels`);
    }
  }
});

ok('A2 bake determinism: the pack is exactly what the generator bakes, and a second bake is identical', () => {
  const baked = bitmapPackSource();
  assert.equal(fs.readFileSync('src/data/assets/assets-bitmap.js', 'utf8'), baked);
  assert.equal(bitmapPackSource(), baked, 'no draw anywhere: bake twice, same bytes');
});

// ── B · poem-only ───────────────────────────────────────────────────────
ok('B1 poem-only: catalogue member, never dealt, never placed, measured by its source', () => {
  assert.equal(ASSETS[ASSETS.length - 1].id, 'creature', 'the citizen is still last');
  for (const id of BITMAP_STAMP_IDS) {
    assert.ok(BY_ID.has(id), `${id} is in the catalogue`);
    assert.ok(POEM_ONLY_STAMP_IDS.has(id), `${id} is poem-only`);
  }
  assert.ok(!poolDescriptors().some((r) => BITMAP_STAMP_IDS.has(r.id)), 'the pool panel shows none');
  for (const ch of ['swiss', 'now']) assert.ok(!chapterAssets(ch).some((id) => BITMAP_STAMP_IDS.has(id)), `chapter ${ch}: none`);
  assert.ok(!dealableRecords(ASSETS).some((r) => BITMAP_STAMP_IDS.has(r.id)), 'the KINETIC roll deals none');
  for (const ch of 'ABCxyz') {
    assert.ok(!BITMAP_STAMP_IDS.has(stampIdForGlyph(ch)), `${ch}: base resolver never sets pixels`);
    assert.ok(!BITMAP_STAMP_IDS.has(serifStampIdForChar(ch)), `${ch}: serif resolver never sets pixels`);
  }
  for (const a of ASSETS_BITMAP) assert.equal(stampWidthEm(a.id, a.glyph), stampWidthEm(a.bitmapOf, a.glyph), a.id);
  assert.equal(stampWidthEm('typ_bm_W', 'W'), glyphWidthEm('W'));
  const live = fs.readFileSync('src/gl/liveResolve.mjs', 'utf8');
  assert.ok(/\.\.\.ASSETS_BITMAP,/.test(live), 'the placeable pool excludes the pack');
  const studio = fs.readFileSync('../studio/render.mjs', 'utf8');
  assert.ok(/\.\.\.ASSETS_BITMAP\]\.map/.test(studio), 'the stills path excludes the pack');
  assert.equal(bitmapStampIdFor('typ_A'), 'typ_bm_A');
  assert.equal(bitmapStampIdFor('creature'), null);
});

// ── C · the moves ───────────────────────────────────────────────────────
const forms = [
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't1', script: 'kana' }, mkRng(42)),
  fieldFormForDeal({ poetId: 'teijo', pieceId: 't3' }, mkRng(3)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(5)),
  fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g2', face: 'serif' }, mkRng(7)),
  fieldFormForDeal({ poetId: 'rosselli', pieceId: 'r1' }, mkRng(11)),
].filter(Boolean);
assert.ok(forms.length >= 3, 'fixtures deal');
const geo = (s) => [s.ch, s.x, s.y, s.rotation, s.em];

ok('C1 FLOAT: no axis named draws exactly the pre-P5 float; the axes mean nothing at any other mode', () => {
  for (const form of forms)
    for (let seed = 1; seed <= 8; seed++) {
      const float = rayGunForm(form, { mode: 'greiman', seed });
      for (const s of float.stamps) assert.ok(!('alpha' in s) && !('spec' in s), 'the float stamps carry neither');
      assert.deepStrictEqual(rayGunForm(form, { mode: 'greiman', seed, wear: 1, distort: 1 }), float, 'wear/distort never touch HYBRID');
      for (const mode of ['carson', 'grit', 'shot'])
        assert.deepStrictEqual(
          rayGunForm(form, { mode, seed, bitmap: 1, planes: 1, spectrum: 1 }),
          rayGunForm(form, { mode, seed }),
          `${mode} ignores HYBRID's axes`,
        );
    }
});

ok('C2 BITMAP: every treatable letter moves to its OWN letter’s variant; geometry, ch, count, order identical to the float', () => {
  let moved = 0;
  for (const form of forms)
    for (let seed = 1; seed <= 8; seed++) {
      const float = rayGunForm(form, { mode: 'greiman', seed });
      const bm = rayGunForm(form, { mode: 'greiman', seed, bitmap: 1 });
      assert.equal(bm.stamps.length, float.stamps.length);
      bm.stamps.forEach((s, i) => {
        const p = float.stamps[i];
        assert.deepStrictEqual(geo(s), geo(p), 'only the face moves');
        if (s.assetId !== p.assetId) {
          moved++;
          assert.equal(BITMAP_SOURCE_BY_ID.get(s.assetId), p.assetId);
          assert.equal(BY_ID.get(s.assetId).glyph, s.ch, 'its own letter');
        } else assert.equal(bitmapStampIdFor(p.assetId), null, 'a stamp that stayed has no variant (digit, kana, punctuation)');
      });
      const { stamps: _a, ...restB } = bm;
      const { stamps: _b, ...restF } = float;
      assert.deepStrictEqual(restB, restF, 'every other field of the form rides unchanged');
    }
  assert.ok(moved > 50, `letters were set in pixels (${moved})`);
});

ok('C3 PLANES: words in translucent depth planes from the table; list order and geometry untouched', () => {
  const seen = new Set();
  for (const form of forms)
    for (let seed = 1; seed <= 12; seed++) {
      const float = rayGunForm(form, { mode: 'greiman', seed });
      const pl = rayGunForm(form, { mode: 'greiman', seed, planes: 1 });
      assert.equal(pl.stamps.length, float.stamps.length);
      pl.stamps.forEach((s, i) => {
        assert.deepStrictEqual(geo(s), geo(float.stamps[i]));
        assert.equal(s.assetId, float.stamps[i].assetId);
        if ('alpha' in s) {
          assert.ok(HYBRID_PLANE_ALPHA.includes(s.alpha) && s.alpha < 1, 'a deeper plane’s alpha, from the table');
          seen.add(s.alpha);
        }
      });
      const n = form.stamps.length;
      for (let i = n; i < pl.stamps.length; i++) assert.equal(pl.stamps[i].alpha, HYBRID_PLANE_ALPHA[2], 'echoes are the deepest plane');
    }
  assert.deepStrictEqual([...seen].sort(), [HYBRID_PLANE_ALPHA[2], HYBRID_PLANE_ALPHA[1]].sort(), 'both back planes occur');
});

ok('C4 SPECTRUM: each word runs a swatch pair; the place along it spans the word; geometry untouched', () => {
  const form = forms[1];
  const sp = rayGunForm(form, { mode: 'greiman', seed: 5, spectrum: 1 });
  const float = rayGunForm(form, { mode: 'greiman', seed: 5 });
  sp.stamps.forEach((s, i) => assert.deepStrictEqual(geo(s), geo(float.stamps[i])));
  const specd = sp.stamps.filter((s) => s.spec);
  assert.ok(specd.length >= form.stamps.length * 0.8, 'the plain letters carry a spec');
  for (const s of specd) {
    const [a, b, t] = s.spec;
    assert.ok(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < HYBRID_SPECTRUM_SPAN && b < HYBRID_SPECTRUM_SPAN);
    assert.notEqual(a, b, 'a gradient runs between two swatches');
    assert.ok(t >= 0 && t <= 1);
  }
  const ts = specd.map((s) => s.spec[2]);
  assert.ok(ts.includes(0) && ts.includes(1), 'a word runs the whole gradient');
});

ok('C5 deterministic per seed; a different seed moves the draw; no clock, no Math.random in the module', () => {
  const form = forms[1];
  for (const axes of [{ bitmap: 1 }, { planes: 1 }, { spectrum: 1 }, { bitmap: 1, planes: 1, spectrum: 1 }]) {
    const a = rayGunForm(form, { mode: 'greiman', seed: 77, ...axes });
    assert.deepStrictEqual(rayGunForm(form, { mode: 'greiman', seed: 77, ...axes }), a);
  }
  assert.notDeepStrictEqual(
    rayGunForm(form, { mode: 'greiman', seed: 78, spectrum: 1 }).stamps.map((s) => s.spec),
    rayGunForm(form, { mode: 'greiman', seed: 77, spectrum: 1 }).stamps.map((s) => s.spec),
  );
  const code = fs.readFileSync('src/poets/rayGunForm.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(code), 'engine path: rng channels only');
});

// ── D · the door ────────────────────────────────────────────────────────
ok('D1 the door carries bitmap/planes/spectrum as 1 or absent, adds no key without them, refuses any other value', () => {
  const form = forms[1];
  const base = { mode: 'greiman', seed: 9 };
  const full = sanitizeFieldForm({ ...form, raygun: { ...base, bitmap: 1, planes: 1, spectrum: 1, doctrine: 'greiman' } });
  assert.deepStrictEqual(full.raygun, { ...base, bitmap: 1, planes: 1, spectrum: 1, doctrine: 'greiman' });
  const bare = sanitizeFieldForm({ ...form, raygun: base });
  assert.deepStrictEqual(Object.keys(bare.raygun).sort(), ['mode', 'seed'], 'no key added without them');
  for (const axis of ['bitmap', 'planes', 'spectrum'])
    for (const bad of [0, 2, true, '1', null, {}])
      assert.equal(sanitizeFieldForm({ ...form, raygun: { ...base, [axis]: bad } }), null, `${axis}: ${JSON.stringify(bad)} refused whole`);
});

// ── E · the draw seam ───────────────────────────────────────────────────
ok('E1 buildPlacements: spectrum colour lies between two palette swatches; plane alpha scales the form alpha; unnamed draws as before', () => {
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
  ];
  const swatches = ['#202020', '#ff0000', '#00c000', '#0040ff', '#ffd000'];
  const palette = { swatches };
  const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
  const lp = {
    mode: 'grid', composition: 'raster', count: 40, scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100], jitter: 10,
    density: 100, zTiers: 1, bleed: false, mirror: false, overlap: true, displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const standing = forms[1];
  const items = (raygun) =>
    buildPlacements({
      layoutParams: { ...lp, fieldForm: raygun ? { ...standing, raygun } : standing },
      seed: 0x1a4f, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700,
    }).items.filter((it) => typeof it.key === 'string' && it.key.startsWith('field-'));
  const floatItems = items({ mode: 'greiman', seed: 31 });
  const spectrumItems = items({ mode: 'greiman', seed: 31, spectrum: 1 });
  const planeItems = items({ mode: 'greiman', seed: 31, planes: 1 });
  assert.deepStrictEqual(items({ mode: 'greiman', seed: 31 }), floatItems, 'deterministic');
  // spectrum: every coloured stamp's colour is a point on a segment between two palette swatches
  const rgb = swatches.map(hexToRgb255);
  const onSomeSegment = (hex) => {
    const c = hexToRgb255(hex);
    for (let i = 0; i < rgb.length; i++)
      for (let j = 0; j < rgb.length; j++) {
        if (i === j) continue;
        const d = rgb[j].map((v, k) => v - rgb[i][k]);
        const len2 = d.reduce((s, v) => s + v * v, 0);
        const t = len2 ? d.reduce((s, v, k) => s + v * (c[k] - rgb[i][k]), 0) / len2 : 0;
        if (t < -0.01 || t > 1.01) continue;
        const dist = Math.hypot(...c.map((v, k) => v - (rgb[i][k] + d[k] * t)));
        if (dist < 2.5) return true;
      }
    return false;
  };
  let differs = 0;
  spectrumItems.forEach((it, i) => {
    assert.ok(onSomeSegment(it.color), `${it.color} lies inside the palette`);
    if (it.color !== floatItems[i].color) differs++;
  });
  assert.ok(differs > 0, 'the spectrum recolours some letters');
  // planes: alpha = form alpha x plane alpha, nothing else
  const base = floatItems[0].alpha;
  let deeper = 0;
  planeItems.forEach((it, i) => {
    if (it.alpha !== floatItems[i].alpha) {
      deeper++;
      assert.ok(HYBRID_PLANE_ALPHA.some((p) => Math.abs(it.alpha - base * p) < 1e-9), 'the plane’s share of the form alpha');
    }
    assert.equal(it.x, floatItems[i].x);
    assert.equal(it.color, floatItems[i].color, 'planes never recolour');
  });
  assert.ok(deeper > 0, 'some letters sit back');
  // an unnamed record is the float: no spec, no alpha key
  floatItems.forEach((it) => assert.equal(it.alpha, base));
});

console.log(`rayGunBitmap.selfcheck: ok (${passed} checks)`);
