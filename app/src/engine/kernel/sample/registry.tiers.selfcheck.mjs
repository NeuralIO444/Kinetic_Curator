// node src/engine/kernel/sample/registry.tiers.selfcheck.mjs
// #1232 — every built-in sampler is a DECLARED registration
// ({ id, reads, writes, costTier, fn }) with true per-sampler
// reads/writes/costTier. The legacy registerSampler(id, fn) shape survives
// only as the third-party compatibility shim; no in-tree product code may
// use it.

import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { registerSampler, getSamplerDecl, listSamplers } from './registry.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// --- no legacy registerSampler('id', fn) calls remain in-tree ---
// Boundary: *.selfcheck.mjs files are excluded on purpose — the
// registry.selfcheck.mjs suite exercises the legacy shim itself (that's
// the shim's contract), so this scan covers product code only.
const SRC = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const LEGACY_CALL = /registerSampler\s*\(\s*['"]/;

ok('no in-tree legacy registerSampler(id, fn) calls', () => {
  const files = walk(SRC).filter(
    (p) => /\.(jsx?|mjs)$/.test(p) && !p.endsWith('.selfcheck.mjs'),
  );
  assert.ok(files.length > 0, 'expected to scan real source files');
  const bad = files
    .filter((p) => LEGACY_CALL.test(readFileSync(p, 'utf8')))
    .map((p) => relative(SRC, p));
  assert.deepStrictEqual(bad, [], `legacy sampler registrations in: ${bad.join(', ')}`);
});

// --- the true per-sampler tiers (the written scale lives in
// engine/kernel/costRegistry.mjs, shared with #1239) ---
const TIER_0 = ['random', 'grid', 'fibonacci', 'phyllotaxis', 'truchet', 'radial', 'layers', 'rails', 'orbit', 'abacus', 'stratified', 'noise'];
const TIER_1 = ['swarm', 'flow', 'hype', 'murmuration'];
const TIER_2 = ['ca', 'voronoi', 'lsystem', 'dla', 'eden', 'brush', 'poisson'];

ok('every built-in sampler declares its true tier', () => {
  const expect = new Map([
    ...TIER_0.map((id) => [id, 0]),
    ...TIER_1.map((id) => [id, 1]),
    ...TIER_2.map((id) => [id, 2]),
  ]);
  assert.strictEqual(expect.size, 23, 'the registry owns exactly the 23 built-ins');
  for (const id of listSamplers()) {
    const d = getSamplerDecl(id);
    assert.ok(d, `missing declaration for ${id}`);
    assert.strictEqual(d.costTier, expect.get(id), `${id}: expected costTier ${expect.get(id)}, got ${d.costTier}`);
  }
  // Nothing else may be registered by this module.
  assert.deepStrictEqual(
    [...listSamplers()].sort(),
    [...expect.keys()].sort(),
    'unexpected sampler ids registered',
  );
});

ok('the named samplers declare real inputs, not the legacy defaults', () => {
  for (const id of ['swarm', 'flow', 'ca', 'dla', 'eden']) {
    const d = getSamplerDecl(id);
    assert.ok(d.costTier >= 1, `${id}: must carry a nonzero tier`);
    assert.ok(
      d.reads.length > 1 || d.reads[0] !== 'seed',
      `${id}: must declare its real inputs, not the legacy reads default`,
    );
  }
  // Spot-checks on the honest read lists.
  assert.ok(getSamplerDecl('ca').reads.includes('caGrid'), 'ca reads the CA grid');
  assert.ok(getSamplerDecl('brush').reads.includes('trailCount'), 'brush reads its trail knobs');
  assert.ok(!getSamplerDecl('brush').reads.includes('jitter'), 'brush deliberately does not read jitter');
  assert.ok(getSamplerDecl('dla').reads.includes('growthTick'), 'dla reads the living aggregate tick');
  assert.ok(getSamplerDecl('poisson').reads.includes('poissonRadius'), 'poisson reads the radius override');
  // The samplers that emit t / rot01 say so.
  for (const id of ['flow', 'rails', 'lsystem', 'dla', 'eden']) {
    assert.ok(getSamplerDecl(id).writes.includes('points.t'), `${id}: writes points.t`);
  }
  assert.ok(getSamplerDecl('brush').writes.includes('points.rot01'), 'brush: writes points.rot01');
});

ok('the governor can shed high-tier samplers while tier-0 placement stays', () => {
  // The shed set is derived from the declarations — no hard-coded id lists.
  const shed = new Set(listSamplers().filter((id) => getSamplerDecl(id).costTier >= 1));
  for (const id of [...TIER_1, ...TIER_2]) {
    assert.ok(shed.has(id), `${id} (tier ${getSamplerDecl(id).costTier}) must be sheddable`);
  }
  for (const id of TIER_0) {
    assert.ok(!shed.has(id), `${id} is structural and must never shed`);
  }
  // Shed-first among placement is the voice tier.
  const shedFirst = listSamplers().filter((id) => getSamplerDecl(id).costTier === 1).sort();
  assert.deepStrictEqual(shedFirst, [...TIER_1].sort(), 'tier 1 is exactly the voice samplers');
});

ok('the legacy shim still works for third-party callers', () => {
  const fn = () => ({ x: 0, y: 0 });
  registerSampler('__tiers_third_party', fn);
  const d = getSamplerDecl('__tiers_third_party');
  assert.strictEqual(d.costTier, 0, 'shim registrations stay fail-closed at tier 0');
  assert.deepStrictEqual([...d.reads], ['seed']);
  assert.deepStrictEqual([...d.writes], ['points']);
});

console.log(`sample/registry.tiers.selfcheck: ok (${n} checks)`);
