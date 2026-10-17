#!/usr/bin/env node
/**
 * measureWingWarp — Phase 2 S2 cost measurement for the wing warp (engine/wingWarp.mjs).
 *
 *   node src/gl/debug/measureWingWarp.mjs [--width 1920] [--height 1080] [--frames 20] [--reps 3] [--out warp-cost.json]
 *
 * Method, in the #1622 harness lineage (gl/parity/costBench.mjs): scenes are resolved through the REAL
 * live path (liveResolve → buildSceneContract → buildRenderPayload) and rendered in headless Chromium
 * on the costBench page, timed page-side with performance.now() around a readback-forced renderScene
 * (the __kcPerf convention — no rAF, warmups discarded, Node wall-clock cross-check per rep).
 *
 * Scenes: the FOUR-CREATURE CAP (four formed dish pins, four moths) at 1080p, twice — REST (beat 0,
 * no meshes: the pre-S2 frame) and BENT (peak beat, every wing skinned). The warp's marginal GPU cost
 * is BENT − REST in the same environment; the resolver-side CPU (skeleton builds + skinning feed) is
 * timed Node-side over the same frames.
 *
 * HONESTY: this sandbox renders through SwiftShader. These numbers order the work and prove the
 * pipeline; they are NOT iPad numbers and do not settle the 2.0 ms GPU/frame budget — the Studio run
 * does. The verdict line below says so every time it prints.
 */
import { writeFile } from 'node:fs/promises';
import { createLiveResolver } from '../liveResolve.mjs';
import { buildSceneContract } from '../sceneContract.js';
import { buildRenderPayload, openHarnessPage, closeGlDriver, evaluateChunked } from '../parity/glDriver.mjs';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';
import { MOTH } from '../../engine/creature.js';

const args = { width: 1920, height: 1080, frames: 20, reps: 3, out: null, noGpu: false };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--width') args.width = Number(process.argv[++i]);
  else if (a === '--height') args.height = Number(process.argv[++i]);
  else if (a === '--frames') args.frames = Number(process.argv[++i]);
  else if (a === '--reps') args.reps = Number(process.argv[++i]);
  else if (a === '--out') args.out = process.argv[++i];
  else if (a === '--no-gpu') args.noGpu = true;
  else throw new Error(`unknown arg: ${a}`);
}
const WARMUP_FRAMES = 2;
const PEAK_MS = MOTH.flapMs / 4;
const FULL = MOTH.growFrames + 1;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const PINS = [
  { x: 0.22, y: 0.35 }, { x: 0.72, y: 0.30 }, { x: 0.38, y: 0.72 }, { x: 0.82, y: 0.68 },
].map((p) => ({ x: Math.round(p.x * args.width), y: Math.round(p.y * args.height) }));

function sceneInput(loopTimeMs) {
  return {
    canvasW: args.width, canvasH: args.height,
    layers: [{ id: 'a', name: 'a', visible: true, layerBlendMode: 'normal', layerOpacity: 1 }],
    activeLayerId: 'a', layerSnapshots: {}, seed: 1234, seedOffsets: null, paletteId: 'bone', paletteOverrides: null,
    userPalettes: [], layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 60, particleCount: 60 }, caGrid: null,
    enabledAssets: null, assetWeightOverrides: {}, customAssets: [], quality: 'balanced', lockedParams: {}, batchPaused: false,
    focusSwap: false, loopTimeMs, dtSec: 1 / 60, perfClampOverride: null, perfTier1: false, assetThin: false,
    slowRender: false, scaleMul: 1, alphaBoost: 0, effectiveScale: [0.5, 1.5], effectiveAlpha: [20, 100], phraseWrapGen: 0, attractor: null,
    dishPins: PINS, dishFormed: PINS.map(() => true), assetAttach: {},
  };
}

/** Resolve one scene end-state (grown in at rest, then one frame at the scene's beat) + time the resolver. */
function resolveScene(loopTimeMs) {
  const r = createLiveResolver();
  let out;
  for (let i = 0; i < FULL; i++) out = r.resolveLayers(sceneInput(0));
  const cpu = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    out = r.resolveLayers(sceneInput(loopTimeMs));
    cpu.push(performance.now() - t0);
  }
  r.dispose();
  return { resolved: out, cpuMsPerFrame: median(cpu) };
}

function contractOf(resolved) {
  return buildSceneContract({
    doc: {
      seed: 1234, seedOffsets: null, quality: 'balanced', perfTier1: false,
      layers: [{ id: 'a', name: 'a', visible: true }], light: null, squash: 0, assetKineme: null, kinemeTime: 0,
      palette: resolved[0]?.palette || null, regionKinemes: null, customAssets: [],
      assetThin: false, perfClamp: false, slowRender: false, reducedMotion: false, regionBudget: null,
    },
    resolvedLayers: resolved, caps: null, accum: null,
  });
}

let page = null; let closePage = null;
async function ensurePage() {
  if (page) return page;
  const h = await openHarnessPage('/parity/costBench.html');
  page = h.page; closePage = h.close;
  return page;
}

