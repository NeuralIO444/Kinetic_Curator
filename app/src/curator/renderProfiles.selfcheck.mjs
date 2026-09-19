// renderProfiles.selfcheck.mjs — persona render profiles for the Curator.
// Palettes resolve + valid hex; biases are subsets of the engine's real
// randomizeKey ranges; forces are real layoutParams keys with valid values;
// the "off"/unknown path returns the candidate untouched (same reference);
// every profile id has a matching scorer taste; the surface shows aliases,
// never real artist names.
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

// A profile is one variant (biases/forces) or several (stock's modes).
function variants(p) {
  if (p.modes) return Object.entries(p.modes).map(([name, m]) => ({ name, ...m }));
  return [{ name: 'base', biases: p.biases, forces: p.forces }];
}

// ─── registry shape ───
{
  assert.deepStrictEqual(RENDER_PROFILE_IDS,
    ['davis', 'benjamin', 'reas', 'haeckel', 'molnar', 'mohr', 'anadol', 'menkman', 'oxman', 'stock'],
    'all ten personas have profiles');
  assert.strictEqual(RENDER_PROFILES.length, 10, 'ten profiles');
  for (const p of RENDER_PROFILES) {
    assert.ok(p.id && p.name && p.paletteId, `${p.id}: identity`);
    assert.ok(typeof p.rationale === 'string' && p.rationale.length > 40, `${p.id}: rationale documented`);
    assert.ok(Array.isArray(p.gaps) && p.gaps.length > 0, `${p.id}: gaps documented`);
    for (const v of variants(p)) {
      assert.ok(v.biases && typeof v.biases === 'object', `${p.id}/${v.name}: biases`);
      assert.ok(v.forces && typeof v.forces === 'object', `${p.id}/${v.name}: forces`);
    }
  }
  assert.ok(getRenderProfile('stock').modes, 'stock is dual-mode');
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
function checkBiasSubset(pid, vname, key, spec) {
  assert.ok(key in ENGINE_BOUNDS, `${pid}/${vname}: bias key '${key}' is a randomizable engine key`);
  const eng = ENGINE_BOUNDS[key];
  if (PAIR_KEYS.includes(key)) {
    const [[a, b], [c, d]] = spec;
    const [[ea, eb], [ec, ed]] = eng;
    assert.ok(a >= ea && b <= eb && c >= ec && d <= ed && a <= b && c <= d,
      `${pid}/${vname}.${key}: within engine bounds and ordered`);
  } else {
    assert.ok(spec[0] >= eng[0] && spec[1] <= eng[1] && spec[0] <= spec[1],
      `${pid}/${vname}.${key}: [${spec}] within engine [${eng}]`);
  }
}
{
  for (const p of RENDER_PROFILES) {
    for (const v of variants(p)) {
      for (const [key, spec] of Object.entries(v.biases)) checkBiasSubset(p.id, v.name, key, spec);
    }
  }
}

// ─── forces are real layoutParams keys with valid values ───
{
  const paramKeys = new Set(Object.keys(DEFAULT_LAYOUT_PARAMS));
  for (const p of RENDER_PROFILES) {
    for (const v of variants(p)) {
      for (const [key, value] of Object.entries(v.forces)) {
        assert.ok(paramKeys.has(key), `${p.id}/${v.name}: force key '${key}' is a real layoutParam`);
        if (key === 'symmetry') assert.ok(SYMMETRY_MODES.includes(value), `${p.id}: symmetry value valid`);
        if (key === 'accumulationOptics') assert.ok(typeof value === 'number' && value >= 0 && value <= 1, `${p.id}: optics valid`);
        if (key === 'accumulation') assert.ok(typeof value === 'boolean', `${p.id}: accumulation boolean`);
      }
    }
  }
}

// ─── off/unknown path: untouched, same reference ───
{
  const c = { count: 240, alpha: [40, 100], symmetry: 'none' };
  assert.strictEqual(applyRenderProfile(c, null), c, 'null profile → same ref');
  assert.strictEqual(applyRenderProfile(c, 'off'), c, 'unknown id → same ref');
  assert.deepStrictEqual(c, { count: 240, alpha: [40, 100], symmetry: 'none' }, 'input never mutated');
}

// ─── shaping: new object, in-range values, forces applied, rest preserved ───
function checkValueInSpec(pid, vname, key, spec, v) {
  if (INT_KEYS.includes(key)) {
    assert.ok(Number.isInteger(v) && v >= spec[0] && v <= spec[1], `${pid}/${vname}.${key}=${v} in [${spec}]`);
  } else if (PAIR_KEYS.includes(key)) {
    const [[a, b], [c, d]] = spec;
    assert.ok(v[0] >= a && v[0] <= b && v[1] >= c && v[1] <= d, `${pid}/${vname}.${key} in ranges`);
  } else {
    assert.ok(v >= spec[0] && v <= spec[1], `${pid}/${vname}.${key}=${v} in [${spec}]`);
  }
}
{
  const base = {
    count: 240, scale: [0.4, 1.6], rotate: [-180, 180], alpha: [40, 100],
    jitter: 24, density: 78, zTiers: 4, noiseFreq: 0.005, noiseSpeed: 0.5,
    displacement: 0, particleCount: 150, swarmCohesion: 0.6, gravityWells: 1.0,
    damping: 0.95, symmetry: 'none', accumulation: false, accumulationOptics: 0.2,
  };
  for (const p of RENDER_PROFILES) {
    const vs = variants(p);
    // Union of variant ranges per key (only stock has >1 variant).
    const union = {};
    for (const v of vs) {
      for (const [key, spec] of Object.entries(v.biases)) {
        if (PAIR_KEYS.includes(key)) {
          const u = union[key] ?? [[Infinity, -Infinity], [Infinity, -Infinity]];
          u[0][0] = Math.min(u[0][0], spec[0][0]); u[0][1] = Math.max(u[0][1], spec[0][1]);
          u[1][0] = Math.min(u[1][0], spec[1][0]); u[1][1] = Math.max(u[1][1], spec[1][1]);
          union[key] = u;
        } else {
          const u = union[key] ?? [Infinity, -Infinity];
          u[0] = Math.min(u[0], spec[0]); u[1] = Math.max(u[1], spec[1]);
          union[key] = u;
        }
      }
    }
    const unionForces = {};
    for (const v of vs) for (const [k, val] of Object.entries(v.forces)) (unionForces[k] ??= new Set()).add(JSON.stringify(val));
    for (let i = 0; i < 60; i++) {
      const out = applyRenderProfile(base, p.id);
      assert.notStrictEqual(out, base, `${p.id}: returns a new object`);
      assert.strictEqual(base.symmetry, 'none', `${p.id}: input not mutated`);
      for (const [key, spec] of Object.entries(union)) checkValueInSpec(p.id, 'union', key, spec, out[key]);
      for (const [key, vals] of Object.entries(unionForces)) {
        assert.ok(vals.has(JSON.stringify(out[key])), `${p.id}: force ${key} is one of the mode values`);
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
  const mol = applyRenderProfile(base, 'molnar');
  assert.strictEqual(mol.accumulationOptics, 0, 'molnar: no glow (dry paper)');
  assert.strictEqual(mol.accumulation, false, 'molnar: no trails');
  assert.ok(mol.density >= 80, 'molnar: dense programmed field');
  const moh = applyRenderProfile(base, 'mohr');
  assert.strictEqual(moh.accumulationOptics, 0, 'mohr: matte');
  assert.ok(moh.density <= 70, 'mohr: generous negative space');
  const ana = applyRenderProfile(base, 'anadol');
  assert.strictEqual(ana.accumulationOptics, 0.2, 'anadol: luminous');
  assert.strictEqual(ana.accumulation, true, 'anadol: trails on');
  assert.ok(ana.density >= 80 && ana.zTiers >= 5, 'anadol: full-bleed deep field');
  const men = applyRenderProfile(base, 'menkman');
  assert.strictEqual(men.accumulationOptics, 0, 'menkman: no soft glow (anti-aliasing is the enemy)');
  assert.strictEqual(men.accumulation, true, 'menkman: smear as P-frame propagation');
  assert.ok(Math.abs(men.rotate[0]) <= 15 && Math.abs(men.rotate[1]) <= 15, 'menkman: rectilinear');
  const oxm = applyRenderProfile(base, 'oxman');
  assert.strictEqual(oxm.symmetry, 'bilateral', 'oxman: chrysalis symmetry');
  assert.strictEqual(oxm.accumulationOptics, 0, 'oxman: matte, never glossy');
  assert.ok(oxm.density <= 50, 'oxman: one structure in a void');
  // Stock: both modes actually fire across rolls.
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    const o = applyRenderProfile(base, 'stock');
    seen.add(o.density >= 90 ? 'field' : o.density <= 60 ? 'tubes' : 'ambiguous');
  }
  assert.ok(seen.has('field') && seen.has('tubes'), `stock: both modes fire (saw ${[...seen]})`);
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
