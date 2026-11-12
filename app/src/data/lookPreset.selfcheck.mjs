// node src/data/lookPreset.selfcheck.mjs
// #1479 (DLC Look phase types) — the kc-look/1 preset type (docs/DLC_PRESET_TYPES.md §1). Pins: a valid look
// round-trips byte-stable through write/parse; an unknown format is refused BY NAME and never half-applied; a
// newer kc-look version is refused plainly; hostile JSON (unparseable, prototype keys, non-object roots) is
// refused, never thrown; out-of-range values clamp through the layout module's own specs while structurally
// unreadable values refuse the whole preset; cross-scope fields (FX, geometry, voice, a palette object) are
// stripped at the top level and inside layoutParams; a seed is optional — seedless applies to the live scene,
// seeded is the #642 uint32 rule (hex strings coerce, garbage refuses).
import assert from 'node:assert/strict';
import { parseLookPreset, writeLookPreset, sniffLookFormat, KC_LOOK_VERSION } from './lookPreset.mjs';
import { MODE_IDS, PARAM_SPEC, RANGE_HARD } from './layout-modes.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const MODE = MODE_IDS[0];
const base = {
  format: 'kc-look/1',
  mode: MODE,
  layoutParams: { count: 90, density: 55 },
  paletteId: 'sepia-plate',
};
const asText = (v) => JSON.stringify(v);

ok('a valid look parses, carrying exactly the look-scope fields', () => {
  const r = parseLookPreset(asText(base));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.look), ['format', 'mode', 'layoutParams', 'paletteId']);
  assert.equal(r.look.format, 'kc-look/1');
  assert.equal(r.look.mode, MODE);
  assert.equal(r.look.paletteId, 'sepia-plate');
  // only the keys the author supplied, clamped — no defaults invented, no mode repeated inside layoutParams
  assert.deepEqual(r.look.layoutParams, { count: 90, density: 55 });
});

ok('a written look reads back identical (round-trip is a fixed point)', () => {
  const first = parseLookPreset(asText({ ...base, seed: 4242 }));
  assert.equal(first.ok, true);
  const text = writeLookPreset(first.look);
  assert.ok(text.endsWith('\n'));
  assert.equal(JSON.parse(text).format, 'kc-look/1');
  const second = parseLookPreset(text);
  assert.equal(second.ok, true);
  assert.deepEqual(second.look, first.look);
  assert.equal(writeLookPreset(second.look), text);
});

ok('range params (scale/alpha/rotate) also round-trip byte-stable after normalisation', () => {
  // range params change shape during normalisation (scale becomes the {x, y} object form), so the
  // fixed-point promise needs its own pin beyond the scalar case above (QA finding, 2026-11-12)
  const first = parseLookPreset(
    asText({ ...base, layoutParams: { count: 40, scale: [0.5, 9], alpha: [10, 500], rotate: [-999, 45] } }),
  );
  assert.equal(first.ok, true);
  const text = writeLookPreset(first.look);
  const second = parseLookPreset(text);
  assert.equal(second.ok, true);
  assert.deepEqual(second.look, first.look);
  assert.equal(writeLookPreset(second.look), text);
});

ok('seedless is seedless; a seeded look keeps its seed; a hex seed coerces (#642)', () => {
  assert.equal('seed' in parseLookPreset(asText(base)).look, false);
  assert.equal(parseLookPreset(asText({ ...base, seed: 0 })).look.seed, 0);
  assert.equal(parseLookPreset(asText({ ...base, seed: 'ff' })).look.seed, 255);
});

ok('bad seeds refuse: negative, oversized, fractional, non-numeric', () => {
  for (const seed of [-1, 2 ** 40, 1.5, 'zzz', null, {}]) {
    const r = parseLookPreset(asText({ ...base, seed }));
    assert.equal(r.ok, false, `seed ${String(seed)}`);
    assert.match(r.error, /Invalid seed/);
  }
});

