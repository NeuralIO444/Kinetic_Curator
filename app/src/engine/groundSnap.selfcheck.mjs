// node src/engine/groundSnap.selfcheck.mjs
// #1183 palette snap — a share of the marks take the exact colours of the PATTERN tile beneath them (Matt's
// decisions, 2026-10-12). Off is byte-identical; the snapped set is fixed per seed and grows with the knob; both
// colours snap to the tile's own colours (never its ground); snap wins over GROUND's lean; a still equals live.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { colorDistance2, nearestColor, snapPair, snaps, applyGroundSnap } from './groundSnap.js';
import { patternGround } from '../pattern/ground.js';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../data/layout-modes.js';
import { RANDOMIZABLE_KEYS } from '../state/paramUtils.js';
import { STRING_CHANNEL_GROUPS } from './kernel/rng.js';
import { defaultPattern } from '../state/patternTrack.js';
import { resolvePalette } from '../data/palettes.js';

// 1. colour maths
{
  assert.equal(colorDistance2('#336699', '#336699'), 0);
  assert.equal(colorDistance2('#336699', 'junk'), Infinity);
  assert.equal(nearestColor('#f00000', ['#0000ff', '#ee1111', '#00ff00']), '#ee1111');
  assert.equal(nearestColor('#808080', []), null);
  assert.deepEqual(
    snapPair('#ff0000', '#0000ff', ['#ee2222', '#2222ee', '#22ee22']),
    { color: '#ee2222', accent: '#2222ee' },
    'main and accent each find their nearest',
  );
  assert.deepEqual(
    snapPair('#ff0000', '#ff1010', ['#ee2222', '#2222ee']),
    { color: '#ee2222', accent: '#2222ee' },
    'the accent takes one of the OTHER tile colours, so the mark keeps two tones',
  );
  assert.deepEqual(
    snapPair('#ff0000', '#00ff00', ['#ee2222']),
    { color: '#ee2222', accent: '#ee2222' },
    'a one-colour tile gives both',
  );
}

// 2. which marks snap: fixed per seed, grows with the knob, about the share, on the COLOUR stream
{
  assert.equal(snaps(5, 3, 0), false);
  assert.equal(snaps(5, 3, 1), true);
  let at40 = 0;
  let at70 = 0;
  for (let i = 0; i < 4000; i++) {
    const a = snaps(77, i, 0.4);
    const b = snaps(77, i, 0.7);
    if (a) at40++;
    if (b) at70++;
    if (a) assert.ok(b, 'raising the knob only ever adds marks');
    assert.equal(snaps(77, i, 0.4), a, 'deterministic');
  }
  assert.ok(
    Math.abs(at40 / 4000 - 0.4) < 0.03 && Math.abs(at70 / 4000 - 0.7) < 0.03,
    `about the share (${at40}, ${at70} of 4000)`,
  );
  assert.equal(STRING_CHANNEL_GROUPS.snap, 'color', 'the snap channel rides the colour stream');
  const differ = (off) => {
    let d = 0;
    for (let i = 0; i < 500; i++) if (snaps(77, i, 0.5, off) !== snaps(77, i, 0.5)) d++;
    return d;
  };
  assert.ok(differ({ color: 12345 }) > 100, 're-rolling colour reshuffles the snapped set');
  assert.equal(differ({ spatial: 12345 }), 0, 're-rolling spatial does not');
  assert.equal(differ({ asset: 12345 }), 0);
}

// 3. the applier: fresh arrays, base arrays untouched, null when nothing snaps
{
  const soa = { n: 3, x: [10, 20, 30], y: [10, 20, 30], index: new Int32Array([0, 1, 2]) };
  const colors = ['#ff0000', '#00ff00', '#0000ff'];
  const accents = ['#ffffff', '#ffffff', '#ffffff'];
  const r = applyGroundSnap({ soa, colors, accents, rolesAt: () => ['#111111', '#eeeeee'], share: 1, seed: 1 });
  assert.notEqual(r.colors, colors);
  assert.notEqual(r.accents, accents);
  assert.deepEqual(colors, ['#ff0000', '#00ff00', '#0000ff'], 'the base colours are never mutated');
  assert.deepEqual(Array.from(r.snapped), [1, 1, 1]);
  assert.ok(r.colors.every((c) => c === '#111111' || c === '#eeeeee'));
  assert.equal(applyGroundSnap({ soa, colors, accents, rolesAt: () => ['#111111'], share: 0, seed: 1 }), null);
  assert.equal(applyGroundSnap({ soa, colors, accents, rolesAt: null, share: 1, seed: 1 }), null);
}

