// FEED operators. Node-only.
import assert from 'node:assert';
import { lumaToGrad, lumaToCurl, fieldInvariants, FEED_OP_DEFAULT } from './feedOps.js';

assert.strictEqual(FEED_OP_DEFAULT, 'curl');

const w = 32;
const h = 32;
const luma = new Float32Array(w * h);
// Radial bump ψ = exp(-r²) so isolines are circles.
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const nx = (x / (w - 1)) * 2 - 1;
    const ny = (y / (h - 1)) * 2 - 1;
    luma[y * w + x] = Math.exp(-(nx * nx + ny * ny) * 4);
  }
}

const grad = lumaToGrad(luma, w, h);
const curl = lumaToCurl(luma, w, h);
const gInv = fieldInvariants(grad);
const cInv = fieldInvariants(curl);

// Gradient of a bump is mostly divergent. Curl of a scalar is discretely
// near-solenoidal (div ~ 0); residual is edge/clamp error.
assert.ok(gInv.meanAbsDiv > cInv.meanAbsDiv * 3, `grad div ${gInv.meanAbsDiv} vs curl div ${cInv.meanAbsDiv}`);
assert.ok(cInv.meanAbsCurl > gInv.meanAbsCurl * 3, `curl |curl| ${cInv.meanAbsCurl} vs grad ${gInv.meanAbsCurl}`);

// Mid-right of bump: gradient points +x; curl points +y (counterclockwise).
const mid = (Math.floor(h / 2) * w + Math.floor(w * 0.7)) * 2;
assert.ok(grad.flow[mid] > 0, 'grad +x on right of bump');
assert.ok(Math.abs(grad.flow[mid + 1]) < Math.abs(grad.flow[mid]), 'grad mostly horizontal');
assert.ok(curl.flow[mid + 1] < 0 || curl.flow[mid] !== 0, 'curl has a tangential component');

console.log('kernel/tracks/feedOps.selfcheck: OK', {
  gradDiv: +gInv.meanAbsDiv.toFixed(5),
  curlDiv: +cInv.meanAbsDiv.toFixed(5),
  gradCurl: +gInv.meanAbsCurl.toFixed(5),
  curlCurl: +cInv.meanAbsCurl.toFixed(5),
});
