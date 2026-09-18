// taper.selfcheck.mjs — invariants for the shared slider response curves (#274).
import assert from 'node:assert';
import { getTaper, halfLifeToKeep } from './taper.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Every taper round-trips: toSlider(toParam(s)) ≈ s, and stays in bounds.
for (const [kind, opts] of [
  ['linear', { min: 0, max: 100 }],
  ['exponential', { min: 0.001, max: 0.03 }],
  ['power', { min: 0, max: 1, exp: 2 }],
  ['halfLife', { minFrames: 1, maxFrames: 40 }],
  ['softKnee', { knee: 120, max: 250 }],
]) {
  const t = getTaper(kind, opts);
  for (const s of [0, 0.1, 0.25, 0.4727, 0.5, 0.75, 0.9, 1]) {
    const v = t.toParam(s);
    const back = t.toSlider(v);
    assert.ok(approx(back, s, 1e-6), `${kind}: round-trip failed at s=${s} (got ${back})`);
    assert.ok(back >= 0 && back <= 1, `${kind}: toSlider out of bounds at s=${s}`);
  }
  // Monotonic in both directions.
  let last = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const v = t.toParam(i / 20);
    assert.ok(v >= last, `${kind}: toParam not monotonic`);
    last = v;
  }
}

// Unknown kind throws, loudly.
assert.throws(() => getTaper('sigmoid', {}), /unknown taper kind/);

// Spot checks against the #273 fixes.
const noise = getTaper('exponential', { min: 0.001, max: 0.03 });
assert.ok(approx(noise.toParam(0), 0.001), 'noise freq: s=0 -> 0.001');
assert.ok(approx(noise.toParam(1), 0.03), 'noise freq: s=1 -> 0.03');
assert.ok(noise.toParam(0.5) < 0.01, 'noise freq: midpoint well below linear midpoint');

const glow = getTaper('power', { min: 0, max: 1, exp: 2 });
assert.ok(approx(glow.toParam(0), 0) && approx(glow.toParam(1), 1), 'glow: endpoints pinned');
assert.ok(approx(glow.toParam(0.5), 0.25), 'glow: effective = o^2');

const fade = getTaper('halfLife', { minFrames: 1, maxFrames: 40 });
assert.ok(approx(fade.toParam(0), 1) && approx(fade.toParam(1), 40), 'fade: 1..40 frames');
assert.ok(approx(halfLifeToKeep(5.4), Math.pow(0.5, 1 / 5.4)), 'keep = 0.5^(1/hl)');
assert.ok(approx(halfLifeToKeep(5.4), 0.88, 0.005), 'default 5.4 frames ≈ old keep 0.88');
assert.ok(halfLifeToKeep(40) < 0.99 && halfLifeToKeep(1) === 0.5, 'keep bounds sane');

const disp = getTaper('softKnee', { knee: 120, max: 250 });
assert.ok(approx(disp.toParam(0), 0), 'displace: s=0 -> 0');
assert.ok(approx(disp.toParam(0.75), 120), 'displace: knee at s=0.75');
assert.ok(approx(disp.toParam(1), 250), 'displace: top end reachable');
assert.ok(disp.toParam(0.5) < 120, 'displace: most of travel lives under the knee');

console.log('taper.selfcheck: OK (5 tapers, round-trip + spot checks)');
