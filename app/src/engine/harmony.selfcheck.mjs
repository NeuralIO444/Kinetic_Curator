// node src/engine/harmony.selfcheck.mjs
import assert from 'node:assert';
import {
  hexToHsl, hslToHex, buildHarmony, applyWithLocks, HARMONY_SCHEMES, SCHEME_IDS,
} from './harmony.js';

// round trip through HSL stays close (integer rounding only)
for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#123456', '#ffffff', '#000000', '#7f7f7f']) {
  const back = hslToHex(hexToHsl(hex));
  const d = [1, 3, 5].map((i) =>
    Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)));
  assert.ok(Math.max(...d) <= 2, `${hex} → ${back} should round-trip within 2/255`);
}

// grey has no saturation; pure red sits at hue 0
assert.strictEqual(hexToHsl('#808080').s, 0);
assert.strictEqual(Math.round(hexToHsl('#ff0000').h), 0);
assert.strictEqual(Math.round(hexToHsl('#00ff00').h), 120);

// every scheme yields the requested count of valid hex
const rng = () => 0.5; // deterministic: no jitter
for (const id of SCHEME_IDS) {
  const out = buildHarmony('#ff2d6f', id, 8, rng);
  assert.strictEqual(out.length, 8, `${id} must fill 8 slots`);
  for (const c of out) assert.ok(/^#[0-9a-f]{6}$/.test(c), `${id} produced bad hex ${c}`);
}
assert.strictEqual(Object.keys(HARMONY_SCHEMES).length, SCHEME_IDS.length);

// lightness fans out, so a scheme is never a flat block of one colour
const mono = buildHarmony('#ff2d6f', 'monochrome', 8, rng);
assert.ok(new Set(mono).size >= 6, 'monochrome must still vary by lightness');

// a near-grey base must not collapse the scheme to grey
const fromGrey = buildHarmony('#7f7f7f', 'triadic', 8, rng);
assert.ok(fromGrey.some((c) => hexToHsl(c).s > 0.3), 'grey base should still produce colour');

// locks are honoured exactly
const current = ['#111111', '#222222', '#333333', '#444444'];
const generated = ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd'];
assert.deepStrictEqual(
  applyWithLocks(current, generated, [true, false, true, false]),
  ['#111111', '#bbbbbb', '#333333', '#dddddd'],
);
assert.deepStrictEqual(applyWithLocks(current, generated, {}), generated, 'no locks = full replace');
assert.deepStrictEqual(
  applyWithLocks(current, generated, [true, true, true, true]), current,
  'all locked = nothing changes',
);
// a short generated set must not blank out trailing slots
assert.deepStrictEqual(applyWithLocks(current, ['#aaaaaa'], []), ['#aaaaaa', '#222222', '#333333', '#444444']);

console.log('harmony.selfcheck: OK', { schemes: SCHEME_IDS.length });
