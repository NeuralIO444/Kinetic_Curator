// typePlate.selfcheck.mjs — #1928: the FIELD poem as a clean type plate (Matt ruling, 2026-11-02), measured.
//
//   spacing   glyph ink boxes never overlap — within a word or across lines — for every deck piece, at every density,
//             dish aspect and seed; every glyph's ink stays on the dish; on the strict grid a word break is a full cell
//   plate     a standing form becomes a plate (one glyph per stamp, fractions of the frame, a backing that holds all
//             the ink); silence and dishonest forms make none
//   colour    for every catalog palette the plate's ink clears its backing at WCAG 4.5:1 or better
//   contract  a layer with a form carries `plates` and its marks carry no poem; a poem-less contract has no key
//   painter   paintPlateMask draws one backing and every glyph at exactly its cap height (coverage, tinted later)
//   renderer  the plate is composited on BOTH exits — after the present resolve and inside the single byte readback
//             (stills, captures, takes) — and the frame's plates come from the contract
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { placePiece, glyphWidthEm, GLYPH_MAX_W, GLYPH_CAP_UNITS } from './placement.js';
import { POET_DECKS, fieldFormForDeal } from './fieldForm.js';
import {
  plateFromForm,
  plateColours,
  paintPlateMask,
  selectPlate,
  contrast,
  plateKey,
  GLYPH_PATHS,
  PLATE_MIN_CONTRAST,
  MASK_GLYPH,
  MASK_BACKING,
} from './typePlate.mjs';
import { mkRng } from '../engine/prng.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const inkBox = (s) => {
  const hw = (glyphWidthEm(s.ch) * s.em) / 2;
  return { l: s.x - hw, r: s.x + hw, t: s.y - s.em / 2, b: s.y + s.em / 2 };
};

ok('metrics are measured: every letter has an outline and a width; the widest is W', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    assert.ok(GLYPH_PATHS[ch] && GLYPH_PATHS[ch].length > 10, `${ch} has an outline`);
    assert.ok(glyphWidthEm(ch) > 0.15 && glyphWidthEm(ch) <= GLYPH_MAX_W, `${ch} has a measured width`);
  }
  assert.equal(glyphWidthEm('W'), GLYPH_MAX_W);
  assert.equal(GLYPH_CAP_UNITS, 80);
});

ok('spacing: no two glyphs overlap and every glyph stays on the dish — all pieces × densities × aspects × seeds', () => {
  let forms = 0;
  for (const deck of Object.values(POET_DECKS)) {
    for (const piece of deck) {
      for (const density of [0, 0.4, 0.8, 1]) {
        for (const aspect of [0.6, 1, 10 / 7, 16 / 9, 2.6]) {
          for (let seed = 1; seed <= 6; seed++) {
            const { stamps } = placePiece({ ...piece, density }, mkRng(seed * 31 + 7), { aspect });
            forms++;
            const boxes = stamps.map(inkBox);
            for (const b of boxes) {
              assert.ok(b.l >= -1e-9 && b.r <= aspect + 1e-9 && b.t >= -1e-9 && b.b <= 1 + 1e-9, `${piece.id}: on the dish`);
            }
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const c = boxes[j];
                const ix = Math.min(a.r, c.r) - Math.max(a.l, c.l);
                const iy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
                assert.ok(!(ix > 1e-9 && iy > 1e-9), `${piece.id} d${density} a${aspect.toFixed(2)} s${seed}: glyphs collide`);
              }
            }
          }
        }
      }
    }
  }
  assert.equal(forms, 1920);
});

ok('the strict grid: a word break is wider than any gap inside a word', () => {
  const { stamps } = placePiece({ id: 'g', lines: ['THE SNOW LIES', 'ON THE HILL'], layout: 'grid', density: 0.4 }, mkRng(3));
  const row = stamps.filter((s) => Math.abs(s.y - stamps[0].y) < 1e-9);
  const gaps = row.slice(1).map((s, i) => inkBox(s).l - inkBox(row[i]).r);
  const inWord = [0, 1, 3, 4, 5, 7, 8, 9].map((i) => gaps[i]); // THE·SNOW·LIES: indexes 2 and 6 are word breaks
  assert.ok(Math.min(gaps[2], gaps[6]) > Math.max(...inWord), 'word breaks read as breaks');
});

