// dishLifeRender.selfcheck.mjs — DISH LIFE slice 3b (#1923): the culture as ordinary marks.
//
//   A assets    each live cell takes the NEAREST original mark's asset / colour / tier; junk marks are skipped
//   B decay     alpha and scale follow the cell's level, so colonies rot with tails; dead cells emit nothing
//   C dissolve  the scene's own marks fade out as the cells fade in; generation 0 is the scene alone; originals untouched
//   D bounded   at most maxItems cells, strongest first, deterministic; keys are stable per cell
//   E pure      same inputs = same frame; empty / junk inputs never throw
import assert from 'node:assert/strict';
import {
  nearestMarks,
  cultureItems,
  cultureFrame,
  dissolveMarks,
  sceneKeep,
  cultureShow,
  DISSOLVE_GENS,
  MAX_CELL_ITEMS,
  DECAY_SCALE_MIN,
  speckItems,
  SPECK_MAX,
  SPECK_ALPHA,
  SPECK_GAP,
} from './dishLifeRender.mjs';
import { createCulture, stepCulture } from './dishLife.mjs';

const G = { canvasW: 1000, canvasH: 500, cols: 40, rows: 20 };
const L = { assetId: 'left', color: '#ff0000', alpha: 100, x: 100, y: 250, scale: 3, zTier: 1, rotation: 10 };
const R = { assetId: 'right', color: '#0000ff', alpha: 50, x: 900, y: 250, scale: 3, zTier: 2 };
const MARKS = [L, R];
const cell = (x, y) => y * G.cols + x;
const aliveCulture = (cells, gen = 0) => {
  const seed = new Uint8Array(G.cols * G.rows);
  for (const [x, y] of cells) seed[cell(x, y)] = 1;
  const c = createCulture({ cols: G.cols, rows: G.rows, seed });
  c.gen = gen;
  return c;
};

// ---- A: assets
{
  const near = nearestMarks(MARKS, G);
  assert.equal(near[cell(2, 10)], 0, 'a cell on the left takes the left mark');
  assert.equal(near[cell(37, 10)], 1, 'a cell on the right takes the right mark');
  assert.equal(near[cell(20, 10)] === 0 || near[cell(20, 10)] === 1, true);
  const items = cultureItems(
    aliveCulture(
      [
        [2, 10],
        [37, 10],
      ],
      20,
    ),
    MARKS,
    near,
    G,
  );
  assert.equal(items.length, 2);
  const l = items.find((i) => i.key === `life:${cell(2, 10)}`);
  const r = items.find((i) => i.key === `life:${cell(37, 10)}`);
  assert.deepEqual(
    [l.assetId, l.color, l.zTier, l.rotation],
    ['left', '#ff0000', 1, 10],
    "the scene's own asset, colour, tier, rotation",
  );
  assert.deepEqual([r.assetId, r.color, r.zTier], ['right', '#0000ff', 2]);
  assert.ok(
    Math.abs(l.x - 2.5 * 25) < 1e-9 && Math.abs(l.y - 10.5 * 25) < 1e-9,
    'a cell stamps at its centre, in canvas px',
  );
  assert.ok(
    Math.abs(l.alpha - 100) < 1e-9 && Math.abs(r.alpha - 50) < 1e-9,
    "alpha is the nearest mark's alpha × level × show, in placement units (0..100)",
  );
  // junk marks are skipped, never nearest
  const junk = nearestMarks([null, { x: NaN, y: 1 }, { x: 50, y: 50 }, 'x'], G);
  for (const v of junk) assert.equal(v, 2, 'only the valid mark can be nearest');
  assert.ok(
    nearestMarks([], G).every((v) => v === -1),
    'no marks: nothing is nearest',
  );
  assert.ok(nearestMarks(null, G).every((v) => v === -1));
  assert.ok(
    nearestMarks([{ x: NaN, y: NaN }], G).every((v) => v === -1),
    'only junk marks: nothing is nearest',
  );
}

// ---- A2: the cell is the mark's kind — every field rides along, so the Look path draws it as that mark
{
  const rich = {
    x: 100,
    y: 250,
    scale: 3,
    scaleY: 3,
    alpha: 80,
    assetId: 'g',
    color: '#123',
    accent: '#456',
    glass: true,
    plate: false,
    wash: true,
    stipple: false,
    matParams: { k: 1 },
    t: 0.25,
    key: 'p9-g',
    index: 9,
    zTier: 2,
  };
  const near = nearestMarks([rich], G);
  const c = aliveCulture([[4, 10]], 20);
  const [it] = cultureItems(c, [rich], near, G);
  for (const k of ['assetId', 'color', 'accent', 'glass', 'plate', 'wash', 'stipple', 't', 'zTier'])
    assert.equal(it[k], rich[k], `${k} rides along`);
  assert.deepEqual(it.matParams, rich.matParams, 'matParams ride along');
  assert.equal(it.scaleY, it.scale, 'isotropic, like the placement engine');
  assert.equal(it.key, `life:${cell(4, 10)}`, "its own key, not the mark's");
  assert.equal(it.index, cell(4, 10), 'its own index');
  assert.ok(it.alpha > 0 && it.alpha <= 80, "placement alpha, never above the mark's");
}

