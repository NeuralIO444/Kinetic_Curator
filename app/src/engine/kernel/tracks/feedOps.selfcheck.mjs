// node src/engine/kernel/tracks/feedOps.selfcheck.mjs
// #1248: feedOps pins. feedOps.js / feedDelay.js carry the hottest per-frame
// CPU path (lumaToFlow, delay-1) and had no selfchecks before this. Pins
// lumaToFlow correctness on fixed fixtures: grad vs an independent central-
// difference reference, the exact grad/curl duality, exact zeros on constant
// luma, and the op field. No RNG anywhere — same bytes every run.
// NOTE (#1253): fieldInvariants is pinned here and ONLY here — its sole
// caller is this selfcheck's invariant asserts below. No live consumers, and
// deliberately so: it scans the full grid and has no place on the hottest
// FEED path (#1253: do not wire into live diagnostics).
import assert from 'node:assert';
import { lumaToGrad, lumaToCurl, lumaToFlow, lumaToGradInto, lumaToCurlInto, lumaToFlowInto, fieldInvariants } from './feedOps.js';

const W = 4;
const H = 4;

// --- fixture: horizontal ramp luma[y*W+x] = x/(W-1) ------------------------
const ramp = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ramp[y * W + x] = x / (W - 1);

// Independent central-difference reference (different code shape than
// feedOps.js — same math). Both write through Float32Array, so a correct
// feedOps must be bit-identical.
function referenceGrad(luma, w, h) {
  const flow = new Float32Array(w * h * 2);
  const at = (x, y) => {
    const xx = Math.max(0, Math.min(w - 1, x));
    const yy = Math.max(0, Math.min(h - 1, y));
    return luma[yy * w + xx] || 0;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const i = (y * w + x) * 2;
      flow[i] = dx;
      flow[i + 1] = dy;
    }
  }
  return flow;
}

const grad = lumaToGrad(ramp, W, H);
assert.deepStrictEqual(
  Array.from(grad.flow),
  Array.from(referenceGrad(ramp, W, H)),
  'lumaToGrad bit-matches the independent central-difference reference',
);
assert.strictEqual(grad.op, 'grad', "op rides along as 'grad'");
assert.strictEqual(grad.w, W, 'width rides along');
assert.strictEqual(grad.h, H, 'height rides along');

// Hand-pinned scalars on the ramp: dx is constant on the interior row.
// ramp: x=0 → 0, x=1 → 1/3, x=2 → 2/3, x=3 → 1 (float32).
// interior dx = (luma(x+1) - luma(x-1)) / 2 = (2/3 - 0)/2 = 1/3; dy = 0.
const i11 = (1 * W + 1) * 2;
const expectedDx = (ramp[2] - ramp[0]) / 2;
assert.strictEqual(grad.flow[i11], expectedDx, 'interior grad dx = (luma(2)-luma(0))/2');
assert.strictEqual(grad.flow[i11 + 1], 0, 'ramp is flat along y → dy exactly 0');

// --- curl fixture: exact grad/curl duality ----------------------------------
const curl = lumaToCurl(ramp, W, H);
assert.strictEqual(curl.op, 'curl', "op rides along as 'curl'");
for (let i = 0; i < W * H; i++) {
  assert.strictEqual(curl.flow[i * 2], grad.flow[i * 2 + 1], `curl.u == grad.v at cell ${i}`);
  assert.strictEqual(curl.flow[i * 2 + 1], -grad.flow[i * 2], `curl.v == -grad.u at cell ${i}`);
}

// --- constant luma → exact zero flow, both ops ------------------------------
const flat = new Float32Array(W * H).fill(0.5);
for (const f of [lumaToGrad(flat, W, H), lumaToCurl(flat, W, H)]) {
  assert.ok(Array.from(f.flow).every((v) => v === 0), 'constant luma → zero flow');
}

// --- lumaToFlow dispatch -----------------------------------------------------
const viaDefault = lumaToFlow(ramp, W, H);
assert.deepStrictEqual(
  Array.from(viaDefault.flow),
  Array.from(curl.flow),
  'default op is curl (#default FEED_OP_DEFAULT)',
);
assert.deepStrictEqual(
  Array.from(lumaToFlow(ramp, W, H, 'grad').flow),
  Array.from(grad.flow),
  "'grad' dispatches to lumaToGrad",
);
assert.deepStrictEqual(
  Array.from(lumaToFlow(ramp, W, H, 'curl').flow),
  Array.from(curl.flow),
  "'curl' dispatches to lumaToCurl",
);

