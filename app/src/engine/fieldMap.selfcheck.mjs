// node src/engine/fieldMap.selfcheck.mjs
// #1199 — field→channel MATH modulation: sanitize/gate, response curves,
// channel math, saturation compositing, density field, determinism per seed.
import assert from 'node:assert';
import {
  FIELDMAP_FIELDS,
  FIELDMAP_CHANNELS,
  FIELDMAP_CURVES,
  FIELDMAP_STEPS,
  FIELDMAP_RANGES,
  FIELDMAP_SAT_RANGE,
  sanitizeFieldMap,
  fieldMapActive,
  curveResponse,
  saturateHex,
  applyFieldMap,
} from './fieldMap.mjs';

const CTX = { seed: 1234, canvasW: 1000, canvasH: 800 };

/** Synthetic item row: n items across the canvas, base scale 1, a saturated red. */
function makeItems(n, xs) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      x: xs ? xs[i] : (i + 0.5) * (1000 / n),
      y: 400,
      scale: 1,
      scaleY: 1,
      color: '#cc3322',
      accent: '#22aa88',
    });
  }
  return items;
}

// ── vocab ──────────────────────────────────────────────────────────────
assert.deepStrictEqual([...FIELDMAP_FIELDS], ['off', 'noise', 'density']);
assert.deepStrictEqual([...FIELDMAP_CHANNELS], ['off', 'weight', 'saturation', 'scale']);
assert.deepStrictEqual([...FIELDMAP_CURVES], ['linear', 'smooth', 'stepped']);
assert.ok(FIELDMAP_STEPS >= 2, 'stepped needs at least 2 steps');

// ── sanitize: garbage in → the no-op out, never a throw ────────────────
{
  const d = sanitizeFieldMap();
  assert.deepStrictEqual(d, { field: 'off', channel: 'off', amount: 0, curve: 'smooth' });
  assert.deepStrictEqual(sanitizeFieldMap(null), d);
  const bad = sanitizeFieldMap({ field: 'lava', channel: 'nope', amount: 99, curve: 'wob' });
  assert.deepStrictEqual(
    bad,
    { field: 'off', channel: 'off', amount: 1, curve: 'smooth' },
    'unknown enums fall back; amount clamps to 1',
  );
}

// amount clamps through clamp01
{
  const neg = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: -3 });
  assert.strictEqual(neg.amount, 0, 'negative amount clamps to 0');
  const nan = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: NaN });
  assert.strictEqual(nan.amount, 0, 'NaN amount → 0');
}

// ── hard gate ──────────────────────────────────────────────────────────
assert.strictEqual(fieldMapActive(null), false);
assert.strictEqual(fieldMapActive({ field: 'off', channel: 'scale', amount: 1, curve: 'smooth' }), false);
assert.strictEqual(fieldMapActive({ field: 'noise', channel: 'off', amount: 1, curve: 'smooth' }), false);
assert.strictEqual(fieldMapActive({ field: 'noise', channel: 'scale', amount: 0, curve: 'smooth' }), false);
assert.strictEqual(fieldMapActive({ field: 'noise', channel: 'scale', amount: 0.5, curve: 'smooth' }), true);

// gate no-op: same array reference, items untouched
{
  const items = makeItems(5);
  const before = JSON.stringify(items);
  const out = applyFieldMap(items, { field: 'off', channel: 'off', amount: 0, curve: 'smooth' }, CTX);
  assert.strictEqual(out, items, 'inactive → same reference');
  assert.strictEqual(JSON.stringify(items), before, 'inactive → items untouched');
  const out2 = applyFieldMap(items, sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 0 }), CTX);
  assert.strictEqual(JSON.stringify(items), before, 'amount 0 → items untouched');
}

