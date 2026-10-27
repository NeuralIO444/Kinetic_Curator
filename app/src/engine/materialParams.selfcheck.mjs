// materialParams.selfcheck.mjs — #1585 (Materials M4): the material
// bodies' tunables as live per-Look parameters.
//
// Pins the M4 contract across all four bodies:
//  - the params exist in DEFAULT_LAYOUT_PARAMS with the SHIPPED
//    constants as their defaults, and in PARAM_SPEC with bounds (the
//    #1550 single source of truth — write path, dice and census all
//    read the same table);
//  - normalize clamps every knob to its spec; the write-path door
//    (validateLayoutParams) accepts them like any other scalar;
//  - a Look that sets the knobs to exactly the shipped constants
//    composes a BYTE-IDENTICAL still to a Look that never heard of
//    them (the matParams elision: defaults stamp nothing);
//  - each knob, moved alone to a mid-range value, moves its body's
//    composed still measurably (differing-pixel counts, cached pixel
//    buffers — the #1564 lesson);
//  - the census reads every knob ALIVE ('moves') in the context that
//    honestly exercises it: glassAlpha at placement level, the
//    ramp/screen knobs through the composed still (matstill).
import assert from 'node:assert';
import { Resvg } from '@resvg/resvg-js';
import { GLASS_BODY_ALPHA } from './glassBody.mjs';
import { PLATE_CENTER, PLATE_RADIUS } from './plateBody.mjs';
import { STIPPLE_DOT_SCALE } from './stippleBody.mjs';
import {
  DEFAULT_LAYOUT_PARAMS,
  PARAM_SPEC,
  normalizeLayoutParams,
  validateLayoutParams,
} from '../data/layout-modes.js';
import { place, paramCensus } from '../curator/censusReport.mjs';
import { composeStillSvg } from '../curator/miner.mjs';
import { resolvePalette } from '../data/palettes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const KNOBS = [
  'glassAlpha',
  'plateRadius',
  'plateCenterX',
  'plateCenterY',
  'washStrength',
  'washSpread',
  'stippleDotScale',
];

// ── registration + defaults ──────────────────────────────────────────
ok('defaults are the shipped constants, exactly', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.glassAlpha, GLASS_BODY_ALPHA);
  assert.equal(DEFAULT_LAYOUT_PARAMS.plateRadius, PLATE_RADIUS);
  assert.equal(DEFAULT_LAYOUT_PARAMS.plateCenterX, PLATE_CENTER.x);
  assert.equal(DEFAULT_LAYOUT_PARAMS.plateCenterY, PLATE_CENTER.y);
  assert.equal(DEFAULT_LAYOUT_PARAMS.washStrength, 1);
  assert.equal(DEFAULT_LAYOUT_PARAMS.washSpread, 1);
  assert.equal(DEFAULT_LAYOUT_PARAMS.stippleDotScale, STIPPLE_DOT_SCALE);
});

ok('every knob is registered in PARAM_SPEC with sane bounds', () => {
  for (const k of KNOBS) {
    const spec = PARAM_SPEC[k];
    assert.ok(spec, `${k} registered`);
    assert.ok(spec.min < spec.max, `${k} has a range`);
    const d = DEFAULT_LAYOUT_PARAMS[k];
    assert.ok(d >= spec.min && d <= spec.max, `${k} default ${d} inside [${spec.min}, ${spec.max}]`);
  }
});

