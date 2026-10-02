// qa/units.mjs — run only the selfchecks a change can break.
//
//   npm run units -- 850
//   npm run units -- src/panels/pipeline/pipelineNotices.mjs
//
// Full `npm run selfcheck` is 160+ suites and the PR gate. This is the
// iteration loop: map the diff to the suites next to it, run those, stop.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export function suitesFor(files, listing) {
  const wanted = new Set();
  for (const file of files) {
    const rel = file.replace(/^app\//, '');
    if (rel.endsWith('.selfcheck.mjs')) wanted.add(rel);
    const dir = dirname(rel);
    for (const name of listing(dir)) {
      if (name.endsWith('.selfcheck.mjs')) wanted.add(join(dir, name).split('\\').join('/'));
    }
    const stem = rel.split('/').pop().replace(/\.(mjs|js|jsx)$/, '');
    for (const suite of listing.all || []) {
      if (suite.includes(stem) && suite.endsWith('.selfcheck.mjs')) wanted.add(suite);
    }
  }
  return [...wanted].filter((f) => f.endsWith('.selfcheck.mjs')).sort();
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.selfcheck.mjs')) out.push(relative(APP, p).split('\\').join('/'));
  }
  return out;
}

function changedFiles(pr) {
  const r = spawnSync('gh', ['pr', 'diff', String(pr), '--name-only', '--repo', 'NeuralIO444/Kinetic_Curator'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'gh pr diff failed');
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

function hardness(files) {
  const e2e = files.some((f) => f.includes('/e2e/') || f.endsWith('.jsx'));
  const feel = files.some((f) => /particles\.js|paletteMix|behave/.test(f));
  return feel ? 'feel — unit pin is not the review' : e2e ? 'face — units first, e2e only if the click path changed' : 'unit — selfcheck is the gate';
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npm run units -- <pr-number | file>');
    process.exit(2);
  }
  const files = /^\d+$/.test(arg) ? changedFiles(arg) : [arg];
  const all = walk(join(APP, 'src'));
  const listing = (dir) => {
    const abs = join(APP, dir);
    return existsSync(abs) ? readdirSync(abs) : [];
  };
  listing.all = all;
  const suites = suitesFor(files, listing);
  console.log(`units: ${files.length} file(s) → ${suites.length} suite(s)`);
  console.log(`hardness: ${hardness(files)}`);
  if (!suites.length) {
    console.log('no selfcheck next to this diff — full selfcheck is the fallback');
    process.exit(0);
  }
  for (const suite of suites) console.log(`  ${suite}`);
  for (const suite of suites) {
    const r = spawnSync(process.execPath, ['--test', suite], { cwd: APP, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