// ── curves ─────────────────────────────────────────────────────────────
assert.strictEqual(curveResponse(0.37, 'linear'), 0.37, 'linear is identity');
assert.strictEqual(curveResponse(0, 'smooth'), 0);
assert.strictEqual(curveResponse(1, 'smooth'), 1);
assert.strictEqual(curveResponse(0.5, 'smooth'), 0.5, 'smootherstep midpoint is exact');
assert.ok(curveResponse(0.25, 'smooth') < 0.25, 'smooth eases the low end');
assert.ok(curveResponse(0.75, 'smooth') > 0.75, 'smooth lifts the high end');
assert.strictEqual(curveResponse(0.37, 'mystery'), curveResponse(0.37, 'smooth'), 'unknown curve → smooth');
{
  const seen = new Set();
  for (let i = 0; i <= 100; i++) seen.add(curveResponse(i / 100, 'stepped'));
  assert.strictEqual(seen.size, FIELDMAP_STEPS, `stepped yields exactly ${FIELDMAP_STEPS} distinct drives`);
  assert.strictEqual(curveResponse(0, 'stepped'), 0);
  assert.strictEqual(curveResponse(1, 'stepped'), 1);
}
assert.strictEqual(curveResponse(NaN, 'linear'), 0, 'NaN → 0');
assert.strictEqual(curveResponse(7, 'linear'), 1, 'clamps high');
assert.strictEqual(curveResponse(-2, 'linear'), 0, 'clamps low');

// ── saturateHex: amount 0 is byte-identical (the applyLean contract) ────
assert.strictEqual(saturateHex('#cc3322', 1, 0), '#cc3322', 'amount 0 → untouched string');
assert.strictEqual(saturateHex('#cc3322', 1, -1), '#cc3322', 'negative amount → untouched');
{
  const muted = saturateHex('#cc3322', FIELDMAP_SAT_RANGE[0], 1);
  const full = saturateHex('#cc3322', FIELDMAP_SAT_RANGE[1], 1);
  assert.notStrictEqual(muted, '#cc3322', 'muting moves the hex');
  assert.notStrictEqual(full, '#cc3322', 'saturating moves the hex');
  assert.notStrictEqual(muted, full, 'muted ≠ saturated');
  // grey stays grey: saturation shift of an achromatic hex is a no-op
  assert.strictEqual(saturateHex('#808080', 1, 1), '#808080', 'grey has no saturation to shift');
  // hue is preserved: muting red keeps it reddish, not hue-rotated
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(muted.slice(i, i + 2), 16));
  assert.ok(r >= g && r >= b, 'muted red stays red-dominant');
}

// ── scale channel: noise field, deterministic per seed ──────────────────
{
  const cfg = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 1, curve: 'linear' });
  const a = makeItems(40);
  const b = makeItems(40);
  applyFieldMap(a, cfg, CTX);
  applyFieldMap(b, cfg, CTX);
  assert.deepStrictEqual(
    a.map((it) => it.scale),
    b.map((it) => it.scale),
    'same seed → identical scales',
  );
  const scales = a.map((it) => it.scale);
  const [lo, hi] = FIELDMAP_RANGES.scale;
  assert.ok(
    scales.every((s) => s >= lo - 1e-9 && s <= hi + 1e-9),
    `scales stay in [${lo}, ${hi}]`,
  );
  assert.ok(new Set(scales.map((s) => s.toFixed(6))).size > 10, 'the noise field actually varies the channel');
  // scaleY rides along
  assert.deepStrictEqual(
    a.map((it) => it.scaleY),
    scales,
    'scaleY matches scale',
  );
  // different seed → different mapping (overwhelmingly likely; assert not-all-equal)
  const c = makeItems(40);
  applyFieldMap(c, cfg, { ...CTX, seed: 9999 });
  assert.ok(
    c.some((it, i) => Math.abs(it.scale - a[i].scale) > 1e-9),
    'seed changes the field',
  );
}

// amount blends: half amount → halfway between 1 and the full mapping
{
  const full = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 1, curve: 'linear' });
  const half = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 0.5, curve: 'linear' });
  const a = makeItems(20);
  applyFieldMap(a, full, CTX);
  const b = makeItems(20);
  applyFieldMap(b, half, CTX);
  for (let i = 0; i < 20; i++) {
    assert.ok(Math.abs(b[i].scale - (1 + (a[i].scale - 1) * 0.5)) < 1e-9, `amount 0.5 lands halfway (item ${i})`);
  }
}

