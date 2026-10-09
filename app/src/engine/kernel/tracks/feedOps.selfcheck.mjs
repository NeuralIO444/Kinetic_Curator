// node src/engine/kernel/tracks/feedOps.selfcheck.mjs
// #1248: feedOps pins. feedOps.js / feedDelay.js carry the hottest per-frame
// CPU path (lumaToFlow, delay-1) and had no selfchecks before this. Pins
// lumaToFlow correctness on fixed fixtures: grad vs an independent central-
// difference reference, the exact grad/curl duality, exact zeros on constant
// luma, and the op field. No RNG anywhere — same bytes every run.
// NOTE (#1253): the natural home for the fieldInvariants assert is here;
// invariants are computed and logged below so that issue can pin them.
import assert from 'node:assert';
import { lumaToGrad, lumaToCurl, lumaToFlow, fieldInvariants } from './feedOps.js';

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

// --- fieldInvariants scaffold for #1253 --------------------------------------
// Computed on the pinned fixtures so #1253 can turn these into asserts.
// On a linear ramp: grad is nearly divergence-free? No — grad of a ramp has
// dv/dy=du/dx structure; curl of a ramp is nearly divergence-free (dy=0,
// v=-dx constant along y). Log the numbers; do NOT assert here (#1253's lane).
const invGrad = fieldInvariants(grad);
const invCurl = fieldInvariants(curl);

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
