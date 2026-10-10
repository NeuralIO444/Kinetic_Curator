// node src/engine/kernel/bake/bake.detTrig.selfcheck.mjs
// #1240 — opt-in deterministic trig for the bake path.
//
// Two pins, following the #1247 (version.selfcheck) single-source-flag +
// pinned-bytes pattern:
//
// (a) DEFAULT PATH UNCHANGED — the default trig resolves to the *exact*
//     Math.sin/cos/atan2 references, so a default bake executes literally
//     today's arithmetic. This is asserted by reference identity (===),
//     deliberately NOT by a pinned hash: a hash of native-trig output would
//     encode the machine that recorded it (V8's Math.sin differs ~1 ulp
//     between x64 and arm64 — see particles.reference.mjs header), so pinning
//     one would be a false gate that fails on the other arch. Byte-level
//     regression cover for the default path stays with the existing suite
//     (bake.selfcheck, bake.parity.selfcheck, and the particles.selfcheck
//     reference comparison, which asserts exact in-process equality with the
//     pre-SoA engine).
// (b) OPT-IN DETERMINISTIC — det-trig fixtures are pinned by sha256. The det
//     implementation is pure IEEE-754 double arithmetic (the suite scans
//     trig.mjs to prove no Math.sin/cos/atan2 — or any other
//     implementation-defined transcendental — remains), so these pins hold
//     on x64 AND arm64. Same seed → same bytes, every run, every machine.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeParticles } from './index.js';
import {
  TRIG_NATIVE,
  TRIG_DET,
  NATIVE_TRIG,
  DET_TRIG,
  resolveTrig,
  detSin,
  detCos,
  detAtan2,
} from '../trig.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../../data/layout-modes.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Deterministic LCG — the sweep must not depend on Math.random's per-process seed.
function lcg(seed) {
  let st = seed >>> 0;
  return () => (st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

// --- 1. the polynomials are faithful trig -----------------------------------
// Measured (2M samples): sin/cos ≤ 9.1e-13 abs on |x| ≤ 10001 (the bake's
// real argument range — flap phases carry seedOffset up to 1e4), ≤ 1.2e-16
// on |x| ≤ 2π; atan2 ≤ 7.8e-12 abs. Thresholds carry ~10x headroom.
{
  const rnd = lcg(0x1240);
  let maxSin = 0, maxCos = 0;
  for (let i = 0; i < 200000; i++) {
    const x = (rnd() * 2 - 1) * 10001;
    const es = Math.abs(detSin(x) - Math.sin(x));
    const ec = Math.abs(detCos(x) - Math.cos(x));
    if (es > maxSin) maxSin = es;
    if (ec > maxCos) maxCos = ec;
  }
  assert.ok(maxSin <= 1e-11, `detSin fidelity: max abs err ${maxSin} > 1e-11`);
  assert.ok(maxCos <= 1e-11, `detCos fidelity: max abs err ${maxCos} > 1e-11`);

  let maxAtan2 = 0;
  for (let i = 0; i < 200000; i++) {
    const y = (rnd() * 2 - 1) * 10 ** (rnd() * 12 - 6);
    const x = (rnd() * 2 - 1) * 10 ** (rnd() * 12 - 6);
    const e = Math.abs(detAtan2(y, x) - Math.atan2(y, x));
    if (e > maxAtan2) maxAtan2 = e;
  }
  assert.ok(maxAtan2 <= 1e-10, `detAtan2 fidelity: max abs err ${maxAtan2} > 1e-10`);

  // Edge semantics match Math.*.
  assert.ok(Number.isNaN(detSin(NaN)) && Number.isNaN(detSin(Infinity)));
  assert.ok(Number.isNaN(detCos(NaN)) && Number.isNaN(detCos(-Infinity)));
  assert.ok(Number.isNaN(detAtan2(NaN, 1)) && Number.isNaN(detAtan2(1, NaN)));
  assert.strictEqual(detAtan2(0, 0), 0);
  assert.strictEqual(detAtan2(0, -5), Math.PI);
  assert.strictEqual(detAtan2(-0, -5), -Math.PI);
  assert.strictEqual(detAtan2(-0, -0), -Math.PI); // -π, not +π
  console.log('detTrig fidelity: OK', { maxSin, maxCos, maxAtan2 });
}

// --- 2. the det module uses no implementation-defined transcendentals ------
// This scan is the cross-architecture guarantee: with no Math.sin/cos/atan2
// (or any other non-correctly-rounded libm call) in the module, the only
// operations left are IEEE-754 doubles, which are bit-identical on x64/arm64.
{
  let src = readFileSync(join(HERE, '..', 'trig.mjs'), 'utf8');
  // Strip comments first: the header documents Math.sin/cos/atan2 by name.
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  // Excise the NATIVE_TRIG literal: it intentionally holds the exact Math.*
  // references (that IS the default path). Everything else must be clean.
  const start = src.indexOf('export const NATIVE_TRIG');
  assert.ok(start >= 0, 'trig.mjs must define NATIVE_TRIG');
  const end = src.indexOf('});', start);
  assert.ok(end > start, 'trig.mjs NATIVE_TRIG literal must terminate');
  src = src.slice(0, start) + src.slice(end + 3);
  const banned = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|sinh|cosh|tanh|asinh|acosh|atanh)\b/;
  assert.ok(!banned.test(src), 'trig.mjs must not call implementation-defined transcendentals outside NATIVE_TRIG');
  console.log('detTrig source scan: OK (no Math.sin/cos/atan2 or other libm transcendentals outside NATIVE_TRIG)');
}

// --- 3a. default path: the opt-in resolves to today's exact builtins -------
// Identity (===) with the Math.* function objects proves the default bake
// executes literally the same calls as before this change — byte-identical
// by construction, on every architecture.
{
  assert.strictEqual(NATIVE_TRIG.sin, Math.sin, 'default trig must BE Math.sin');
  assert.strictEqual(NATIVE_TRIG.cos, Math.cos, 'default trig must BE Math.cos');
  assert.strictEqual(NATIVE_TRIG.atan2, Math.atan2, 'default trig must BE Math.atan2');
  assert.strictEqual(resolveTrig(undefined), NATIVE_TRIG);
  assert.strictEqual(resolveTrig(null), NATIVE_TRIG);
  assert.strictEqual(resolveTrig(TRIG_NATIVE), NATIVE_TRIG);
  assert.strictEqual(resolveTrig(TRIG_DET), DET_TRIG);
  assert.throws(() => resolveTrig('bogus'), /unknown trig mode/, 'unknown trig mode must throw, never silently fall back');
  console.log('detTrig default-path identity: OK');
}

// --- fixtures ---------------------------------------------------------------
const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] };
const base = {
  seed: 0xc0ffee,
  count: 40,
  activeAssets: assets,
  palette,
  canvasW: 1000,
  canvasH: 700,
  steps: 120, // the issue's "120 chaotic bake steps"
  engine: 'js',
};
const lp = (extra = {}) =>
  normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: 40,
    contactRadius: 0,
    ...extra,
  });

