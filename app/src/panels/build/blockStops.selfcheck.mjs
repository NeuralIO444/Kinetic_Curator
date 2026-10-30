// #1608 (Strata Q Phase 2) — the block-editor stop tables + the sign cell.
//
// Pins the stop-table law (docs/research/strata-quantized/plan.md, Phase 0
// paper) against the tables in blockStops.mjs, the same clauses
// modeStops.selfcheck pins for the shelves:
//   · the censuses — every FX / MATH catalog param and every PATTERN
//     param has an entry, and nothing else does;
//   · stops are authored inside the param's range, four distinct detents,
//     monotonic in effect order (descending only for identity / inverse);
//   · the shipped default is always one of the stops (for PATTERN: every
//     mode's shipped default);
//   · OFF follows its class: magnitude = the floor, identity = the
//     default itself (never the floor), bipolar = true 0, inverse = the
//     least-effect end;
//   · the bipolar set is exactly Phase 0 rule 6's list, and the sign math
//     (nearest magnitude, flip, OFF under either sign) holds;
//   · the surface: the block editors render mode rows, no bare RangeRow
//     remains in them, the shelf tiles are converted, and MixBar keeps
//     its scrubber (the recorded stop — it holds no param to quantize).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { FX_EFFECT_DEFS } from '../../fx/fxFilters.js';
import { MATH_EFFECT_DEFS } from '../../fx/mathFilters.js';
import { defaultPattern, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX } from '../../state/patternTrack.js';
import { QUILT_MAX_GROUT } from '../../pattern/engine.js';
import {
  WET_STOPS,
  wetStopsForCap,
  PATCH_STRENGTH_STOPS,
  FX_PARAM_STOPS,
  MATH_PARAM_STOPS,
  PATTERN_STOPS,
  fxStopsFor,
  mathStopsFor,
  patternStopsFor,
} from './blockStops.mjs';
import { bipolarStateFor, bipolarValueFor } from './te/modeStops.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const catalogKeys = (defs) =>
  Object.entries(defs).flatMap(([kind, def]) => Object.keys(def.params).map((param) => `${kind}.${param}`));

ok('the FX table covers exactly the FX catalog params (every kind, incl. feedbackWarp)', () => {
  assert.deepStrictEqual(Object.keys(FX_PARAM_STOPS).sort(), catalogKeys(FX_EFFECT_DEFS).sort());
  for (const key of catalogKeys(FX_EFFECT_DEFS)) {
    const [kind, param] = key.split('.');
    assert.strictEqual(fxStopsFor(kind, param), FX_PARAM_STOPS[key], `${key} resolves`);
  }
  // The param-less kinds (invert / solarize / edge) contribute no entries.
  for (const kind of ['invert', 'solarize', 'edge']) assert.deepStrictEqual(FX_EFFECT_DEFS[kind].params, {});
});

ok('the MATH table covers exactly the MATH catalog params', () => {
  assert.deepStrictEqual(Object.keys(MATH_PARAM_STOPS).sort(), catalogKeys(MATH_EFFECT_DEFS).sort());
  for (const key of catalogKeys(MATH_EFFECT_DEFS)) {
    const [kind, param] = key.split('.');
    assert.strictEqual(mathStopsFor(kind, param), MATH_PARAM_STOPS[key], `${key} resolves`);
  }
});

ok('the PATTERN table covers exactly the six continuous pattern params', () => {
  assert.deepStrictEqual(Object.keys(PATTERN_STOPS).sort(), ['density', 'drift', 'grout', 'hero', 'mix', 'movers']);
  for (const key of Object.keys(PATTERN_STOPS)) assert.strictEqual(patternStopsFor(key), PATTERN_STOPS[key]);
});

