// FEED operators. Node-only.
import assert from 'node:assert';
import { lumaToGrad, lumaToCurl, fieldInvariants, FEED_OP_DEFAULT } from './feedOps.js';

assert.strictEqual(FEED_OP_DEFAULT, 'curl');

const w = 32;
const h = 32;
const luma = new Float32Array(w * h);
// Radial bump ψ = exp(-4 r²). Isolines are circles. Peak at grid center.
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

assert.ok(gInv.meanAbsDiv > cInv.meanAbsDiv * 3, `grad div ${gInv.meanAbsDiv} vs curl div ${cInv.meanAbsDiv}`);
assert.ok(cInv.meanAbsCurl > gInv.meanAbsCurl * 3, `curl |curl| ${cInv.meanAbsCurl} vs grad ${gInv.meanAbsCurl}`);

// Right of peak (nx>0): ascent is -x, so ∂ψ/∂x < 0.
// curl u=∂ψ/∂y≈0 on the equator, v=-∂ψ/∂x > 0 (CCW).
const mid = (Math.floor(h / 2) * w + Math.floor(w * 0.7)) * 2;
assert.ok(grad.flow[mid] < 0, 'grad points toward peak (-x on the right)');
assert.ok(Math.abs(grad.flow[mid]) > Math.abs(grad.flow[mid + 1]), 'grad mostly horizontal on equator');
assert.ok(curl.flow[mid + 1] > 0, 'curl +y on the right (CCW around peak)');

console.log('kernel/tracks/feedOps.selfcheck: OK', {
  gradDiv: +gInv.meanAbsDiv.toFixed(5),
  curlDiv: +cInv.meanAbsDiv.toFixed(5),
  gradCurl: +gInv.meanAbsCurl.toFixed(5),
  curlCurl: +cInv.meanAbsCurl.toFixed(5),
});
