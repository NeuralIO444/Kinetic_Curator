// renderProfiles.selfcheck.mjs — persona render profiles for the Curator.
// Palettes resolve + valid hex; biases are subsets of the engine's real
// randomizeKey ranges; forces are real layoutParams keys with valid values;
// the "off"/unknown path returns the candidate untouched (same reference);
// every profile id has a matching scorer taste.
import assert from 'node:assert';
import {
  RENDER_PROFILES,
  RENDER_PROFILE_IDS,
  getRenderProfile,
  applyRenderProfile,
} from './renderProfiles.js';
import { PERSONA_TASTES } from './personaTastes.js';
import { PALETTES, normalizeHex } from '../data/palettes.js';
import { DEFAULT_LAYOUT_PARAMS, SYMMETRY_MODES } from '../data/layout-modes.js';

// Engine bounds, mirroring randomizeKey in app/src/state/paramUtils.js.
// Biases must be subsets of these — a profile can narrow the engine's
// ranges but never widen them.
const ENGINE_BOUNDS = {
  count: [30, 600],
  scale: [[0.1, 1.0], [1.0, 3.0]],
  rotate: [[-180, 0], [0, 180]],
  alpha: [[15, 60], [70, 100]],
  jitter: [0, 150],
  density: [20, 120],
  zTiers: [1, 10],
  noiseFreq: [0.002, 0.015],
  noiseSpeed: [0.1, 2.0],
  displacement: [0, 150],
  particleCount: [50, 300],
  swarmCohesion: [0.2, 4.0],
  gravityWells: [0.1, 3.0],
  damping: [0.90, 0.98],
};
const INT_KEYS = ['count', 'jitter', 'density', 'zTiers', 'displacement', 'particleCount'];
const PAIR_KEYS = ['scale', 'rotate', 'alpha'];

// ─── registry shape ───
{
  assert.deepStrictEqual(RENDER_PROFILE_IDS, ['davis', 'benjamin', 'reas', 'haeckel'], 'proving set');
  assert.strictEqual(RENDER_PROFILES.length, 4, 'four profiles');
  for (const p of RENDER_PROFILES) {
    assert.ok(p.id && p.name && p.paletteId, `${p.id}: identity`);
    assert.ok(typeof p.rationale === 'string' && p.rationale.length > 40, `${p.id}: rationale documented`);
    assert.ok(Array.isArray(p.gaps) && p.gaps.length > 0, `${p.id}: gaps documented`);
    assert.ok(p.biases && typeof p.biases === 'object', `${p.id}: biases`);
    assert.ok(p.forces && typeof p.forces === 'object', `${p.id}: forces`);
  }
}

// ─── palettes resolve + valid ───
{
  for (const p of RENDER_PROFILES) {
    const pal = PALETTES.find((x) => x.id === p.paletteId);
    assert.ok(pal, `${p.id}: palette '${p.paletteId}' in catalog`);
    assert.ok(normalizeHex(pal.bg), `${p.id}: bg valid hex`);
    assert.ok(Array.isArray(pal.swatches) && pal.swatches.length >= 5, `${p.id}: >= 5 swatches`);
    for (const s of pal.swatches) assert.ok(normalizeHex(s), `${p.id}: swatch ${s} valid hex`);
  }
  const ids = PALETTES.map((x) => x.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'palette ids unique');
}

// ─── biases are subsets of engine bounds ───
{
  for (const p of RENDER_PROFILES) {
    for (const [key, spec] of Object.entries(p.biases)) {
      assert.ok(key in ENGINE_BOUNDS, `${p.id}: bias key '${key}' is a randomizable engine key`);
      const eng = ENGINE_BOUNDS[key];
      if (INT_KEYS.includes(key)) {
        assert.ok(spec[0] >= eng[0] && spec[1] <= eng[1] && spec[0] <= spec[1],
          `${p.id}.${key}: [${spec}] within engine [${eng}]`);
      } else if (PAIR_KEYS.includes(key)) {
        const [[a, b], [c, d]] = spec;
        const [[ea, eb], [ec, ed]] = eng;
        assert.ok(a >= ea && b <= eb && c >= ec && d <= ed && a <= b && c <= d,
          `${p.id}.${key}: within engine bounds and ordered`);
      } else {
        assert.ok(spec[0] >= eng[0] && spec[1] <= eng[1] && spec[0] <= spec[1],
          `${p.id}.${key}: [${spec}] within engine [${eng}]`);
      }
    }
  }
}