const CATALOG_RANGES = {
  ...Object.fromEntries(
    catalogKeys(FX_EFFECT_DEFS).map((key) => {
      const [kind, param] = key.split('.');
      const p = FX_EFFECT_DEFS[kind].params[param];
      return [key, { min: p.min, max: p.max, def: p.def, table: FX_PARAM_STOPS[key] }];
    }),
  ),
  ...Object.fromEntries(
    catalogKeys(MATH_EFFECT_DEFS).map((key) => {
      const [kind, param] = key.split('.');
      const p = MATH_EFFECT_DEFS[kind].params[param];
      return [key, { min: p.min, max: p.max, def: p.def, table: MATH_PARAM_STOPS[key] }];
    }),
  ),
};
const PATTERN_RANGES = {
  density: { min: PATTERN_DENSITY_MIN, max: PATTERN_DENSITY_MAX },
  mix: { min: 0, max: 1 },
  grout: { min: 0, max: QUILT_MAX_GROUT },
  hero: { min: 0, max: 1 },
  drift: { min: 0, max: 1 },
  movers: { min: 0, max: 1 },
};

ok('every entry is four distinct finite stops, monotonic in effect order, inside the range', () => {
  const check = (key, entry, range) => {
    const s = entry.stops;
    assert.strictEqual(s.length, 4, `${key}: four detents`);
    assert.ok(s.every(Number.isFinite), `${key}: finite stops`);
    assert.strictEqual(new Set(s).size, 4, `${key}: distinct stops`);
    const ascending = s.every((v, i) => i === 0 || v > s[i - 1]);
    const descending = s.every((v, i) => i === 0 || v < s[i - 1]);
    assert.ok(ascending || descending, `${key}: monotonic in effect order`);
    if (descending) assert.ok(entry.identity || entry.inverse, `${key}: descending is identity/inverse only`);
    for (const v of s)
      assert.ok(v >= range.min && v <= range.max, `${key}: stop ${v} within ${range.min}..${range.max}`);
  };
  for (const [key, r] of Object.entries(CATALOG_RANGES)) check(key, r.table, r);
  for (const [key, entry] of Object.entries(PATTERN_STOPS)) check(key, entry, PATTERN_RANGES[key]);
});

ok('the shipped default is always one of the stops', () => {
  for (const [key, r] of Object.entries(CATALOG_RANGES)) {
    const want = r.table.bipolar ? Math.abs(r.def) : r.def;
    assert.ok(r.table.stops.includes(want), `${key}: default ${r.def} is a stop`);
  }
  // PATTERN defaults are per mode: EVERY mode's default must be a stop,
  // or the first mode tap strands that mode's tune.
  for (const mode of ['QUILT', 'GLYPH', 'FIELD', 'TIDES']) {
    const d = defaultPattern(mode);
    for (const key of Object.keys(PATTERN_STOPS)) {
      assert.ok(PATTERN_STOPS[key].stops.includes(d[key]), `${mode}.${key}: default ${d[key]} is a stop`);
    }
  }
});

ok('OFF follows its class (magnitude = floor; identity = the default, never the floor; bipolar = true 0)', () => {
  for (const [key, r] of Object.entries(CATALOG_RANGES)) {
    const e = r.table;
    if (e.bipolar) {
      assert.strictEqual(e.stops[0], 0, `${key}: bipolar OFF is true 0`);
      assert.ok(
        e.stops.every((v, i) => i === 0 || v > e.stops[i - 1]),
        `${key}: magnitudes ascend`,
      );
    } else if (e.identity) {
      assert.strictEqual(e.stops[0], r.def, `${key}: identity OFF is the shipped default`);
      assert.notStrictEqual(e.stops[0], r.min, `${key}: identity OFF is never the range minimum`);
    } else if (e.inverse) {
      assert.strictEqual(e.stops[0], r.max, `${key}: inverse OFF is the least-effect end`);
    } else {
      assert.strictEqual(e.stops[0], r.min, `${key}: magnitude OFF is the no-effect floor`);
    }
  }
  for (const [key, entry] of Object.entries(PATTERN_STOPS)) {
    assert.strictEqual(entry.stops[0], PATTERN_RANGES[key].min, `${key}: OFF is the floor`);
  }
});

