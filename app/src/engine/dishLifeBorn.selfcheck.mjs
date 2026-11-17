// node src/engine/dishLifeBorn.selfcheck.mjs
// #2152 slice 2 (re-cut) — DISH LIFE births are copies of the stage's own marks (docs/design/dish-life-on-assets.md). Pinned:
//   law       closed gates give nothing; a copy is its nearest dealt mark, smaller and quieter, at a live EMPTY cell; never on a
//             mark's body; dead ground births nothing; a decaying cell's copy fades and shrinks with it; nearest the parent first
//             (ties by cell); the dial scales the count; the cap holds; the share rule stops births at half the dealt ink; terrain,
//             the poem, fluid copies and Life's own copies are never parents; each copy joins its parent's layer; the fluid leans
//             a copy; same inputs give the same copies; nothing handed in is mutated
//   resolver  LIFE up without the recorded marker is byte-identical to slice 1 (an older take replays unchanged); LIFE 0 with the
//             marker is the plain frame; with the marker, copies appear and every one is a smaller, quieter copy of a dealt mark
//             in its layer; the dealt marks are exactly the slice 1 marks; the first shed step drops every copy (copies shed
//             first) while the fade still runs; a Life picture dissolving the scene seats none, the quiet read does; the same stream replays bit-identically
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lifeBornItems, isLifeBorn, BORN_CAP, BORN_SHARE, BORN_SCALE, BORN_ALPHA, BORN_KEY } from './dishLifeBorn.mjs';
import { LIFE_SHRINK } from './dishLifeCouple.mjs';
import { createLiveResolver } from '../gl/liveResolve.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

// ---------------------------------------------------------------- the law on a small dish
// A 20×10 dish on a 2000×1000 stage: a cell is 100 px. Marks are small (scale 0.02 → the body is one cell).
const COLS = 20;
const ROWS = 10;
const W = 2000;
const H = 1000;
const field = (fill = 1, over = {}) => ({
  active: true,
  cols: COLS,
  rows: ROWS,
  gen: 5,
  level: new Float32Array(COLS * ROWS).fill(fill),
  activity: new Float32Array(COLS * ROWS),
  ...over,
});
const at = (cx, cy) => cy * COLS + cx;
const mark = (cx, cy, over = {}) => ({
  x: (cx + 0.5) * 100,
  y: (cy + 0.5) * 100,
  scale: 0.02,
  scaleY: 0.02,
  rotation: 0.3,
  alpha: 80,
  index: 0,
  t: 0.5,
  zTier: 0,
  assetId: 'a1',
  color: '#111',
  accent: '#eee',
  key: `m-${cx}-${cy}`,
  ...over,
});
// The law cases isolate each rule from the share rule (share: Infinity); the share rule has its own case below.
const born = (published, layers, opts = {}) =>
  lifeBornItems(published, layers, { W, H, life: 1, share: Infinity, ...opts });
const flat = (res) => res.flat();

ok('law: closed gates give nothing', () => {
  const layers = [{ items: [mark(5, 5)] }];
  for (const p of [null, undefined, {}, field(1, { active: false }), field(1, { level: null })])
    assert.equal(flat(born(p, layers)).length, 0);
  for (const life of [0, -1, NaN, undefined]) assert.equal(flat(born(field(), layers, { life })).length, 0);
  assert.equal(flat(born(field(), [{ items: [] }])).length, 0, 'no dealt marks: never a shape of its own');
  assert.equal(flat(born(field(), layers, { W: 0 })).length, 0);
  assert.deepEqual(born(field(), null), []);
});

ok('law: a copy is its nearest dealt mark, smaller and quieter, at a live empty cell', () => {
  const p = mark(5, 5);
  const res = flat(born(field(), [{ items: [p] }], { life: 8 / BORN_CAP }));
  assert.equal(res.length, 8, 'the first ring: the eight cells round the parent');
  for (const c of res) {
    assert.ok(isLifeBorn(c) && c.key.startsWith(BORN_KEY));
    assert.equal(c.assetId, p.assetId);
    assert.equal(c.color, p.color);
    assert.equal(c.rotation, p.rotation);
    assert.ok(near(c.scale, p.scale * BORN_SCALE) && near(c.scaleY, p.scaleY * BORN_SCALE), 'smaller');
    assert.ok(near(c.alpha, p.alpha * BORN_ALPHA), 'quieter');
    const cx = Math.floor(c.x / 100);
    const cy = Math.floor(c.y / 100);
    assert.ok(Math.max(Math.abs(cx - 5), Math.abs(cy - 5)) === 1, 'beside the parent, never on it');
    assert.equal(c.x, (cx + 0.5) * 100, 'seated at the cell centre');
  }
  assert.equal(new Set(res.map((c) => c.key)).size, 8, 'one copy per cell');
});

