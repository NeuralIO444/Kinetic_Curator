#!/usr/bin/env node
/**
 * costStudioRun — the #1578 Studio session as ONE command.
 *
 * Before this script, finishing the governor cost head (T4) meant a person
 * sitting at the Mac Studio through four manual steps: build, run the
 * benchmark harness recipe by recipe, train, judge. This runner chains the
 * pieces that already exist (plus studio/train_cost_head.py and the replay
 * judge) so the session is:
 *
 *   cd app && npm run cost:studio
 *
 * Stages (each fails LOUD and stops the chain — no silent partial states):
 *   1. build   `npm run build` (the tree must build before its labels mean
 *              anything; --skip-build to reuse a build you trust).
 *   2. bench   src/gl/parity/costBench.mjs over the FULL 26-recipe corpus
 *              with the four device probes (the harness's own machinery —
 *              nothing here reimplements measurement).
 *   3. gate    the dataset is re-validated (costDataset.mjs), and the run
 *              FAILS if any recipe failed to measure, if the probes drifted
 *              >±50% across the session, or if any row's timing cross-check
 *              flagged it suspect (overrides: --allow-drift /
 *              --allow-suspect, both printed when used). Provenance is
 *              printed from the dataset itself: a SwiftShader run says so,
 *              in a banner, every time — sandbox labels validate machinery
 *              only and must never masquerade as Studio labels.
 *   4. train   studio/train_cost_head.py (additivity gate, grouped splits,
 *              quantile fit, calibration, artifact export). Exit 3 from the
 *              trainer is the ADDITIVE path, not an error: the chain
 *              continues to the judge, which prints the formal verdict.
 *   5. judge   src/gl/parity/costJudge.mjs prints the ship/kill verdict;
 *              the runner's exit code IS the judge's (0 SHIP, 1 KILL,
 *              3 ADDITIVE-KILL).
 *
 * Outputs (defaults; all overridable):
 *   dataset  app/cost-datasets/cost-dataset.json  (gitignored working data)
 *   model    studio/cost-model.json               (the runtime artifact)
 *   report   studio/cost-model.report.json        (the trainer's report)
 *
 * Mac notes: the bench drives Chromium through Playwright (the repo's
 * @playwright/test). If Playwright's own Chromium build is not installed,
 * either run `npm run test:e2e:install` once, or point --chromium at a
 * Chrome/Chromium binary (forwarded as KC_CHROMIUM_PATH). The trainer
 * needs a Python 3 with xgboost (--python to choose the interpreter).
 *
 *   node scripts/costStudioRun.mjs [--out dataset.json] [--model-out m.json]
 *     [--dataset-only] [--skip-build] [--python python3] [--chromium path]
 *     [--width 1280] [--height 720] [--frames 30] [--reps 3]
 *     [--max-payload-mb 512] [--allow-drift] [--allow-suspect]
 *     [--target-fps 30] [--only id,id]  (diagnostics: a subset bench —
 *     the chain runs, but no verdict on a subset carries weight)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataset } from '../src/gl/parity/costDataset.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(APP, '..');
const BENCH = join(APP, 'src/gl/parity/costBench.mjs');
const JUDGE = join(APP, 'src/gl/parity/costJudge.mjs');
const TRAINER = join(ROOT, 'studio/train_cost_head.py');

function parseArgs(argv) {
  const args = {
    out: join(APP, 'cost-datasets', 'cost-dataset.json'),
    modelOut: join(ROOT, 'studio', 'cost-model.json'),
    reportOut: null,
    datasetOnly: false,
    skipBuild: false,
    python: 'python3',
    chromium: null,
    targetFps: 30,
    allowDrift: false,
    allowSuspect: false,
    bench: {},
  };
  const benchKeys = { '--width': 'width', '--height': 'height', '--frames': 'frames', '--reps': 'reps', '--max-payload-mb': 'maxPayloadMb', '--only': 'only' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = resolve(argv[++i]);
    else if (a === '--model-out') args.modelOut = resolve(argv[++i]);
    else if (a === '--report-out') args.reportOut = resolve(argv[++i]);
    else if (a === '--dataset-only') args.datasetOnly = true;
    else if (a === '--skip-build') args.skipBuild = true;
    else if (a === '--python') args.python = argv[++i];
    else if (a === '--chromium') args.chromium = argv[++i];
    else if (a === '--target-fps') args.targetFps = Number(argv[++i]);
    else if (a === '--allow-drift') args.allowDrift = true;
    else if (a === '--allow-suspect') args.allowSuspect = true;
    else if (benchKeys[a]) args.bench[benchKeys[a]] = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!args.reportOut) args.reportOut = args.modelOut.replace(/\.json$/, '') + '.report.json';
  return args;
}

function stage(name, cmd, cmdArgs, opts = {}) {
  console.log(`\n[cost-studio] ══ stage: ${name} ══`);
  console.log(`[cost-studio] $ ${cmd} ${cmdArgs.join(' ')}`);
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  if (res.error) throw new Error(`stage ${name}: could not launch ${cmd}: ${res.error.message}`);
  return res.status;
}

function fail(msg) {
  console.error(`\n[cost-studio] FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[cost-studio] ${e.message}`);
    process.exit(2);
  }

  if (!args.skipBuild) {
    const st = stage('build', 'npm', ['run', 'build'], { cwd: APP });
    if (st !== 0) fail(`npm run build exited ${st} — labels from an unbuildable tree mean nothing`);
  } else {
    console.log('[cost-studio] build skipped (--skip-build)');
  }

  const benchArgs = [BENCH, '--out', args.out];
  for (const [k, v] of Object.entries(args.bench)) {
    benchArgs.push(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, String(v));
  }
  const env = { ...process.env };
  if (args.chromium) env.KC_CHROMIUM_PATH = args.chromium;
  const benchStatus = stage('bench (full corpus + device probes)', process.execPath, benchArgs, { cwd: APP, env });
  if (benchStatus !== 0) fail(`costBench exited ${benchStatus} — no dataset was blessed; see its output above`);

  // ── gate: re-validate and interrogate the dataset that was just written ──
  console.log('\n[cost-studio] ══ stage: dataset gate ══');
  let ds;
  try {
    ds = JSON.parse(readFileSync(args.out, 'utf8'));
  } catch (e) {
    fail(`cannot read the dataset at ${args.out}: ${e.message}`);
  }
  const check = validateDataset(ds);
  if (!check.ok) fail(`dataset fails the kc-cost-dataset gate:\n  - ${check.errors.join('\n  - ')}`);
  const failedRows = ds.rows.filter((r) => r.status === 'failed');
  const suspectRows = ds.rows.filter((r) => r.timingSuspect);
  const env2 = ds.environment || {};
  console.log(`[cost-studio] provenance: renderer = ${env2.renderer}`);
  console.log(`[cost-studio] platform = ${env2.platform} · swiftShader = ${env2.swiftShader} · probeDrift = ${env2.probeDrift}`);
  if (env2.swiftShader) {
    console.log('[cost-studio] ╔══════════════════════════════════════════════════════════════╗');
    console.log('[cost-studio] ║  SOFTWARE RENDERING (SwiftShader): these labels validate the  ║');
    console.log('[cost-studio] ║  machinery ONLY. They are NOT Studio/device truth and a model  ║');
    console.log('[cost-studio] ║  trained on them must never ship.                              ║');
    console.log('[cost-studio] ╚══════════════════════════════════════════════════════════════╝');
  }
  if (failedRows.length) {
    fail(`${failedRows.length} recipe(s) FAILED to measure (${failedRows.map((r) => r.id).join(', ')}) — ` +
      'refusing to continue on a partial dataset. The dataset file stays on disk for diagnosis.');
  }
  if (env2.probeDrift && !args.allowDrift) {
    fail('device probes drifted >±50% across the session (thermal/load drift) — labels are untrustworthy. Re-run, or pass --allow-drift to accept them knowingly.');
  }
  if (env2.probeDrift && args.allowDrift) console.log('[cost-studio] WARNING: probe drift accepted via --allow-drift');
  if (suspectRows.length && !args.allowSuspect) {
    fail(`${suspectRows.length} row(s) have suspect timing (${suspectRows.map((r) => r.id).join(', ')}) — page and wall clocks disagreed >2.5x. Re-run, or pass --allow-suspect to accept them knowingly.`);
  }
  if (suspectRows.length && args.allowSuspect) console.log('[cost-studio] WARNING: suspect-timing rows accepted via --allow-suspect');
  console.log(`[cost-studio] dataset OK: ${ds.rows.length} measured rows -> ${args.out}`);
  if (args.bench.only) {
    console.log('[cost-studio] WARNING: --only subset bench — this dataset is a diagnostic slice, NOT the full corpus; any downstream verdict is machinery validation only.');
  }

  if (args.datasetOnly) {
    console.log('\n[cost-studio] DONE (dataset only, --dataset-only).');
    process.exit(0);
  }

  // ── train ──
  const trainStatus = stage('train (additivity gate -> quantile fit -> artifact)',
    args.python, [TRAINER, args.out, '--out', args.modelOut, '--report', args.reportOut], { cwd: ROOT });
  let modelArg = [];
  if (trainStatus === 3) {
    console.log('[cost-studio] trainer reports ADDITIVE — continuing to the judge for the formal verdict (no artifact).');
  } else if (trainStatus !== 0) {
    fail(`trainer exited ${trainStatus} — see its message above. The dataset at ${args.out} is intact; the trainer can be re-run standalone.`);
  } else {
    modelArg = ['--model', args.modelOut];
  }

  // ── judge ──
  const judgeStatus = stage('judge (governor replay: ship / kill)',
    process.execPath, [JUDGE, '--dataset', args.out, ...modelArg, '--target-fps', String(args.targetFps)], { cwd: APP });

  console.log('\n[cost-studio] ══ session summary ══');
  console.log(`[cost-studio] dataset: ${args.out}`);
  console.log(`[cost-studio] model:   ${modelArg.length ? args.modelOut : '(none — additive or untrained)'}`);
  console.log(`[cost-studio] report:  ${args.reportOut}`);
  process.exit(judgeStatus === null ? 1 : judgeStatus);
}

main();
