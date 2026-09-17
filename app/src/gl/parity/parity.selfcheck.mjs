// parity.selfcheck.mjs — parity harness integrity (Phase 0, #186):
// corpus validity, reference determinism, resvg self-parity smoke,
// and the GL candidate stub contract.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { CORPUS, getScene, POLICIES } from './corpus.mjs';
import { renderReference, renderReferenceSvg } from './reference.mjs';
import { renderCandidate, CANDIDATE_READY } from '../candidate.mjs';
import { diffPixels, DEFAULT_POLICY } from './diff.mjs';
import { parseProject } from '../../state/projectDocument.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const okAsync = async (name, fn) => { await fn(); n++; console.log(`  [ok] ${name}`); };

ok('corpus: unique ids, valid policies, parseable docs', () => {
  const ids = CORPUS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'scene ids unique');
  assert.ok(CORPUS.length >= 5, 'corpus covers baseline + blends + FX chains');
  for (const scene of CORPUS) {
    assert.ok(POLICIES[scene.policy], `scene ${scene.id}: known policy`);
    assert.ok(scene.description && scene.description.length > 10);
    const parsed = parseProject(JSON.parse(JSON.stringify(scene.doc)));
    assert.ok(parsed.ok, `scene ${scene.id}: doc parses`);
    assert.ok(Number.isFinite(scene.width) && scene.width > 0);
  }
  assert.throws(() => getScene('nope'), /unknown scene/);
});

ok('reference SVG is deterministic per scene', () => {
  for (const scene of CORPUS) {
    const a = renderReferenceSvg(scene);
    const b = renderReferenceSvg(scene);
    assert.ok(a.length > 1000, `scene ${scene.id}: non-trivial SVG`);
    assert.equal(a, b, `scene ${scene.id}: byte-identical SVG`);
    assert.ok(!a.includes('var(--ink'), `scene ${scene.id}: no unresolved CSS vars for resvg`);
  }
});

ok('GL candidate stub fails loudly until Phase 1', async () => {
  assert.equal(CANDIDATE_READY, false);
  await assert.rejects(() => renderCandidate(CORPUS[0], { width: 100 }), /Phase 1/);
});

await okAsync('resvg self-parity: reference vs itself passes (strict policy)', async () => {
  const scene = getScene('single-basic');
  const a = await renderReference(scene, { width: 200 });
  const b = await renderReference(scene, { width: 200 });
  assert.equal(a.width, b.width);
  assert.ok(a.pixels.length > 0);
  const r = diffPixels(a.pixels, b.pixels, a.width, a.height, DEFAULT_POLICY);
  assert.equal(r.pass, true, `self-parity must pass: ${r.failed} failed`);
  assert.equal(r.maxDelta, 0);
});

await okAsync('runner CLI: self-parity over the full corpus exits 0', async () => {
  const out = execFileSync('node', ['src/gl/parity/run.mjs', '--candidate', 'svg'], {
    cwd: new URL('../../..', import.meta.url).pathname,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.ok(out.includes('5/5 scenes pass'), `expected 5/5 pass, got:\n${out}`);
});

await okAsync('runner CLI: --candidate gl fails with the Phase 1 message', async () => {
  let err = null;
  try {
    execFileSync('node', ['src/gl/parity/run.mjs', '--candidate', 'gl', '--scene', 'single-basic'], {
      cwd: new URL('../../..', import.meta.url).pathname,
      encoding: 'utf8',
      timeout: 60000,
    });
  } catch (e) { err = e; }
  assert.ok(err, 'expected non-zero exit');
  assert.ok((err.stderr || '').includes('Phase 1'), 'loud Phase 1 message');
});

console.log(`parity.selfcheck: OK (${n} cases)`);