// ─── forces are real layoutParams keys with valid values ───
{
  const paramKeys = new Set(Object.keys(DEFAULT_LAYOUT_PARAMS));
  for (const p of RENDER_PROFILES) {
    for (const [key, value] of Object.entries(p.forces)) {
      assert.ok(paramKeys.has(key), `${p.id}: force key '${key}' is a real layoutParam`);
      if (key === 'symmetry') assert.ok(SYMMETRY_MODES.includes(value), `${p.id}: symmetry value valid`);
      if (key === 'accumulationOptics') assert.ok(typeof value === 'number' && value >= 0, `${p.id}: optics valid`);
      if (key === 'accumulation') assert.ok(typeof value === 'boolean', `${p.id}: accumulation boolean`);
    }
  }
}

// ─── off/unknown path: untouched, same reference ───
{
  const c = { count: 240, alpha: [40, 100], symmetry: 'none' };
  assert.strictEqual(applyRenderProfile(c, null), c, 'null profile → same ref');
  assert.strictEqual(applyRenderProfile(c, 'off'), c, 'unknown id → same ref');
  assert.strictEqual(applyRenderProfile(c, 'molnar'), c, 'unprofiled persona → same ref');
  assert.deepStrictEqual(c, { count: 240, alpha: [40, 100], symmetry: 'none' }, 'input never mutated');
}

// ─── shaping: new object, in-range values, forces applied, rest preserved ───
{
  const base = {
    count: 240, scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 78, zTiers: 4, noiseFreq: 0.005, noiseSpeed: 0.5,
    displacement: 0, particleCount: 150, swarmCohesion: 0.6, gravityWells: 1.0,
    damping: 0.95, symmetry: 'none', accumulation: false, accumulationOptics: 0.2,
  };
  for (const p of RENDER_PROFILES) {
    for (let i = 0; i < 60; i++) {
      const out = applyRenderProfile(base, p.id);
      assert.notStrictEqual(out, base, `${p.id}: returns a new object`);
      assert.strictEqual(base.symmetry, 'none', `${p.id}: input not mutated`);
      for (const [key, spec] of Object.entries(p.biases)) {
        const v = out[key];
        if (INT_KEYS.includes(key)) {
          assert.ok(Number.isInteger(v) && v >= spec[0] && v <= spec[1], `${p.id}.${key}=${v} in [${spec}]`);
        } else if (PAIR_KEYS.includes(key)) {
          const [[a, b], [c, d]] = spec;
          assert.ok(v[0] >= a && v[0] <= b && v[1] >= c && v[1] <= d, `${p.id}.${key} in ranges`);
        } else {
          assert.ok(v >= spec[0] && v <= spec[1], `${p.id}.${key}=${v} in [${spec}]`);
        }
      }
      for (const [key, value] of Object.entries(p.forces)) {
        assert.deepStrictEqual(out[key], value, `${p.id}: force ${key}=${value}`);
      }
    }
  }
  // Spot-check the signature moves.
  const ben = applyRenderProfile(base, 'benjamin');
  assert.strictEqual(ben.accumulationOptics, 0, 'benjamin: glow forced off');
  assert.strictEqual(ben.accumulation, false, 'benjamin: trails forced off');
  assert.ok(ben.alpha[0] >= 50 && ben.alpha[1] >= 95, 'benjamin: flat opaque');
  const hae = applyRenderProfile(base, 'haeckel');
  assert.strictEqual(hae.symmetry, 'bilateral', 'haeckel: bilateral symmetry forced');
  assert.strictEqual(hae.accumulationOptics, 0, 'haeckel: matte, no glow');
  const rea = applyRenderProfile(base, 'reas');
  assert.strictEqual(rea.accumulation, true, 'reas: trails forced on (trace of behavior)');
}

// ─── every profile id has a scorer taste (generation + taste stay aligned) ───
{
  const byId = new Map(PERSONA_TASTES.map((t) => [t.id, t]));
  for (const id of RENDER_PROFILE_IDS) {
    const t = byId.get(id);
    assert.ok(t, `${id}: profile backed by a scorer taste`);
    assert.ok(typeof t.alias === 'string' && t.alias.length > 0, `${id}: taste carries a display alias`);
  }
  // Display policy (Matt's IP caution): the product surface shows aliases,
  // never real artist names. Real names live in `name` (code lineage only).
  const expectedAliases = {
    davis: 'OVERLAP', benjamin: 'HARD EDGE', reas: 'PROCESS FIELD', haeckel: 'SPECIMEN',
    molnar: 'NEAR GRID', mohr: 'MONO AXIS', anadol: 'LATENT DRIFT',
    menkman: 'COMPRESSION', oxman: 'GROWN', stock: 'VORTEX',
  };
  for (const t of PERSONA_TASTES) {
    assert.strictEqual(t.alias, expectedAliases[t.id], `${t.id}: alias`);
    assert.notStrictEqual(t.alias, t.name, `${t.id}: alias differs from the real name`);
  }
}

console.log('renderProfiles.selfcheck: ok');
