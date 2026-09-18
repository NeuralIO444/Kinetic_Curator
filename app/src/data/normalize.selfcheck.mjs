// node src/data/normalize.selfcheck.mjs
//
// #106 item 1 — shared project sanitize.
//
// normalizeLayoutParams is the trust boundary for project JSON. The same
// function guards three entry points that all accept untrusted input:
//
//   live   applyProject / parseProject   (file picker, autosave from an older build)
//   studio render.mjs                    (arbitrary path on the command line)
//   live   readAutosave                  (localStorage, editable by anyone)
//
// Before this, it validated the three dual-slider ranges, symmetry, behave and
// body — and nothing else. Every case in POISON below is one that got through
// and reached the render loop. They are kept as a corpus because "we clamp
// numbers now" is the sort of claim that rots quietly when a new parameter is
// added without a spec entry; the last test in this file fails if that happens.

import assert from 'node:assert';
import {
  normalizeLayoutParams, DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, RANGE_SPEC,
  MODE_IDS, BLEND_MODES, PALETTE_SHIFTS, SYMMETRY_MODES, BEHAVE_MODES,
  COMPOSITION_IDS,
} from './layout-modes.js'; // #268: MATERIAL_IDS/SHADING_MODES removed
import { buildPlacements } from '../engine/buildPlacements.js';

const ASSETS = [{ id: 'a', weight: 'heavy' }, { id: 'b', weight: 'medium' }];
const PALETTE = { swatches: ['#111', '#222', '#333'] };
const CAPS = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };

// Each entry is a real failure mode observed against the pre-#106 normalizer.
const POISON = [
  // Non-finite numerics. `jitter: Infinity` was the worst of these: it
  // produced a full canvas of non-finite coordinates, which the live path
  // renders as nothing and studio writes into the SVG as "NaN".
  ['jitter Infinity', { jitter: Infinity }],
  ['jitter -Infinity', { jitter: -Infinity }],
  ['noiseFreq NaN', { noiseFreq: NaN }],
  ['damping NaN', { damping: NaN }],
  ['count NaN', { count: NaN }],
  ['scale ends NaN', { scale: [NaN, NaN] }],
  ['scale ends strings', { scale: ['a', 'b'] }],
  ['null everywhere', { count: null, jitter: null, density: null, zTiers: null }],
  ['empty strings', { count: '', damping: '', wind: '' }],
  ['arrays as scalars', { count: [], jitter: [5], damping: [0.9] }],
  ['booleans as scalars', { count: true, jitter: false }],

  // Unbounded magnitudes. particleCount went straight to ParticleSystem.init,
  // which allocates that many rows; zTiers fed a Uint16Array column.
  ['count 1e9', { count: 1e9 }],
  ['particleCount 1e7', { particleCount: 1e7 }],
  ['zTiers 1e6', { zTiers: 1e6 }],
  ['zTiers 0', { zTiers: 0 }],
  ['displacement 1e12', { displacement: 1e12 }],
  ['density -50', { density: -50 }],
  ['negative count', { count: -1 }],

  // Enums. `mode` is the one with teeth — see the getSampler note below.
  ['mode __proto__', { mode: '__proto__' }],
  ['mode constructor', { mode: 'constructor' }],
  ['mode unknown', { mode: 'definitely-not-a-mode' }],
  ['mode non-string', { mode: 42 }],
  ['composition __proto__', { composition: '__proto__' }],
  ['paletteShift __proto__', { paletteShift: '__proto__' }],
  ['blendMode css injection', { blendMode: 'url(javascript:alert(1))' }],
  ['shading unknown', { shading: 'holographic' }],
  ['material unknown', { material: '../../etc/passwd' }],
  ['symmetry unknown', { symmetry: 'nope' }],
  ['behave unknown', { behave: 'nope' }],

  // Shapes that are not what the reader expects.
  ['scale not an array', { scale: 'big' }],
  ['scale too short', { scale: [1] }],
  ['booleans as strings', { bleed: 'false', mirror: 'no', overlap: '' }],
  ['prototype key', { __proto__: { polluted: true } }],
];

for (const [label, patch] of POISON) {
  // Build the input the way JSON.parse would: a plain object with own keys.
  const raw = { ...DEFAULT_LAYOUT_PARAMS };
  for (const k of Object.keys(patch)) Object.defineProperty(raw, k, {
    value: patch[k], enumerable: true, writable: true, configurable: true,
  });

  const lp = normalizeLayoutParams(raw);

  // 1. Every spec'd scalar is finite and inside its bounds.
  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    assert.ok(Number.isFinite(lp[key]), `${label}: ${key} is not finite (${lp[key]})`);
    assert.ok(
      lp[key] >= spec.min && lp[key] <= spec.max,
      `${label}: ${key}=${lp[key]} outside [${spec.min}, ${spec.max}]`,
    );
    if (spec.int) assert.strictEqual(lp[key], Math.round(lp[key]), `${label}: ${key} must be integer`);
  }

  // 2. Ranges are finite pairs inside their bounds.
  for (const [key, spec] of Object.entries(RANGE_SPEC)) {
    assert.ok(Array.isArray(lp[key]) && lp[key].length === 2, `${label}: ${key} shape`);
    for (const v of lp[key]) {
      assert.ok(Number.isFinite(v), `${label}: ${key} end not finite`);
      assert.ok(v >= spec.min && v <= spec.max, `${label}: ${key} end ${v} outside bounds`);
    }
  }

  // 3. Every enum is one of the allowed values.
  for (const [key, allowed] of [
    ['mode', MODE_IDS], ['composition', COMPOSITION_IDS], ['blendMode', BLEND_MODES],
    ['paletteShift', PALETTE_SHIFTS],
    ['symmetry', SYMMETRY_MODES], ['behave', BEHAVE_MODES], // #268: shading/material removed
  ]) {
    assert.ok(allowed.includes(lp[key]), `${label}: ${key}="${lp[key]}" not in allow-list`);
  }

  // 4. Booleans are booleans — 'false' is truthy, and used to stay a string.
  for (const key of ['bleed', 'mirror', 'overlap', 'accumulation']) { // #268: recolor removed
    assert.strictEqual(typeof lp[key], 'boolean', `${label}: ${key} must be boolean`);
  }

  // 5. Nothing shadowed Object.prototype.
  assert.strictEqual({}.polluted, undefined, `${label}: prototype was polluted`);

  // 6. The real test: the render pipeline survives it and emits finite geometry.
  let out;
  assert.doesNotThrow(() => {
    out = buildPlacements({
      layoutParams: lp, seed: 0x1a4f, activeAssets: ASSETS, palette: PALETTE,
      caps: CAPS, canvasW: 1000, canvasH: 700,
    });
  }, `${label}: buildPlacements threw`);
  for (const it of out.items) {
    assert.ok(
      Number.isFinite(it.x) && Number.isFinite(it.y) && Number.isFinite(it.scale)
      && Number.isFinite(it.rotation) && Number.isFinite(it.alpha),
      `${label}: non-finite geometry reached the renderer — ${JSON.stringify(it).slice(0, 120)}`,
    );
  }
}