ok('normalize clamps to spec; the write-path door accepts the knobs', () => {
  const wild = normalizeLayoutParams({
    glassAlpha: 7,
    plateRadius: 99,
    plateCenterX: -3,
    plateCenterY: 2,
    washStrength: -1,
    washSpread: 100,
    stippleDotScale: 0,
  });
  assert.equal(wild.glassAlpha, PARAM_SPEC.glassAlpha.max);
  assert.equal(wild.plateRadius, PARAM_SPEC.plateRadius.max);
  assert.equal(wild.plateCenterX, PARAM_SPEC.plateCenterX.min);
  assert.equal(wild.plateCenterY, PARAM_SPEC.plateCenterY.max);
  assert.equal(wild.washStrength, PARAM_SPEC.washStrength.min);
  assert.equal(wild.washSpread, PARAM_SPEC.washSpread.max);
  assert.equal(wild.stippleDotScale, PARAM_SPEC.stippleDotScale.min);
  const door = validateLayoutParams({ plateRadius: 0.6, washStrength: 0.5, stippleDotScale: 4 });
  assert.deepEqual(door.rejected, [], 'mid-range writes are not rejections');
  assert.equal(door.params.plateRadius, 0.6);
  assert.equal(door.params.washStrength, 0.5);
  assert.equal(door.params.stippleDotScale, 4);
});

// ── defaults parity at the still surface ─────────────────────────────
const BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12, mode: 'fibonacci' };
const palette = resolvePalette('hydra', null, []);
const raster = (svg) =>
  new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
const diffPx = (a, b) => {
  const ap = a.pixels;
  const bp = b.pixels; // cache once (#1564)
  let d = 0;
  for (let i = 0; i < ap.length; i += 4) {
    if (ap[i] !== bp[i] || ap[i + 1] !== bp[i + 1] || ap[i + 2] !== bp[i + 2] || ap[i + 3] !== bp[i + 3]) d++;
  }
  return d;
};

ok('explicit defaults compose byte-identical stills to absent knobs (all four bodies)', () => {
  const cases = [
    ['plate', { plateRadius: PLATE_RADIUS, plateCenterX: PLATE_CENTER.x, plateCenterY: PLATE_CENTER.y }],
    ['wash', { washStrength: 1, washSpread: 1 }],
    ['stipple', { stippleDotScale: STIPPLE_DOT_SCALE }],
    ['glass', { glassAlpha: GLASS_BODY_ALPHA }],
  ];
  for (const [material, explicit] of cases) {
    const absent = composeStillSvg(place({ ...BASE, material }), palette);
    const stated = composeStillSvg(place({ ...BASE, material, ...explicit }), palette);
    assert.equal(stated, absent, `${material}: explicit defaults must equal absent knobs, byte for byte`);
  }
});

// ── each knob moves its body, alone ──────────────────────────────────
ok("each knob moved alone moves its body's still (differing pixels)", () => {
  const cases = [
    ['glass', 'glassAlpha', { glassAlpha: 0.4 }],
    ['plate', 'plateRadius', { plateRadius: 0.6 }],
    ['plate', 'plateCenterX', { plateCenterX: 0.65 }],
    ['plate', 'plateCenterY', { plateCenterY: 0.6 }],
    ['wash', 'washStrength', { washStrength: 0.5 }],
    ['wash', 'washSpread', { washSpread: 2 }],
    ['stipple', 'stippleDotScale', { stippleDotScale: 4 }],
  ];
  for (const [material, key, moved] of cases) {
    const a = raster(composeStillSvg(place({ ...BASE, material }), palette));
    const b = raster(composeStillSvg(place({ ...BASE, material, ...moved }), palette));
    const d = diffPx(a, b);
    assert.ok(d > 100, `${key}: still must move measurably (got ${d} differing px)`);
    console.log(`    ${key}: ${d} differing px`);
  }
});

// ── the census reads every knob alive ────────────────────────────────
ok('census: all seven knobs read "moves" in their honest context', () => {
  const rows = paramCensus().filter((r) => KNOBS.includes(r.key));
  assert.equal(rows.length, KNOBS.length, 'every knob has a census row');
  for (const r of rows) {
    assert.equal(r.class, 'moves', `${r.key} must read alive (got ${r.class} via ${r.driver})`);
    assert.ok(r.delta && r.delta.moved > 0, `${r.key} delta must be non-zero`);
    console.log(`    ${r.key}: moves via ${r.driver} (delta ${r.delta.moved})`);
  }
});

console.log(`materialParams.selfcheck: OK (${n} cases)`);
