// gradientMap.selfcheck.mjs — #2443: the GRADIENT MAP FX item (EF-3 Tonal).
//
// Pins the loot's acceptance:
//   · gradientMap is a real kind — in FX_EFFECT_DEFS with exactly one
//     performer param (strength, default 0.6), in the EF-3 rack list,
//     offered by the add-row path, and NOT in the curated KINETIC menu
//     (rack-only, like grade — the dice never deal it);
//   · the document never carries stops: sanitizeFxEffects keeps
//     { kind, strength } and drops any stop-shaped params;
//   · the default gradient obeys the issue's recipe: endpoints mostly
//     desaturated, the saturated colour in the midtones, a real hue
//     shift between midtones and highlights;
//   · stops resolve per-Look (partial authoring merges over defaults,
//     unknown composition falls back to the default gradient) and the
//     scene-contract seam (withGradientStops) attaches them;
//   · the CPU reference maps by luminance, not hue: strength 0 is the
//     identity, strength 1 is the pure map, partial strength is the
//     exact blend, alpha survives, and a grey ramp's output luminance
//     is monotonic;
//   · both render paths compile it: the GL descriptor (whose stop defs
//     equal the default gradient) and the SVG table-transfer prims.
import assert from 'node:assert';
import {
  FX_EFFECT_DEFS,
  FX_RACK,
  FX_MENU_KINDS,
  sanitizeFxEffects,
  availableFxKinds,
  defaultFxParams,
  compileFxPrimitives,
} from './fxFilters.js';
import {
  DEFAULT_GRADIENT_STOPS,
  GRADIENT_STOP_PARAMS,
  hexToRgb,
  resolveGradientStops,
  gradientStopParams,
  gradientStopParamsForComposition,
  withGradientStops,
  gradientStopsFromParams,
  luminance709,
  sampleGradient,
  applyGradientMap,
} from './gradientMap.mjs';
import { FX_SHADER_KINDS, FX_SHADER_EFFECTS, FX_GRADIENT_MAP_DESCRIPTOR } from '../gl/effects/fxShaders.mjs';
import { sanitizeParams } from '../gl/effects/template.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const chroma = (rgb) => Math.max(...rgb) - Math.min(...rgb);
const hueDeg = (rgb) => {
  const [r, g, b] = rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

ok('gradientMap is a real EF-3 kind with exactly one performer param: strength at 0.6', () => {
  const def = FX_EFFECT_DEFS.gradientMap;
  assert.ok(def, 'FX_EFFECT_DEFS.gradientMap exists');
  assert.equal(def.label, 'Gradient Map');
  assert.deepEqual(
    Object.keys(def.params),
    ['strength'],
    'strength is the only catalog param — stops are Look recipe constants',
  );
  assert.deepEqual(
    { min: def.params.strength.min, max: def.params.strength.max, def: def.params.strength.def },
    { min: 0, max: 1, def: 0.6 },
    'strength defaults to a tasteful partial blend, not 100%',
  );
  const ef3 = FX_RACK.find((s) => s.slot === 'EF-3');
  assert.ok(ef3.kinds.includes('gradientMap'), 'EF-3 rack lists gradientMap');
  assert.deepEqual(defaultFxParams('gradientMap'), { strength: 0.6 });
  assert.ok(availableFxKinds([]).includes('gradientMap'), 'offered on an empty layer');
  assert.ok(!availableFxKinds([{ kind: 'gradientMap', params: {} }]).includes('gradientMap'), 'not offered twice');
  assert.ok(!FX_MENU_KINDS.includes('gradientMap'), 'not in the curated KINETIC menu — the dice never deal it');
});

ok('the document never carries stops: sanitize keeps { kind, strength } and drops stop-shaped params', () => {
  const out = sanitizeFxEffects([
    { kind: 'gradientMap', params: { strength: 2, black_point: '#ff0000', midtones: [1, 0, 0, 1] } },
  ]);
  assert.deepEqual(out, [{ kind: 'gradientMap', params: { strength: 1 } }], 'strength clamped, stops stripped');
  // Chain position is the performer's: a non-grain kind keeps its slot.
  const chain = sanitizeFxEffects([
    { kind: 'gradientMap', params: { strength: 0.6 } },
    { kind: 'invert', params: {} },
  ]);
  assert.deepEqual(
    chain.map((e) => e.kind),
    ['gradientMap', 'invert'],
    'slot order preserved',
  );
});

ok('the default gradient obeys the recipe: quiet endpoints, saturated midtones, a midtone→highlight hue shift', () => {
  const mid = hexToRgb(DEFAULT_GRADIENT_STOPS.midtones);
  const high = hexToRgb(DEFAULT_GRADIENT_STOPS.highlights);
  const black = hexToRgb(DEFAULT_GRADIENT_STOPS.blackPoint);
  const white = hexToRgb(DEFAULT_GRADIENT_STOPS.whitePoint);
  assert.ok(chroma(mid) > 0.5, `midtone stop is saturated (chroma ${chroma(mid).toFixed(2)})`);
  assert.ok(chroma(black) < 0.35 * chroma(mid), 'black point stays mostly desaturated');
  assert.ok(chroma(white) < 0.35 * chroma(mid), 'white point stays mostly desaturated');
  const shift = Math.abs(hueDeg(high) - hueDeg(mid));
  assert.ok(shift > 15, `hue shifts between midtones and highlights (${shift.toFixed(0)}°)`);
});

ok('stops resolve per-Look: partial authoring merges over defaults, junk falls back per stop', () => {
  const stops = resolveGradientStops({ gradientMap: { midtones: '#00ff00', shadows: 'not-a-colour' } });
  assert.deepEqual(
    stops.map((s) => s.at),
    [0, 0.25, 0.5, 0.75, 1],
  );
  assert.deepEqual(stops[2].rgb, [0, 1, 0], 'the authored stop wins');
  assert.deepEqual(stops[1].rgb, hexToRgb(DEFAULT_GRADIENT_STOPS.shadows), 'an unparseable stop falls back');
  assert.deepEqual(stops[0].rgb, hexToRgb(DEFAULT_GRADIENT_STOPS.blackPoint), 'an unnamed stop falls back');
  assert.deepEqual(resolveGradientStops(null), resolveGradientStops({}), 'no Look = the default gradient');
  assert.deepEqual(resolveGradientStops(undefined), resolveGradientStops({ gradientMap: null }));
});

ok('withGradientStops attaches the standing Look’s stops; other chains pass through untouched', () => {
  const plain = [{ kind: 'invert', params: {} }];
  assert.equal(
    withGradientStops(plain, 'chiaroscuro'),
    plain,
    'no gradientMap entry → same array, byte-identical contracts',
  );
  const chain = withGradientStops(
    [
      { kind: 'invert', params: {} },
      { kind: 'gradientMap', params: { strength: 0.6 } },
    ],
    'chiaroscuro',
  );
  assert.deepEqual(chain[0], { kind: 'invert', params: {} }, 'neighbour steps untouched');
  assert.equal(chain[1].params.strength, 0.6, 'the performer param survives');
  assert.deepEqual(
    chain[1].params.midtones,
    [...hexToRgb('#a83218'), 1],
    'chiaroscuro’s authored ember midtone is attached',
  );
  assert.deepEqual(
    Object.keys(chain[1].params).sort(),
    ['strength', ...GRADIENT_STOP_PARAMS].sort(),
    'exactly strength + the five stop params',
  );
  const fallback = withGradientStops([{ kind: 'gradientMap', params: { strength: 0.6 } }], 'no-such-look');
  assert.deepEqual(
    fallback[0].params,
    { strength: 0.6, ...gradientStopParams(null) },
    'unknown composition → default gradient',
  );
  assert.deepEqual(gradientStopParamsForComposition('bio-plate-sepia').midtones, [...hexToRgb('#96754a'), 1]);
});

ok('the CPU reference maps by luminance, not hue — and strength blends toward the unmapped frame', () => {
  const stops = resolveGradientStops(null);
  // Full strength: each pixel becomes the gradient sampled at ITS luminance.
  const px = new Float32Array([
    0.85,
    0.1,
    0.1,
    1, // a red
    0.1,
    0.5,
    0.1,
    1, // a green
  ]);
  const lumA = luminance709([px[0], px[1], px[2]]);
  const lumB = luminance709([px[4], px[5], px[6]]);
  applyGradientMap(px, { stops, strength: 1 });
  const expectA = sampleGradient(stops, lumA);
  const expectB = sampleGradient(stops, lumB);
  for (let c = 0; c < 3; c++) {
    assert.ok(near(px[c], expectA[c], 1e-6), 'full strength: the pixel becomes the gradient at its luminance');
    assert.ok(near(px[4 + c], expectB[c], 1e-6), 'same law for the second hue');
  }
  assert.equal(px[3], 1, 'alpha untouched');
  // Equal luminance, different hue → the same mapped colour: a warm
  // pixel and a pure-green pixel built to share its exact luminance.
  const warm = [0.6, 0.3, 0.05];
  const warmLum = luminance709(warm);
  const greenTwin = [0, warmLum / 0.7152, 0];
  const both = new Float32Array([...warm, 1, ...greenTwin, 1]);
  applyGradientMap(both, { stops, strength: 1 });
  for (let c = 0; c < 3; c++) {
    assert.ok(
      near(both[c], both[4 + c], 1e-6),
      `channel ${c}: equal luminance in different hues maps to the same colour — the map judges tone, not hue`,
    );
  }
  // Strength 0 is the identity, byte for byte.
  const untouched = new Float32Array([0.2, 0.4, 0.6, 0.8, 0, 0, 0, 0]);
  const copy = new Float32Array(untouched);
  applyGradientMap(untouched, { stops, strength: 0 });
  assert.deepEqual([...untouched], [...copy], 'strength 0 leaves the frame untouched');
  // Partial strength is the exact blend toward the unmapped frame.
  const partial = new Float32Array([0.5, 0.5, 0.5, 1]);
  const mapped = sampleGradient(stops, 0.5);
  applyGradientMap(partial, { stops, strength: 0.6 });
  for (let c = 0; c < 3; c++) {
    assert.ok(near(partial[c], 0.5 + (mapped[c] - 0.5) * 0.6, 1e-6), `channel ${c} blends by exactly strength`);
  }
  // Transparent pixels are never touched; half-alpha re-premultiplies.
  const ghost = new Float32Array([0, 0, 0, 0, 0.25, 0.25, 0.25, 0.5]);
  applyGradientMap(ghost, { stops, strength: 1 });
  assert.deepEqual([ghost[0], ghost[1], ghost[2], ghost[3]], [0, 0, 0, 0], 'transparent stays transparent');
  const halfMapped = sampleGradient(stops, 0.5);
  for (let c = 0; c < 3; c++) {
    assert.ok(
      near(ghost[4 + c], halfMapped[c] * 0.5, 1e-6),
      'a half-alpha grey maps in straight space and re-premultiplies',
    );
  }
  assert.equal(ghost[7], 0.5, 'alpha preserved');
});

ok('a grey ramp’s mapped luminance is monotonic — the map never folds tones back', () => {
  const stops = resolveGradientStops(null);
  let prev = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const out = luminance709(sampleGradient(stops, t));
    assert.ok(out >= prev - 1e-9, `tone ${t.toFixed(2)} maps monotonically (got ${out} after ${prev})`);
    prev = out;
  }
  // The authored Looks keep the same discipline.
  for (const id of ['chiaroscuro', 'neon-brood', 'bio-plate-sepia']) {
    const lookStops = gradientStopsFromParams(gradientStopParamsForComposition(id));
    let p = -Infinity;
    for (let i = 0; i <= 40; i++) {
      const out = luminance709(sampleGradient(lookStops, i / 40));
      assert.ok(out >= p - 1e-9, `${id} ramp is monotonic at step ${i}`);
      p = out;
    }
  }
});

