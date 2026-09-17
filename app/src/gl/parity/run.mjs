#!/usr/bin/env node
// Parity runner — Phase 0 (#186).
//
// Renders each corpus scene through the reference (SVG) path and a
// candidate path, then pixel-diffs them.
//
//   node src/gl/parity/run.mjs [--candidate svg|gl] [--scene <id>] [--width 400] [--json]
//
// --candidate svg  self-parity: reference vs itself. Must PASS; proves the
//                  harness (corpus + renderer + diff) is sound. This is the
//                  only mode available until Phase 1 implements the GL side.
// --candidate gl   reference vs GL candidate (Phase 1+, #187). Currently
//                  fails loudly via candidate.mjs.
//
// Exit code 0 iff every scene passes; non-zero otherwise (CI-friendly).
import { CORPUS, getScene, POLICIES } from './corpus.mjs';
import { renderReference } from './reference.mjs';
import { renderCandidate, closeCandidate, CANDIDATE_READY } from '../candidate.mjs';
import { diffPixels, formatReport } from './diff.mjs';

function parseArgs(argv) {
  const out = { candidate: 'svg', scene: null, width: 400, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--candidate') out.candidate = argv[++i];
    else if (a === '--scene') out.scene = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--json') out.json = true;
    else throw new Error(`[parity] unknown arg "${a}"`);
  }
  if (!['svg', 'gl'].includes(out.candidate)) throw new Error('[parity] --candidate must be svg|gl');
  if (!Number.isFinite(out.width) || out.width <= 0) throw new Error('[parity] --width must be positive');
  return out;
}

async function runScene(scene, candidate, width) {
  const ref = await renderReference(scene, { width });
  let cand;
  if (candidate === 'svg') {
    cand = ref; // self-parity: proves the harness, no GL code in Phase 0
  } else {
    if (!CANDIDATE_READY) await renderCandidate(scene, { width }); // throws descriptively
    cand = await renderCandidate(scene, { width });
  }
  if (cand.width !== ref.width || cand.height !== ref.height) {
    throw new Error(
      `[parity:${scene.id}] dimension mismatch (ref ${ref.width}x${ref.height}, cand ${cand.width}x${cand.height})`
    );
  }
  const report = diffPixels(ref.pixels, cand.pixels, ref.width, ref.height, POLICIES[scene.policy]);
  return { id: scene.id, policy: scene.policy, candidate, ...report, failedSample: report.failedSample };
}

async function main(argv) {
  const { candidate, scene, width, json } = parseArgs(argv);
  const scenes = scene ? [getScene(scene)] : CORPUS;
  const results = [];
  try {
  for (const s of scenes) {
    const r = await runScene(s, candidate, s.width || width);
    results.push(r);
    if (!json) console.log(formatReport(r, `${r.id}/${candidate}`));
  }
  const failed = results.filter((r) => !r.pass);
  if (json) {
    console.log(JSON.stringify({
      candidate, width, scenes: results.length, failed: failed.map((r) => r.id),
      results: results.map(({ failedSample, ...rest }) => rest),
    }, null, 2));
  } else {
    console.log(`[parity] ${results.length - failed.length}/${results.length} scenes pass (candidate=${candidate})`);
  }
  if (failed.length > 0) {
    for (const r of failed) {
      if (!json && r.failedSample.length > 0) {
        const p = r.failedSample[0];
        console.log(`[parity:${r.id}] first failing pixel @(${p.x},${p.y}) Δ=${p.maxDelta} ref=${p.a} cand=${p.b}`);
      }
    }
    process.exitCode = 1;
  }
  } finally {
    if (candidate === 'gl') await closeCandidate(); // release headless Chromium
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
