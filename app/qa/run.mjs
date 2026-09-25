// node qa/run.mjs [scenario ...] [--headed] [--open]
//   npm run qa                       run every scenario
//   npm run qa -- palette-import     run one (name = file in qa/scenarios/, no .mjs)
//   QA_URL=http://127.0.0.1:5180/Kinetic_Curator/ npm run qa     reuse a running server
// Writes app/qa-report/index.html (+ screenshots). Exit 1 if any scenario fails.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { APP, ensureServer, runScenario, writeReport } from './lib.mjs';
import { renderReport } from './report.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wanted = args.filter((a) => !a.startsWith('--'));

const dir = join(APP, 'qa', 'scenarios');
const all = readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => f.replace(/\.mjs$/, '')).sort();
const unknown = wanted.filter((w) => !all.includes(w));
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(', ')}\navailable: ${all.join(', ')}`); process.exit(2); }
const names = wanted.length ? wanted : all;

const server = await ensureServer();
const results = [];
try {
  for (const n of names) {
    const scn = (await import(pathToFileURL(join(dir, `${n}.mjs`)).href)).default;
    process.stdout.write(`▶ ${n} … `);
    const r = await runScenario({ ...scn, name: n }, server.url, { headed: flags.has('--headed') });
    results.push(r);
    console.log(r.pass ? 'PASS' : 'FAIL');
    for (const s of r.steps.filter((x) => x.kind === 'check')) console.log(`   ${s.pass ? '✓' : '✗'} ${s.label}${s.detail && !s.pass ? `\n       ${s.detail.split('\n')[0]}` : ''}`);
  }
} finally { server.stop(); }

const file = writeReport(results, renderReport);
console.log(`\nreport: ${file}`);
if (flags.has('--open')) execFile('open', [file]);
process.exit(results.every((r) => r.pass) ? 0 : 1);