const pal = resolvePalette('bone', null, []);

// 4. roles(): main first (= the colour lean's target), never the ground, never empty — FIELD, QUILT, GLYPH
{
  for (const mode of ['FIELD', 'QUILT', 'GLYPH']) {
    for (const seed of [3, 21, 40]) {
      const g = patternGround(defaultPattern(mode, seed), pal, 1000, 700);
      for (let i = 0; i < 300; i++) {
        const x = (i * 37.3) % 1000;
        const y = (i * 53.1) % 700;
        const r = g.roles(x, y, 0);
        assert.ok(Array.isArray(r) && r.length >= 1 && r.length <= 3, `${mode}: 1..3 role colours`);
        assert.equal(r[0], g.at(x, y, 0).toLowerCase(), `${mode}: the main colour comes first`);
        assert.equal(new Set(r).size, r.length, `${mode}: de-duplicated`);
        for (const c of r) assert.match(c, /^#[0-9a-f]{6}$/);
      }
    }
  }
}

// ── the live frame ───────────────────────────────────────────────────────────────────────────────────────────────
const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
const P = (id, mode = 'QUILT', seed = 21, extra = {}) =>
  L(id, { type: 'pattern', pattern: { ...defaultPattern(mode, seed), ...extra } });
const lp = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  mode: 'random',
  count: 240,
  kinemeBreath: 0,
  kinemeDrift: 0,
  kinemePaletteBreath: 0,
  lifeDrift: 0,
  ...over,
});
const input = (over = {}) => ({
  canvasW: 1000,
  canvasH: 700,
  layers: [P('p'), L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 1234,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: lp(),
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 16,
  dtSec: 0.016,
  perfClampOverride: null,
  perfTier1: false,
  assetThin: false,
  slowRender: false,
  scaleMul: 1,
  alphaBoost: 0,
  effectiveScale: [0.5, 1.5],
  effectiveAlpha: [20, 100],
  phraseWrapGen: 0,
  attractor: null,
  ...over,
});
const itemsOf = (out, id = 'lyr-a') => out.find((l) => l.id === id).items;
const hash = (items) =>
  createHash('sha256')
    .update(
      JSON.stringify(items.map((i) => [i.x, i.y, i.scale, i.rotation, i.alpha, i.assetId, i.tint, i.color, i.accent])),
    )
    .digest('hex');
const frame = (over) => itemsOf(createLiveResolver().resolveLayers(input(over)));
const col = (c) => String(c).toLowerCase();

// 5. the knob ships off, never rolled; off is byte-identical
{
  assert.equal(DEFAULT_LAYOUT_PARAMS.groundSnap, 0);
  assert.deepEqual(PARAM_SPEC.groundSnap, { min: 0, max: 1 });
  assert.ok(!RANDOMIZABLE_KEYS.includes('groundSnap'), 'the dice never turn it on');
  const off = hash(frame());
  const noKey = { ...lp() };
  delete noKey.groundSnap;
  assert.equal(hash(frame({ layoutParams: noKey })), off, 'a layout without the key is the same frame');
  const plain = hash(frame({ layers: [L('lyr-a')] }));
  assert.equal(
    hash(frame({ layers: [L('lyr-a')], layoutParams: lp({ groundSnap: 1 }) })),
    plain,
    'no pattern below: nothing to snap to',
  );
  assert.equal(
    hash(frame({ layers: [L('lyr-a'), P('p')], layoutParams: lp({ groundSnap: 1 }) })),
    hash(frame({ layers: [L('lyr-a'), P('p')] })),
    'a pattern ABOVE is not the ground',
  );
}

// 6. full snap: every mark wears its tile's colours exactly, both tones; nothing moves
{
  const g = patternGround(input().layers[0].pattern, pal, 1000, 700);
  const off = frame();
  const on = frame({ layoutParams: lp({ groundSnap: 1 }) });
  assert.equal(on.length, off.length);
  let recoloured = 0;
  for (let k = 0; k < on.length; k++) {
    assert.equal(on[k].x, off[k].x);
    assert.equal(on[k].y, off[k].y);
    assert.equal(on[k].scale, off[k].scale);
    const roles = g.roles(off[k].x, off[k].y, 0.016);
    const want = snapPair(off[k].color, off[k].accent, roles);
    assert.equal(col(on[k].color), want.color, `mark ${k}: main colour = the nearest tile colour`);
    assert.equal(col(on[k].accent), want.accent, `mark ${k}: accent = the nearest of the tile's other colours`);
    if (col(on[k].color) !== col(off[k].color)) recoloured++;
  }
  assert.ok(recoloured > on.length / 2, `the snap really recolours (${recoloured}/${on.length})`);
}

// 7. a share: about that many marks, the same ones every frame, a superset as the knob rises; snap wins over lean
{
  const off = frame();
  const snappedSet = (share, over = {}) => {
    const on = frame({ layoutParams: lp({ groundSnap: share }), ...over });
    const s = new Set();
    on.forEach((it, k) => {
      if (col(it.color) !== col(off[k].color) || col(it.accent) !== col(off[k].accent)) s.add(k);
    });
    return s;
  };
  const s40 = snappedSet(0.4);
  const s80 = snappedSet(0.8);
  for (const k of s40) assert.ok(s80.has(k), 'raising the knob keeps every mark that already snapped');
  assert.ok(s40.size > 40 && s40.size < 140, `about 40% of 240 marks (${s40.size} visibly recoloured)`);
  const r = createLiveResolver();
  const args = { layoutParams: lp({ groundSnap: 0.4 }) };
  const h1 = hash(itemsOf(r.resolveLayers(input(args))));
  for (let i = 0; i < 4; i++) r.resolveLayers(input(args));
  assert.equal(hash(itemsOf(r.resolveLayers(input(args)))), h1, 'the same frame again is the same frame');

  const snapOnly = frame({ layoutParams: lp({ groundSnap: 1 }) });
  const both = frame({ layoutParams: lp({ groundSnap: 1, groundLean: 1 }) });
  for (let k = 0; k < both.length; k++)
    assert.equal(col(both[k].color), col(snapOnly[k].color), 'snap wins: a snapped mark is not leaned');
  const lean = frame({ layoutParams: lp({ groundLean: 0.6 }) });
  const half = frame({ layoutParams: lp({ groundLean: 0.6, groundSnap: 0.4 }) });
  const halfSnap = frame({ layoutParams: lp({ groundSnap: 0.4 }) });
  let leanedKept = 0;
  for (let k = 0; k < half.length; k++) {
    if (col(halfSnap[k].color) === col(off[k].color) && col(halfSnap[k].accent) === col(off[k].accent)) {
      assert.equal(col(half[k].color), col(lean[k].color), `mark ${k}: a mark that did not snap is leaned as before`);
      leanedKept++;
    }
  }
  assert.ok(leanedKept > 50);
}

// 8. a STILL equals the live frame with the snap on
{
  const { resolveLayers: resolveStill } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');
  const layers = [P('p', 'FIELD', 9), L('lyr-a')];
  const params = lp({ groundSnap: 0.6, groundLean: 0.5, count: 120 });
  const live = itemsOf(createLiveResolver().resolveLayers(input({ layers, layoutParams: params, loopTimeMs: 0 })));
  const still = resolveStill(
    {
      layers,
      activeLayerId: 'lyr-a',
      layerSnapshots: {},
      seed: 1234,
      paletteId: 'bone',
      paletteOverrides: null,
      layoutParams: params,
      patternTime: 0,
    },
    { caps: getRenderCaps('balanced') },
  ).find((l) => l.id === 'lyr-a').items;
  assert.equal(still.length, live.length);
  for (let k = 0; k < live.length; k++) {
    assert.equal(col(still[k].color), col(live[k].color), `mark ${k}: still colour equals live`);
    assert.equal(col(still[k].accent), col(live[k].accent));
  }
}

console.log('groundSnap.selfcheck: ok (#1183 palette snap)');