ok('the GL path compiles it: descriptor stop defs equal the default gradient, stops ride the chain step', () => {
  assert.ok(FX_SHADER_KINDS.includes('gradientMap'), 'GL template registry has gradientMap');
  const entry = FX_SHADER_EFFECTS.find(([k]) => k === 'gradientMap');
  const desc = entry[1].descriptor;
  assert.deepEqual(
    Object.fromEntries(GRADIENT_STOP_PARAMS.map((p) => [p, desc.params[p].def])),
    gradientStopParams(null),
    'descriptor stop defaults ARE the default gradient',
  );
  assert.equal(desc.params.strength.def, 0.6, 'descriptor strength mirrors the catalog');
  // compileFxShaders applies sanitizeParams(descriptor, params) per step
  // (fxShaders.selfcheck covers the registered compile end to end) — pin
  // that the Look's stops survive that sanitize intact.
  const carried = sanitizeParams(FX_GRADIENT_MAP_DESCRIPTOR, {
    strength: 0.6,
    ...gradientStopParamsForComposition('chiaroscuro'),
  });
  assert.equal(carried.strength, 0.6);
  assert.deepEqual(
    carried.midtones,
    [...hexToRgb('#a83218'), 1],
    'the Look’s stops survive the compile sanitize intact',
  );
  // A step without stops sanitizes to the default gradient.
  const bare = sanitizeParams(FX_GRADIENT_MAP_DESCRIPTOR, { strength: 0.6 });
  assert.deepEqual(bare.midtones, gradientStopParams(null).midtones, 'no stops → default gradient fills in');
  assert.deepEqual(
    Object.keys(bare).sort(),
    ['strength', ...GRADIENT_STOP_PARAMS].sort(),
    'the compiled step carries exactly strength + the five stops',
  );
});