// --- lumaToFlowInto: column-writing mode pins (#1308) ------------------------
// The SoA successor to the allocating encode: writes (u, v) columns into
// caller-owned arrays, bit-identical to the interleaved lumaToFlow output.
for (const [op, into, ref] of [
  ['grad', lumaToGradInto, grad],
  ['curl', lumaToCurlInto, curl],
]) {
  const u = new Float32Array(W * H).fill(123); // sentinel: every lane must be overwritten
  const v = new Float32Array(W * H).fill(123);
  const out = into(ramp, W, H, u, v);
  assert.strictEqual(out.u, u, `${op}Into returns the caller's u array (no alias swap)`);
  assert.strictEqual(out.v, v, `${op}Into returns the caller's v array`);
  assert.strictEqual(out.op, op, `${op}Into op rides along`);
  assert.strictEqual(out.w, W, `${op}Into width rides along`);
  assert.strictEqual(out.h, H, `${op}Into height rides along`);
  for (let i = 0; i < W * H; i++) {
    assert.strictEqual(u[i], ref.flow[i * 2], `${op}Into u[${i}] bit-identical to lumaTo${op === 'grad' ? 'Grad' : 'Curl'}`);
    assert.strictEqual(v[i], ref.flow[i * 2 + 1], `${op}Into v[${i}] bit-identical to lumaTo${op === 'grad' ? 'Grad' : 'Curl'}`);
  }
  assert.ok(!Array.from(u).includes(123) && !Array.from(v).includes(123), `${op}Into overwrote every lane (no sentinel left)`);
}
// lumaToFlowInto dispatch mirrors lumaToFlow (default curl; 'grad' → grad).
{
  const u = new Float32Array(W * H);
  const v = new Float32Array(W * H);
  const viaDefault = lumaToFlowInto(ramp, W, H, u, v);
  assert.deepStrictEqual(Array.from(u), Array.from(curl.flow.filter((_, i) => i % 2 === 0)), 'default op is curl');
  assert.strictEqual(viaDefault.op, 'curl', 'dispatched op rides along');
  const ug = new Float32Array(W * H);
  const vg = new Float32Array(W * H);
  lumaToFlowInto(ramp, W, H, ug, vg, 'grad');
  assert.deepStrictEqual(Array.from(ug), Array.from(grad.flow.filter((_, i) => i % 2 === 0)), "'grad' dispatches to lumaToGradInto");
}
// Zero allocation inside the encode (the #1308 guarantee): counting
// Float32Array construction across encodes must see none.
{
  const u = new Float32Array(W * H);
  const v = new Float32Array(W * H);
  const RealF32 = globalThis.Float32Array;
  let allocs = 0;
  class CountingF32 extends RealF32 {
    constructor(...args) {
      allocs++;
      super(...args);
    }
  }
  globalThis.Float32Array = CountingF32;
  try {
    for (let k = 0; k < 20; k++) lumaToFlowInto(ramp, W, H, u, v);
    assert.strictEqual(allocs, 0, '20 lumaToFlowInto encodes: zero Float32Array allocations');
  } finally {
    globalThis.Float32Array = RealF32;
  }
}

// --- fieldInvariants pins (#1253) -------------------------------------------
// The grad/curl duality as invariants: a curl field ((dx,dy) → (dy,-dx)) is
// divergence-free, and a grad field is curl-free. On the pinned ramp both
// read float-exact zero; the asserts pin "near zero" (1e-9) so the invariant
// reads as the spec, not the fixture.
const invGrad = fieldInvariants(grad);
const invCurl = fieldInvariants(curl);
assert.ok(
  invCurl.meanAbsDiv < 1e-9,
  `curl field must be divergence-free (meanAbsDiv ${invCurl.meanAbsDiv})`,
);
assert.ok(
  invGrad.meanAbsCurl < 1e-9,
  `grad field must be curl-free (meanAbsCurl ${invGrad.meanAbsCurl})`,
);

// --- determinism --------------------------------------------------------------
const again = lumaToFlow(ramp, W, H);
assert.deepStrictEqual(Array.from(again.flow), Array.from(viaDefault.flow), 'same input → same output');

console.log('ok — feedOps fixtures (#1248)', {
  interiorDx: grad.flow[i11],
  gradOp: grad.op,
  curlOp: curl.op,
  invariantsGrad: { div: invGrad.meanAbsDiv.toExponential(2), curl: invGrad.meanAbsCurl.toExponential(2) },
  invariantsCurl: { div: invCurl.meanAbsDiv.toExponential(2), curl: invCurl.meanAbsCurl.toExponential(2) },
});
