// dither.selfcheck.mjs — #1610 (Strata Q Phase 4): EF-4 dither, grain family.
//
// Pins the phase's acceptance:
//   · the GL shader's bit-formula threshold IS the shared stage —
//     curator/roomDither.js's BAYER4, the matrix the ROOM codec faces
//     quantize through (#1560 §09). One pipeline, two tenants.
//   · a one-bit render of a seeded Look matches the reference dither
//     (roomDither.orderedLevel per channel) within the house parity bar
//     (gl/parity/diff.mjs DEFAULT_POLICY — Matt's rule: under 10%
//     differing pixels is a pass);
//   · grain-family ordering: sanitizeFxEffects re-seats dither after
//     non-grain kinds; the add-menu path (availableFxKinds) offers it;
//   · both render paths compile it: the GL template registry and the
//     SVG approximation (the one-bit cut without the weave).
import assert from 'node:assert';
import {
  FX_EFFECT_DEFS,
  FX_RACK,
  GRAIN_FAMILY_KINDS,
  sanitizeFxEffects,
  availableFxKinds,
  defaultFxParams,
  compileFxPrimitives,
} from './fxFilters.js';
import { BAYER4, orderedLevel } from '../curator/roomDither.js';
import { FX_SHADER_KINDS } from '../gl/effects/fxShaders.mjs';
import { diffPixels, DEFAULT_POLICY } from '../gl/parity/diff.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// The shader's rank formula, transcribed 1:1 from FX_DITHER_FS
// (bayerThreshold): over the cell's mod-4 coordinates,
//   r = ((x0^y0)<<3) | (y0<<2) | ((x1^y1)<<1) | y1,  t = (r + 0.5) / 16.
function bayerRankBits(cx, cy) {
  const x = ((cx % 4) + 4) % 4;
  const y = ((cy % 4) + 4) % 4;
  const x0 = x & 1;
  const x1 = (x >> 1) & 1;
  const y0 = y & 1;
  const y1 = (y >> 1) & 1;
  return ((x0 ^ y0) << 3) | (y0 << 2) | ((x1 ^ y1) << 1) | y1;
}
const shaderThreshold = (cx, cy) => (bayerRankBits(cx, cy) + 0.5) / 16;

// FX_DITHER_FS main(), transcribed: premultiplied plate discipline —
// quantize the straight colour against the cell threshold, re-premultiply,
// mix by amount; alpha untouched.
function shaderPixel(r, g, b, a, px, py, cell, amount) {
  const amt = Math.min(1, Math.max(0, amount));
  if (amt <= 0) return [r, g, b, a];
  const t = shaderThreshold(Math.floor(px / cell), Math.floor(py / cell));
  const cut = (v) => {
    const straight = a > 0 ? Math.min(1, Math.max(0, v / a)) : 0;
    const base = Math.floor(straight);
    const q = Math.min(1, Math.max(0, base + (straight - base > t ? 1 : 0)));
    return v + (q * a - v) * amt;
  };
  return [cut(r), cut(g), cut(b), a];
}

// The reference: the shared stage itself, per channel (the FX kind is the
// stage applied to the plate — levels fixed at 2, the one-bit finish).
function referencePixel(r, g, b, a, px, py, cell) {
  const cx = Math.floor(px / cell);
  const cy = Math.floor(py / cell);
  const cut = (v) => {
    const straight = a > 0 ? Math.min(1, Math.max(0, v / a)) : 0;
    return orderedLevel(straight, cx, cy, 2) * a;
  };
  return [cut(r), cut(g), cut(b), a];
}

// A seeded Look: deterministic PRNG + smooth fields (gradient, radial
// blob, flat bands) — tones at every level, edges for the weave to bite.
function seededLook(w, h) {
  let s = 0x1610;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const blobX = 0.3 + rnd() * 0.4;
  const blobY = 0.3 + rnd() * 0.4;
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      const d = Math.hypot(u - blobX, v - blobY);
      const blob = Math.max(0, 1 - d * 2.2);
      const band = Math.floor(v * 5) / 5;
      const i = (y * w + x) * 4;
      out[i] = Math.min(1, u * 0.8 + blob * 0.35);
      out[i + 1] = Math.min(1, band * 0.7 + blob * 0.3);
      out[i + 2] = Math.min(1, (1 - u) * 0.6 + (1 - band) * 0.25);
      out[i + 3] = 1;
    }
  }
  return out;
}

const toBytes = (raster) => {
  const b = new Uint8Array(raster.length);
  for (let i = 0; i < raster.length; i++) b[i] = Math.round(Math.min(1, Math.max(0, raster[i])) * 255);
  return b;
};

function renderWith(raster, w, h, fn, cell, amount) {
  const out = new Float32Array(raster.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = fn(raster[i], raster[i + 1], raster[i + 2], raster[i + 3], x, y, cell, amount);
      out[i] = px[0];
      out[i + 1] = px[1];
      out[i + 2] = px[2];
      out[i + 3] = px[3];
    }
  }
  return out;
}

ok('the shader bit-formula reproduces BAYER4 on all sixteen cells', () => {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      assert.equal(shaderThreshold(x, y), BAYER4[y][x], `cell (${x},${y})`);
    }
  }
  // …and wraps mod 4 like the shader's mod(cellPx, 4.0).
  assert.equal(shaderThreshold(5, 9), BAYER4[1][1]);
  assert.equal(shaderThreshold(-1, 0), BAYER4[0][3]);
});

