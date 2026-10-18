// colorHex.selfcheck.mjs — audit standards, hex dedupe slice 1 (#1682).
//
// The canonical hex helpers (engine/colorHex.mjs) are proven EQUAL to
// the original local implementations — carried below verbatim as
// oracles — over an exhaustive small-form sweep, a seeded large-form
// sweep, and an edge battery. Dedupe that changes any input's result
// fails here, not in a render.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { mkRng } from './prng.js';
import { hexToRgb255, hexToRgb255Strict, rgb255ToHex } from './colorHex.mjs';
import { parseHex as patternParseHex } from '../pattern/engine.js';
import { applyLean } from './kernel/color/index.js';
import { hexToRgb as tintInjectHexToRgb, rgbToHex as tintInjectRgbToHex } from '../gl/tintInject.mjs';
import { hexToRgb as tintWashHexToRgb, rgbToHex as tintWashRgbToHex } from '../gl/tintWash.mjs';

// ── Oracles: the original implementations, verbatim ─────────────────────────
// engine/kernel/color/index.js parseHexColor (== engine/fieldMap.mjs
// parseHex == pattern/engine.js parseHex — the same algorithm, 3 copies).
function oracleLenient(hex) {
  const s = String(hex).replace('#', '');
  const f =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  const n = parseInt(f.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}
// gl/tintInject.mjs hexToRgb (== gl/tintWash.mjs hexToRgb, verbatim twins).
function oracleStrict(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h))
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// gl/tintInject.mjs rgbToHex (== gl/tintWash.mjs rgbToHex; the same
// clamp/round/pad encoder kernel/color's toHexColor uses).
function oracleEncode([r, g, b]) {
  const q = (v) =>
    Math.min(255, Math.max(0, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

// ── The sweep ────────────────────────────────────────────────────────────────
const inputs = [];
for (let i = 0; i < 4096; i++) {
  const h = i.toString(16).padStart(3, '0');
  inputs.push(h, `#${h}`, h.toUpperCase());
}
for (const r of [0, 51, 102, 153, 204, 255])
  for (const g of [0, 51, 102, 153, 204, 255])
    for (const b of [0, 51, 102, 153, 204, 255]) {
      const h = [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      inputs.push(h, `#${h}`, `#${h.toUpperCase()}`);
    }
{
  const rng = mkRng(1682);
  const digits = '0123456789abcdefABCDEF';
  for (let i = 0; i < 20000; i++) {
    let h = '';
    for (let j = 0; j < 6; j++) h += digits[Math.floor(rng() * digits.length)];
    inputs.push(`#${h}`);
  }
}
inputs.push(
  '',
  '#',
  '##',
  null,
  undefined,
  0,
  123456,
  {},
  [],
  '#abcd',
  '#abcde',
  '#abcdef0',
  'gggggg',
  '#gggggg',
  '  #aabbcc ',
  '# aabbcc',
  'aabbcc',
  'ABC',
  '#ABCDEF',
  '0x112233',
  '#11223',
);

for (const input of inputs) {
  assert.deepStrictEqual(
    hexToRgb255(input),
    oracleLenient(input),
    `hexToRgb255(${JSON.stringify(input)}) must equal the lenient oracle`,
  );
  assert.deepStrictEqual(
    hexToRgb255Strict(input),
    oracleStrict(input),
    `hexToRgb255Strict(${JSON.stringify(input)}) must equal the strict oracle`,
  );
  assert.deepStrictEqual(
    patternParseHex(input),
    oracleLenient(input),
    `pattern/engine.js parseHex(${JSON.stringify(input)}) must stay the lenient oracle`,
  );
}

// The tint modules' exported surfaces ARE the canonical functions now.
for (const input of inputs) {
  assert.deepStrictEqual(tintInjectHexToRgb(input), oracleStrict(input), 'tintInject hexToRgb = strict oracle');
  assert.deepStrictEqual(tintWashHexToRgb(input), oracleStrict(input), 'tintWash hexToRgb = strict oracle');
}
for (const rgb of [
  [0, 0, 0],
  [255, 255, 255],
  [127.4, 127.5, 128],
  [-10, 300, 42],
  [1, 2, 3],
]) {
  assert.strictEqual(rgb255ToHex(rgb), oracleEncode(rgb), `rgb255ToHex(${rgb}) = encoder oracle`);
  assert.strictEqual(tintInjectRgbToHex(rgb), oracleEncode(rgb), 'tintInject rgbToHex = encoder oracle');
  assert.strictEqual(tintWashRgbToHex(rgb), oracleEncode(rgb), 'tintWash rgbToHex = encoder oracle');
}

// kernel/color's parseHexColor, observed through applyLean (its only
// consumer-facing surface): lean=1 returns the ground exactly,
// lean=0 returns the input untouched, midpoints lerp the oracle parses.
for (const c of ['#aabbcc', '#112233', '#ff0000', '#00ff80', '#abc', 'garbage']) {
  for (const g of ['#000000', '#ffffff', '#123456']) {
    assert.strictEqual(applyLean(c, g, 0), c, 'lean 0 is the untouched input');
    assert.strictEqual(applyLean(c, g, 1), oracleEncode(oracleLenient(g)), `lean 1 lands on the ground (${g})`);
    const [r1, g1, b1] = oracleLenient(c);
    const [r2, g2, b2] = oracleLenient(g);
    assert.strictEqual(
      applyLean(c, g, 0.5),
      oracleEncode([r1 + (r2 - r1) / 2, g1 + (g2 - g1) / 2, b1 + (b2 - b1) / 2]),
      `lean 0.5 lerps the oracle parses (${c} -> ${g})`,
    );
  }
}

// ── Source shape: the migrated files define no local copies any more ──────
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
assert.ok(
  !read('./kernel/color/index.js').includes('function parseHexColor'),
  'kernel/color must not define a local parseHexColor',
);
assert.ok(!read('./fieldMap.mjs').includes('function parseHex('), 'fieldMap must not define a local parseHex');
assert.ok(
  !read('../pattern/engine.js').includes('function parseHex('),
  'pattern/engine.js must not define a local parseHex',
);
for (const rel of ['../gl/tintInject.mjs', '../gl/tintWash.mjs']) {
  assert.ok(!read(rel).includes('function hexToRgb('), `${rel} must not define a local hexToRgb`);
  assert.ok(!read(rel).includes('function rgbToHex('), `${rel} must not define a local rgbToHex`);
}

console.log(`colorHex.selfcheck: OK — canonical hex helpers equal their oracles on ${inputs.length} inputs`);