const palette = resolvePalette('praystation', null);
const form = fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, mkRng(11));

ok('plate: a form becomes a plate — one glyph per stamp, in frame fractions, the backing holding all the ink', () => {
  const p = plateFromForm(form, palette);
  assert.equal(p.glyphs.length, form.stamps.length);
  for (const g of p.glyphs) {
    assert.ok(g.x >= 0 && g.x <= 1 && g.y >= 0 && g.y <= 1 && g.cap > 0 && g.cap < 0.3);
    const hw = (glyphWidthEm(g.ch) * g.cap) / form.aspect / 2;
    assert.ok(g.x - hw >= p.backing.x0 - 1e-9 && g.x + hw <= p.backing.x1 + 1e-9, 'backing holds the ink (x)');
    assert.ok(g.y - g.cap / 2 >= p.backing.y0 - 1e-9 && g.y + g.cap / 2 <= p.backing.y1 + 1e-9, 'backing holds the ink (y)');
  }
  assert.equal(plateFromForm(null, palette), null, 'silence: no plate');
  assert.equal(plateFromForm({ poetId: 'nobody', stamps: [] }, palette), null, 'a dishonest form: no plate');
  assert.equal(plateKey(p), p.key);
  assert.equal(plateFromForm(form, palette).key, p.key, 'the key is stable');
  // colour is tinted in the shader, never painted: a palette change or a voice MIX keeps the same mask
  const recoloured = plateFromForm(form, { ...palette, ink: '#ffff00', bg: '#000040' });
  assert.equal(recoloured.key, p.key, 'a colour change never repaints the mask');
  assert.equal(recoloured.ink, '#ffff00', 'but the plate carries the new colours');
  assert.equal(recoloured.backingColour, '#000040');
  const other = plateFromForm(fieldFormForDeal({ poetId: 'gibson', pieceId: 'w1' }, mkRng(11)), palette);
  assert.notEqual(other.key, p.key, 'a different poem is a different mask');
});

ok('colour: for every catalog palette the plate ink clears its backing at WCAG 4.5:1', () => {
  const list = Array.isArray(PALETTES) ? PALETTES : Object.values(PALETTES);
  assert.ok(list.length > 20);
  for (const pal of list) {
    const { ink, backing } = plateColours(pal);
    assert.ok(contrast(ink, backing) >= PLATE_MIN_CONTRAST, `${pal.id}: ${ink} on ${backing}`);
  }
  assert.deepEqual(plateColours(null), { ink: '#ffffff', backing: '#000000' });
});

