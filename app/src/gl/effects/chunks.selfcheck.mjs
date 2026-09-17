// chunks.selfcheck.mjs — GLSL shared chunk library (#196, order:07).
//
// Node-only. Proves the chunk-library rules without a GPU:
//   - versioned, pure (no uniforms/textures), kc_-prefixed, documented
//   - explicit inter-chunk dependencies, all resolvable
//   - injectCommon() keeps the debug harness #line mapping correct
//   - zero duplicated noise/hash/color implementations in the tree (grep)
//   - CPU reference formulas are sane (properties + golden values)
// Render-vs-GPU comparison lives in the debug harness page tests
// (selfcheck.page.mjs) and app/e2e/gl-chunks.spec.js.
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMON_VERSION,
  COMMON_GLSL,
  CHUNK_INDEX,
  definedChunkNames,
  auditChunks,
  injectCommon,
  chunksUsedBy,
  chunkFingerprint,
} from './chunks.mjs';
import {
  refHash12,
  refHash22,
  refVnoise,
  refFbm,
  refLuma,
  refRgb2hsl,
  refHsl2rgb,
  refSrgb2lin,
  refLin2srgb,
  refIgn,
  refDither,
  refUvCentered,
  refUvAspect,
} from './chunkReference.mjs';
import { TMPL_GRAIN_FS } from './examples.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.join(HERE, '..', '..'); // app/src

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const near = (a, b, tol, msg) => {
  assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ±${tol}`);
};

ok('library version header matches COMMON_VERSION', () => {
  const header = COMMON_GLSL.split('\n')[0];
  assert.ok(header.includes(`v${COMMON_VERSION}`), `header: ${header}`);
  assert.equal(COMMON_VERSION, 1);
});

ok('auditChunks is clean (pure, prefixed, documented, resolvable)', () => {
  const { errors } = auditChunks();
  assert.deepEqual(errors, [], errors.join('; '));
});

ok('auditChunks catches violations', () => {
  const badUniform = COMMON_GLSL + '\nuniform float u_x;\nfloat kc_bad(vec2 p) { return u_x; }\n';
  assert.ok(auditChunks(badUniform).errors.some((e) => /uniform/.test(e)), 'uniform rejected');
  const badName = COMMON_GLSL + '\nfloat myhash(vec2 p) { return p.x; }\n';
  assert.ok(auditChunks(badName).errors.some((e) => /kc_ prefix/.test(e)), 'prefix enforced');
  const badCall = COMMON_GLSL + '\nfloat kc_bad2(vec2 p) { return kc_nope(p); }\n';
  assert.ok(auditChunks(badCall).errors.some((e) => /undefined/.test(e)), 'undefined callee rejected');
});

ok('CHUNK_INDEX covers every defined chunk', () => {
  const defined = definedChunkNames().sort();
  const indexed = CHUNK_INDEX.map((c) => c.name).sort();
  assert.deepEqual(indexed, defined, 'index matches definitions');
});

ok('injectCommon maps #line for chunks and effect body', () => {
  const src = '#version 300 es\nprecision highp float;\nvoid main() {}\n';
  const lines = injectCommon(src).split('\n');
  assert.equal(lines[0], '#version 300 es', 'version stays first');
  assert.equal(lines[1], '#line 1', 'chunk block maps to common.glsl lines');
  const chunkCount = COMMON_GLSL.split('\n').length;
  assert.equal(lines[2 + chunkCount], '#line 2', 'effect body maps to effect source lines');
  assert.equal(lines[3 + chunkCount], 'precision highp float;', 'body line 2 intact');
  assert.equal(lines[4 + chunkCount], 'void main() {}', 'body line 3 intact');
  // No #version: chunk block first, body restarts at line 1.
  const bare = injectCommon('void main() {}').split('\n');
  assert.equal(bare[0], '#line 1');
  assert.equal(bare[1 + chunkCount], '#line 1');
  assert.equal(bare[2 + chunkCount], 'void main() {}');
});

ok('injectCommon output still declares no uniforms', () => {
  const out = injectCommon('#version 300 es\nuniform float u_x;\nvoid main() {}\n');
  const decls = [...out.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
  assert.deepEqual(decls, ['u_x'], 'only the effect\'s own uniforms survive');
});

ok('no duplicated noise/hash/color implementations in the tree', () => {
  // The 10 Phase-2 effects must reuse chunks, not reinvent them. These
  // patterns are the known-bad idioms; chunks.mjs is the only file allowed
  // to implement them.
  const banned = [
    /43758\.5453/, // sin-hash magic constant
    /fract\s*\(\s*sin\s*\(\s*dot/, // fract(sin(dot())) hash idiom
    /127\.1\s*,\s*311\.7/, // sin-hash seed vector
  ];
  const offenders = [];
  const SELF = path.join(HERE, 'chunks.selfcheck.mjs');
  const LIB = path.join(HERE, 'chunks.mjs');
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      // chunks.mjs is the one file allowed to implement the primitives;
      // this selfcheck is the auditor, not the audited.
      if (!/\.(mjs|js|jsx)$/.test(e) || p === LIB || p === SELF) continue;
      const text = readFileSync(p, 'utf8');
      for (const re of banned) {
        if (re.test(text)) offenders.push(`${path.relative(SRC_ROOT, p)}: ${re}`);
      }
    }
  };
  walk(SRC_ROOT);
  assert.deepEqual(offenders, [], 'duplicated implementations:\n' + offenders.join('\n'));
});

ok('template grain example uses the shared hash (no inline copy)', () => {
  const used = chunksUsedBy(TMPL_GRAIN_FS);
  assert.ok(used.includes('kc_hash12'), `grain uses kc_hash12 (uses: ${used})`);
  assert.ok(!/float\s+hash\s*\(/.test(TMPL_GRAIN_FS), 'no local hash() in the example');
});

ok('chunksUsedBy answers which effects a chunk change affects', () => {
  assert.deepEqual(chunksUsedBy('void main() { float x = kc_vnoise(p) + kc_luma(c); }'), ['kc_luma', 'kc_vnoise']);
  assert.deepEqual(chunksUsedBy('void main() {}'), []);
});

ok('chunkFingerprint is a stable 8-hex change detector', () => {
  const fp = chunkFingerprint();
  assert.match(fp, /^[0-9a-f]{8}$/, 'format');
  assert.equal(chunkFingerprint(), fp, 'deterministic');
  assert.notEqual(chunkFingerprint(COMMON_GLSL + '\n'), fp, 'any edit changes it');
});

ok('CPU reference: hand-verifiable properties', () => {
  assert.equal(refHash12(0, 0), 0, 'hash12(0,0) is exactly 0');
  assert.equal(refVnoise(2, 3), refHash12(2, 3), 'vnoise at lattice point = hash of corner');
  assert.equal(refLuma(1, 0, 0), 0.2126, 'luma of pure red');
  assert.equal(refLuma(0, 0, 0), 0);
  near(refLuma(1, 1, 1), 1, 1e-12, 'luma of white');
  assert.equal(refSrgb2lin(0), 0);
  near(refSrgb2lin(1), 1, 1e-12, 'srgb2lin(1)');
  assert.equal(refLin2srgb(0), 0);
  near(refLin2srgb(1), 1, 1e-12, 'lin2srgb(1)');
  near(refLin2srgb(refSrgb2lin(0.5)), 0.5, 1e-12, 'srgb roundtrip');
  for (const [x, y] of [[0.3, 0.7], [4.5, 7.5], [100.2, 0.1]]) {
    const h = refHash12(x, y);
    assert.ok(h >= 0 && h < 1, `hash12 in [0,1): ${h}`);
    const h2 = refHash22(x, y);
    assert.ok(h2.every((v) => v >= 0 && v < 1), 'hash22 in [0,1)^2');
    const ig = refIgn(x, y);
    assert.ok(ig >= 0 && ig < 1, 'ign in [0,1)');
    const d = refDither(x, y);
    assert.ok(d >= -0.5 && d < 0.5, 'dither in [-0.5,0.5)');
  }
  const fbm = refFbm(3.7, 9.1, 4);
  assert.ok(fbm >= 0 && fbm <= 0.9375, `fbm bounded: ${fbm}`);
  const hsl = refRgb2hsl(0.2, 0.5, 0.8);
  const back = refHsl2rgb(...hsl);
  near(back[0], 0.2, 1e-12, 'hsl roundtrip r');
  near(back[1], 0.5, 1e-12, 'hsl roundtrip g');
  near(back[2], 0.8, 1e-12, 'hsl roundtrip b');
  assert.deepEqual(refUvCentered(0, 0), [-1, -1]);
  assert.deepEqual(refUvCentered(1, 1), [1, 1]);
  assert.deepEqual(refUvAspect(1, 1, 16, 9), [16 / 9, 1]);
});

ok('CPU reference: golden values (regression tripwires)', () => {
  near(refHash12(1.5, 2.5), 0.038120745183618965, 1e-15, 'hash12 golden');
  near(refVnoise(1.5, 2.5), 0.5910836719785806, 1e-15, 'vnoise golden');
  near(refFbm(3.7, 9.1, 4), 0.5489616802999926, 1e-15, 'fbm golden');
  near(refIgn(4.5, 7.5), 0.32022944808964127, 1e-15, 'ign golden');
  const h22 = refHash22(1.5, 2.5);
  near(h22[0], 0.7152727531283745, 1e-15, 'hash22 golden x');
  near(h22[1], 0.8186705594879413, 1e-15, 'hash22 golden y');
});

console.log(`chunks.selfcheck: OK (${n} cases)`);
