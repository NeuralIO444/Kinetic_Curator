// printPost.selfcheck.mjs — print desk allow-list (#172): pixel math,
// allow-list enforcement, and ffmpeg string emission.
import assert from 'node:assert';
import {
  POST_CHIPS,
  chipDef,
  sanitizeStack,
  applyPostStack,
  entryToFfmpeg,
  stackToFfmpeg,
  stackToHuman,
  entryToHuman,
  stackToFarmArgs,
  stackToFarmCommand,
  gradeEq,
} from './printPost.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const mk = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a = 255] = fn(x, y);
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return { data, width: w, height: h };
};
const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
const sum = (img) => img.data.reduce((s, v) => s + v, 0);

// --- allow-list ---------------------------------------------------------------
ok('six chips on the allow-list, ids stable', () => {
  assert.deepEqual(POST_CHIPS.map((c) => c.id),
    ['BLUR', 'SHARP', 'GRAIN', 'VIGNETTE', 'GRADE', 'SPLIT']);
});

ok('unknown chip throws (fail-closed)', () => {
  assert.throws(() => chipDef('BLOOM'), /allow-list/);
  assert.throws(() => sanitizeStack([{ chip: 'BLOOM', amount: 1 }]), /allow-list/);
  assert.throws(() => entryToFfmpeg({ chip: 'BLOOM', amount: 1 }), /allow-list/);
  assert.throws(() => stackToFfmpeg([{ chip: 'BLOOM', amount: 1 }]), /allow-list/);
});

ok('sanitizeStack clamps amounts, drops zeros, keeps order', () => {
  const out = sanitizeStack([
    { chip: 'BLUR', amount: 99 },
    { chip: 'GRADE', amount: 0 },
    { chip: 'SHARP', amount: 1.2 },
  ]);
  assert.deepEqual(out, [
    { chip: 'BLUR', amount: 8 },
    { chip: 'SHARP', amount: 1.2 },
  ]);
  assert.deepEqual(sanitizeStack(null), []);
});

// --- identity -----------------------------------------------------------------
ok('empty/all-off stack is pixel-identical', () => {
  const img = mk(8, 8, (x, y) => [(x * 31) % 256, (y * 47) % 256, 128]);
  const out = applyPostStack(img, [], 1234);
  assert.deepEqual([...out.data], [...img.data]);
  assert.equal(out.width, 8); assert.equal(out.height, 8);
});

ok('amount 0 is the identity for every filter', () => {
  const img = mk(9, 9, (x, y) => [(x * 29 + y * 13) % 256, (x * 7 + y * 41) % 256, (x + y * 3) % 256]);
  for (const c of POST_CHIPS) {
    const out = applyPostStack(img, [{ chip: c.id, amount: 0 }], 7);
    assert.deepEqual([...out.data], [...img.data], c.id);
  }
});

// --- per-filter behavior -------------------------------------------------------
ok('BLUR spreads energy and conserves it', () => {
  const img = mk(9, 9, (x, y) => (x === 4 && y === 4 ? [255, 255, 255] : [0, 0, 0]));
  const out = applyPostStack(img, [{ chip: 'BLUR', amount: 2 }], 1);
  const [cr] = px(out, 4, 4);
  assert.ok(cr < 255 && cr > 0, `center ${cr} should dim but not vanish`);
  const [nr] = px(out, 5, 4);
  assert.ok(nr > 0, 'neighbor picks up energy');
  const ratio = sum(out) / sum(img);
  assert.ok(Math.abs(ratio - 1) < 0.02, `energy conserved, ratio ${ratio}`);
});

ok('SHARP leaves flat fields untouched, boosts edges', () => {
  const flat = mk(9, 9, () => [120, 120, 120]);
  const flatOut = applyPostStack(flat, [{ chip: 'SHARP', amount: 1.5 }], 1);
  assert.deepEqual([...flatOut.data], [...flat.data]);
  const edge = mk(9, 9, (x) => (x < 4 ? [40, 40, 40] : [200, 200, 200]));
  const edgeOut = applyPostStack(edge, [{ chip: 'SHARP', amount: 1 }], 1);
  const [dark] = px(edgeOut, 3, 4); // dark side of edge overshoots down
  const [lite] = px(edgeOut, 4, 4); // light side overshoots up
  assert.ok(dark < 40 && lite > 200, `edge boost dark=${dark} light=${lite}`);
});

ok('GRAIN is deterministic per seed, scales with amount', () => {
  const img = mk(16, 16, () => [128, 128, 128]);
  const a = applyPostStack(img, [{ chip: 'GRAIN', amount: 25 }], 42);
  const b = applyPostStack(img, [{ chip: 'GRAIN', amount: 25 }], 42);
  const c = applyPostStack(img, [{ chip: 'GRAIN', amount: 25 }], 43);
  assert.deepEqual([...a.data], [...b.data], 'same seed → identical');
  assert.notDeepEqual([...a.data], [...c.data], 'different seed → differs');
  const varOf = (im) => {
    // R channel only — alpha is a constant 255 and would swamp the ratio.
    const rs = [];
    for (let i = 0; i < im.data.length; i += 4) rs.push(im.data[i]);
    const m = rs.reduce((s, v) => s + v, 0) / rs.length;
    return rs.reduce((s, v) => s + (v - m) ** 2, 0) / rs.length;
  };
  const v25 = varOf(applyPostStack(img, [{ chip: 'GRAIN', amount: 25 }], 42));
  const v80 = varOf(applyPostStack(img, [{ chip: 'GRAIN', amount: 80 }], 42));
  assert.ok(v80 > v25 * 4, `variance grows with amount: ${v25} → ${v80}`);
});

