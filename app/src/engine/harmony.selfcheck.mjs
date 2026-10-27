// node src/engine/harmony.selfcheck.mjs
import assert from 'node:assert';
import { hexToHsl, hslToHex, buildHarmony, applyWithLocks, HARMONY_SCHEMES, SCHEME_IDS } from './harmony.js';

// round trip through HSL stays close (integer rounding only)
for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#123456', '#ffffff', '#000000', '#7f7f7f']) {
  const back = hslToHex(hexToHsl(hex));
  const d = [1, 3, 5].map((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)));
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
assert.ok(
  fromGrey.some((c) => hexToHsl(c).s > 0.3),
  'grey base should still produce colour',
);

// locks are honoured exactly
const current = ['#111111', '#222222', '#333333', '#444444'];
const generated = ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd'];
assert.deepStrictEqual(applyWithLocks(current, generated, [true, false, true, false]), [
  '#111111',
  '#bbbbbb',
  '#333333',
  '#dddddd',
]);
assert.deepStrictEqual(applyWithLocks(current, generated, {}), generated, 'no locks = full replace');
assert.deepStrictEqual(
  applyWithLocks(current, generated, [true, true, true, true]),
  current,
  'all locked = nothing changes',
);
// a short generated set must not blank out trailing slots
assert.deepStrictEqual(applyWithLocks(current, ['#aaaaaa'], []), ['#aaaaaa', '#222222', '#333333', '#444444']);

// ── Audit fix 3c — the no-rng path is deterministic ─────────────────────────
// buildHarmony used to default rng = Math.random, so the two production
// callers (PaletteWing generate, layoutSlice applyHarmony) dealt fresh
// jitter per call: same base + scheme never reproduced the same palette
// (measured pre-fix: 50 distinct palettes over 50 identical calls).
// The jitter is now dealt from the inputs via hashU01 ('harmony' colour
// channel): same inputs → same palette, and the fan-out survives.
const det1 = buildHarmony('#3a7bd5', 'triadic', 8);
const det2 = buildHarmony('#3a7bd5', 'triadic', 8);
assert.deepStrictEqual(det1, det2, 'no-rng buildHarmony must be deterministic');
assert.ok(new Set(det1).size >= 6, 'no-rng palette must still fan out by slot');
assert.notDeepStrictEqual(
  buildHarmony('#d53a7b', 'triadic', 8),
  det1,
  'a different base must deal a different palette',
);
assert.notDeepStrictEqual(
  buildHarmony('#3a7bd5', 'split', 8),
  det1,
  'a different scheme must deal a different palette',
);
// a non-function rng falls back to the same deterministic deal, never Math.random
assert.deepStrictEqual(buildHarmony('#3a7bd5', 'triadic', 8, undefined), det1);
assert.deepStrictEqual(buildHarmony('#3a7bd5', 'triadic', 8, 42), det1);

console.log('harmony.selfcheck: OK', { schemes: SCHEME_IDS.length });
