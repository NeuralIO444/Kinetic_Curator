// node src/curator/showSpectrum.selfcheck.mjs
// #1483 stage 2 — the spectrum summary the personas are told: silent -> nothing, noise is flat, a tone is not.
import assert from 'node:assert/strict';
import { spectrumSummary, createShowSpectrum, FLUX_FULL } from './showSpectrum.js';

const bins = (fill) => new Float32Array(128).fill(fill);
const st = (o = {}) => ({ smooth: bins(0.5), rms: 0.2, centroid: 0.4, fluxTotal: 0.3, ...o });

assert.equal(spectrumSummary(null), null);
assert.equal(spectrumSummary(undefined), null);
assert.equal(spectrumSummary(st({ smooth: null })), null);
assert.equal(spectrumSummary(st({ smooth: [] })), null);
assert.equal(spectrumSummary(st({ rms: 0.001 })), null, 'silence');
assert.equal(spectrumSummary(st({ rms: NaN })), null);
assert.equal(spectrumSummary(st({ rms: undefined })), null);

assert.ok(spectrumSummary(st()).flatness >= 0.99, 'white noise is flat');
const tone = bins(0);
tone[40] = 1;
assert.ok(spectrumSummary(st({ smooth: tone })).flatness <= 0.05, 'one tone in silence is not');

const hi = spectrumSummary(st({ centroid: 1.7, fluxTotal: -0.2 }));
assert.equal(hi.centroid, 1);
assert.equal(hi.flux, 0);

const r = spectrumSummary(
  st({ centroid: 0.123456, fluxTotal: 0.987654, smooth: Array.from({ length: 8 }, (_, i) => i / 8) }),
);
for (const v of Object.values(r)) assert.equal(v, Math.round(v * 1000) / 1000, 'rounded to 3 decimals');
assert.equal(r.centroid, 0.123);
assert.equal(r.flux, 0.988);

const input = st({ smooth: Float32Array.from({ length: 16 }, (_, i) => i / 16) });
const before = JSON.stringify({ ...input, smooth: Array.from(input.smooth) });
spectrumSummary(input);
assert.equal(JSON.stringify({ ...input, smooth: Array.from(input.smooth) }), before, 'input not mutated');

// the bar reader: flux is the bar-to-bar movement of the smoothed spectrum, never a frame's fluxTotal
{
  const r = createShowSpectrum();
  assert.equal(r.sample(st({ fluxTotal: 0.9 })), null, 'the first bar has nothing to compare with');
  const held = r.sample(st({ fluxTotal: 0.9 }));
  assert.equal(held.flux, 0, 'a held spectrum does not move, whatever one frame said');
  assert.ok(held.flatness >= 0.99);
  const moved = r.sample(st({ smooth: bins(0.5 + FLUX_FULL / 2) }));
  assert.equal(moved.flux, 0.5, 'half of FLUX_FULL of change reads 0.5');
  assert.equal(r.sample(st({ smooth: bins(0) })).flux, 1, 'a big jump clamps at 1');
  assert.equal(r.sample(st({ rms: 0 })), null, 'silence');
  assert.equal(r.sample(st()), null, 'after silence: a fresh baseline, not a jump from before it');
  assert.equal(r.sample(st()).flux, 0);
  r.reset();
  assert.equal(r.sample(st()), null, 'reset forgets the last bar');
}

console.log(
  'showSpectrum.selfcheck: ok (null on silent/missing, flatness noise vs tone, bar-to-bar flux, clamped, rounded, pure)',
);
