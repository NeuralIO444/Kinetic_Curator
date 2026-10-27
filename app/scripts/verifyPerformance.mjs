// node scripts/verifyPerformance.mjs <take.kcperf> [--json]
// Replay a recorded performance through a fresh resolver and check every checkpoint (the same verification the app's
// export promises). Exit 0: the take replays exactly. Exit 1: it does not (the first mismatching frame is named).
// Exit 2: the file is not a performance. `--json` prints the machine-readable result.
import { readFileSync } from 'node:fs';
import {
  unpackPerformance,
  verifyPerformance,
  checkPerformance,
  PERFORMANCE_FORMAT,
} from '../src/gl/performanceFile.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
if (args.length !== 1) {
  console.error('usage: node scripts/verifyPerformance.mjs <take.kcperf> [--json]');
  process.exit(2);
}

let perf;
try {
  perf = await unpackPerformance(new Uint8Array(readFileSync(args[0])));
  checkPerformance(perf);
} catch (e) {
  const msg = e && e.message ? e.message : String(e);
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(`not a performance file: ${msg}`);
  process.exit(2);
}

const v = verifyPerformance(perf);
const secs = perf.frames / 60;
const summary = {
  ok: v.ok,
  file: args[0],
  format: perf.format === PERFORMANCE_FORMAT ? perf.format : null,
  version: perf.version,
  kernelVersion: perf.kernelVersion,
  frames: perf.frames,
  minutes: +(secs / 60).toFixed(2),
  checkpoints: v.checked,
  firstMismatchFrame: v.firstMismatchFrame,
  kernelMismatch: v.kernelMismatch,
};
if (asJson) console.log(JSON.stringify(summary));
else {
  console.log(`${v.ok ? 'OK  ' : 'FAIL'} ${args[0]}`);
  console.log(
    `     ${perf.frames} frames (${secs.toFixed(1)} s at 60 fps), ${v.checked} checkpoints, kernel ${perf.kernelVersion}${v.kernelMismatch ? ' (a DIFFERENT kernel version from this build: replay is not expected to match)' : ''}`,
  );
  if (!v.ok) console.log(`     first mismatch at frame ${v.firstMismatchFrame}`);
}
process.exit(v.ok ? 0 : 1);
