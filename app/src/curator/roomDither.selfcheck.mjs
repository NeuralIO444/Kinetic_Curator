// roomDither.selfcheck.mjs — #1560 S2: the generative faces. One pipeline (ordered Bayer), two sources
// (Davis's rosette in colour, LOIS's construction in glyphs), tier = resolution, state = parameters.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BAYER4, orderedLevel, DITHER_GRIDS, gridTierFor, vibeBend, lerpParams,
  buildDavisSource, davisSampler, davisFaceParams, davisRamp, DAVIS_FACE_PARAMS, DAVIS_LEVELS,
  loisSampler, loisFaceParams, loisInk, LOIS_GLYPHS, LOIS_FACE_PARAMS, LOIS_LEVELS, LOIS_FACE_CODES, LOIS_EXTRA_EXPRS,
} from './roomDither.js';
import { sigilTempo } from './davisSigil.js';
import { DAVIS_STATES } from './davisState.js';
import { LOIS_FACES } from './loisFace.js';
import { LOIS_EXTRA_FACES } from './mindFace.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const mean = (s, cells = 28) => { let t = 0; for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) t += s(((i + 0.5) / cells) * 2 - 1, ((j + 0.5) / cells) * 2 - 1); return t / (cells * cells); };

ok('the Bayer stage: bounded, monotone in the shade, and a flat shade is a stable pattern (never noise)', () => {
  assert.equal(BAYER4.length, 4);
  for (let lv = 0; lv < 10; lv++) for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    const l = orderedLevel(lv / 9, x, y, 10);
    assert.ok(l >= 0 && l < 10, 'level in range');
    if (lv > 0) assert.ok(l >= orderedLevel((lv - 1) / 9, x, y, 10), 'monotone in the shade at a fixed cell');
  }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    assert.equal(orderedLevel(0, x, y, 10), 0); assert.equal(orderedLevel(1, x, y, 10), 9);
    assert.equal(orderedLevel(0.5, x, y, 10), orderedLevel(0.5, x, y, 10), 'the same cell and shade, the same level, forever');
  }
});

ok('tier = resolution: the grid coarsens at low engagement, and cool-down renders one grid coarser', () => {
  assert.deepEqual({ ...DITHER_GRIDS }, { 1: 12, 2: 21, 3: 28, 4: 42 });
  assert.ok(DITHER_GRIDS[1] < DITHER_GRIDS[2] && DITHER_GRIDS[2] < DITHER_GRIDS[3] && DITHER_GRIDS[3] < DITHER_GRIDS[4]);
  assert.equal(gridTierFor(4, false), 4); assert.equal(gridTierFor(4, true), 3);
  assert.equal(gridTierFor(1, true), 1, 'tier 1 has nothing coarser to fall to');
  assert.equal(gridTierFor(9, false), 1, 'junk tier reads as the floor, never finer');
});

ok('vibe: no reading bends nothing; moonlight and season bend warmth; the persona modulation bends contrast', () => {
  assert.deepEqual(vibeBend({ intensity: 1.1 }, null), { contrast: 1.1, warmth: 0 });
  assert.deepEqual(vibeBend(null, null), { contrast: 1, warmth: 0 });
  assert.ok(vibeBend({ intensity: 1 }, { illumination: 1, season: 'summer' }).warmth > 0.4, 'a full moon in summer warms');
  assert.ok(vibeBend({ intensity: 1 }, { illumination: 0, season: 'winter' }).warmth < -0.4, 'a new moon in winter cools');
});

ok('Davis: every state has a parameter set, and its spin is the sigil tempo table’s own', () => {
  for (const code of [...Object.keys(DAVIS_STATES), null, 'NOPE']) {
    const p = davisFaceParams(code);
    assert.equal(p.spinS, sigilTempo(code), `${code}: spin from the tempo table`);
    assert.ok(Number.isFinite(p.density) && Number.isFinite(p.ringGain));
  }
  assert.ok(davisFaceParams('UGLY').spinDir < 0, 'sifting turns against the grain (06 re-parameterization, flagged)');
  assert.ok(davisFaceParams('BLOOM').density > davisFaceParams('FLOW').density, 'a bloom is fuller');
  assert.ok(davisFaceParams('STUCK').ringGain < davisFaceParams('FLOW').ringGain, 'a stuck seed’s rings fade');
  assert.deepEqual(Object.keys(DAVIS_FACE_PARAMS).sort(), [...Object.keys(DAVIS_STATES), 'none'].sort());
});

