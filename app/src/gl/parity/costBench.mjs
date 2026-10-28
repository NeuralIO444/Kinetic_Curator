#!/usr/bin/env node
/**
 * costBench — the T4 governor cost-head benchmark harness (#1578, slice 1 of
 * the remaining T4 work: harness FIRST, then Studio training, device probes,
 * prime call site — this script is only the harness).
 *
 * Renders every recipe in costCorpus.mjs through the REAL render path (the
 * parity harness: resolveLayers → buildSceneContract → buildRenderPayload →
 * renderer.renderScene in headless Chromium), measures frame times honestly,
 * pairs each measurement with the recipe's costFeatures() vector (features +
 * mechanism estimates + device-probe descriptors, via src/hooks/costHead.mjs),
 * and emits the versioned dataset artifact a training script consumes
 * (schema: costDataset.mjs — validateDataset gates the write).
 *
 *   node src/gl/parity/costBench.mjs [--out dataset.json] [--only id,id]
 *     [--width 1280] [--height 720] [--frames 30] [--reps 3] [--max-payload-mb 512]
 *     [--gpu]
 *
 * Timing honesty:
 * - Frames are timed page-side with performance.now() around renderScene,
 *   which ends in readPixels — completed work inside the timed window (the
 *   __kcPerf convention). No rAF anywhere: vsync-censored labels would read
 *   every sub-refresh frame as identical and poison training.
 * - 2 warm-up renders per repetition are discarded (clock ramp, compile).
 * - Each repetition is ALSO wall-timed from Node; a rep whose wall-per-frame
 *   disagrees with the page median by >2.5x either way flags the row
 *   `timingSuspect` instead of silently shipping a doubtful label.
 * - A recipe whose page dies (the known giant-atlas evaluate failure) is
 *   retried once on a fresh browser, then recorded as a failed row with its
 *   error — the run continues; a dead recipe is data, not a dead harness.
 * - Probes run at session start AND end; drift beyond +/-50% on any probe
 *   flags the dataset (thermal/load drift over a long session is real).
 *
 * Labels measured in THIS sandbox are SwiftShader numbers: useful for
 * relative ordering and pipeline validation, NOT device truth. The dataset
 * stamps its environment (renderer string included) so no one can mistake
 * one environment's labels for another's. Device-truth labels come from
 * running this same harness on the Studio / real devices.
 *
 * GPU mode (--gpu): the stock Playwright headless launch falls back to
 * SwiftShader on macOS even on real hardware (observed on the Mac Studio,
 * 2026-10-28 — the probes line named SwiftShader and the simplest recipe
 * labelled ~63 ms). --gpu launches Chromium with ANGLE pointed at the
 * platform's real GPU backend (glDriver.realGpuLaunchArgs) and REFUSES to
 * measure if the renderer still reports a software rasterizer: an operator
 * who asked for device truth gets a loud failure, never quiet software
 * labels. Default runs are unchanged.
 */
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { COST_CORPUS, getCostScene, castIdsOf } from './costCorpus.mjs';
import { buildSceneContract } from '../sceneContract.js';
import { resolveLayers, whenSwarmWasmReady } from '../../../../studio/render.mjs';
import { getRenderCaps } from '../../data/quality.js';
import {
  buildRenderPayload,
  openHarnessPage,
  closeGlDriver,
  evaluateChunked,
  setGlLaunchArgs,
  realGpuLaunchArgs,
} from './glDriver.mjs';
import { costFeatures } from '../../hooks/costHead.mjs';
import { FEATURES_VERSION } from '../../curator/recipeFeatures.js';
import {
  COST_DATASET_KIND,
  COST_DATASET_VERSION,
  LABEL_DEFINITION,
  summarizeFrames,
  labelFromReps,
  validateDataset,
} from './costDataset.mjs';

