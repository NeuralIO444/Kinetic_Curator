// #1607 (Strata Q Phase 1) — the stop table + mode-row math.
//
// Pins the stop-table law (docs/research/strata-quantized/plan.md, Phase 0
// paper) mechanically against PARAM_STOPS in data/layout-modes.js:
//   · the census — every continuous BUILD shelf value has stops, and
//     nothing else does (the Phase 0 exemptions stay out of the table);
//   · stops are authored inside the param's range, four distinct detents,
//     monotonic in effect order (descending only for identity class);
//   · the shipped default is always one of the stops;
//   · OFF follows its class: magnitude OFF = the PARAM_SPEC floor,
//     identity OFF is never the floor;
//   · atlas-affecting counts are flagged (law rule 7);
//   · tapered params' stops are spread in taper space, not param space;
//   · the mode math: nearest mode, ties to the lower mode, exact vs
//     off-detent — including the dice case (an in-between value lights
//     its nearest mode and is NOT exact).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { PARAM_SPEC, DEFAULT_LAYOUT_PARAMS, PARAM_STOPS, ATLAS_AFFECTING_PARAMS } from '../../../data/layout-modes.js';
import { getTaper } from '../../../components/taper.js';
import { MODE_IDS, stopsFor, modeStateFor } from './modeStops.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

// The Phase 1 shelf census: every continuous value rendered on the §1–§4
// shelves by LayoutSliders / SwarmSliders / HypeSliders / AccumFamily /
// AppearanceSliders / MaterialSliders. A new shelf value joins this list
// and the table together, or the build fails here — that is the point.
const SHELF_CENSUS = [
  // ① LAYOUT
  'count',
  'jitter',
  'density',
  'groundLean',
  'groundNudge',
  'groundShadow',
  'groundSnap',
  'weatherAir',
  // ③ swarm + hype shelves
  'particleCount',
  'swarmCohesion',
  'gravityWells',
  'damping',
  'noiseSpeed',
  'creatures',
  'body',
  'tight',
  'metabolism',
  // ③ ACCUM trail family
  'echoes',
  'accumScan',
  'leaveFade',
  'tunnelFade',
  'prismFade',
  'flowFade',
  'accumulationFade',
  'accumulationOptics',
  'accumulationWetness',
  'accumulationTunnel',
  'accumulationPrism',
  'accumulationFlow',
  // ④ appearance + materials
  'crooked',
  'squash',
  'growthRate',
  'growthBranch',
  'glassAlpha',
  'plateRadius',
  'washStrength',
  'washSpread',
  'stippleDotScale',
];

// #1608 (Phase 2) — the layout params whose rows Phase 2 quantized: the
// #716 motion keys (shelf tiles in HypeSliders) and the DISH knobs (rows
// inside the strata blocks, LayerStack). Same table, same law — the
// census grows by exactly these six, named here so a seventh cannot
// slip in silently.
const BLOCK_LAYOUT_CENSUS = ['flap', 'breath', 'wind', 'contactRestitution', 'contactRepel', 'dishTempo'];

ok('the stop table covers exactly the shelf census + the Phase 2 layout params', () => {
  assert.deepStrictEqual(Object.keys(PARAM_STOPS).sort(), [...SHELF_CENSUS, ...BLOCK_LAYOUT_CENSUS].sort());
});

ok('the Phase 0 exemptions stay out of the table', () => {
  // Precision (phylloDivergence), position (plate centre), the dial
  // (hueRotate), and the dual ranges (scale/rotate/alpha) are exempt as a
  // closed list — a stop entry for any of them is a law violation.
  for (const key of ['phylloDivergence', 'plateCenterX', 'plateCenterY', 'hueRotate', 'scale', 'rotate', 'alpha']) {
    assert.ok(!(key in PARAM_STOPS), `${key} is exempt and must not carry stops`);
    assert.strictEqual(stopsFor(key), null, `${key} resolves to no stops`);
  }
});

ok('every entry is four distinct finite stops, monotonic in effect order', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    const s = entry.stops;
    assert.strictEqual(s.length, 4, `${key}: four detents`);
    assert.ok(s.every(Number.isFinite), `${key}: finite stops`);
    assert.strictEqual(new Set(s).size, 4, `${key}: distinct stops`);
    const ascending = s.every((v, i) => i === 0 || v > s[i - 1]);
    const descending = s.every((v, i) => i === 0 || v < s[i - 1]);
    assert.ok(ascending || descending, `${key}: monotonic in effect order`);
    if (descending) assert.ok(entry.identity, `${key}: descending stops are identity class only`);
  }
});

ok('every stop sits inside the param range', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    const spec = PARAM_SPEC[key];
    if (key === 'accumScan') {
      // #1804: accumScan deliberately has no PARAM_SPEC entry; its panel
      // range is 0..1 and the stops are authored against it.
      assert.ok(!spec, 'accumScan stays out of PARAM_SPEC');
      for (const v of entry.stops) assert.ok(v >= 0 && v <= 1, `accumScan stop ${v} in 0..1`);
      continue;
    }
    assert.ok(spec, `${key} has a PARAM_SPEC entry`);
    for (const v of entry.stops)
      assert.ok(v >= spec.min && v <= spec.max, `${key} stop ${v} within ${spec.min}..${spec.max}`);
  }
});

