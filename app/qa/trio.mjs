// The iteration gate is three of each, not the full suite.
//
//   npm run trio
//   npm run trio -- --playwright
//   npm run trio -- --qa
//
// Full selfcheck and the 19 e2e specs stay the merge gate.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export const TRIO = {
  selfcheck: [
    'src/panels/pipeline/paletteImportCopy.selfcheck.mjs',
    'src/gl/clock.workerDt.selfcheck.mjs',
    'qa/units.selfcheck.mjs',
  ],
  playwright: [
    'e2e/smoke.spec.js',
    'e2e/living-boot.spec.js',
    'e2e/director-regroup.spec.js',
  ],
  qa: [
    'palette-import',
    'wash-mode',
    'fx-finish-grain-rgb',
  ],
};

export function trioProblems(trio) {
  const problems = [];
  for (const lane of ['selfcheck', 'playwright', 'qa']) {
    if (!Array.isArray(trio[lane]) || trio[lane].length !== 3) problems.push(`${lane} must be 3`);
  }
  return problems;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: APP, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const problems = trioProblems(TRIO);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(2);
  }
  const flags = new Set(process.argv.slice(2));
  console.log('trio: 3 selfcheck, 3 playwright, 3 QA');
  for (const [lane, items] of Object.entries(TRIO)) console.log(`  ${lane}: ${items.join(', ')}`);
  for (const suite of TRIO.selfcheck) run(process.execPath, ['--test', suite]);
  if (flags.has('--playwright')) run('npx', ['playwright', 'test', ...TRIO.playwright]);
  if (flags.has('--qa')) for (const name of TRIO.qa) run(process.execPath, ['qa/run.mjs', name]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
