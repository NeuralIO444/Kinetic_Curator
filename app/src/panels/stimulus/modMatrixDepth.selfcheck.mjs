// node src/panels/stimulus/modMatrixDepth.selfcheck.mjs
//
// #2497 (stress A20) — the STIMULI modulation matrix flagged its own default
// depths [invalid]: Route 2's spinbutton read 0.154, Route 3's 0.098, both
// marked invalid while the slider beside them showed 0.15 / 0.10.
//
// The law this pin holds: a route depth is a CONTINUOUS value. The one trust
// boundary (sanitizeAudioRoutes) clamps a depth to the target's ±ceiling and
// never quantizes it to a step grid — the shipped default table itself holds
// products (0.55 × 0.28, 0.35 × 0.28). The spinbutton's step attribute is a
// validation contract, not just an arrow increment: with step = 0.01 the
// browser's native stepMismatch flags every off-grid lawful depth, which is
// the [invalid] the session recorded. The field therefore declares
// step="any" (the PersonaTunePanel pattern for float fields) while min/max
// keep bounding it; the slider keeps the grid, which is its stepping law.
//
// Groups: (1) the filed cells, exact floats; (2) the panel source declares
// the continuous law and keeps the bounds; (3) storage round-trips the filed
// floats byte-exact; (4) a sweep of the lawful range at display precision —
// displayed text parses back to the stored value and validates clean;
// (5) out-of-range values still fail the bounds (nothing was suppressed).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DEFAULT_ROUTES, ROUTE_TARGETS } from '../../gl/audioRoutes.mjs';
import { NEW_ROUTE_DEPTH, routeDepthRange, sanitizeAudioRoutes } from '../../data/audioRoutes.js';
import { STARTER_DEPTH } from '../../gl/stimuliAuto.mjs';

let groups = 0;
const group = (name, fn) => {
  fn();
  groups += 1;
  console.log(`  ok ${groups} — ${name}`);
};

// The panel's own display rounding (ModMatrix.jsx Row): 4 decimal places.
const shown = (v) => Math.round(v * 10000) / 10000;

// The HTML step law for <input type=number>: a value suffers stepMismatch
// when (value − min) / step is not an integer. step "any" declares no grid,
// so no lawful value can mismatch. (Blink evaluates this in decimal; the
// filed cells mismatch in decimal and in doubles alike — 315.4 and 309.8.)
const stepMismatch = (value, min, step) => {
  if (step === 'any') return false;
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) > 1e-6;
};

// The step the panel's spinbutton actually declares, read from its source.
const panel = readFileSync(new URL('./ModMatrix.jsx', import.meta.url), 'utf8');
const spin = panel.match(/<input\s+type="number"[\s\S]*?\/>/);
assert.ok(spin, 'the matrix row renders a number spinbutton for the depth');
const spinSrc = spin[0];
const declaredStep = /step="any"/.test(spinSrc) ? 'any' : /step=\{range\.step\}/.test(spinSrc) ? 'grid' : 'other';

// ── 1. the filed cells, exact ────────────────────────────────────────────
group('filed cells: stored products 0.154 / 0.098, grid step flags them, declared step does not', () => {
  const filed = [
    { route: DEFAULT_ROUTES[1], product: 0.55 * 0.28, text: '0.154' },
    { route: DEFAULT_ROUTES[2], product: 0.35 * 0.28, text: '0.098' },
  ];
  for (const { route, product, text } of filed) {
    assert.strictEqual(route.target, 'render.scale', `filed route target (got ${route.target})`);
    assert.strictEqual(
      route.depth,
      product,
      `stored depth is the shipped product (stored ${route.depth}, product ${product})`,
    );
    const range = routeDepthRange(route.target);
    const displayed = String(shown(route.depth));
    assert.strictEqual(displayed, text, `displayed text (stored ${route.depth} → "${displayed}", expected "${text}")`);
    assert.strictEqual(
      stepMismatch(shown(route.depth), range.min, range.step),
      true,
      `the grid step ${range.step} flags the lawful depth ${route.depth} (displayed "${displayed}") — the filed [invalid]`,
    );
    assert.strictEqual(
      declaredStep,
      'any',
      `the spinbutton must declare the continuous law (declared: ${declaredStep}) for stored ${route.depth}`,
    );
    assert.strictEqual(
      stepMismatch(shown(route.depth), range.min, 'any'),
      false,
      `under step="any" the filed depth validates clean (stored ${route.depth}, displayed "${displayed}")`,
    );
  }
  // The routes the session saw clean (0.38, and 0.45 / 0.4 / 0.35 later) are
  // exact grid multiples — which is why only the two product routes flagged.
  const range = routeDepthRange('render.scale');
  for (const v of [0.38, 0.45, 0.4, 0.35])
    assert.strictEqual(
      stepMismatch(v, range.min, range.step),
      false,
      `${v} is on the ${range.step} grid — clean either way`,
    );
});