ok('one-bit parity: seeded Look, shader math vs the reference stage (house bar <10%)', () => {
  const w = 96;
  const h = 64;
  const look = seededLook(w, h);
  for (const cell of [1, 2, 3]) {
    const got = renderWith(look, w, h, shaderPixel, cell, 1);
    const want = renderWith(look, w, h, (r, g, b, a, x, y, c) => referencePixel(r, g, b, a, x, y, c), cell, 1);
    const r = diffPixels(toBytes(got), toBytes(want), w, h, DEFAULT_POLICY);
    const pct = ((100 * r.failed) / (w * h)).toFixed(3);
    console.log(`    cell=${cell}: ${r.failed}/${w * h} differing pixels (${pct}%)`);
    assert.ok(r.pass, `cell ${cell}: parity within the house bar (${pct}% differing)`);
    assert.equal(r.failed, 0, `cell ${cell}: the two transcriptions agree exactly`);
  }
});

ok('amount: 0 is identity, 1 is the full cut, the mix is linear between', () => {
  const px = [0.62, 0.3, 0.85, 1];
  assert.deepEqual(shaderPixel(...px, 0, 0, 1, 0), px, 'amount 0 passes the plate through');
  const full = shaderPixel(...px, 0, 0, 1, 1);
  assert.ok(
    full.slice(0, 3).every((v) => v === 0 || v === 1),
    'amount 1 on an opaque plate is pure one-bit',
  );
  const half = shaderPixel(...px, 0, 0, 1, 0.5);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(half[i] - (px[i] + full[i]) / 2) < 1e-9, 'amount mixes linearly');
});

ok('premultiplied discipline: nothing paints outside the plate alpha', () => {
  assert.deepEqual(shaderPixel(0, 0, 0, 0, 3, 5, 2, 1), [0, 0, 0, 0], 'transparent stays transparent');
  const out = shaderPixel(0.2, 0.1, 0.05, 0.4, 1, 1, 1, 1);
  assert.equal(out[3], 0.4, 'alpha untouched');
  for (let i = 0; i < 3; i++) assert.ok(out[i] <= 0.4 + 1e-9, 'rgb never exceeds the plate alpha');
});

ok('grain-family ordering: dither re-seats after non-grain kinds, family order preserved', () => {
  assert.ok(GRAIN_FAMILY_KINDS.includes('dither'));
  const moved = [];
  const out = sanitizeFxEffects(
    [
      { kind: 'dither', params: { cell: 2, amount: 0.5 } },
      { kind: 'rgbSplit', params: { dx: 3 } },
    ],
    { onMove: ({ kinds }) => moved.push(...kinds) },
  );
  assert.deepEqual(
    out.map((e) => e.kind),
    ['rgbSplit', 'dither'],
  );
  assert.deepEqual(moved, ['dither']);
  // Grain + dither are both family: no violation, relative order kept.
  let silent = true;
  const both = sanitizeFxEffects(
    [
      { kind: 'dither', params: {} },
      { kind: 'grain', params: {} },
    ],
    {
      onMove: () => {
        silent = false;
      },
    },
  );
  assert.deepEqual(
    both.map((e) => e.kind),
    ['dither', 'grain'],
  );
  assert.ok(silent, 'an all-family tail never triggers onMove');
});

ok('registration: def, rack seat, add-menu path, GL registry, sanitize clamps', () => {
  const def = FX_EFFECT_DEFS.dither;
  assert.ok(def, 'the catalog carries dither');
  assert.deepEqual(defaultFxParams('dither'), { cell: 2, amount: 0.5 });
  const ef4 = FX_RACK.find((s) => s.slot === 'EF-4');
  assert.ok(ef4.kinds.includes('dither'), 'dither sits in EF-4 kinds');
  assert.deepEqual(ef4.stubs, ['stipple'], 'stipple stays a stub — only dither ships');
  assert.ok(availableFxKinds([]).includes('dither'), 'the free-pick add path offers dither');
  assert.ok(!availableFxKinds([]).includes('stipple'), 'stubs are never offered');
  assert.ok(
    availableFxKinds([{ kind: 'dither', params: {} }]).indexOf('dither') === -1,
    'a present dither is not offered twice',
  );
  assert.ok(FX_SHADER_KINDS.includes('dither'), 'the GL template registry carries dither');
  const clamped = sanitizeFxEffects([{ kind: 'dither', params: { cell: 99, amount: -1 } }]);
  assert.deepEqual(clamped[0].params, { cell: 8, amount: 0 }, 'params clamp to the catalog ranges');
});

ok('SVG path: identity at amount 0, the one-bit cut (no weave) above it', () => {
  const idle = compileFxPrimitives([{ kind: 'dither', params: { cell: 2, amount: 0 } }]);
  assert.deepEqual(
    idle.map((p) => p.prim),
    ['feOffset'],
    'amount 0 passes the layer through',
  );
  const cut = compileFxPrimitives([{ kind: 'dither', params: { cell: 2, amount: 1 } }]);
  assert.deepEqual(
    cut.map((p) => p.prim),
    ['feComponentTransfer', 'feComposite'],
  );
  for (const c of cut[0].children) {
    assert.equal(c.attrs.type, 'discrete');
    assert.equal(c.attrs.tableValues, '0 1', 'the print path makes the same one-bit cut');
  }
  assert.equal(cut[1].attrs.operator, 'arithmetic');
  assert.equal(cut[1].attrs.k2, 1, 'amount 1 is fully the cut');
  assert.equal(cut[1].attrs.k3, 0);
  const half = compileFxPrimitives([{ kind: 'dither', params: { cell: 2, amount: 0.5 } }]);
  assert.equal(half[1].attrs.k2, 0.5, 'amount blends cut and source like the GL mix');
  assert.equal(half[1].attrs.k3, 0.5);
});

console.log(`dither.selfcheck: OK (${n} checks)`);
