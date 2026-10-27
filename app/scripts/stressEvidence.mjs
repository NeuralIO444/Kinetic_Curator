// node scripts/stressEvidence.mjs <take.kcperf> [more.kcperf …] [--json]
// #1635 — the band edges' evidence from real takes: per-take and pooled occupancy, crossings per minute, the smoothed
// stress distribution, and the verdict the issue's kill criteria allow. Prints a Markdown block to paste on the PR
// that tunes (or keeps) the 0.28 / 0.72 edges. Exit 0 always for readable input; exit 2 when no file is given.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { unpackPerformance, checkPerformance } from '../src/gl/performanceFile.mjs';
import { stressTakeEvidence, pooledStressEvidence, stressEvidenceMarkdown } from '../src/curator/stressEvidence.js';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
if (!files.length) {
  console.error('usage: node scripts/stressEvidence.mjs <take.kcperf> [more.kcperf …] [--json]');
  process.exit(2);
}

const takes = [];
for (const f of files) {
  try {
    const perf = await unpackPerformance(new Uint8Array(readFileSync(f)));
    checkPerformance(perf);
    takes.push(stressTakeEvidence(perf.stress));
  } catch (e) {
    takes.push({ ok: false, reason: `not a performance file: ${e && e.message ? e.message : String(e)}` });
  }
}

if (asJson) {
  const strip = ({ _tally, ...rest }) => rest;
  console.log(JSON.stringify({ takes: takes.map((t, i) => ({ file: files[i], ...strip(t) })), pooled: pooledStressEvidence(takes) }, null, 2));
} else {
  console.log(stressEvidenceMarkdown(takes, files.map((f) => basename(f))));
}
