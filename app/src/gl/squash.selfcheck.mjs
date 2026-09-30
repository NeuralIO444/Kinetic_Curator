// squash.selfcheck.mjs — #594 PR3 squash-and-stretch.
//
// The #309 smear stretches a moving mark along its motion; squash thins it
// across the motion so it keeps its mass. Node: the param, the contract
// (key omitted at 0 — every existing hash unchanged), the gated shader, and
// a JS mirror of the vertex math (area held at squash 1). Browser: one real
// mark rendered at rest / stretched / squashed — squash 0 is byte-identical
// to the plain smear, and squash 1 covers about the resting mark's pixels.
import assert from 'node:assert';
import { PARAM_SPEC, DEFAULT_LAYOUT_PARAMS, validateLayoutParams } from '../data/layout-modes.js';
import { buildSceneContract } from './sceneContract.js';
import { QUAD_VS } from './shaders.mjs';
import { SMEAR_K, SMEAR_MAX } from './renderer.mjs';
import { ASSETS } from '../data/assets/index.js';

// ── param: 0..1, default 0 (off) ─────────────────────────────────────────
assert.deepStrictEqual(PARAM_SPEC.squash, { min: 0, max: 1 });
assert.strictEqual(DEFAULT_LAYOUT_PARAMS.squash, 0, 'off by default');
assert.strictEqual(validateLayoutParams({ squash: 5 }).params.squash, 1);
assert.strictEqual(validateLayoutParams({ squash: -1 }).params.squash, 0);
assert.strictEqual(validateLayoutParams({ squash: 'x' }).params.squash, 0);

// ── contract: key omitted when off, so unlit/unsquashed hashes never move ─
const layer = (vx) => [{ id: 'L', isFx: false, items: [{
  assetId: ASSETS[0].id, x: 500, y: 350, scale: 1.4, rotation: 0,
  color: '#ffffff', accent: '#ffffff', alpha: 100, vx, vy: 0, key: 'k0',
}] }];
const contract = (doc, vx = 12) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(vx) });
assert.ok(!('squash' in contract({})), 'no squash → no key');
assert.ok(!('squash' in contract({ squash: 0 })), 'squash 0 → no key');
assert.ok(!('squash' in contract({ layoutParams: { squash: 0 } })));
assert.strictEqual(contract({ squash: 0.5 }).squash, 0.5, 'live path: doc.squash');
assert.strictEqual(contract({ layoutParams: { squash: 0.7 } }).squash, 0.7, 'export path: project layoutParams');
assert.strictEqual(contract({ squash: 9 }).squash, 1, 'clamped');
assert.ok(!('squash' in contract({ squash: NaN })));

// ── shader: squash only inside the smear, only when > 0 ───────────────────
assert.match(QUAD_VS, /uniform vec3 u_smear;/);
assert.match(QUAD_VS, /if \(sms > 1e-4\) \{[^]*if \(u_smear\.z > 0\.0\) \{[^]*1\.0 \/ \(1\.0 \+ smk\)[^]*\}\s*\}/,
  'squash lives inside the moving-mark branch and is gated on > 0');

// ── JS mirror of the vertex math: area of a unit square after the transform ─
function transform([x, y], v, q) {
  const s = Math.hypot(v[0], v[1]);
  if (s <= 1e-4) return [x, y];
  const d = [v[0] / s, v[1] / s];
  const k = Math.min(s * SMEAR_K, SMEAR_MAX);
  let r = [x + d[0] * (x * d[0] + y * d[1]) * k, y + d[1] * (x * d[0] + y * d[1]) * k];
  if (q > 0) {
    const a = x * d[0] * (1 + k) + y * d[1] * (1 + k); // dot(r, d)
    const al = [d[0] * a, d[1] * a];
    const p = 1 + (1 / (1 + k) - 1) * q;
    r = [al[0] + (r[0] - al[0]) * p, al[1] + (r[1] - al[1]) * p];
  }
  return r;
}
const area = (v, q) => {
  const [a, b] = [transform([1, 0], v, q), transform([0, 1], v, q)];
  return Math.abs(a[0] * b[1] - a[1] * b[0]);
};
for (const v of [[12, 0], [5, 5], [0, -30], [0.5, 0.2]]) {
  const k = Math.min(Math.hypot(...v) * SMEAR_K, SMEAR_MAX);
  assert.ok(Math.abs(area(v, 0) - (1 + k)) < 1e-9, `stretch-only grows area by 1+k (${v})`);
  assert.ok(Math.abs(area(v, 1) - 1) < 1e-9, `squash 1 holds area (${v})`);
  assert.ok(area(v, 0.5) < area(v, 0) && area(v, 0.5) > 1, 'squash 0.5 sits between');
}
assert.strictEqual(area([0, 0], 1), 1, 'a mark at rest is untouched');
console.log('squash node: OK');

// ── GPU: real WebGL2 through the parity driver ───────────────────────────
async function runBrowserTests() {
  const { renderViaGL, closeGlDriver } = await import('./parity/glDriver.mjs');
  const render = async (c) => (await renderViaGL(c, { width: 400, height: 280, bg: '#000000' })).pixels;
  const lit = (px) => { let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i - 3] + px[i - 2] + px[i - 1] > 96) n++; return n; };
  try {
    const rest = await render(contract({}, 0));
    const smear = await render(contract({}, 12));
    const smear0 = await render({ ...contract({}, 12), squash: 0 });
    const squashed = await render(contract({ squash: 1 }, 12));
    assert.ok(Buffer.compare(smear, smear0) === 0, 'squash 0 is byte-identical to the plain smear');
    const [r, s, q] = [lit(rest), lit(smear), lit(squashed)];
    assert.ok(r > 200, `the mark is visible (${r} px)`);
    assert.ok(s > r * 1.3, `stretch-only grows the mark (${r} → ${s})`);
    assert.ok(q < s * 0.8, `squash thins it (${s} → ${q})`);
    assert.ok(Math.abs(q - r) / r < 0.15, `squash 1 keeps about the resting area (${r} vs ${q})`);
    assert.ok(Buffer.compare(rest, await render(contract({ squash: 1 }, 0))) === 0, 'a mark at rest never squashes');
    console.log(`squash GPU: OK — rest ${r}px, stretch ${s}px, squash ${q}px`);
  } finally {
    await closeGlDriver();
  }
}
try {
  await runBrowserTests();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  [skip] browser squash tests: Playwright browser not installed in this environment');
  } else {
    throw e;
  }
}
console.log('squash.selfcheck: OK');