ok('Davis source: a pure function of the seed — same seed same field, new seed new face, shades in range', () => {
  const a = buildDavisSource(42); const b = buildDavisSource(42); const c = buildDavisSource(43);
  assert.deepEqual([...a.orn.slice(0, 500)], [...b.orn.slice(0, 500)], 'deterministic');
  assert.notDeepEqual([...a.orn.slice(0, 500)], [...c.orn.slice(0, 500)], 'a new seed is a new face');
  const s = davisSampler(a, { angle: 0.7, breath: 1.02, density: 1, ringGain: 1, contrast: 1.1 });
  let lo = 1; let hi = 0;
  for (let j = 0; j < 28; j++) for (let i = 0; i < 28; i++) {
    const v = s(((i + 0.5) / 28) * 2 - 1, ((j + 0.5) / 28) * 2 - 1);
    assert.ok(v >= 0 && v <= 1, 'shade in range');
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  // PR #1728 review (Matt, 2026-10-23): the claim this line used to make — "the heart outshines its corners" —
  // was a claim about the zoom-1 BLACK corners his scale-up ruling removed. At 0.6 the corners are the ornament
  // belt, which always outshone the centre dot (only the dead margins hid it). What the crop must keep is real
  // light-to-dark across the window: a picture, not a flat wash. ("Davis fills his frame" below guards the
  // other side — no dead margins at any angle.)
  assert.ok(hi - lo > 0.3, `the crop still has structure: range ${(hi - lo).toFixed(2)}`);
  assert.ok(Math.abs(mean(davisSampler(a, { angle: 0 })) - mean(davisSampler(a, { angle: 1.3 }))) < 0.05, 'turning moves the pattern, not the light');
});

ok('Davis ramp: five stops of his colour, dark to hot, warmth bends the middle', () => {
  const ramp = davisRamp([255, 205, 130], 0);
  assert.equal(ramp.length, DAVIS_LEVELS);
  const lum = (css) => { const [r, g, b] = css.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (let i = 1; i < ramp.length; i++) assert.ok(lum(ramp[i]) > lum(ramp[i - 1]), 'the ramp climbs');
  assert.notEqual(davisRamp([255, 205, 130], 0.8)[2], ramp[2], 'warmth moves the mid stops');
});

// PR #1728 review (Matt, 2026-10-23): "right now davis has an empty gap" — at zoom 1 his rosette was a circle
// on black (21-30 dead cells in the outer frame band at every angle) inside a box whose whole job is to be
// filled by the animation. His source is sampled zoomed in so the art overflows the window — the frozen
// mockup's edge-to-edge dither — and this pins the property, not the number: zero dead cells in the band,
// at every rotation angle, at every state, under the harshest vibe contrast.
ok('Davis fills his frame: the art overflows the window — no dead margins at any angle', () => {
  const src = buildDavisSource(12345);
  const N = DITHER_GRIDS[1];
  for (const contrast of [1, 1.25]) {
    for (const code of [null, 'FLOW', 'STUCK', 'BLOOM']) {
      const p = davisFaceParams(code);
      for (let k = 0; k < 32; k++) {
        const a = (k * Math.PI * 2) / 32;
        const s = davisSampler(src, { angle: a, breath: code ? 1.03 : 1, density: p.density, ringGain: p.ringGain, contrast });
        let dead = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = ((i + 0.5) / N) * 2 - 1; const y = ((j + 0.5) / N) * 2 - 1;
          if (Math.abs(x) > 0.75 || Math.abs(y) > 0.75) {
            const v = Math.min(1, Math.max(0, s(x, y)));
            if (orderedLevel(v, i, j, DAVIS_LEVELS) === 0) dead++;
          }
        }
        assert.equal(dead, 0, `${code ?? 'rest'} @${a.toFixed(2)} (contrast ${contrast}): ${dead} dead cells in the frame band`);
      }
    }
  }
});

ok('LOIS: every honest state (and CUT) has a parameter set and a fixed glyph vocabulary', () => {
  for (const code of LOIS_FACE_CODES) {
    const p = loisFaceParams(code);
    assert.ok(LOIS_GLYPHS[p.glyphs], `${code}: a glyph set`);
    assert.equal(LOIS_GLYPHS[p.glyphs].length, LOIS_LEVELS, 'one glyph per level');
    assert.ok(p.tint >= 0 && p.tint <= 1 && p.dim === 1, `${code}: full light — she never fades (Matt, 2026-10-23)`);
  }
  assert.deepEqual(Object.keys(LOIS_FACE_PARAMS).sort(), [...Object.keys(LOIS_FACES), 'CUT'].sort());
  for (const f of LOIS_EXTRA_FACES) assert.ok(LOIS_EXTRA_EXPRS[f], `${f}: a micro-expression has a construction preset`);
  assert.ok(loisFaceParams('BURN').tint > loisFaceParams('VIBE').tint, 'her red floods a burn, barely touches a vibe');
  const inv1 = loisFaceParams('side-eye'); const inv2 = loisFaceParams('side-eye');
  assert.deepEqual(inv1, inv2, 'an invented state wears the same face every time');
});

ok('LOIS construction: features read — eyes and mouth are gaps in the lit face; no state ever fades', () => {
  const vibe = loisSampler(loisFaceParams('VIBE'));
  assert.ok(vibe(-0.31, -0.05) < vibe(-0.36, 0.2) - 0.3, 'the eye slot is a gap beside the cheek');
  assert.ok(vibe(0, 0.46) < vibe(0, 0.62) - 0.3, 'the mouth is a gap above the chin');
  assert.ok(vibe(0, -0.72) < vibe(0, 0.05), 'hair masses darker than the lit face');
  // Never fade to black (Matt, 2026-10-23: "always visible like Davis"): every honest state keeps the
  // face's full light — AWAY reads as gone through her expression (no eyes, a flat line), not a dim.
  for (const code of LOIS_FACE_CODES) {
    assert.ok(mean(loisSampler(loisFaceParams(code))) > mean(vibe) * 0.75, `${code} keeps her light`);
  }
  const burn = loisSampler(loisFaceParams('BURN'));
  assert.notDeepEqual(
    Array.from({ length: 25 }, (_, k) => burn((k % 5) * 0.3 - 0.6, Math.floor(k / 5) * 0.3 - 0.6).toFixed(3)),
    Array.from({ length: 25 }, (_, k) => vibe((k % 5) * 0.3 - 0.6, Math.floor(k / 5) * 0.3 - 0.6).toFixed(3)),
    'BURN and VIBE are different faces',
  );
});

// PR #1728 review (Matt, 2026-10-23): "have multiple expression liek we had in Unicode" — the construction
// now wears the Unicode era's faces as amplified presets (BURN's ◉ are wide open, AWAY's ── has no eyes at
// all), and an invented state wears its micro-expression's preset. This pins the readings at the COARSEST
// tier: the eyes' open/closed span, a smile and a frown on opposite sides of the mouth line, and every one
// of the thirteen presets drawing a different tier-1 picture.
ok('LOIS expressions: the Unicode faces read at dither resolution — ◉ open, ── absent, smiles and frowns', () => {
  const at = (code, x, y) => loisSampler(loisFaceParams(code))(x, y);
  assert.ok(at('BURN', 0.31, -0.05) < 0.1, "BURN's ◉ are wide open — the eye slot is a dark gap");
  assert.ok(at('VIBE', 0.31, -0.05) < 0.15, "VIBE's ─ are slits, still there");
  assert.ok(at('AWAY', 0.31, -0.05) > 0.45, "AWAY's ── has no eyes at all — the lit face shows through");
  assert.ok(at('CUT', 0.3, 0.5) < 0.4, "CUT's frown drops its mouth corner below the line");
  assert.ok(at('BURN', 0.3, 0.5) > 0.45, "BURN's grin keeps the corner clear of it");
  const N = DITHER_GRIDS[1];
  const tier1 = (p) => {
    const s = loisSampler(p, {}); const g = LOIS_GLYPHS[p.glyphs];
    return Array.from({ length: N * N }, (_, k) => {
      const i = k % N; const j = Math.floor(k / N);
      return g[orderedLevel(s(((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1), i, j, g.length)];
    }).join('');
  };
  const presets = LOIS_FACE_CODES.map((c) => [c, loisFaceParams(c)])
    .concat(LOIS_EXTRA_FACES.map((f) => [f, { ...loisFaceParams('VIBE'), ...LOIS_EXTRA_EXPRS[f] }]));
  const grids = presets.map(([name, p]) => [name, tier1(p)]);
  for (let a = 0; a < grids.length; a++) for (let b = a + 1; b < grids.length; b++) {
    let diff = 0;
    for (let k = 0; k < N * N; k++) if (grids[a][1][k] !== grids[b][1][k]) diff++;
    assert.ok(diff >= 2, `${grids[a][0]} and ${grids[b][0]} draw the same picture at tier 1 (${diff} cells apart)`);
  }
});

ok('LOIS ink: paper scaled by level, her red mixed by tint — strongest in the darks', () => {
  const ink = [232, 232, 224]; const red = [255, 77, 0];
  const rgbOf = (css) => css.match(/\d+/g).map(Number);
  const dark = rgbOf(loisInk(1, 0.45, 0, ink, red)); const darkCalm = rgbOf(loisInk(1, 0.05, 0, ink, red));
  assert.ok(dark[0] - dark[2] > darkCalm[0] - darkCalm[2], 'more tint, redder darks');
  const lite = rgbOf(loisInk(9, 0.45, 0, ink, red));
  assert.ok(lite[0] > dark[0] && lite[1] > dark[1], 'the ramp climbs with the level');
});

// LOIS's idle animation (Matt, 2026-10-23, PR #1728 review): her side was hardly visible — the breath S2
// shipped ran ±0.006, under the glyph ramp's quantization step, so the construction breathed on paper and
// sat still on screen. The breath now runs Davis's magnitude at her own per-state tempo, and this pins both
// halves: a tempo every state wears, and cells that actually change glyph level at peak lift.
ok('LOIS idle: every state breathes at its own tempo, and the breath crosses the dither', () => {
  for (const code of LOIS_FACE_CODES) {
    const p = loisFaceParams(code);
    assert.ok(p.breathS >= 3 && p.breathS <= 12, `${code}: a breath tempo between 3 and 12 seconds`);
  }
  assert.ok(loisFaceParams('BURN').breathS < loisFaceParams('AWAY').breathS, 'a burn hurries, an away drifts');
  const invented = loisFaceParams('side-eye');
  assert.ok(invented.breathS >= 3 && invented.breathS <= 12, 'an invented state wears a deterministic tempo too');
  for (const code of LOIS_FACE_CODES) {
    const p = loisFaceParams(code);
    const still = loisSampler(p, { lift: 0 });
    const breathed = loisSampler(p, { lift: 0.028 }); // peak lift — the amplitude the canvas clock runs
    let flips = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      const x = ((i + 0.5) / 12) * 2 - 1, y = ((j + 0.5) / 12) * 2 - 1;
      if (orderedLevel(still(x, y), i, j, LOIS_LEVELS) !== orderedLevel(breathed(x, y), i, j, LOIS_LEVELS)) flips++;
    }
    assert.ok(flips >= 8, `${code}: the breath flips ${flips} of 144 cells — the dither must feel it`);
  }
  // the seam RUNS that breath: the phase lives in the canvas clock, so the pin is on the source
  const faces = readFileSync(new URL('../panels/directors/RoomFaces.jsx', import.meta.url), 'utf8');
  assert.match(faces, /lift: reduced \? 0 : 0\.028 \* Math\.sin/, 'the lift runs at breath magnitude, not the 0.006 the dither ate');
  assert.match(faces, /next\.breathS/, 'her per-state tempo drives the cycle');
});

ok('parameter easing: numbers lerp, the glyph set switches at the midpoint', () => {
  const a = { eyeAngle: 0, tint: 0, glyphs: 'vibe' }; const b = { eyeAngle: 10, tint: 1, glyphs: 'burn' };
  assert.deepEqual(lerpParams(a, b, 0.5), { eyeAngle: 5, tint: 0.5, glyphs: 'burn' });
  assert.equal(lerpParams(a, b, 0.25).glyphs, 'vibe');
});

ok('purity + wiring: the module reads no clock and rolls no dice; the seam renders it, the panel is untouched', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.ok(!/Math\.random|Date\.now|performance\.now|document|window/.test(strip(readFileSync(new URL('./roomDither.js', import.meta.url), 'utf8'))), 'the pipeline is pure');
  const faces = readFileSync(new URL('../panels/directors/RoomFaces.jsx', import.meta.url), 'utf8');
  assert.match(faces, /from '..\/..\/curator\/roomDither\.js'/);
  assert.match(faces, /buildDavisSource\(seed\)/); assert.match(faces, /loisFaceParams\(code\)/); assert.match(faces, /davisFaceParams\(code\)/);
  assert.match(faces, /gridTierFor\(presence\.tier, presence\.cool\)/, 'resolution comes from the presence tier');
  const codec = readFileSync(new URL('../panels/directors/RoomCodec.jsx', import.meta.url), 'utf8');
  assert.match(codec, /<LoisFaceNow face=\{lois\.face\} overlay=\{mind\.lois\} barS=\{mind\.barS\} \/>/, 'the panel still hands the seam the same inputs');
  assert.match(codec, /<DavisFaceNow seed=\{seed\} code=\{dCode\} \/>/);
  const css = readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8');
  assert.match(css, /\.codec-dither \{ width: 84px; height: 84px;/);
});

console.log(`roomDither.selfcheck: ${n} checks passed`);
