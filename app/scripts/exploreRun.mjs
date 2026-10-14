#!/usr/bin/env node
// exploreRun.mjs — #1506 (Look Explorer E2): run the miner and write
// a run folder. The heavy path lives here, NOT in the selfcheck
// manifest (the manifest is the standing gate; a batch is a job).
//
//   node scripts/exploreRun.mjs [--seed 0x1506] [--batch 240]
//       [--finalists 12] [--keeps <ledger-export.json>] [--out <dir>]
//       [--corner <profileId|wilderness>] [--davis <CODE>]
//
// E4 (#1508): --corner aims the run at one named prospecting corner
// (default: the rotation); --davis <CODE> lets Davis's state steer
// the dealing wildness (UGLY/FLOW/… — wildnessForDavis).
//
// Run folder:
//   REPORT.md       the readable run report (yield, coverage, quota
//                   proof, spread vs the dice tray, LOIS verdicts,
//                   the Queen's evidence)
//   run.json        config + the report object (machine-readable)
//   candidates.json every baked candidate: record + features + stats
//   finalists.json  the finalist records alone (#1140 shape +
//                   provenance — what E3's tray will read)
//   verdicts.jsonl  LOIS's keep/pass ledger for the run: one line per
//                   judged finalist, judge-marked, with provenance
//   stills/         one PNG per finalist (the composed bake, full
//                   size) + its SVG source
//
// --keeps takes a JSON array of keep records in the #1140 ledger
// shape (a kc:keeps:v1 export). Without it the run measures novelty
// pairwise-only and SAYS SO in the report — the production ledger is
// browser-local and is never faked.
// Elapsed time is measured here, outside the deterministic module.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePalette } from '../src/data/palettes.js';
import {
  runMiner, formatMinerReport, renderStillPng, composeStillSvg, stillHash,
} from '../src/curator/miner.mjs';
import { queenEvidence, formatQueenSection } from '../src/curator/prospecting.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const runSeed = Number(opt('seed', '0x1506'));
const batchSize = Number(opt('batch', '240'));
const finalistCount = Number(opt('finalists', '12'));
const keepsPath = opt('keeps', null);
const keeps = keepsPath ? JSON.parse(readFileSync(keepsPath, 'utf8')) : [];
const corner = opt('corner', null);
const davisCode = opt('davis', null);

const t0 = Date.now();
const run = runMiner({ runSeed, batchSize, finalistCount, keeps, corner, davisCode });
const elapsedMs = Date.now() - t0;

// The Queen's evidence over this run's finalists (prospecting.mjs):
// her anchor is the keeps corpus handed to the run; the mined pool
// is what she weighs. Telemetry only — it steers nothing here.
const queen = queenEvidence(keeps, run.finalists.map((f) => ({
  layoutParams: f.sample.layoutParams, corner: f.sample.corner, index: f.sample.index,
})));

const outDir = opt('out', join('explorer-runs', run.runId));
mkdirSync(join(outDir, 'stills'), { recursive: true });

const stillIndex = [];
for (const [n, f] of run.finalists.entries()) {
  const palette = resolvePalette(f.sample.paletteId, null, []);
  const png = renderStillPng(f.items, palette);
  const stem = `finalist-${String(n + 1).padStart(2, '0')}-sample-${f.sample.index}`;
  writeFileSync(join(outDir, 'stills', `${stem}.png`), png);
  writeFileSync(join(outDir, 'stills', `${stem}.svg`), composeStillSvg(f.items, palette, { withBg: true }));
  stillIndex.push({ file: `stills/${stem}.png`, sample: f.sample.index, stillSha256: stillHash(png), bakeFingerprint: f.fingerprint });
}

const strip = ({ sample, features, stats, bakePath, fingerprint, fontContingent, record }) => ({
  index: sample.index, corner: sample.corner, anchor: sample.anchor,
  bakePath, fingerprint, fontContingent, features, stats, record,
});
writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(run.baked.map(strip), null, 2));
writeFileSync(join(outDir, 'finalists.json'), JSON.stringify(run.finalists.map((f) => f.record), null, 2));
writeFileSync(join(outDir, 'verdicts.jsonl'), run.verdicts.map((v) => JSON.stringify(v)).join('\n') + '\n');
writeFileSync(join(outDir, 'run.json'), JSON.stringify({
  runId: run.runId,
  config: run.config,
  elapsedMs,
  bakesPerSecond: +(run.report.yield.baked / (elapsedMs / 1000)).toFixed(2),
  report: run.report,
  queen,
  discards: run.discards,
  stills: stillIndex,
}, null, 2));
writeFileSync(join(outDir, 'REPORT.md'), [
  `# Miner run ${run.runId}`,
  '',
  '```',
  formatMinerReport(run),
  '',
  formatQueenSection(queen),
  '```',
  '',
  `Elapsed: ${(elapsedMs / 1000).toFixed(1)}s for ${run.report.yield.baked} bakes (${(run.report.yield.baked / (elapsedMs / 1000)).toFixed(2)} bakes/s, sampler + bake + measure + select, this machine).`,
  '',
  '## Stills',
  '',
  ...stillIndex.map((s) => `- sample ${s.sample}: \`${s.file}\` (still sha256 ${s.stillSha256.slice(0, 12)}…, bake fingerprint ${s.bakeFingerprint.slice(0, 12)}…)`),
  '',
].join('\n'));

console.log(formatMinerReport(run));
console.log(`\nrun folder: ${outDir} · elapsed ${(elapsedMs / 1000).toFixed(1)}s`);