ok('law: never on a mark body; dead ground births nothing; a decaying cell fades and shrinks its copy', () => {
  const f = field(0);
  f.level[at(6, 5)] = 1;
  f.level[at(5, 5)] = 1; // under the parent itself
  f.level[at(7, 5)] = 0.5;
  f.level[at(8, 5)] = 0.01; // below the LIFE floor: gone
  const p = mark(5, 5);
  const res = flat(born(f, [{ items: [p] }]));
  assert.deepEqual(
    res.map((c) => c.index).sort((a, b) => a - b),
    [at(6, 5), at(7, 5)],
  );
  const half = res.find((c) => c.index === at(7, 5));
  assert.ok(near(half.alpha, p.alpha * BORN_ALPHA * 0.5), 'fades with its cell');
  assert.ok(near(half.scale, p.scale * BORN_SCALE * (1 - LIFE_SHRINK * 0.5)), 'shrinks with its cell');
  const big = mark(5, 5, { scale: 60, scaleY: 60 }); // a body covering the whole dish
  assert.equal(flat(born(field(), [{ items: [big] }])).length, 0, 'a covered dish has no empty ground');
});

ok('law: nearest the parent first, ties by cell; the dial scales the count; the cap holds', () => {
  const layers = [{ items: [mark(10, 5)] }];
  const ring = (c) => Math.max(Math.abs(Math.floor(c.x / 100) - 10), Math.abs(Math.floor(c.y / 100) - 5));
  const res = flat(born(field(), layers, { life: 40 / BORN_CAP }));
  assert.equal(res.length, 40);
  for (let k = 1; k < res.length; k++) {
    assert.ok(ring(res[k]) >= ring(res[k - 1]), 'rings in order');
    if (ring(res[k]) === ring(res[k - 1])) assert.ok(res[k].index > res[k - 1].index, 'ties by cell');
  }
  assert.equal(res.filter((c) => ring(c) === 1).length, 8, 'ring 1 is full before ring 2 opens');
  assert.equal(res.filter((c) => ring(c) === 2).length, 16);
  assert.ok(flat(born(field(), layers, { life: 0.01 })).length <= Math.ceil(BORN_CAP * 0.01));
  // many big-ink parents so the share rule is not what stops it: the cap is
  const bigDish = { active: true, cols: 96, rows: 54, gen: 1, level: new Float32Array(96 * 54).fill(1) };
  const wide = [];
  for (let x = 2; x < 96; x += 3)
    for (let y = 2; y < 54; y += 3)
      wide.push({
        ...mark(0, 0),
        x: (x + 0.5) * (W / 96),
        y: (y + 0.5) * (H / 54),
        scale: 0.004,
        scaleY: 0.004,
        key: `w-${x}-${y}`,
      });
  const capped = flat(lifeBornItems(bigDish, [{ items: wide }], { W, H, life: 1, share: Infinity }));
  assert.equal(capped.length, BORN_CAP, 'never more than the cap');
});

ok('law: the share rule stops births at half the dealt ink', () => {
  const layers = [{ items: [mark(5, 5), mark(14, 5)] }];
  const dealt = 2 * 0.02 * 0.02 * 80;
  const res = flat(born(field(), layers, { share: BORN_SHARE }));
  const ink = res.reduce((s, c) => s + Math.abs(c.scale * c.scaleY) * c.alpha, 0);
  assert.ok(ink <= BORN_SHARE * dealt + 1e-12, 'copies never pass half the dealt ink');
  const one = 0.02 * 0.02 * BORN_SCALE * BORN_SCALE * 80 * BORN_ALPHA;
  assert.equal(res.length, Math.floor((BORN_SHARE * dealt) / one + 1e-9), 'and they fill the share, no further');
  assert.equal(res.length, 3, 'two parents carry three copies here, far below what the live ground would hold');
});

