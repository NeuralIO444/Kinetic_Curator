// stipple.selfcheck.mjs — #2038 (strata rebuild): EF-4 stipple, grain family.
//
// Pins the rebuild's acceptance for the rack's last "planned" stub:
//   · stipple is a real kind — in FX_EFFECT_DEFS, in the EF-4 rack list,
//     and NO rack slot carries a stub any more;
//   · grain-family ordering: sanitizeFxEffects re-seats stipple after
//     non-grain kinds; the add-menu path (availableFxKinds) offers it;
//   · both render paths compile it: the GL template registry (with a
//     descriptor that mirrors the document def exactly) and the SVG
//     approximation (the one-bit cut without the screen);
//   · the GL shader's dot screen, transcribed 1:1 — threshold is the
//     squared distance from the cell centre, so dot AREA grows with
//     tone: silence at 0, full coverage at 1, round dots between.
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
import { FX_SHADER_KINDS, FX_SHADER_EFFECTS } from '../gl/effects/fxShaders.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('stipple is a real EF-4 kind and the rack holds no stubs any more', () => {
  assert.ok(FX_EFFECT_DEFS.stipple, 'FX_EFFECT_DEFS.stipple exists');
  assert.equal(FX_EFFECT_DEFS.stipple.label, 'Stipple');
  const ef4 = FX_RACK.find((s) => s.slot === 'EF-4');
  assert.ok(ef4.kinds.includes('stipple'), 'EF-4 rack lists stipple');
  for (const slot of FX_RACK) assert.deepEqual(slot.stubs, [], `${slot.slot} has no planned stubs left`);
  assert.deepEqual(defaultFxParams('stipple'), { cell: 3, amount: 0.5 });
});

ok('grain family: stipple re-seats after non-grain kinds and is offered for adding', () => {
  assert.ok(GRAIN_FAMILY_KINDS.includes('stipple'));
  const out = sanitizeFxEffects([
    { kind: 'stipple', params: { cell: 3, amount: 0.5 } },
    { kind: 'invert', params: {} },
  ]);
  assert.deepEqual(
    out.map((e) => e.kind),
    ['invert', 'stipple'],
    'stipple moved to the finish position',
  );
  assert.ok(availableFxKinds([]).includes('stipple'), 'offered on an empty layer');
  assert.ok(!availableFxKinds([{ kind: 'stipple', params: {} }]).includes('stipple'), 'not offered twice');
});

ok('both render paths compile it; the GL descriptor mirrors the document def', () => {
  assert.ok(FX_SHADER_KINDS.includes('stipple'), 'GL template registry has stipple');
  const entry = FX_SHADER_EFFECTS.find(([k]) => k === 'stipple');
  const desc = entry[1].descriptor;
  const def = FX_EFFECT_DEFS.stipple;
  assert.equal(desc.label, def.label);
  assert.equal(desc.hint, def.hint);
  for (const [key, p] of Object.entries(def.params)) {
    const d = desc.params[key];
    assert.ok(d, `descriptor param ${key}`);
    for (const f of ['label', 'min', 'max', 'step', 'def', 'hint']) assert.equal(d[f], p[f], `${key}.${f} mirrors`);
  }
  const prims = compileFxPrimitives([{ kind: 'stipple', params: { cell: 3, amount: 0.5 } }]);
  assert.ok(prims.length >= 2, 'SVG path compiles stipple to primitives');
  const identity = compileFxPrimitives([{ kind: 'stipple', params: { cell: 3, amount: 0 } }]);
  assert.deepEqual(
    identity,
    [{ prim: 'feOffset', attrs: { in: 'SourceGraphic', dx: 0, dy: 0 } }],
    'amount 0 is the identity pass-through',
  );
});

// FX_STIPPLE_FS main(), transcribed 1:1: the threshold is the squared
// distance from the cell centre (t = clamp(2·|u|²) over cell-local
// u ∈ [-0.5, 0.5)²); the cut is dither's premultiplied one-bit cut
// against that threshold, mixed by amount; alpha untouched.
function dotThreshold(px, py, cell) {
  const ux = ((((px / cell) % 1) + 1) % 1) - 0.5;
  const uy = ((((py / cell) % 1) + 1) % 1) - 0.5;
  return Math.min(1, Math.max(0, 2 * (ux * ux + uy * uy)));
}
function shaderPixel(r, g, b, a, px, py, cell, amount) {
  const amt = Math.min(1, Math.max(0, amount));
  if (amt <= 0) return [r, g, b, a];
  const t = dotThreshold(px, py, cell);
  const cut = (v) => {
    const straight = a > 0 ? Math.min(1, Math.max(0, v / a)) : 0;
    const base = Math.floor(straight);
    const q = Math.min(1, Math.max(0, base + (straight - base > t ? 1 : 0)));
    return q * a;
  };
  const mix = (orig, q) => orig + (q - orig) * amt;
  return [mix(r, cut(r)), mix(g, cut(g)), mix(b, cut(b)), a];
}

ok('the dot screen: centre on, corners off, area grows with tone', () => {
  // Cell 8, tone 0.5 grey, opaque: the pixel at the cell centre cuts on
  // (t = 0), the pixel at the cell corner cuts off (t = 1).
  const centre = shaderPixel(0.5, 0.5, 0.5, 1, 4, 4, 8, 1);
  assert.deepEqual(centre, [1, 1, 1, 1], 'centre pixel: tone beats t=0, cuts to full');
  const corner = shaderPixel(0.5, 0.5, 0.5, 1, 0, 0, 8, 1);
  assert.deepEqual(corner, [0, 0, 0, 1], 'corner pixel: tone loses to t=1, cuts to none');
  // Area law over one cell (64×64 samples of an 8px cell at fine grain):
  // on-fraction ≈ π·tone/2 (disc area), 0 at tone 0, 1 at tone 1.
  const frac = (tone) => {
    let on = 0;
    let total = 0;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const [r] = shaderPixel(tone, tone, tone, 1, x, y, 64, 1);
        if (r > 0.5) on++;
        total++;
      }
    return on / total;
  };
  assert.equal(frac(0), 0, 'tone 0: no dots');
  assert.equal(frac(1), 1, 'tone 1: full coverage');
  const mid = frac(0.5);
  assert.ok(Math.abs(mid - Math.PI / 4) < 0.03, `tone 0.5: dot area ≈ π/4 (got ${mid.toFixed(3)})`);
  const low = frac(0.25);
  assert.ok(Math.abs(low - Math.PI / 8) < 0.03, `tone 0.25: dot area ≈ π/8 (got ${low.toFixed(3)})`);
});

ok('amount blends and alpha is untouched; amount 0 is identity', () => {
  assert.deepEqual(shaderPixel(0.2, 0.4, 0.6, 0.8, 3, 3, 4, 0), [0.2, 0.4, 0.6, 0.8]);
  const half = shaderPixel(0.5, 0.5, 0.5, 1, 4, 4, 8, 0.5);
  assert.deepEqual(half, [0.75, 0.75, 0.75, 1], 'half amount mixes halfway to the cut');
});

console.log(`stipple.selfcheck: ${n} checks passed`);
