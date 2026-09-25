// runSelfcheck.mjs — run the selfcheck manifest (#620).
//
// Replaces the 95-command `&&` chain that used to live in package.json: every PR
// that added a suite edited that one line, so every pair of PRs conflicted.
// Same semantics as the chain: commands run in file order, one at a time, output
// streams straight through, and the first failure stops the run with that exit code.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
// SELFCHECK_MANIFEST overrides the path (used only by runSelfcheck.selfcheck.mjs).
const MANIFEST = process.env.SELFCHECK_MANIFEST || join(APP, 'selfcheck.manifest');

/** *.selfcheck.mjs files that are deliberately NOT chain suites. */
const IGNORED = new Set([]);

/** Parse manifest text -> ['node src/x.selfcheck.mjs', ...]. Pure, exported for the test. */
export function parseManifest(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** Problems with a parsed manifest (empty = fine). Pure over the disk listing it is given. */
export function manifestProblems(cmds, suitesOnDisk, fileExists) {
  const problems = [];
  const seen = new Set();
  for (const c of cmds) {
    if (!/^node \S+/.test(c)) problems.push(`not a "node <file>" command: ${c}`);
    if (seen.has(c)) problems.push(`duplicate entry: ${c}`);
    seen.add(c);
    const file = c.split(/\s+/)[1];
    if (file && !fileExists(file)) problems.push(`file not found: ${file}`);
  }
  const listed = new Set(cmds.map((c) => c.split(/\s+/)[1]));
  for (const f of suitesOnDisk) {
    if (!listed.has(f) && !IGNORED.has(f)) problems.push(`suite not in the manifest (it would never run): ${f}`);
  }
  return problems;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.selfcheck.mjs')) out.push(relative(APP, p).split('\\').join('/'));
  }
  return out.sort();
}

function main() {
  const cmds = parseManifest(readFileSync(MANIFEST, 'utf8'));
  const onDisk = process.env.SELFCHECK_MANIFEST ? [] : walk(join(APP, 'src'));
  const problems = manifestProblems(cmds, onDisk, (f) => existsSync(resolve(APP, f)));
  if (problems.length) {
    console.error(`selfcheck.manifest: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
    process.exit(2);
  }
  const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };
  for (const c of cmds) {
    const [, ...args] = c.split(/\s+/);
    const r = spawnSync(process.execPath, args, { cwd: APP, env, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`\nselfcheck FAILED: ${c} (${r.signal ? `signal ${r.signal}` : `exit ${r.status}`})`);
      process.exit(r.status ?? 1);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