ok('law: terrain, the poem and copies are never parents; each copy joins its parent layer', () => {
  const none = [
    mark(5, 5, { held: true }),
    mark(8, 5, { locked: true }),
    mark(11, 5, { life: 'bedrock' }),
    mark(14, 5, { key: 'field-0' }),
    mark(3, 2, { key: 'fluid-dup:7' }),
    mark(3, 7, { key: `${BORN_KEY}9` }),
    mark(16, 2, { alpha: 0 }),
  ];
  assert.equal(flat(born(field(), [{ items: none }])).length, 0);
  const a = mark(3, 5, { assetId: 'A' });
  const b = mark(16, 5, { assetId: 'B' });
  const res = born(field(), [{ items: [a] }, { items: [b] }], { life: 16 / BORN_CAP });
  assert.equal(res.length, 2);
  assert.ok(res[0].length > 0 && res[1].length > 0);
  assert.ok(res[0].every((c) => c.assetId === 'A') && res[1].every((c) => c.assetId === 'B'));
  // a held mark's body is still occupied ground
  const withHeld = flat(born(field(), [{ items: [a, mark(4, 5, { held: true })] }], { life: 8 / BORN_CAP }));
  assert.ok(
    withHeld.every((c) => c.index !== at(4, 5)),
    'never seated on terrain',
  );
});

ok('law: the fluid leans a copy; same inputs, same copies; nothing handed in is mutated', () => {
  const p = mark(5, 5);
  const layers = [{ items: [p] }];
  const f = field();
  const before = JSON.stringify(layers) + [...f.level].join(',');
  const lean = {
    density: new Float32Array(96 * 54).fill(1),
    magnets: [{ x: 0.9, y: 0.5 }],
    pull: 1,
    aspectHW: H / W,
    W,
    H,
  };
  const plain = flat(born(f, layers, { life: 8 / BORN_CAP }));
  const leaned = flat(born(f, layers, { life: 8 / BORN_CAP, lean }));
  assert.equal(leaned.length, plain.length);
  assert.ok(
    leaned.some((c, k) => c.x !== plain[k].x || c.y !== plain[k].y),
    'the lean moved a copy',
  );
  assert.deepEqual(flat(born(f, layers)), flat(born(f, layers)));
  assert.equal(JSON.stringify(layers) + [...f.level].join(','), before);
});

// ---------------------------------------------------------------- the real resolver
const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
const baseInput = (over = {}) => ({
  layers: [L('lyr-a')],
  activeLayerId: 'lyr-a',
  layerSnapshots: {},
  seed: 4242,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  layoutParams: {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 60,
    particleCount: 60,
    mode: 'random',
    kinemeBreath: 0,
    kinemeDrift: 0,
    kinemePaletteBreath: 0,
  },
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  quality: 'balanced',
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  loopTimeMs: 0,
  dtSec: 1 / 60,
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
  mixSeconds: 0,
  canvasW: 1280,
  canvasH: 720,
  ...over,
});
const DT = 16.7;
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) return `${v.constructor.name}[${[...v].join(',')}]`;
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${k}:${canon(v[k])}`)
      .join(',')}}`;
  }
  return String(v);
};
const hash = (layers) => createHash('sha256').update(canon(layers)).digest('hex').slice(0, 16);
const fstamp = (gen, shed = 0) => ({ mode: 'field', wakeMs: 0, gen, cycleGens: 48, shed });
const itemsOf = (out) => out.find((l) => Array.isArray(l.items))?.items ?? [];
const FRAMES = 40;
const run = ({ life, marker = false, shed = 0, extra = null } = {}) => {
  const r = createLiveResolver();
  const hashes = [];
  const outs = [];
  for (let f = 0; f < FRAMES; f++) {
    const out = r.resolveLayers(
      baseInput({
        loopTimeMs: f * DT,
        dtSec: DT / 1000,
        dishField: fstamp(f, shed),
        dishFieldCoupling: 0,
        ...(life !== undefined ? { dishFieldLife: life } : {}),
        ...(marker ? { dishFieldBorn: 1 } : {}),
        ...(extra ? extra(f) : {}),
      }),
    );
    hashes.push(hash(out));
    outs.push(itemsOf(out).map((it) => ({ ...it })));
  }
  r.dispose();
  return { hashes, outs };
};

