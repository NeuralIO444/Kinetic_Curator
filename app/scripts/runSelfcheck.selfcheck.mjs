// runSelfcheck.selfcheck.mjs — the manifest runner keeps the old `&&` chain's semantics (#620).
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, manifestProblems } from './runSelfcheck.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

// parsing: comments/blank lines ignored, order kept
assert.deepStrictEqual(parseManifest('# c\n\nnode a.mjs\n  node b.mjs  \n#x\n'), ['node a.mjs', 'node b.mjs']);

// problems: duplicate, non-node command, missing file, and an unlisted suite on disk
const exists = (f) => f !== 'gone.mjs';
assert.deepStrictEqual(manifestProblems(['node a.selfcheck.mjs'], ['a.selfcheck.mjs'], exists), []);
assert.match(manifestProblems(['node a.mjs', 'node a.mjs'], [], exists).join('|'), /duplicate/);
assert.match(manifestProblems(['python x.py'], [], exists).join('|'), /not a "node/);
assert.match(manifestProblems(['node gone.mjs'], [], exists).join('|'), /file not found: gone\.mjs/);
assert.match(manifestProblems(['node a.mjs'], ['a.mjs', 'orphan.selfcheck.mjs'], exists).join('|'),
  /suite not in the manifest.*orphan\.selfcheck\.mjs/);

// the REAL manifest is clean (every suite on disk listed once, all files exist) — the runner
// re-checks this on every run; asserting it here makes a bad manifest fail with a clear name.
const real = parseManifest(readFileSync(join(APP, 'selfcheck.manifest'), 'utf8'));
assert.ok(real.length >= 90, `manifest has ${real.length} entries`);

// stop-on-first-failure, with the failing command's exit code and its output streamed through
{
  const dir = mkdtempSync(join(tmpdir(), 'scm-'));
  writeFileSync(join(dir, 'a.mjs'), 'console.log("A ran");\n');
  writeFileSync(join(dir, 'b.mjs'), 'console.log("B ran"); process.exit(7);\n');
  writeFileSync(join(dir, 'c.mjs'), 'console.log("C ran");\n');
  const manifest = join(dir, 'm');
  const run = (lines) => {
    writeFileSync(manifest, lines.join('\n') + '\n');
    return spawnSync(process.execPath, [join(APP, 'scripts/runSelfcheck.mjs')], {
      env: { ...process.env, SELFCHECK_MANIFEST: manifest }, cwd: APP, encoding: 'utf8',
    });
  };
  const bad = run([`node ${join(dir, 'a.mjs')}`, `node ${join(dir, 'b.mjs')}`, `node ${join(dir, 'c.mjs')}`]);
  assert.strictEqual(bad.status, 7, 'exit code of the failing suite is propagated');
  assert.match(bad.stdout, /A ran/); assert.match(bad.stdout, /B ran/);
  assert.doesNotMatch(bad.stdout, /C ran/, 'nothing after the first failure runs');
  assert.match(bad.stderr, /selfcheck FAILED: node .*b\.mjs/);
  const good = run([`node ${join(dir, 'a.mjs')}`, `node ${join(dir, 'c.mjs')}`]);
  assert.strictEqual(good.status, 0);
  assert.match(good.stdout, /A ran[\s\S]*C ran/, 'file order is execution order');
}

console.log('runSelfcheck.selfcheck: OK');