async function measureGpu(contract, bg) {
  const payload = buildRenderPayload(contract, { width: args.width, height: args.height, bg });
  const pg = await ensurePage();
  await evaluateChunked(pg, '__kcBenchLoad', payload);
  const reps = [];
  let suspect = false;
  for (let r = 0; r < args.reps; r++) {
    const t0 = Date.now();
    const res = await pg.evaluate(([f, w]) => window.__kcBenchRun(f, w), [args.frames, WARMUP_FRAMES]);
    const wallPerFrame = (Date.now() - t0) / args.frames;
    const times = [...res.timesMs].sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)];
    if (wallPerFrame > p50 * 2.5 || wallPerFrame < p50 * 0.4) suspect = true;
    reps.push(p50);
  }
  return { p50Ms: median(reps), reps, ...(suspect ? { timingSuspect: true } : {}) };
}

const meshCensus = (contract) => {
  const meshed = contract.instances.filter((i) => i.mesh);
  return {
    instances: contract.instances.length,
    meshedItems: meshed.length,
    meshVertices: meshed.reduce((n, i) => n + i.mesh.pos.length / 2, 0),
    meshIndices: meshed.reduce((n, i) => n + i.mesh.idx.length, 0),
  };
};

async function main() {
  console.log(`[measureWingWarp] 4-creature cap @ ${args.width}x${args.height}, ${args.reps} reps x ${args.frames} frames`);
  const rest = resolveScene(0);
  const bent = resolveScene(PEAK_MS);
  const restContract = contractOf(rest.resolved);
  const bentContract = contractOf(bent.resolved);
  const bg = rest.resolved[0]?.palette?.bg || '#000000';
  console.log(`[measureWingWarp] rest census: ${JSON.stringify(meshCensus(restContract))}`);
  console.log(`[measureWingWarp] bent census: ${JSON.stringify(meshCensus(bentContract))}`);
  console.log(`[measureWingWarp] resolver CPU/frame at cap: rest ${rest.cpuMsPerFrame.toFixed(3)} ms, bent ${bent.cpuMsPerFrame.toFixed(3)} ms (Node, this machine)`);
  if (args.noGpu) {
    const report = {
      kind: 'kc-wing-warp-measure', slice: 'S2', creatures: 4, mode: 'cpu+census only (--no-gpu)',
      canvas: { w: args.width, h: args.height },
      resolverCpuMsPerFrame: { rest: rest.cpuMsPerFrame, bent: bent.cpuMsPerFrame },
      census: { rest: meshCensus(restContract), bent: meshCensus(bentContract) },
      budget: { gpuMsPerFrame1080pIpadClass: 2.0, verdict: 'GPU not measured in this mode — see the full run / the Studio run' },
    };
    console.log('[measureWingWarp] --no-gpu: census + resolver CPU only');
    if (args.out) { await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(`[measureWingWarp] wrote ${args.out}`); }
    return;
  }
  const restGpu = await measureGpu(restContract, bg);
  const bentGpu = await measureGpu(bentContract, bg);
  const pg = await ensurePage();
  const env = await pg.evaluate(() => ({ ua: navigator.userAgent, probes: window.__kcProbes ? window.__kcProbes() : null }));
  const delta = bentGpu.p50Ms - restGpu.p50Ms;
  const report = {
    kind: 'kc-wing-warp-measure', slice: 'S2', creatures: 4,
    canvas: { w: args.width, h: args.height },
    environment: { ua: env.ua, renderer: env.probes?.renderer || 'unknown', note: 'headless Chromium / SwiftShader — INDICATIVE ONLY, not iPad truth; the Studio run settles the 2.0 ms budget' },
    resolverCpuMsPerFrame: { rest: rest.cpuMsPerFrame, bent: bent.cpuMsPerFrame },
    gpuMsPerFrame: { rest: restGpu, bent: bentGpu, warpDelta: delta },
    census: { rest: meshCensus(restContract), bent: meshCensus(bentContract) },
    budget: { gpuMsPerFrame1080pIpadClass: 2.0, bentTotalVsBudget: bentGpu.p50Ms, verdict: 'IN THIS ENVIRONMENT ONLY — see environment.note' },
  };
  console.log(`[measureWingWarp] GPU/frame p50: rest ${restGpu.p50Ms.toFixed(3)} ms, bent ${bentGpu.p50Ms.toFixed(3)} ms, warp delta ${delta.toFixed(3)} ms`);
  console.log(`[measureWingWarp] renderer: ${report.environment.renderer}`);
  console.log('[measureWingWarp] NOTE: SwiftShader numbers — indicative ordering only. The 2.0 ms iPad budget is settled by the Studio run, not by this sandbox.');
  if (args.out) { await writeFile(args.out, JSON.stringify(report, null, 2)); console.log(`[measureWingWarp] wrote ${args.out}`); }
  try { await closePage?.(); } catch { /* already gone */ }
  await closeGlDriver();
}

await main();