ok('the shipped default is always one of the stops', () => {
  for (const key of [...SHELF_CENSUS, ...BLOCK_LAYOUT_CENSUS]) {
    const def = key === 'accumScan' ? 0 : DEFAULT_LAYOUT_PARAMS[key];
    assert.ok(PARAM_STOPS[key].stops.includes(def), `${key}: default ${def} is a stop`);
  }
});

ok('OFF follows its class (magnitude = the floor; identity never is)', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    if (key === 'accumScan') {
      assert.strictEqual(entry.stops[0], 0, 'accumScan OFF is 0 (absence)');
      continue;
    }
    if (entry.identity) {
      assert.notStrictEqual(entry.stops[0], PARAM_SPEC[key].min, `${key}: identity OFF is never the range minimum`);
    } else {
      assert.strictEqual(entry.stops[0], PARAM_SPEC[key].min, `${key}: magnitude OFF is the no-effect floor`);
    }
  }
});

ok('atlas-affecting shelf counts are flagged (law rule 7)', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    if (entry.atlas) assert.ok(ATLAS_AFFECTING_PARAMS.includes(key), `${key}: flagged but not atlas-affecting`);
  }
  for (const key of SHELF_CENSUS) {
    if (ATLAS_AFFECTING_PARAMS.includes(key)) {
      assert.ok(PARAM_STOPS[key].atlas, `${key}: atlas-affecting counts carry the flag`);
    }
  }
});

ok('tapered stops are authored in taper space (spread where the hand travels)', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    if (!entry.taper) continue;
    const { kind, ...opts } = entry.taper;
    const taper = getTaper(kind, opts);
    const positions = entry.stops.map((v) => taper.toSlider(v));
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i] - positions[i - 1] >= 0.1, `${key}: detents spread in taper space (${positions})`);
    }
  }
});

ok('mode math: every stop lights its own mode, exactly', () => {
  for (const [key, entry] of Object.entries(PARAM_STOPS)) {
    entry.stops.forEach((stop, i) => {
      const st = modeStateFor(entry.stops, stop);
      assert.strictEqual(st.index, i, `${key}: stop ${stop} lights ${MODE_IDS[i]}`);
      assert.strictEqual(st.exact, true, `${key}: stop ${stop} is exact`);
    });
  }
});

ok('mode math: in-between values light the nearest mode, off-detent (the dice case)', () => {
  // A dice-authored wetness of 0.37 renders identically and displays as
  // nearest-mode MID with the off-detent mark — never as a bare MID.
  const wet = modeStateFor(stopsFor('accumulationWetness'), 0.37);
  assert.strictEqual(wet.id, 'mid');
  assert.strictEqual(wet.exact, false);
  const count = modeStateFor(stopsFor('count'), 373);
  assert.strictEqual(count.id, 'mid');
  assert.strictEqual(count.exact, false);
  // Ties go to the lower mode (shift-layer precedent).
  assert.strictEqual(modeStateFor(stopsFor('count'), 180).id, 'low', 'midway 120/240 lights LOW');
  // Identity class descends: the tuned neutral is OFF, and a value between
  // LOW and MID on the damping row lights the earlier (lower) mode.
  assert.deepStrictEqual(modeStateFor(stopsFor('damping'), 0.95), { index: 0, id: 'off', exact: true });
  const damp = modeStateFor(stopsFor('damping'), 0.91);
  assert.strictEqual(damp.id, 'low');
  assert.strictEqual(damp.exact, false);
  // Non-values light nothing.
  assert.strictEqual(modeStateFor(stopsFor('count'), NaN), null);
  assert.strictEqual(modeStateFor(null, 0.5), null);
});

ok('the shelves render mode rows; only the exemptions keep value buttons', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  for (const rel of [
    '../../layout/SwarmSliders.jsx',
    '../../layout/HypeSliders.jsx',
    '../../layout/AppearanceSliders.jsx',
  ]) {
    const src = read(rel);
    assert.ok(src.includes('<ModeRow'), `${rel} renders mode rows`);
    assert.ok(!src.includes('<ValueButton'), `${rel} has no value buttons left`);
  }
  const layout = read('../../layout/LayoutSliders.jsx');
  assert.ok(layout.includes('<ModeRow'), 'LayoutSliders renders mode rows');
  assert.ok(layout.includes('<ValueButton'), 'LayoutSliders keeps value buttons for the dual ranges + divergence');
  const materials = read('../../layout/MaterialSliders.jsx');
  assert.ok(
    materials.includes('<ModeRow') && materials.includes('<ValueButton'),
    'MaterialSliders: rows + exempt centres',
  );
  const accum = read('../../layout/AccumFamily.jsx');
  assert.ok(accum.includes('<ModeRow') && !accum.includes('<ValueButton'), 'AccumFamily renders mode rows only');
  const row = read('./ModeRow.jsx');
  assert.ok(row.includes('TeaMatrix') && row.includes('dot'), 'ModeRow is a TeaMatrix with the off-detent dot');
  assert.ok(row.includes('useDock'), 'ModeRow opens the value dock (D2), not a new popover');
});

console.log(`\nmodeStops.selfcheck: ${n} checks passed`);