ok('the identity / inverse / bipolar censuses are exactly the ruled sets', () => {
  const flagged = (table, flag) =>
    Object.keys(table)
      .filter((k) => table[k][flag])
      .sort();
  assert.deepStrictEqual([...flagged(FX_PARAM_STOPS, 'identity'), ...flagged(MATH_PARAM_STOPS, 'identity')].sort(), [
    'channelMix.r_to_r',
    'grade.chroma',
    'grade.lift',
    'levelsFixed.white',
    'saturate.saturation',
  ]);
  assert.deepStrictEqual([...flagged(FX_PARAM_STOPS, 'inverse'), ...flagged(MATH_PARAM_STOPS, 'inverse')].sort(), [
    'posterize.levels',
    'quantize.steps',
  ]);
  // Phase 0 rule 6's bipolar list, no more, no fewer.
  assert.deepStrictEqual([...flagged(FX_PARAM_STOPS, 'bipolar'), ...flagged(MATH_PARAM_STOPS, 'bipolar')].sort(), [
    'gain.exposure',
    'grade.hue',
    'hueRotate.degrees',
    'lift.offset',
    'tempTint.temperature',
    'tempTint.tint',
  ]);
});

ok('WET + PATCH: authored stops, defaults among them, the ceiling scales like the slider max did', () => {
  assert.deepStrictEqual([...WET_STOPS], [0, 0.35, 0.65, 1]);
  assert.ok(WET_STOPS.includes(1), 'wet default 1 (full) is a stop');
  assert.deepStrictEqual(wetStopsForCap(1), [0, 0.35, 0.65, 1], 'uncapped reads the authored table');
  assert.deepStrictEqual(wetStopsForCap(0.5), [0, 0.18, 0.33, 0.5], 'the HUE ROTATE ceiling scales the stops');
  assert.ok(PATCH_STRENGTH_STOPS.includes(0.16), 'the shipped patch strength 0.16 is a stop');
  assert.strictEqual(PATCH_STRENGTH_STOPS[0], 0, 'patch OFF contributes nothing');
});

ok('sign math: nearest magnitude under the value\u2019s own sign; OFF is 0 under either sign', () => {
  const gain = MATH_PARAM_STOPS['gain.exposure'].stops;
  assert.deepStrictEqual(bipolarStateFor(gain, -1.5), { sign: -1, index: 2, id: 'mid', exact: true });
  const off = bipolarStateFor(gain, -0.4);
  assert.strictEqual(off.sign, -1);
  assert.strictEqual(off.index, 1, '|-0.4| is nearest the 0.5 magnitude');
  assert.strictEqual(off.exact, false, 'an in-between magnitude is off-detent');
  assert.deepStrictEqual(bipolarStateFor(gain, 0), { sign: 0, index: 0, id: 'off', exact: true });
  assert.strictEqual(bipolarValueFor(gain, -1, 2), -1.5, 'a magnitude tap applies under the current sign');
  assert.strictEqual(bipolarValueFor(gain, 1, 3), 3);
  assert.ok(Object.is(bipolarValueFor(gain, -1, 0), 0), 'OFF under a negative sign is true 0, never -0');
  const hue = MATH_PARAM_STOPS['hueRotate.degrees'].stops;
  assert.deepStrictEqual(bipolarStateFor(hue, 90), { sign: 1, index: 2, id: 'mid', exact: true });
  assert.strictEqual(bipolarStateFor(gain, NaN), null);
});

ok('the surface: block editors render mode rows; no bare RangeRow remains in them', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  for (const rel of ['./LayerStack.jsx', './MathEffectEditor.jsx', './PatternEditor.jsx']) {
    const src = read(rel);
    assert.ok(src.includes('<ModeRow'), `${rel} renders mode rows`);
    assert.ok(!src.includes('<RangeRow'), `${rel} has no bare RangeRow left`);
  }
  const hype = read('../layout/HypeSliders.jsx');
  assert.ok(!hype.includes('<MotionTile'), 'the BUILD motion tiles are mode rows (#1608 disposition)');
  // The recorded stop: MixBar is a transient crossfade scrubber over
  // state.voiceMix — it holds no stored param, has no default, and
  // authors nothing, so there is no stop table to write for it. Its
  // slider stays until a ruling says otherwise (see STAGING-REPORT.md).
  const mix = read('../layout/MixBar.jsx');
  assert.ok(mix.includes('<RangeRow'), 'MixBar keeps its scrubber — recorded stop, not an oversight');
  const row = read('./te/ModeRow.jsx');
  assert.ok(row.includes('te-mode-block') && row.includes('bipolarStateFor'), 'one ModeRow, block seat + sign cell');
});

console.log(`\nblockStops.selfcheck: ${n} checks passed`);