// ── 2. the panel source declares the law, keeps the bounds ───────────────
group('panel source: spinbutton is step="any" with min/max kept; the slider keeps its grid step', () => {
  assert.ok(/step="any"/.test(spinSrc), 'the spinbutton declares step="any" (continuous depth)');
  assert.ok(
    !/step=\{range\.step\}/.test(spinSrc),
    'the spinbutton no longer binds the slider grid as its validation law',
  );
  assert.ok(/min=\{range\.min\}/.test(spinSrc) && /max=\{range\.max\}/.test(spinSrc), 'min/max still bound the field');
  assert.ok(/value=\{shown\}/.test(spinSrc), 'the field still shows the stored depth at 4dp');
  const slider = panel.match(/<RangeRow[\s\S]*?\/>/);
  assert.ok(
    slider && /step=\{range\.step\}/.test(slider[0]),
    'the RangeRow slider keeps step={range.step} — its stepping law is unchanged',
  );
});

// ── 3. storage holds the filed floats byte-exact ─────────────────────────
group('storage: the sanitizer round-trips the filed floats exactly (clamp only, no quantization)', () => {
  const table = [
    { input: 'bass', target: 'render.scale', depth: 0.55 * 0.28 },
    { input: 'level', target: 'render.scale', depth: 0.35 * 0.28 },
    { input: 'band.air', target: 'render.glow', depth: 0.5 },
  ];
  const out = sanitizeAudioRoutes(table.map((r) => ({ ...r })));
  assert.ok(Array.isArray(out), 'the table survives the trust boundary');
  assert.strictEqual(out[0].depth, 0.55 * 0.28, `route 2 depth byte-exact (stored ${out[0].depth})`);
  assert.strictEqual(out[1].depth, 0.35 * 0.28, `route 3 depth byte-exact (stored ${out[1].depth})`);
});

// ── 4. sweep of the lawful range: display ⇄ storage agreement ────────────
group('sweep: every lawful depth displays, parses back, and validates clean under the declared step', () => {
  assert.strictEqual(declaredStep, 'any', `sweep runs under the declared step (declared: ${declaredStep})`);
  for (const target of Object.keys(ROUTE_TARGETS)) {
    const range = routeDepthRange(target);
    const values = new Set([NEW_ROUTE_DEPTH[target], 0, range.min, range.max]);
    if (STARTER_DEPTH[target] !== undefined) values.add(STARTER_DEPTH[target]);
    for (const r of DEFAULT_ROUTES) if (r.target === target) values.add(r.depth);
    // products of the shipped-master kind, and a dense lawful ladder
    for (const d of [0.55, 0.35, 0.28, 0.65, 0.45]) values.add(d * 0.28 * Math.sign(range.max || 1));
    for (let i = 0; i <= 250; i++) values.add(range.min + (i / 250) * (range.max - range.min));
    for (const v of values) {
      if (!(v >= range.min && v <= range.max)) continue;
      const text = String(shown(v));
      const parsed = Number(text);
      assert.ok(
        Math.abs(parsed - v) <= 5e-5,
        `${target}: displayed text parses back to the stored value (stored ${v}, displayed "${text}", parsed ${parsed})`,
      );
      assert.strictEqual(
        stepMismatch(shown(v), range.min, 'any'),
        false,
        `${target}: no [invalid] for a lawful depth (stored ${v}, displayed "${text}")`,
      );
    }
  }
});

// ── 5. the bounds still bite — validity was corrected, not suppressed ────
group('bounds: an out-of-range depth is still outside the law the field declares', () => {
  for (const target of Object.keys(ROUTE_TARGETS)) {
    const range = routeDepthRange(target);
    assert.ok(
      range.max + range.step > range.max && range.min - range.step < range.min,
      `${target}: probe values leave the range`,
    );
    // the sanitizer clamps the same bounds the field declares
    const clamped = sanitizeAudioRoutes([{ input: 'beat', target, depth: range.max + 1000 }]);
    assert.ok(
      clamped === null || clamped[0].depth <= range.max,
      `${target}: storage clamps at the ceiling the field declares (max ${range.max})`,
    );
  }
  assert.ok(
    /min=\{range\.min\}/.test(spinSrc) && /max=\{range\.max\}/.test(spinSrc),
    'range validation remains declared on the field',
  );
});

console.log(`modMatrixDepth.selfcheck: ok (${groups} groups)`);
