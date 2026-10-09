// pool_rig.selfcheck.mjs — the synthetic pass pool is varied, deterministic and at the app's feature version (#762).
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const run = (seed, count, prefix) => {
  const dir = mkdtempSync(join(tmpdir(), 'kc-rig-'));
  execFileSync(process.execPath, [join(here, 'pool_rig.mjs'), '--dry', '--count', String(count), '--seed', String(seed), '--prefix', prefix, '--out', dir], { stdio: 'pipe' });
  const feats = JSON.parse(readFileSync(join(dir, `${prefix}-features.json`), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return feats;
};

const a = run(7, 60, 'x'); const b = run(7, 60, 'x'); const c = run(8, 60, 'x');
assert.deepStrictEqual(a, b, 'same seed and count: byte-identical recipes');
assert.notDeepStrictEqual(a, c, 'another seed: another pool');
const rows = Object.values(a);
assert.strictEqual(rows.length, 60);
const { FEATURES_VERSION } = await import('../app/src/curator/recipeFeatures.js');
assert.ok(rows.every((f) => f.v === FEATURES_VERSION), 'features are at the app\'s current version');
const distinct = (k) => new Set(rows.map((f) => f[k])).size;
assert.ok(distinct('system') >= 6, `systems: ${distinct('system')}`);
assert.ok(distinct('palette') >= 10, `palettes: ${distinct('palette')}`);
assert.ok(distinct('behave') >= 2, `behaviours: ${distinct('behave')}`);
console.log('pool_rig.selfcheck: OK');