// An absent field (JSON null, empty string) must fall back to the DEFAULT,
// not to the slider minimum. Number(null) is 0, so a naive clamp would render
// `{"damping": null}` at 0.80 instead of 0.95 and look deliberate.
for (const absent of [null, undefined, '', '   ', [], true, {}]) {
  const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, damping: absent, count: absent });
  assert.strictEqual(
    lp.damping, DEFAULT_LAYOUT_PARAMS.damping,
    `damping=${JSON.stringify(absent)} should fall back to the default, got ${lp.damping}`,
  );
  assert.strictEqual(
    lp.count, DEFAULT_LAYOUT_PARAMS.count,
    `count=${JSON.stringify(absent)} should fall back to the default, got ${lp.count}`,
  );
}

// Numeric strings are still accepted — older project files wrote some of
// these as strings.
{
  const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, count: '500', damping: '0.9' });
  assert.strictEqual(lp.count, 500);
  assert.strictEqual(lp.damping, 0.9);
}

// Garbage in place of the whole object must not throw either.
for (const bad of [null, undefined, 'string', 42, [], [1, 2, 3], true]) {
  const lp = normalizeLayoutParams(bad);
  assert.strictEqual(lp.mode, DEFAULT_LAYOUT_PARAMS.mode, `${JSON.stringify(bad)} should fall back`);
  assert.ok(Number.isFinite(lp.count));
}

// Valid input must pass through untouched. A sanitizer that quietly rewrites
// good projects is worse than none — every existing seed would shift.
{
  const lp = normalizeLayoutParams(DEFAULT_LAYOUT_PARAMS);
  for (const [k, v] of Object.entries(DEFAULT_LAYOUT_PARAMS)) {
    if (Array.isArray(v)) assert.deepStrictEqual(lp[k], v, `defaults changed: ${k}`);
    else assert.strictEqual(lp[k], v, `defaults changed: ${k}`);
  }
  // …and so must a hand-authored project using the extremes of each slider.
  const extremes = {
    ...DEFAULT_LAYOUT_PARAMS,
    count: 800, jitter: 200, density: 100, zTiers: 12, displacement: 250, // #272: capped at 100
    noiseFreq: 0.03, noiseSpeed: 3.0, particleCount: 500, damping: 0.99,
    wind: 3, body: 7, flap: 1, tight: 0.95,
    scale: [0.1, 3.0], rotate: [-180, 180], alpha: [0, 100],
    mode: 'hype', symmetry: 'bilateral', behave: 'cruise',
  };
  const norm = normalizeLayoutParams(extremes);
  for (const [k, v] of Object.entries(extremes)) {
    if (Array.isArray(v)) assert.deepStrictEqual(norm[k], v, `slider extreme clamped: ${k}`);
    else assert.strictEqual(norm[k], v, `slider extreme clamped: ${k}`);
  }
}

// A reversed range runs the lerp backwards on purpose; normalizing must not
// "helpfully" reorder it, or existing compositions change.
{
  const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, scale: [1.6, 0.4] });
  assert.deepStrictEqual(lp.scale, [1.6, 0.4], 'reversed range must survive');
}

// Every scalar default must have a spec entry. This is the test that catches
// a parameter added later without bounds — the exact way this hole reopens.
{
  const EXEMPT = new Set([
    'composition', 'mode', 'scale', 'rotate', 'alpha', 'bleed', 'recolor', 'mirror',
    'overlap', 'blendMode', 'shading', 'paletteShift', 'accumulation', 'symmetry',
    'behave', 'material',
  ]);
  const unspecced = Object.entries(DEFAULT_LAYOUT_PARAMS)
    .filter(([k, v]) => typeof v === 'number' && !EXEMPT.has(k) && !PARAM_SPEC[k])
    .map(([k]) => k);
  assert.deepStrictEqual(
    unspecced, [],
    `numeric layout params with no PARAM_SPEC bounds: ${unspecced.join(', ')}.\n`
    + '  Add them to PARAM_SPEC (matching the slider in ParamBlock.jsx), or a\n'
    + '  poisoned project can put any value at all into the render loop.',
  );
}

console.log('normalize.selfcheck: OK (#106 — project sanitize)', {
  poisonCases: POISON.length,
  specced: Object.keys(PARAM_SPEC).length,
});