ok('unknown format is refused by name, never half-applied', () => {
  const r = parseLookPreset(asText({ ...base, format: 'kc-style/1' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown file format "kc-style\/1"/);
  const bare = parseLookPreset(asText({ mode: MODE, paletteId: 'x' }));
  assert.equal(bare.ok, false);
  assert.match(bare.error, /not a look preset/);
});

ok('a newer kc-look version is refused plainly, with `newer` set', () => {
  const r = parseLookPreset(asText({ ...base, format: 'kc-look/2' }));
  assert.equal(r.ok, false);
  assert.equal(r.newer, true);
  assert.equal(r.found, 2);
  assert.match(r.error, /kc-look\/2/);
});

ok('hostile JSON is refused, never thrown', () => {
  for (const bad of ['{', 'not json', '[1,2]', '"kc-look/1"', '42', 'null', '']) {
    assert.equal(parseLookPreset(bad).ok, false, bad);
  }
  // a prototype key inside layoutParams is structurally unreadable, not a value to strip quietly
  const proto = parseLookPreset(
    '{"format":"kc-look/1","mode":"' + MODE + '","paletteId":"x","layoutParams":{"__proto__":{"polluted":true}}}',
  );
  assert.equal(proto.ok, false);
  assert.match(proto.error, /__proto__/);
  assert.equal({}.polluted, undefined);
});

ok('out-of-range values clamp through the live specs', () => {
  const r = parseLookPreset(asText({ ...base, layoutParams: { count: 10 ** 9, alpha: [0, 500], scale: [0.001, 99] } }));
  assert.equal(r.ok, true);
  assert.equal(r.look.layoutParams.count, PARAM_SPEC.count.max);
  assert.deepEqual(r.look.layoutParams.alpha, [RANGE_HARD.alpha.min, RANGE_HARD.alpha.max]);
  assert.deepEqual(r.look.layoutParams.scale, {
    x: [RANGE_HARD.scale.min, RANGE_HARD.scale.max],
    y: [RANGE_HARD.scale.min, RANGE_HARD.scale.max],
  });
});

ok('structurally unreadable layoutParams refuse the whole preset, naming the keys', () => {
  const r = parseLookPreset({ ...base, layoutParams: { count: 'lots', jitter: Number.NaN } });
  assert.equal(r.ok, false);
  assert.match(r.error, /count/);
  assert.match(r.error, /jitter/);
  assert.equal(parseLookPreset(asText({ ...base, layoutParams: [1, 2] })).ok, false);
});

ok('mode must exist; a layoutParams mode that disagrees refuses', () => {
  const unknown = parseLookPreset(asText({ ...base, mode: 'not-a-mode' }));
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /unknown mode "not-a-mode"/);
  assert.equal(parseLookPreset(asText({ format: 'kc-look/1', paletteId: 'x' })).ok, false);
  const other = MODE_IDS.find((m) => m !== MODE);
  const conflict = parseLookPreset(asText({ ...base, layoutParams: { mode: other } }));
  assert.equal(conflict.ok, false);
  assert.match(conflict.error, /disagrees/);
  const agreeing = parseLookPreset(asText({ ...base, layoutParams: { mode: MODE, count: 42 } }));
  assert.equal(agreeing.ok, true);
  assert.deepEqual(agreeing.look.layoutParams, { count: 42 });
});

ok('paletteId must be a name; layoutParams may be absent', () => {
  assert.equal(parseLookPreset(asText({ format: 'kc-look/1', mode: MODE })).ok, false);
  assert.equal(parseLookPreset(asText({ ...base, paletteId: '' })).ok, false);
  assert.equal(parseLookPreset(asText({ ...base, paletteId: 7 })).ok, false);
  const bare = parseLookPreset(asText({ format: 'kc-look/1', mode: MODE, paletteId: 'v01d' }));
  assert.equal(bare.ok, true);
  assert.deepEqual(bare.look.layoutParams, {});
});

ok('cross-scope fields are stripped, top level and inside layoutParams', () => {
  const r = parseLookPreset(
    asText({
      ...base,
      name: 'authored name',
      id: 'look_123',
      fx: { chain: ['blur'] },
      palette: { colors: ['#fff'] },
      voice: { name: 'lois' },
      assets: ['user:loot_x'],
      layoutParams: { count: 12, fxChain: ['blur'], paletteId: 'other', geometry: { verts: 3 } },
    }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.look), ['format', 'mode', 'layoutParams', 'paletteId']);
  assert.deepEqual(r.look.layoutParams, { count: 12 });
  assert.equal(r.look.paletteId, 'sepia-plate');
});

ok('sniff reports the claimed version and nothing more', () => {
  assert.equal(sniffLookFormat(base), 1);
  assert.equal(sniffLookFormat({ format: 'kc-look/2' }), 2);
  assert.equal(sniffLookFormat({ format: 'kc-style/1' }), null);
  assert.equal(sniffLookFormat(null), null);
  assert.equal(sniffLookFormat('kc-look/1'), null);
});

ok('the writer refuses input it could not read back', () => {
  assert.throws(() => writeLookPreset(null));
  assert.throws(() => writeLookPreset({ mode: 'not-a-mode', paletteId: 'x' }));
  assert.throws(() => writeLookPreset({ mode: MODE }));
  assert.equal(KC_LOOK_VERSION, 1);
});

console.log(
  `lookPreset.selfcheck: ${n} checks passed (#1479 — kc-look/${KC_LOOK_VERSION}: sniff, validate, clamp, fail closed)`,
);