// Canonical form — x/y/rotation drive (and are driven by) every trig call on
// the bake path.
const canon = (items) =>
  items.map((p) => [+p.x.toFixed(9), +p.y.toFixed(9), +p.rotation.toFixed(9)]);
const sha = (items) => createHash('sha256').update(JSON.stringify(canon(items))).digest('hex');

// --- 3b. default path: explicit 'native' is a no-op vs the default ---------
{
  const params = lp();
  const def = canon(bakeParticles({ ...base, layoutParams: params }));
  const nat = canon(bakeParticles({ ...base, layoutParams: params, trig: TRIG_NATIVE }));
  assert.deepStrictEqual(nat, def, "trig:'native' must be byte-identical to the default path");
  console.log('detTrig default-vs-native: OK (identical)');
}

// --- 4. opt-in: same seed → same output, every run --------------------------
{
  const params = lp();
  const run1 = canon(bakeParticles({ ...base, layoutParams: params, trig: TRIG_DET }));
  const run2 = canon(bakeParticles({ ...base, layoutParams: params, trig: TRIG_DET }));
  assert.deepStrictEqual(run2, run1, 'det bake must be deterministic across runs');
  // A different bake in between must not disturb it (no shared trig state).
  bakeParticles({ ...base, seed: 0xbeef, layoutParams: params, trig: TRIG_DET });
  assert.deepStrictEqual(
    canon(bakeParticles({ ...base, layoutParams: params, trig: TRIG_DET })),
    run1,
    'det bake must not depend on prior bakes',
  );
  // The opt-in actually engages: det output differs from native output at raw
  // double precision. (The 1e-9 canonical rounding above can hide a 2.7e-10
  // divergence, so this compares unrounded values. Chaotic divergence over
  // 120 steps makes accidental equality impossible unless the trig source
  // never actually switched — this keeps the test from being vacuous.)
  const raw = (items) => items.map((p) => [p.x, p.y, p.rotation]);
  assert.notDeepStrictEqual(
    raw(bakeParticles({ ...base, layoutParams: params, trig: TRIG_DET })),
    raw(bakeParticles({ ...base, layoutParams: params })),
    'det trig must actually change the trajectory vs native',
  );
  for (const [x, y] of run1) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), 'det positions must stay finite');
    assert.ok(Math.abs(x) < 1e5 && Math.abs(y) < 1e5, 'det positions must not blow up');
  }
  console.log('detTrig determinism: OK');
}

// --- 5. opt-in fixtures pinned (cross-arch safe: pure double arithmetic) ----
const PINS = {
  // swarm physics: wind/curl/levy forces + heading atan2 (update)
  'detTrig.swarm': '7a9448bb77477ede7ebbc062d3a1bb5f1d4847075748b587d15cae1935fdc80d',
  // organism items: bilateral/radial trig in _organismItems (getItems)
  'detTrig.hype': 'cb19269852d16f5c21a57f567a7abb0be097a9bb001a85662eee9f054fde4300',
  // contacts: golden-angle depenetration (_contactPass) + breed rotation atan2
  'detTrig.contacts': 'dbcc788f10e740c196257355737592563dc710ea76577fb88f895973a0fc4dd0',
};
{
  const fixtures = {
    'detTrig.swarm': lp(),
    'detTrig.hype': lp({ mode: 'hype' }),
    'detTrig.contacts': lp({ contactRadius: 18, contactMode: 'bounce', contactRepel: 1.2 }),
  };
  for (const [name, layoutParams] of Object.entries(fixtures)) {
    const items = bakeParticles({ ...base, layoutParams, trig: TRIG_DET });
    assert.strictEqual(sha(items), PINS[name], `${name}: det fixture moved — intentional changes must re-pin`);
  }
  console.log('detTrig pinned fixtures: OK', { fixtures: Object.keys(PINS).length });
}

// --- 6. det trig forces the JS engine honestly -------------------------------
{
  assert.throws(
    () =>
      bakeParticles({
        ...base,
        layoutParams: lp(),
        trig: TRIG_DET,
        engine: 'wasm',
      }),
    /det-trig/,
    "trig:'det' + engine:'wasm' must throw honestly",
  );
  console.log('detTrig engine gating: OK');
}

console.log('kernel/bake.detTrig.selfcheck: OK (#1240)');