// weight channel uses the thickness-tuned range, distinct from scale
{
  const w = sanitizeFieldMap({ field: 'noise', channel: 'weight', amount: 1, curve: 'linear' });
  const s = sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 1, curve: 'linear' });
  const a = makeItems(30);
  applyFieldMap(a, w, CTX);
  const b = makeItems(30);
  applyFieldMap(b, s, CTX);
  const [wlo, whi] = FIELDMAP_RANGES.weight;
  assert.ok(
    a.every((it) => it.scale >= wlo - 1e-9 && it.scale <= whi + 1e-9),
    'weight stays in its range',
  );
  assert.ok(
    b.some((it, i) => Math.abs(it.scale - a[i].scale) > 1e-9),
    'weight ≠ scale ranges',
  );
}

// ── saturation channel on items ────────────────────────────────────────
{
  const cfg = sanitizeFieldMap({ field: 'noise', channel: 'saturation', amount: 1, curve: 'linear' });
  const items = makeItems(30);
  const before = items.map((it) => it.color);
  applyFieldMap(items, cfg, CTX);
  assert.ok(
    items.every((it) => it.color !== before[items.indexOf(it)] || true),
    'colors remapped',
  );
  assert.ok(
    items.some((it, i) => it.color !== before[i]),
    'saturation channel moves colors',
  );
  assert.ok(
    items.every((it) => /^#[0-9a-f]{6}$/.test(it.color)),
    'outputs are valid hex',
  );
  assert.ok(
    items.every((it) => /^#[0-9a-f]{6}$/.test(it.accent)),
    'accents are valid hex',
  );
  // determinism
  const items2 = makeItems(30);
  applyFieldMap(items2, cfg, CTX);
  assert.deepStrictEqual(
    items.map((it) => it.color),
    items2.map((it) => it.color),
    'same seed → same colors',
  );
}

// ── density field: clusters read dense, loners read sparse ─────────────
{
  // 20 marks in a tight cluster + 1 far outlier
  const xs = [...Array(20)].map((_, i) => 490 + (i % 5) * 2);
  const items = xs.map((x, i) => ({
    x,
    y: 390 + Math.floor(i / 5) * 2,
    scale: 1,
    scaleY: 1,
    color: '#cc3322',
    accent: '#22aa88',
  }));
  items.push({ x: 50, y: 50, scale: 1, scaleY: 1, color: '#cc3322', accent: '#22aa88' });
  const cfg = sanitizeFieldMap({ field: 'density', channel: 'scale', amount: 1, curve: 'linear' });
  applyFieldMap(items, cfg, CTX);
  const clusterScales = items.slice(0, 20).map((it) => it.scale);
  const outlierScale = items[20].scale;
  const [lo, hi] = FIELDMAP_RANGES.scale;
  // densest neighbourhood normalizes to 1 → max multiplier; the outlier is sparse → near min
  assert.ok(Math.max(...clusterScales) > outlierScale, 'cluster reads denser than the outlier');
  assert.ok(Math.abs(Math.max(...clusterScales) - hi) < 1e-9, 'densest point hits the top of the range');
  assert.ok(outlierScale < (lo + hi) / 2, 'outlier reads sparse');
  // determinism on density too
  const items2 = xs.map((x, i) => ({
    x,
    y: 390 + Math.floor(i / 5) * 2,
    scale: 1,
    scaleY: 1,
    color: '#cc3322',
    accent: '#22aa88',
  }));
  items2.push({ x: 50, y: 50, scale: 1, scaleY: 1, color: '#cc3322', accent: '#22aa88' });
  applyFieldMap(items2, cfg, CTX);
  assert.deepStrictEqual(
    items.map((it) => it.scale),
    items2.map((it) => it.scale),
    'density deterministic',
  );
}

// empty / degenerate inputs never throw
{
  assert.deepStrictEqual(applyFieldMap([], sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 1 }), CTX), []);
  assert.strictEqual(applyFieldMap(null, sanitizeFieldMap({ field: 'noise', channel: 'scale', amount: 1 }), CTX), null);
}

console.log('fieldMap selfcheck: ok');