ok('contract: a layer with a form carries a plate and its marks carry no poem; no form, no key', () => {
  const caps = getRenderCaps('balanced', false);
  const enabledAssets = Object.fromEntries(ASSETS.map((a) => [a.id, true]));
  const doc = (lp) => ({
    version: 1,
    seed: 1928,
    paletteId: 'praystation',
    paletteOverrides: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, lifeDrift: 0, count: 24, ...lp },
    enabledAssets,
    quality: 'balanced',
    layers: [{ id: 'bg', name: 'BG', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'bg',
    layerSnapshots: {},
  });
  const build = (d) => buildSceneContract({ doc: d, resolvedLayers: resolveLayers(d, { caps }), caps });
  const plain = build(doc({}));
  assert.ok(!('plate' in plain), 'no poem: the contract has no plate key (unchanged)');
  const armed = build(doc({ fieldForm: form }));
  assert.equal(armed.plate.glyphs.length, form.stamps.length);
  assert.equal(JSON.stringify(armed.instances), JSON.stringify(plain.instances), 'the marks are exactly the plain marks');
  assert.ok(!armed.instances.some((i) => String(i.key).startsWith('field-')), 'no poem among the marks');
  const mirrored = build(doc({ fieldForm: form, mirror: 'xy' }));
  assert.equal(mirrored.plate.key, armed.plate.key, 'mirror never touches the plate');
  // "the poem", singular: two layers that both inherit the live poem draw ONE plate
  const two = doc({ fieldForm: form });
  two.layers = [...two.layers, { id: 'top', name: 'Top', type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }];
  assert.equal(build(two).plate.key, armed.plate.key, 'identical poems on two layers are one plate');
});

ok('selectPlate: the poem, singular — the top-most distinct poem; none when silent', () => {
  const a = plateFromForm(form, palette);
  const b = plateFromForm(fieldFormForDeal({ poetId: 'gibson', pieceId: 'w1' }, mkRng(11)), palette);
  assert.equal(selectPlate([a, b]), b, 'the top-most layer wins');
  assert.equal(selectPlate([null, a, null]), a);
  assert.equal(selectPlate([]), null);
  assert.equal(selectPlate(null), null);
});

ok('mask painter: one backing in green, every glyph in red at exactly its cap height', () => {
  const p = plateFromForm(form, palette);
  const calls = [];
  let style = null;
  const ctx = {
    clearRect: () => calls.push(['clear']),
    fillRect: (...a) => calls.push(['rect', style, ...a]),
    fill: () => calls.push(['fill', style]),
    setTransform: (...a) => calls.push(['tf', ...a]),
    set globalAlpha(v) {},
    set fillStyle(v) {
      style = v;
    },
  };
  class FakePath {
    constructor(d) {
      this.d = d;
    }
  }
  const W = 2000;
  const H = 1400;
  paintPlateMask(ctx, p, W, H, FakePath);
  const rects = calls.filter((c) => c[0] === 'rect');
  assert.equal(rects.length, 1, 'one backing');
  assert.equal(rects[0][1], MASK_BACKING);
  const fills = calls.filter((c) => c[0] === 'fill');
  assert.equal(fills.length, p.glyphs.length, 'every glyph');
  assert.ok(fills.every((f) => f[1] === MASK_GLYPH), 'glyphs in the glyph channel');
  const tfs = calls.filter((c) => c[0] === 'tf' && c[1] !== 1);
  tfs.forEach((t, i) => {
    const g = p.glyphs[i];
    assert.ok(Math.abs(t[1] - (g.cap * H) / GLYPH_CAP_UNITS) < 1e-9, 'cap height exact');
    assert.ok(Math.abs(t[5] + 50 * t[1] - g.x * W) < 1e-6 && Math.abs(t[6] + 50 * t[4] - g.y * H) < 1e-6, 'centred');
  });
  paintPlateMask(ctx, null, W, H, FakePath); // silence clears and paints nothing
});

ok('renderer: the plate rides both exits — the present and the single byte readback — fed by the contract', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../gl/renderer.mjs'), 'utf8');
  const fn = (name) => {
    const i = src.indexOf(`function ${name}(`);
    assert.ok(i >= 0, `${name} exists`);
    return src.slice(i, src.indexOf('\n  }\n', i));
  };
  const readback = fn('resolveTargetToBytes');
  assert.ok(
    readback.indexOf('overlayPlate(w, h, true)') > readback.indexOf('drawFullscreen(resProg)') &&
      readback.indexOf('overlayPlate(w, h, true)') < readback.indexOf('gl.readPixels'),
    'readback: resolve → plate → readPixels',
  );
  const present = fn('present');
  assert.ok(present.indexOf('b.overlayPlate(canvas.width, canvas.height, false)') > present.indexOf('b.drawFullscreen(b.progs.resolve)'));
  assert.ok(/framePlate = contract\.plate \|\| null/.test(fn('renderFrameInto')), 'the plate comes from the contract');
  assert.ok(/if \(plate\) overlayPlate\(w, h, true\)/.test(readback), 'readback overlays unless told not to');
  const seam = fn('renderAccumInput');
  assert.ok(/resolveTargetToBytes\(mRead, T, w, h, \{ plate: false \}\)/.test(seam), 'the ACCUM input never carries the plate');
  // the mask is tinted per frame and cached per size: colours are uniforms, not texture content
  const overlay = fn('overlayPlate');
  assert.ok(/u_ink/.test(overlay) && /u_back/.test(overlay), 'tinted in the shader');
  assert.ok(/PLATE_TEX_MAX/.test(fn('plateMaskTexture')), 'a bounded per-size cache');
});

console.log(`typePlate.selfcheck: ${n} checks passed`);