// ---- B: decay
{
  const near = nearestMarks(MARKS, G);
  const c = aliveCulture([[10, 10]], 20);
  const fresh = cultureItems(c, MARKS, near, G)[0];
  stepCulture(c); // a lone cell starves: it starts decaying, it does not vanish
  stepCulture(c);
  c.gen = 20;
  const dying = cultureItems(c, MARKS, near, G)[0];
  assert.ok(dying, 'a decaying cell is still drawn');
  assert.ok(dying.alpha < fresh.alpha, 'alpha follows level down');
  assert.ok(dying.scale < fresh.scale, 'scale shrinks with decay');
  assert.ok(dying.scale >= fresh.scale * DECAY_SCALE_MIN - 1e-9, 'but never vanishes before it is dead');
  for (let i = 0; i < 12; i++) stepCulture(c);
  c.gen = 20;
  assert.equal(cultureItems(c, MARKS, near, G).length, 0, 'a dead culture emits nothing');
  assert.equal(
    cultureItems(aliveCulture([[10, 10]], 0), MARKS, near, G).length,
    0,
    'generation 0 draws no cells: it is the scene',
  );
}

// ---- C: dissolve
{
  assert.equal(sceneKeep(0), 1);
  assert.equal(sceneKeep(DISSOLVE_GENS), 0);
  assert.equal(cultureShow(0), 0);
  assert.equal(cultureShow(DISSOLVE_GENS), 1);
  let ps = 1;
  let pc = 0;
  for (let g = 1; g <= DISSOLVE_GENS + 2; g++) {
    assert.ok(sceneKeep(g) <= ps, 'the scene only fades out');
    assert.ok(cultureShow(g) >= pc, 'the culture only fades in');
    ps = sceneKeep(g);
    pc = cultureShow(g);
  }
  assert.equal(dissolveMarks(MARKS, 0), MARKS, 'generation 0 is the scene, untouched (same array)');
  const half = dissolveMarks(MARKS, DISSOLVE_GENS / 2);
  assert.equal(half.length, 2);
  assert.ok(Math.abs(half[0].alpha - 50) < 1e-9, 'halfway: the scene is half-faded (placement units, 0..100)');
  assert.equal(L.alpha, 100, 'the originals are never edited');
  assert.deepEqual(dissolveMarks(MARKS, DISSOLVE_GENS), [], 'fully dissolved: the scene marks are dropped');
  assert.deepEqual(dissolveMarks(null, 5), []);
  const near = nearestMarks(MARKS, G);
  const c = aliveCulture([[2, 10]], DISSOLVE_GENS / 2);
  const frame = cultureFrame(MARKS, c, near, G);
  assert.equal(frame.length, 2 + 1, 'mid-dissolve: the fading scene and the fading-in cells share the frame');
  const cellItem = frame.find((i) => String(i.key).startsWith('life:'));
  assert.ok(Math.abs(cellItem.alpha - 50) < 1e-9, 'cells are half-shown halfway through the dissolve');
  const late = cultureFrame(MARKS, aliveCulture([[2, 10]], DISSOLVE_GENS), near, G);
  assert.ok(
    late.every((i) => String(i.key).startsWith('life:')),
    'after the dissolve only the culture is drawn',
  );
  assert.deepEqual(cultureFrame(MARKS, null, near, G), MARKS, 'no culture: exactly the scene');
}

