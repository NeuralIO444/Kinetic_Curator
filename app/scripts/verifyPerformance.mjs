// node scripts/verifyPerformance.mjs <take.kcperf> [--json]
// Replay a recorded performance through a fresh resolver and check every checkpoint (the same verification the app's
// export promises). Exit 0: the take replays exactly. Exit 1: it does not (the first mismatching frame is named).
// Exit 2: the file is not a performance. `--json` prints the machine-readable result.
import { readFileSync } from 'node:fs';
import { unpackPerformance, verifyPerformance, checkPerformance, PERFORMANCE_FORMAT } from '../src/gl/performanceFile.mjs';
import { summarizeStressRecord } from '../src/curator/stressRecord.js';

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
// #1635 — the take's stress record, summarised backstage: occupancy per band and crossings per minute
// are the numbers the band edges get tuned from. Reported, never gating: the exit code stays the frame
// replay's verdict, exactly as documented above — a stress record that does not verify says so here.
const stress = perf.stress ? summarizeStressRecord(perf.stress) : null;
const crossingsPerMinute = stress && perf.frames > 0 ? +(stress.crossings / (perf.frames / 3600)).toFixed(2) : 0;
const summary = {
  ok: v.ok, file: args[0], format: perf.format === PERFORMANCE_FORMAT ? perf.format : null, version: perf.version,
  kernelVersion: perf.kernelVersion, frames: perf.frames, minutes: +(secs / 60).toFixed(2), checkpoints: v.checked,
  firstMismatchFrame: v.firstMismatchFrame, kernelMismatch: v.kernelMismatch,
  stress: stress ? { ...stress, crossingsPerMinute } : null,
};
if (asJson) console.log(JSON.stringify(summary));
else {
  console.log(`${v.ok ? 'OK  ' : 'FAIL'} ${args[0]}`);
  console.log(`     ${perf.frames} frames (${secs.toFixed(1)} s at 60 fps), ${v.checked} checkpoints, kernel ${perf.kernelVersion}${v.kernelMismatch ? ' (a DIFFERENT kernel version from this build: replay is not expected to match)' : ''}`);
  if (!v.ok) console.log(`     first mismatch at frame ${v.firstMismatchFrame}`);
  if (perf.stress && !stress) console.log('     stress: a stress record is present but unreadable');
  if (stress) {
    const o = stress.occupancy;
    const pctOf = (n) => `${Math.round((n / Math.max(1, stress.updates)) * 100)}%`;
    console.log(`     stress: ${stress.updates} updates — relax ${o.relax} (${pctOf(o.relax)}) · normal ${o.normal} (${pctOf(o.normal)}) · tighten ${o.tighten} (${pctOf(o.tighten)}), ${stress.crossings} crossings (${crossingsPerMinute}/min), ${stress.ok ? 'record verifies against its signals' : `RECORD DOES NOT VERIFY (first band mismatch #${stress.firstMismatch})`}`);
  }
}
process.exit(v.ok ? 0 : 1);