ok('VIGNETTE darkens corners, spares the center', () => {
  const img = mk(11, 11, () => [200, 200, 200]);
  const out = applyPostStack(img, [{ chip: 'VIGNETTE', amount: 0.5 }], 1);
  const [corner] = px(out, 0, 0);
  const [center] = px(out, 5, 5);
  assert.ok(corner < 200 && corner < center, `corner=${corner} center=${center}`);
});

ok('GRADE amount 0 = eq identity; gray stays gray; color saturates up', () => {
  const { brightness, contrast, saturation } = gradeEq(0);
  assert.deepEqual([brightness, contrast, saturation], [0, 1, 1]);
  const gray = mk(4, 4, () => [128, 128, 128]);
  const gOut = applyPostStack(gray, [{ chip: 'GRADE', amount: 0.8 }], 1);
  const [gr, gg, gb] = px(gOut, 1, 1);
  assert.ok(Math.abs(gr - gg) < 2 && Math.abs(gg - gb) < 2, `gray stays gray: ${gr},${gg},${gb}`);
  const color = mk(4, 4, () => [200, 100, 100]);
  const cOut = applyPostStack(color, [{ chip: 'GRADE', amount: 1 }], 1);
  const [cr, cg] = px(cOut, 1, 1);
  assert.ok(cr - cg > 100, `saturation rises with g>0: r=${cr} g=${cg}`);
});

ok('SPLIT shifts R left and B right by the amount', () => {
  const img = mk(21, 5, (x) => [x * 12, 100, 250 - x * 10]);
  const out = applyPostStack(img, [{ chip: 'SPLIT', amount: 4 }], 1);
  const [r] = px(out, 10, 2);   // R(x) = R(x+4)
  const [, , b] = px(out, 10, 2); // B(x) = B(x-4)
  assert.equal(r, 14 * 12);
  assert.equal(b, 250 - 6 * 10);
  const [, g] = px(out, 10, 2);
  assert.equal(g, 100);
});

// --- ffmpeg emission -----------------------------------------------------------
ok('stackToFfmpeg emits the exact filtergraph', () => {
  const s = stackToFfmpeg([
    { chip: 'BLUR', amount: 2 },
    { chip: 'SHARP', amount: 1 },
    { chip: 'GRAIN', amount: 25 },
    { chip: 'VIGNETTE', amount: 0.5 },
    { chip: 'GRADE', amount: 0.25 },
    { chip: 'SPLIT', amount: 4 },
  ]);
  assert.equal(s,
    'gblur=sigma=2,unsharp=5:5:1,noise=alls=25:allf=t,' +
    `vignette=angle=${(0.5 * Math.PI / 2).toFixed(4)},` +
    'eq=brightness=0.02:contrast=1.0625:saturation=1.0875,' +
    'chromashift=cbh=4:crh=-4');
});

ok('empty stack → empty filtergraph', () => {
  assert.equal(stackToFfmpeg([]), '');
});

ok('stackToFarmArgs mirrors the filtergraph flags', () => {
  assert.deepEqual(stackToFarmArgs([
    { chip: 'BLUR', amount: 2 },
    { chip: 'GRADE', amount: 0.25 },
    { chip: 'SPLIT', amount: 4 },
  ]), ['--gblur', '2', '--eq', '0.02,1.0625,1.0875', '--chromashift', '4']);
});

ok('stackToFarmCommand builds the reproduction command', () => {
  const cmd = stackToFarmCommand([{ chip: 'SHARP', amount: 1 }], 's.png', 'p.png');
  assert.equal(cmd, 'python3 studio/print_post.py s.png --unsharp 1 -o p.png');
});

// --- human-readable summary (#277) ------------------------------------------
ok('stackToHuman reads plain: ids, trimmed amounts, units', () => {
  assert.equal(
    stackToHuman([
      { chip: 'BLUR', amount: 2 },
      { chip: 'GRAIN', amount: 100 },
      { chip: 'VIGNETTE', amount: 1 },
      { chip: 'GRADE', amount: -1 },
      { chip: 'SPLIT', amount: 4 },
    ]),
    'BLUR 2 px · GRAIN 100 · VIGNETTE 1 · GRADE −1 · SPLIT 4 px');
  assert.equal(stackToHuman([{ chip: 'VIGNETTE', amount: 0.35 }]), 'VIGNETTE 0.35');
  assert.equal(stackToHuman([{ chip: 'GRADE', amount: 0.25 }]), 'GRADE 0.25');
  assert.equal(stackToHuman([]), '');
  assert.throws(() => entryToHuman({ chip: 'BLOOM', amount: 1 }), /allow-list/);
});

console.log(`printPost.selfcheck: ${n} checks passed`);
