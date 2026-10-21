// node scripts/refreshFixtureCheckpoints.mjs <take.kcperf> [--write] [--strip key1,key2,...] [--json]
//
// The sanctioned re-record for a replay fixture when a change adds layout params (the #1183 / #1694 S3 / travel
// re-records): replay the fixture's OWN recorded inputs through this tree's resolver and rewrite its CHECKPOINTS
// ONLY. The inputs, the spectrum section and every other field are kept verbatim — unlike re-running a recorder
// script, which spreads the current defaults and so changes the inputs.
//
// It prints the evidence a re-record's provenance note needs:
//   originalVerifies  the file's own checkpoints still verify on this tree (true = nothing to re-record)
//   diffLeaves        deep-diff of old vs new file; nonCheckpointDiffs must be [] (only checkpoint hashes moved)
//   deterministic     the refresh ran twice and produced byte-identical files
//   inSha / outSha    sha256 of the old and the refreshed packed file
// --strip k1,k2     the strip proof: delete these keys from DEFAULT_LAYOUT_PARAMS before replaying. With the new
//                   keys stripped, originalVerifies must be true — the divergence is the keys, only the keys.
// --write           overwrite the file with the refreshed take (refused unless deterministic and the deep diff
//                   touches checkpoint hashes only).
//
// Exit 0: done (or nothing to do). Exit 1: refused (non-deterministic, or the diff touched more than checkpoints).
// Exit 2: usage / not a performance file.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEFAULT_LAYOUT_PARAMS } from '../src/data/layout-modes.js';
import { unpackPerformance, packPerformance, checkPerformance, verifyPerformance, createHashChain } from '../src/gl/performanceFile.mjs';
import { createLiveResolver } from '../src/gl/liveResolve.mjs';
import { replayInputs } from '../src/engine/kernel/replay/inputLog.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Recompute a performance's checkpoints by replaying its own inputs. Returns a new performance object. */
export function refreshCheckpoints(perf, { resolverFactory = createLiveResolver } = {}) {
  const p = checkPerformance(JSON.parse(JSON.stringify(perf)));
  const resolver = resolverFactory();
  if (p.initialState && !resolver.restoreState(p.initialState.snapshot)) throw new Error('initialState snapshot refused');
  const chain = createHashChain(p.initialState ? p.initialState.chainSeed : null);
  const want = new Set(p.checkpoints.map((c) => c.frame));
  const fresh = [];
  let f = 0;
  try {
    for (const input of replayInputs(p.inputs)) {
      chain.push(resolver.resolveLayers(input));
      if (want.has(f)) fresh.push({ frame: f, hash: chain.value() });
      f += 1;
    }
  } finally {
    if (typeof resolver.dispose === 'function') resolver.dispose();
  }
  const out = JSON.parse(JSON.stringify(perf));
  out.checkpoints = fresh;
  return out;
}

/** Every differing leaf path between two JSON values. */
export function diffLeaves(a, b, path = '$', acc = []) {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    if (!Object.is(a, b)) acc.push(path);
    return acc;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffLeaves(a[k], b[k], `${path}.${k}`, acc);
  return acc;
}

/** The full refresh with its evidence. bytes: the packed file. */
export async function refreshFile(bytes, { strip = [] } = {}) {
  const saved = {};
  for (const k of strip) { if (k in DEFAULT_LAYOUT_PARAMS) { saved[k] = DEFAULT_LAYOUT_PARAMS[k]; delete DEFAULT_LAYOUT_PARAMS[k]; } }
  try {
    const perf = await unpackPerformance(new Uint8Array(bytes));
    const v = verifyPerformance(perf);
    const a = refreshCheckpoints(perf);
    const b = refreshCheckpoints(perf);
    const packedA = await packPerformance(a);
    const packedB = await packPerformance(b);
    const diffs = diffLeaves(perf, a);
    return {
      perf: a,
      packed: packedA,
      report: {
        strip,
        originalVerifies: v.ok,
        originalFirstMismatch: v.firstMismatchFrame,
        frames: perf.frames,
        checkpoints: a.checkpoints.length,
        diffLeaves: diffs.length,
        nonCheckpointDiffs: diffs.filter((d) => !/^\$\.checkpoints\.\d+\.hash$/.test(d)),
        deterministic: sha(packedA) === sha(packedB),
        inSha: sha(bytes),
        outSha: sha(packedA),
        outBytes: packedA.length,
      },
    };
  } finally {
    Object.assign(DEFAULT_LAYOUT_PARAMS, saved);
  }
}

const isMain = import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('refreshFixtureCheckpoints.mjs');
if (isMain && !process.argv[1]?.endsWith('.selfcheck.mjs')) {
  const argv = process.argv.slice(2);
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--strip');
  const write = argv.includes('--write');
  const asJson = argv.includes('--json');
  const si = argv.indexOf('--strip');
  const strip = si >= 0 && argv[si + 1] ? argv[si + 1].split(',').filter(Boolean) : [];
  if (files.length !== 1) {
    console.error('usage: node scripts/refreshFixtureCheckpoints.mjs <take.kcperf> [--write] [--strip k1,k2] [--json]');
    process.exit(2);
  }
  let res;
  try {
    res = await refreshFile(readFileSync(files[0]), { strip });
  } catch (e) {
    console.error(`not a performance file: ${e && e.message ? e.message : e}`);
    process.exit(2);
  }
  const r = res.report;
  if (asJson) console.log(JSON.stringify(r));
  else {
    console.log(`${files[0]}: ${r.frames} frames, ${r.checkpoints} checkpoints`);
    console.log(`  original checkpoints verify on this tree${strip.length ? ` (stripped: ${strip.join(', ')})` : ''}: ${r.originalVerifies}`);
    console.log(`  deep diff: ${r.diffLeaves} leaves, ${r.nonCheckpointDiffs.length} outside checkpoint hashes`);
    console.log(`  deterministic: ${r.deterministic}`);
    console.log(`  sha256 ${r.inSha} → ${r.outSha} (${r.outBytes} bytes)`);
  }
  if (write) {
    if (!r.deterministic || r.nonCheckpointDiffs.length) {
      console.error('refused: the refresh must be deterministic and touch checkpoint hashes only');
      process.exit(1);
    }
    if (r.diffLeaves === 0) console.log('  nothing to write: the file already matches this tree');
    else { writeFileSync(files[0], res.packed); console.log(`  wrote ${files[0]}`); }
  }
}
