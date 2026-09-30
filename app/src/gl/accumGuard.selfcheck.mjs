/**
 * accumGuard.selfcheck.mjs — the ACCUM feedback guard (#763). Node-only.
 *
 *  A. non-finite / out-of-range fade collapses to a safe keep (NaN used to
 *     slip through Math.max/min and poison the buffer).
 *  B. torture set — extreme-but-legal values on the JS mirror for 200 frames:
 *     output stays finite and bounded (geometric feedback sum, not a runaway).
 *  C. NaN injection is refused: assertRecipeFinite throws AccumRecipeError
 *     naming the field, and step() runs it before any pass.
 *  D. the live loop turns repeated poison into a watchdog trip, not a silent
 *     retry loop.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  accumRecipeParams, applyAudioEnvelope, mirrorAccumStep, createEchoState,
  assertRecipeFinite, AccumRecipeError,
} from './accum.mjs';

// A. hostile fade values
for (const bad of [NaN, 'x', Infinity, -Infinity, {}]) {
  const k = accumRecipeParams({ fade: bad }).keep;
  assert.ok(Number.isFinite(k) && k >= 0 && k <= 0.99, `fade ${String(bad)} → keep ${k}`);
}
assert.strictEqual(accumRecipeParams({ fade: NaN }).keep, 0, 'NaN fade = no feedback');
assert.strictEqual(accumRecipeParams({ fade: 5 }).keep, 0.99);
assert.strictEqual(accumRecipeParams({ fade: -1 }).keep, 0);
assert.strictEqual(accumRecipeParams({ fade: 0.88 }).keep, 0.88, 'sane value untouched');

// B. torture: every knob at its legal extreme, full-scale audio, echoes on
const W = 8, H = 8, N = W * H * 4;
const frame = new Float64Array(N);
for (let i = 0; i < N; i += 4) { frame[i] = 1; frame[i + 1] = 1; frame[i + 2] = 1; frame[i + 3] = 0; } // additive light: worst case
const params = applyAudioEnvelope(
  accumRecipeParams({ fade: 0.99, optics: 1, tunnel: 1, prism: 1, flow: 1, echoes: 4, background: '#ffffff' }),
  { rms: 1, flux: 1, beatPulse: 1 },
);
assertRecipeFinite(params);
let acc = new Float64Array(N), echo = createEchoState(), peak = 0;
for (let f = 0; f < 200; f++) {
  acc = mirrorAccumStep({ accum: acc, frame, w: W, h: H, params, echo });
  for (const v of acc) { assert.ok(Number.isFinite(v), `NaN/Inf at frame ${f}`); peak = Math.max(peak, v); }
}
// frameIn <= 1 + 1.28 (echo weights) and the fade sums geometrically at 0.99.
assert.ok(peak <= 2.28 / (1 - 0.99) + 4, `peak ${peak} exceeds the geometric bound`);

// C. NaN injection is refused, naming the field
for (const [field, val] of [['keep', NaN], ['tunnelZoom', Infinity], ['bg', [0, NaN, 0]], ['echoWeights', [0.5, NaN]]]) {
  assert.throws(() => assertRecipeFinite({ ...accumRecipeParams(), [field]: val }),
    (e) => e instanceof AccumRecipeError && e.message.includes(`"${field}"`), `${field} poison`);
}
assert.doesNotThrow(() => assertRecipeFinite(accumRecipeParams({ fade: 0.9, echoes: 3, optics: 1 })));
const accumSrc = readFileSync(new URL('./accum.mjs', import.meta.url), 'utf8');
assert.ok(/step\(frameTex, params, frameSize\) \{\s*const p = params;\s*assertRecipeFinite\(p\);/.test(accumSrc), 'step() guards first');

// D. the loop escalates repeated poison to the watchdog
const loopSrc = readFileSync(new URL('./liveLoop.mjs', import.meta.url), 'utf8');
assert.ok(/AccumRecipeError'[^]*tripWatchdog\('accum-nan'\)/.test(loopSrc), 'liveLoop trips the watchdog on repeated poison');

console.log(`accumGuard selfcheck: OK — torture peak ${peak.toFixed(1)}, 4 poison fields refused`);