// ---- D: bounded
{
  const near = nearestMarks(MARKS, G);
  const cells = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 40; x++) cells.push([x, y]);
  const full = aliveCulture(cells, 30);
  assert.equal(cultureItems(full, MARKS, near, G).length, MAX_CELL_ITEMS, 'the default cap holds');
  const capped = cultureItems(full, MARKS, near, { ...G, maxItems: 10 });
  assert.equal(capped.length, 10);
  assert.deepEqual(
    capped.map((i) => i.index),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    'equal levels: the cut is by cell index, deterministic',
  );
  // the strongest cells are the ones kept: a half-decayed cell loses to alive cells when the cap bites
  const mixed = aliveCulture(
    [
      [5, 5],
      [6, 5],
      [7, 5],
    ],
    30,
  );
  mixed.field.level[cell(5, 5)] = 0.3;
  const kept = cultureItems(mixed, MARKS, near, { ...G, maxItems: 2 });
  assert.deepEqual(
    kept.map((i) => i.index).sort((a, b) => a - b),
    [cell(6, 5), cell(7, 5)],
    'the cap drops the weakest first',
  );
  assert.equal(cultureItems(full, MARKS, near, { ...G, maxItems: 0 }).length, 0);
  const keys = cultureItems(full, MARKS, near, G).map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique per cell');
  assert.ok(
    keys.every((k) => /^life:\d+$/.test(k)),
    'and stable: life:<cell>',
  );
}

// ---- E: pure / thin inputs
{
  const near = nearestMarks(MARKS, G);
  const c = aliveCulture(
    [
      [3, 3],
      [4, 3],
      [5, 3],
    ],
    12,
  );
  assert.deepEqual(cultureFrame(MARKS, c, near, G), cultureFrame(MARKS, c, near, G), 'same inputs, same frame');
  assert.deepEqual(cultureItems(null, MARKS, near, G), []);
  assert.deepEqual(cultureItems(c, [], near, G), []);
  assert.deepEqual(cultureItems(c, null, near, G), []);
  const orphan = new Int32Array(G.cols * G.rows).fill(-1);
  assert.deepEqual(cultureItems(c, MARKS, orphan, G), [], 'cells with no nearest mark are not drawn');
}
// ---- S: the tertiary specks — faint points in the gaps between marks, never on a mark
{
  const near = nearestMarks(MARKS, G);
  const onMark = [4, 10]; // x≈112px: right on the left mark
  const inGap = [20, 10]; // x≈512px: far from both marks
  const c = aliveCulture([onMark, inGap]);
  const sp = speckItems(c, MARKS, near, { ...G, strength: 0.5, envelope: 1 });
  assert.equal(sp.length, 1, 'only the gap cell makes a speck — the cell on a mark makes none');
  assert.equal(sp[0].index, cell(20, 10));
  assert.ok(sp[0].key.startsWith('speck:'), 'keyed apart from the cells and the marks');
  const nearest = MARKS[near[cell(20, 10)]];
  assert.equal(sp[0].assetId, nearest.assetId, "it wears the nearest mark's asset");
  assert.equal(sp[0].color, nearest.color, 'and its colour (palette-true)');
  assert.ok(
    sp[0].alpha > 0 && sp[0].alpha <= nearest.alpha * SPECK_ALPHA + 1e-9,
    'a sliver of its alpha, never the mark itself',
  );
  const half = speckItems(c, MARKS, near, { ...G, strength: 0.25, envelope: 1 });
  assert.ok(Math.abs(half[0].alpha - sp[0].alpha / 2) < 1e-9, 'half the strength, half the speck');
  assert.deepEqual(speckItems(c, MARKS, near, { ...G, strength: 0, envelope: 1 }), [], 'strength 0 is silence');
  assert.deepEqual(
    speckItems(c, MARKS, near, { ...G, strength: 0.5, envelope: 0 }),
    [],
    'envelope 0: the layer at rest',
  );
  const live = cultureItems(aliveCulture([onMark, inGap], 20), MARKS, near, {
    canvasW: G.canvasW,
    canvasH: G.canvasH,
  }).find((it) => it.index === cell(20, 10));
  assert.ok(sp[0].scale < live.scale, 'a speck is smaller than a live cell');
  const many = [];
  for (let x = 12; x < 28; x++) for (let y = 2; y < 18; y++) many.push([x, y]);
  const big = aliveCulture(many);
  const a = speckItems(big, MARKS, near, { ...G, strength: 1, envelope: 1, maxItems: 10 });
  const b = speckItems(big, MARKS, near, { ...G, strength: 1, envelope: 1, maxItems: 10 });
  assert.equal(a.length, 10, 'bounded by maxItems');
  assert.deepEqual(a, b, 'same inputs, same specks');
  assert.ok(speckItems(big, MARKS, near, { ...G, strength: 1, envelope: 1 }).length <= SPECK_MAX);
  assert.deepEqual(speckItems(null, MARKS, near, { ...G, strength: 1, envelope: 1 }), []);
  assert.deepEqual(speckItems(c, [], near, { ...G, strength: 1, envelope: 1 }), []);
  assert.ok(SPECK_GAP > 1, 'a gap is farther than the mark itself');
}
console.log('dishLifeRender.selfcheck: ok');