function parseArgs(argv) {
  const args = {
    out: 'cost-dataset.json',
    only: null,
    width: 1280,
    height: 720,
    frames: 30,
    reps: 3,
    maxPayloadMb: 512,
    gpu: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--only')
      args.only = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--width') args.width = Number(argv[++i]);
    else if (a === '--height') args.height = Number(argv[++i]);
    else if (a === '--frames') args.frames = Number(argv[++i]);
    else if (a === '--reps') args.reps = Number(argv[++i]);
    else if (a === '--max-payload-mb') args.maxPayloadMb = Number(argv[++i]);
    else if (a === '--gpu') args.gpu = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return args;
}

const WARMUP_FRAMES = 2;
// Payloads ride glDriver's chunked ferry (the export path's solution to the
// same problem: a 108MB single evaluate argument died, per the parity
// corpus's own note). The cap that remains is page memory, not the ferry:
// atlas + mipmaps at ~4 chars per byte of base64. Refuse past it honestly
// (--max-payload-mb; the default is what a loaded SwiftShader page survives
// here — raise it on the Studio, where the memory is real).
const payloadCharsOf = (payload) => {
  const b64Len = (v) => (Array.isArray(v) ? v.reduce((n, s) => n + s.length, 0) : (v || '').length);
  let n = b64Len(payload.atlasB64) + (payload.atlasMips || []).reduce((a, m) => a + b64Len(m.b64), 0);
  n += JSON.stringify(payload.contract || {}).length + JSON.stringify(payload.cells || {}).length;
  return n;
};

let benchPage = null;
let benchClose = null;
async function ensureBenchPage() {
  if (benchPage) return benchPage;
  const h = await openHarnessPage('/parity/costBench.html');
  benchPage = h.page;
  benchClose = h.close;
  return benchPage;
}
async function resetBrowser() {
  try {
    await benchClose?.();
  } catch {
    /* already gone */
  }
  benchPage = null;
  benchClose = null;
  await closeGlDriver();
}

const probeBag = (p) => ({ fillRate: p.fillMs, instanced: p.instancedMs, blend: p.blendMs, js: p.jsMs });

async function measureRecipe(scene, args, probes) {
  const { doc } = scene;
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  const resolvedLayers = resolveLayers(doc, { caps });
  const contract = buildSceneContract({ doc, resolvedLayers, caps });
  const bg = resolvedLayers[0]?.palette?.bg || '#000000';
  const payload = buildRenderPayload(contract, { width: args.width, height: args.height, bg });
  const payloadChars = payloadCharsOf(payload);
  const maxPayloadChars = args.maxPayloadMb * 1024 * 1024;
  if (payloadChars > maxPayloadChars) {
    throw new Error(
      `payload too large for page memory: ${(payloadChars / 1048576).toFixed(1)}MB > ${args.maxPayloadMb}MB cap`,
    );
  }
  const page = await ensureBenchPage();
  await evaluateChunked(page, '__kcBenchLoad', payload);
  const reps = [];
  let suspect = false;
  for (let r = 0; r < args.reps; r++) {
    const t0 = Date.now();
    const res = await page.evaluate(([f, w]) => window.__kcBenchRun(f, w), [args.frames, WARMUP_FRAMES]);
    const wallPerFrame = (Date.now() - t0) / args.frames;
    const summary = summarizeFrames(res.timesMs);
    if (!summary) throw new Error('bench run returned no frame times');
    if (wallPerFrame > summary.p50 * 2.5 || wallPerFrame < summary.p50 * 0.4) suspect = true;
    reps.push(summary);
  }
  return {
    id: scene.id,
    description: scene.description,
    status: 'measured',
    doc,
    features: costFeatures({
      layoutParams: doc.layoutParams,
      paletteId: doc.paletteId,
      assets: castIdsOf(doc),
      canvas: { w: args.width, h: args.height },
      probes: probeBag(probes),
    }),
    canvas: { w: args.width, h: args.height },
    reps,
    labelMs: labelFromReps(reps),
    ...(suspect ? { timingSuspect: true } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenes = args.only ? args.only.map(getCostScene) : COST_CORPUS;
  console.log(
    `[costBench] ${scenes.length} recipes @ ${args.width}x${args.height}, ${args.reps} reps x ${args.frames} frames`,
  );
  if (args.gpu) {
    const gpuArgs = realGpuLaunchArgs();
    if (!gpuArgs) {
      console.error(`[costBench] --gpu has no known GPU launch args for platform ${os.platform()} — refusing to run`);
      process.exitCode = 1;
      return;
    }
    setGlLaunchArgs(gpuArgs);
    console.log(`[costBench] GPU mode: Chromium launch args ${gpuArgs.join(' ')}`);
  }
  await whenSwarmWasmReady();

  const page = await ensureBenchPage();
  const ua = await page.evaluate(() => navigator.userAgent);
  const probesStart = await page.evaluate(() => window.__kcProbes());
  console.log(
    `[costBench] probes: fill ${probesStart.fillMs}ms, instanced ${probesStart.instancedMs}ms, blend ${probesStart.blendMs}ms, js ${probesStart.jsMs}ms — ${probesStart.renderer}`,
  );
  const swiftShader = /swiftshader|llvmpipe/i.test(probesStart.renderer || '');
  if (args.gpu && swiftShader) {
    console.error(
      `[costBench] --gpu was requested but the renderer is still software (${probesStart.renderer}) — ` +
        'these labels would not be device truth. Not measuring; no dataset written.',
    );
    process.exitCode = 1;
    await resetBrowser();
    return;
  }

  const rows = [];
  for (const scene of scenes) {
    const t0 = Date.now();
    let row = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2 && !row; attempt++) {
      try {
        row = await measureRecipe(scene, args, probesStart);
      } catch (e) {
        lastError = e;
        console.error(`  [cost] ${scene.id}: attempt ${attempt} failed: ${String(e.message || e).slice(0, 200)}`);
        await resetBrowser();
      }
    }
    if (!row) {
      row = {
        id: scene.id,
        description: scene.description,
        status: 'failed',
        doc: scene.doc,
        features: costFeatures({
          layoutParams: scene.doc.layoutParams,
          paletteId: scene.doc.paletteId,
          assets: castIdsOf(scene.doc),
          canvas: { w: args.width, h: args.height },
          probes: probeBag(probesStart),
        }),
        canvas: { w: args.width, h: args.height },
        error: String((lastError && lastError.message) || lastError).slice(0, 500),
      };
    }
    rows.push(row);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (row.status === 'measured') {
      console.log(
        `  [cost] ${row.id}: label ${row.labelMs} ms (rep p90s: ${row.reps.map((r) => r.p90).join(', ')})${row.timingSuspect ? ' TIMING-SUSPECT' : ''} [${secs}s]`,
      );
    } else {
      console.log(`  [cost] ${row.id}: FAILED — ${row.error.slice(0, 120)} [${secs}s]`);
    }
  }

  let probesEnd = null;
  let probeDrift = false;
  try {
    const p2 = await ensureBenchPage();
    probesEnd = await p2.evaluate(() => window.__kcProbes());
    for (const k of ['fillMs', 'instancedMs', 'blendMs', 'jsMs']) {
      const ratio = probesEnd[k] / probesStart[k];
      if (ratio > 1.5 || ratio < 0.67) probeDrift = true;
    }
  } catch {
    probesEnd = null;
  }

  let gitSha = null;
  try {
    gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    /* not a repo run */
  }

  const dataset = {
    kind: COST_DATASET_KIND,
    version: COST_DATASET_VERSION,
    generatedAt: new Date().toISOString(),
    generator: { script: 'src/gl/parity/costBench.mjs', gitSha, node: process.version },
    environment: {
      userAgent: ua,
      renderer: probesStart.renderer,
      vendor: probesStart.vendor,
      webglVersion: probesStart.webglVersion,
      swiftShader,
      platform: `${os.platform()} ${os.arch()}`,
      cpus: os.cpus().length,
      totalMemGB: +(os.totalmem() / 1073741824).toFixed(1),
      probesStart,
      probesEnd,
      probeDrift,
    },
    method: {
      label: LABEL_DEFINITION,
      framesPerRep: args.frames,
      reps: args.reps,
      warmupFrames: WARMUP_FRAMES,
      timing:
        'page performance.now() around readback-forced renderScene (upper-bound frame cost, readPixels included — the __kcPerf convention); Node wall-clock cross-check per rep, >2.5x disagreement flags timingSuspect',
      vsync: 'none — tight render loop, no rAF; labels are uncensored render cost',
    },
    featureSchema: {
      source: 'costFeatures() from src/hooks/costHead.mjs (recipeFeatures + mechanismFeatures + probe descriptors)',
      featuresVersion: FEATURES_VERSION,
      probeKeys:
        'features.probe uses the runtime bag names { fillRate, instanced, blend, js } carrying the measured probe ms for the fixed PROBE_SPEC work (costDataset.mjs)',
    },
    rows,
  };

  const check = validateDataset(dataset);
  if (!check.ok) {
    console.error(
      '[costBench] dataset FAILED schema validation — not writing:\n' + check.errors.map((e) => `  - ${e}`).join('\n'),
    );
    process.exitCode = 1;
    await resetBrowser();
    return;
  }
  await writeFile(args.out, JSON.stringify(dataset, null, 2));
  const measured = rows.filter((r) => r.status === 'measured').sort((a, b) => a.labelMs - b.labelMs);
  console.log(
    `[costBench] wrote ${args.out}: ${rows.length} rows (${measured.length} measured, ${rows.length - measured.length} failed)`,
  );
  console.log('[costBench] label order (cheap → heavy): ' + measured.map((r) => `${r.id} ${r.labelMs}ms`).join(' · '));
  await resetBrowser();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await resetBrowser().catch(() => {});
  process.exitCode = 1;
});