ok('the SVG path compiles it: luminance fold, 16-point tables, strength mix; 0 is a pass-through', () => {
  const prims = compileFxPrimitives([{ kind: 'gradientMap', params: { strength: 0.6 } }]);
  assert.deepEqual(
    prims.map((p) => p.prim),
    ['feColorMatrix', 'feComponentTransfer', 'feComposite'],
    'the table-transfer chain',
  );
  const transfer = prims.find((p) => p.prim === 'feComponentTransfer');
  assert.deepEqual(
    transfer.children.map((c) => c.prim),
    ['feFuncR', 'feFuncG', 'feFuncB'],
  );
  for (const child of transfer.children) {
    assert.equal(child.attrs.tableValues.split(' ').length, 16, '16 samples per channel');
  }
  const firstRed = Number(transfer.children[0].attrs.tableValues.split(' ')[0]);
  assert.ok(
    near(firstRed, hexToRgb(DEFAULT_GRADIENT_STOPS.blackPoint)[0], 0.001),
    'the table starts at the black point',
  );
  const mix = prims.find((p) => p.prim === 'feComposite');
  assert.equal(mix.attrs.operator, 'arithmetic');
  assert.ok(near(Number(mix.attrs.k2), 0.6) && near(Number(mix.attrs.k3), 0.4), 'strength mixes mapped against source');
  const off = compileFxPrimitives([{ kind: 'gradientMap', params: { strength: 0 } }]);
  assert.deepEqual(
    off.map((p) => p.prim),
    ['feOffset'],
    'strength 0 is the identity pass-through',
  );
});

console.log(`gradientMap.selfcheck: ${n} groups passed`);
