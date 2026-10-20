// node src/engine/weatherAir.selfcheck.mjs
// #1183 weather slice 1 — the pure haze response: colours mix toward the veil by the per-mark
// fade, alpha thins by the same fade, strength 0 is provably today's output (same references
// back), and the veil-preparsed mixer is BIT-IDENTICAL to per-mark applyLean over a corpus —
// the cost ruling's remedy (measured 0.385 ms vs applyLean's 0.516 ms at 800 marks) may not
// change a single output byte.
import assert from 'node:assert/strict';
import {
  applyWeatherFade, weatherAlphaScale, hazeVeilHex, hazeVeilLevel, WEATHER_ALPHA_FADE,
} from './weatherAir.mjs';
import { applyLean } from './kernel/color/index.js';
import { hexToRgb255 } from './colorHex.mjs';
import { WEATHER } from './kernel/weather/registry.js';

// 1. The veil is buildHaze's own formula (fx/fxFilters.js: veil = 0.35 + 0.6 × lift) —
//    the marks' fade and the post veil can never drift apart in value.
{
  for (const lift of [0, 0.25, 0.5, 0.75, 1]) {
    assert.strictEqual(hazeVeilLevel(lift), 0.35 + (0.95 - 0.35) * lift, `veil level at lift ${lift}`);
  }
  assert.strictEqual(hazeVeilHex(0.5), '#a6a6a6', 'the default lift veils at 0.65 grey');
  assert.strictEqual(hazeVeilHex(0), '#595959');
  assert.strictEqual(hazeVeilHex(1), '#f2f2f2');
  assert.strictEqual(hazeVeilLevel(-1), 0.35, 'lift clamps below');
  assert.strictEqual(hazeVeilLevel(2), 0.95, 'lift clamps above');
  assert.strictEqual(hazeVeilLevel(Number.NaN), 0.35 + (0.95 - 0.35) * 0.5, 'a missing lift is the default 0.5');
}

// 2. Strength 0 (and every other inactive shape) returns the inputs UNTOUCHED — the same
//    references, so byte-identity at rest is structural, not a re-encode that happens to match.
{
  const colors = ['#112233', '#abcdef'];
  const accents = ['#445566', '#fedcba'];
  const zero = new Float32Array([0, 0]);
  for (const args of [
    { colors, accents, fade: zero, veil: '#a6a6a6' },
    { colors, accents, fade: null, veil: '#a6a6a6' },
    { colors, accents, fade: new Float32Array([0.5, 0.5]), veil: null },
  ]) {
    const out = applyWeatherFade(args);
    assert.strictEqual(out.colors, colors, 'inactive: same colors reference');
    assert.strictEqual(out.accents, accents, 'inactive: same accents reference');
  }
}

// 3. The mixer is bit-identical to per-mark applyLean over a corpus — colours (canonical,
//    shorthand, upper/mixed case, extremes) × fades (incl. 0 = the exact input string, and
//    >1 = applyLean's clamp) × veils. Inputs are never mutated.
{
  const corpus = ['#112233', '#445566', '#778899', '#aabbcc', '#000000', '#ffffff', '#FF8800', '#aBc123', '#abc', '#0f0'];
  const fades = [0, 0.01, 0.2, 1 / 3, 0.5, 0.83, 1, 1.4];
  for (const lift of [0, 0.25, 0.5, 1]) {
    const veil = hazeVeilHex(lift);
    const colors = corpus.slice();
    const accents = corpus.slice().reverse();
    const fade = new Float32Array(corpus.map((_, k) => fades[k % fades.length]));
    const before = colors.slice();
    const out = applyWeatherFade({ colors, accents, fade, veil });
    assert.notStrictEqual(out.colors, colors, 'active: fresh colors array');
    assert.deepStrictEqual(colors, before, 'inputs never mutated');
    for (let k = 0; k < corpus.length; k++) {
      assert.strictEqual(out.colors[k], applyLean(colors[k], veil, fade[k]), `colors[${k}] at fade ${fade[k]}, lift ${lift}`);
      assert.strictEqual(out.accents[k], applyLean(accents[k], veil, fade[k]), `accents[${k}] at fade ${fade[k]}, lift ${lift}`);
      if (!(fade[k] > 0)) assert.strictEqual(out.colors[k], colors[k], 'fade 0 keeps the exact input string');
    }
  }
}

// 4. The fade is monotonic: as the field value under a mark rises, its colour walks toward
//    the veil (channel distance strictly falls) and its alpha scale strictly falls.
{
  const color = '#204060';
  const veil = hazeVeilHex(1);
  const dist = (hex) => {
    const [r, g, b] = hexToRgb255(hex);
    const [vr, vg, vb] = hexToRgb255(veil);
    return Math.abs(r - vr) + Math.abs(g - vg) + Math.abs(b - vb);
  };
  let prevDist = Infinity;
  let prevAlpha = Infinity;
  for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const out = applyWeatherFade({ colors: [color], accents: [color], fade: new Float32Array([f]), veil });
    const d = dist(out.colors[0]);
    assert.ok(d < prevDist, `distance to veil must fall as fade rises (fade ${f}: ${d} !< ${prevDist})`);
    prevDist = d;
    const a = weatherAlphaScale(f);
    assert.ok(a < prevAlpha, `alpha scale must fall as fade rises (fade ${f})`);
    prevAlpha = a;
  }
  assert.strictEqual(dist(applyWeatherFade({ colors: [color], accents: [color], fade: new Float32Array([1]), veil }).colors[0]), 0, 'fade 1 lands exactly on the veil');
  assert.strictEqual(weatherAlphaScale(0), 1, 'no fade, no thinning');
  assert.strictEqual(weatherAlphaScale(1), 1 - WEATHER_ALPHA_FADE, 'a fully faded mark keeps 40% of its alpha');
  assert.strictEqual(weatherAlphaScale(7), 1 - WEATHER_ALPHA_FADE, 'alpha scale clamps above 1');
  assert.strictEqual(weatherAlphaScale(Number.NaN), 1, 'a non-finite fade thins nothing');
}

// 5. Same seed → same fade array, twice (the field is a pure function of seed/x/y/z, so a
//    recorded take replays the same fades); a different seed is a different mist.
{
  const fadeFor = (seed) => {
    const field = WEATHER.get('haze-air').create(seed, { z: 0.064 });
    const fade = new Float32Array(64);
    for (let k = 0; k < 64; k++) fade[k] = 0.35 * field.sample((k % 8) / 8, Math.floor(k / 8) / 8);
    return fade;
  };
  const a = fadeFor(1234);
  const b = fadeFor(1234);
  assert.deepStrictEqual([...a], [...b], 'same seed, same fade array');
  assert.ok(a.some((v) => v > 0) && a.some((v) => v < 0.35), 'the mist varies: thick and thin places');
  const c = fadeFor(9876);
  assert.notDeepStrictEqual([...a], [...c], 'a different seed is a different mist');
  const out1 = applyWeatherFade({ colors: ['#112233'], accents: ['#445566'], fade: new Float32Array([a[0]]), veil: '#a6a6a6' });
  const out2 = applyWeatherFade({ colors: ['#112233'], accents: ['#445566'], fade: new Float32Array([b[0]]), veil: '#a6a6a6' });
  assert.deepStrictEqual(out1, out2, 'the response itself is a pure function of its inputs');
}

console.log('engine/weatherAir.selfcheck: ok');