ok(
  'resolver: without the recorded marker LIFE is slice 1, byte for byte; LIFE 0 with the marker is the plain frame',
  () => {
    const slice1 = run({ life: 1 });
    for (const items of slice1.outs) assert.ok(!items.some(isLifeBorn), 'an older take births nothing');
    assert.deepEqual(run({ life: 0, marker: true }).hashes, run({ life: 0 }).hashes, 'dial 0: no work, same frame');
    assert.deepEqual(run({ marker: true }).hashes, run({}).hashes, 'the marker alone does nothing');
  },
);

ok('resolver: with the marker, copies of the dealt marks appear beside them, smaller and quieter', () => {
  const slice1 = run({ life: 1 });
  const withBorn = run({ life: 1, marker: true });
  let seen = 0;
  let most = 0;
  for (let f = 0; f < FRAMES; f++) {
    const dealt = withBorn.outs[f].filter((it) => !isLifeBorn(it));
    const copies = withBorn.outs[f].filter(isLifeBorn);
    assert.deepEqual(dealt, slice1.outs[f], 'the dealt marks are exactly the slice 1 marks, in place and in order');
    assert.ok(copies.length <= BORN_CAP);
    assert.ok(withBorn.outs[f].slice(dealt.length).every(isLifeBorn), 'copies sit after the layer own dealt marks');
    const byAsset = new Map();
    for (const d of dealt) if (d.alpha > 0) byAsset.set(`${d.assetId}|${d.color}|${d.rotation}`, d);
    let ink = 0;
    for (const c of copies) {
      const p = byAsset.get(`${c.assetId}|${c.color}|${c.rotation}`);
      assert.ok(p, 'every copy is a visible dealt mark of this frame');
      assert.ok(Math.abs(c.scale) < Math.abs(p.scale) && c.alpha < p.alpha, 'smaller and quieter than its parent');
      ink += Math.abs(c.scale * (c.scaleY ?? c.scale)) * c.alpha;
    }
    const dealtInk = dealt.reduce(
      (s, d) => s + (d.alpha > 0 ? Math.abs(d.scale * (d.scaleY ?? d.scale)) * d.alpha : 0),
      0,
    );
    assert.ok(ink <= BORN_SHARE * dealtInk + 1e-9, 'never more than half the dealt ink');
    seen += copies.length;
    most = Math.max(most, copies.length);
  }
  assert.ok(seen > 0, `Life really births copies (most in one frame: ${most})`);
  console.log(`    copies over ${FRAMES} frames: ${seen}, most in one frame: ${most}`);
});

ok(
  'resolver: copies shed first; a Life picture seats none, the quiet read does; the stream replays identically',
  () => {
    const shed1 = run({ life: 1, marker: true, shed: 1 });
    for (const items of shed1.outs) assert.ok(!items.some(isLifeBorn), 'the first shed step drops every copy');
    assert.deepEqual(
      shed1.hashes,
      run({ life: 1, shed: 1 }).hashes,
      'and the fade still runs exactly as slice 1 sheds it',
    );
    assert.deepEqual(
      run({ life: 1, marker: true, shed: 2 }).hashes,
      run({ life: 0, shed: 2 }).hashes,
      'CULTURE HELD: the plain frame',
    );
    const picture = run({
      life: 1,
      marker: true,
      extra: (f) => ({ dishLife: { wakeMs: 0, gen: f, cycleGens: 48, shed: 0 } }),
    });
    for (const items of picture.outs)
      assert.ok(!items.some(isLifeBorn), 'no births while a Life picture dissolves the scene');
    // the live shape: the loop stamps the QUIET read on every frame DISH LIFE is on — births run beside it
    const quiet = run({
      life: 1,
      marker: true,
      extra: (f) => ({
        dishLife: { mode: 'quiet', wakeMs: 0, gen: f, cycleGens: 48, strength: 0.35, boost: 0, shed: 0 },
      }),
    });
    assert.ok(
      quiet.outs.some((items) => items.some(isLifeBorn)),
      'births seat beside the quiet read (the running instrument)',
    );
    const a = run({ life: 0.7, marker: true });
    assert.deepEqual(a.hashes, run({ life: 0.7, marker: true }).hashes, 'replay');
    assert.notDeepEqual(a.hashes, run({ life: 0.7 }).hashes, 'and it really acts');
  },
);

console.log(`[selfcheck] dishLifeBorn (#2152 slice 2): ${n} cases passed`);
