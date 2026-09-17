#!/usr/bin/env node
/**
 * exportStill.mjs — Phase 5 (#191). Node-only.
 *
 * FINAL still export via GPU readback. Renders a project offscreen at any
 * resolution (1x … 8K) through the SHARED WebGL2 pipeline
 * (app/src/gl/renderer.mjs via parity/glDriver.mjs) and writes a PNG.
 *
 * Pure function of (project, seed, resolution): it never touches the live
 * store. The old flip-then-restore mechanism (`applyUncapped` /
 * `restoreFromSnapshot` in the app) is deleted, not called — `--uncapped`
 * simply resolves FINAL_CAPS here, exactly like the parity candidate.
 *
 * Shares its render core with the parity candidate (candidate.mjs):
 * project doc → resolveLayers → buildSceneContract → renderExportViaGL.
 * At 1x the export is pixel-identical to the candidate by construction
 * (same function, same inputs); the resolution is the only difference.
 * That is #176's before/after rule, structurally guaranteed.
 *
 * Pixels cross page.evaluate in 16MB chunks (renderExportViaGL), so 8K
 * readbacks (~132MB RGBA / ~177MB base64) don't hit the ~100MB evaluate
 * limit. The PNG encoder streams rows through zlib: peak memory is one
 * full-res RGBA copy plus the compressed output — no second raw buffer.
 *
 * Usage:
 *   node app/src/gl/exportStill.mjs <project.json> --out out.png
 *     [--res 3840x2160|4k|8k|2|1] [--seed N] [--seeds a,b,c] [--uncapped]
 *     [--background #rrggbb] [--ramp param=from:to ...] [--motion name|none]
 *     [--progress 0..1] [--time SEC]
 *
 * --motion defaults to "none" (the authored params, un-ramped) — the same
 * default the old studio.py stills path used. "auto" applies the drift/swarm
 * preset ramp evaluated at --progress, like the old video path.
 *
 * --seeds renders one PNG per seed ("batch edition: same path per seed").
 * --out may contain "{seed}"; otherwise "-<seed:08x>" is inserted before
 * the extension.
 *
 * --time is accepted for studio.py video compatibility but the GL pipeline
 * is progress-driven: --progress drives ramps/motion exactly like
 * accumStill.mjs. (The SVG path's lifeDrift "breath" is a function of wall
 * time and is not modeled in the GL contract — same as the parity
 * candidate today.)
 *
 * Exit codes: 0 ok; 1 render failure; 2 bad args; 3 headless browser
 * unavailable (studio.py treats this as "refuse" with guidance).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSceneContract, warnUnsupportedMaterials } from './sceneContract.js';
import { resolveLayers, whenSwarmWasmReady } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { renderExportViaGL, closeGlDriver } from './parity/glDriver.mjs';
import { writePngFile } from './png.mjs';

const BROWSER_MISSING_RE = /Executable doesn't exist/;

// Same ceilings as studio.py: an export farm runs unattended on whatever a
// project file says. 8K is 33MP — comfortably inside. The 4k/8k presets keep
// the canvas aspect (1000x700 = 10:7), matching studio.py's RES_PRESETS.
const MAX_DIM = 16384;
const MAX_PIXELS = 64_000_000;
const RES_SHORTHAND = { '4k': [3840, 2688], '8k': [7680, 5376] };

export function isBrowserMissingError(e) {
  return BROWSER_MISSING_RE.test(String((e && e.message) || e || ''));
}

export function parseRes(spec) {
  const s = String(spec).toLowerCase().trim();
  let w, h;
  if (RES_SHORTHAND[s]) {
    [w, h] = RES_SHORTHAND[s];
  } else if (/x/.test(s)) {
    const [ws, hs] = s.split('x');
    w = parseInt(ws, 10); h = parseInt(hs, 10);
  } else {
    const mul = Number(s);
    if (!Number.isFinite(mul) || mul <= 0) throw new Error(`bad --res ${spec}`);
    w = Math.round(1000 * mul); h = Math.round(700 * mul);
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error(`bad --res ${spec}: expected WxH (e.g. 3840x2160), 4k, 8k, or a scale factor`);
  }
  if (w > MAX_DIM || h > MAX_DIM) {
    throw new Error(`--res ${w}x${h} exceeds the ${MAX_DIM}px per-side limit`);
  }
  if (w * h > MAX_PIXELS) {
    throw new Error(`--res ${w}x${h} is ${(w * h / 1e6).toFixed(1)}MP, over the ${(MAX_PIXELS / 1e6).toFixed(0)}MP limit`);
  }
  return { w, h };
}

function parseArgs(argv) {
  const out = {
    project: null, out: null, res: '1', seed: null, seeds: null,
    uncapped: false, background: null, ramps: [], motion: 'none',
    progress: 0, time: 0,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (name) => {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error(`bad ${name} ${argv[i]}`);
      return v;
    };
    if (a === '--out') out.out = argv[++i];
    else if (a === '--res') out.res = argv[++i];
    else if (a === '--seed') out.seed = num('--seed') | 0;
    else if (a === '--seeds') {
      out.seeds = argv[++i].split(',').map((s) => {
        const n = Number(s.trim());
        if (!Number.isFinite(n)) throw new Error(`bad --seeds entry "${s}"`);
        return n | 0;
      });
      if (!out.seeds.length) throw new Error('--seeds needs at least one seed');
    }
    else if (a === '--uncapped') out.uncapped = true;
    else if (a === '--background') out.background = argv[++i];
    else if (a === '--ramp') out.ramps.push(argv[++i]);
    else if (a === '--motion') out.motion = argv[++i];
    else if (a === '--progress') out.progress = num('--progress');
    else if (a === '--time') out.time = num('--time');
    else if (a.startsWith('--')) throw new Error(`unknown arg "${a}"`);
    else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('expected exactly one project JSON path');
  if (!out.out) throw new Error('--out is required');
  if (out.seed != null && out.seeds) throw new Error('--seed and --seeds are mutually exclusive');
  out.project = rest[0];
  return out;
}

function parseRamps(list) {
  const ramp = {};
  for (const r of list) {
    const m = /^([A-Za-z0-9_]+)=(-?[0-9.eE+-]+):(-?[0-9.eE+-]+)$/.exec(r);
    if (!m) throw new Error(`bad --ramp "${r}", expected name=from:to`);
    ramp[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return Object.keys(ramp).length ? ramp : null;
}

/**
 * The shared export core (#191): project doc → PNG pixels via the GL
 * pipeline. Same scene→contract→render path as the parity candidate
 * (candidate.mjs renderCandidate) — the ONLY difference from a 1x preview
 * render is width/height. Never touches any live store: caps, seed, and
 * background are all explicit arguments.
 *
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>} top-first RGBA
 */
export async function renderExport({
  doc, seed = null, width, height,
  uncapped = false, background = null, ramp = null, motion = 'none', progress = 0,
} = {}) {
  if (!doc || typeof doc !== 'object') throw new Error('[export] doc required');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('[export] width/height required');
  }
  const d = seed != null ? { ...doc, seed: seed >>> 0 } : doc;
  const caps = getRenderCaps(d.quality || 'balanced', !!uncapped);
  await whenSwarmWasmReady(); // #175 — wasm fast path warmed up when available
  const resolvedLayers = resolveLayers(d, {
    caps,
    ramp: ramp || null,
    motion: motion && motion !== 'none' ? motion : null,
    progress,
  });
  const contract = buildSceneContract({ doc: d, resolvedLayers, caps });
  warnUnsupportedMaterials(resolvedLayers);
  // Background: explicit flag wins, else the project's palette bg (same rule
  // as the parity candidate and accumStill).
  const paletteBg = resolvedLayers[0]?.palette?.bg || '#000000';
  const bg = /^#[0-9a-fA-F]{6}$/.test(background || '') ? background : paletteBg;
  return renderExportViaGL(contract, { width, height, bg });
}

function outPathForSeed(template, seed) {
  const hex = (seed >>> 0).toString(16).padStart(8, '0');
  if (template.includes('{seed}')) return template.replaceAll('{seed}', hex);
  const dot = template.lastIndexOf('.');
  return dot > 0
    ? `${template.slice(0, dot)}-${hex}${template.slice(dot)}`
    : `${template}-${hex}`;
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`[exportStill] ${e.message}`);
    process.exitCode = 2;
    return;
  }
  let size;
  try {
    size = parseRes(args.res);
  } catch (e) {
    console.error(`[exportStill] ${e.message}`);
    process.exitCode = 2;
    return;
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(args.project, 'utf8'));
  } catch (e) {
    console.error(`[exportStill] cannot read project ${args.project}: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  let ramp;
  try {
    ramp = parseRamps(args.ramps);
  } catch (e) {
    console.error(`[exportStill] ${e.message}`);
    process.exitCode = 2;
    return;
  }
  // --time is accepted for studio.py video compatibility; the GL still is
  // progress-driven (see header). progress defaults to 0 (a still).
  if (args.progress < 0 || args.progress > 1 || !Number.isFinite(args.progress)) {
    console.error(`[exportStill] bad --progress ${args.progress}: expected 0..1`);
    process.exitCode = 2;
    return;
  }
  const seeds = args.seeds ?? (args.seed != null ? [args.seed] : [null]);
  try {
    for (const seed of seeds) {
      const outPath = args.seeds ? outPathForSeed(args.out, seed) : args.out;
      const { pixels, width, height } = await renderExport({
        doc, seed, width: size.w, height: size.h,
        uncapped: args.uncapped, background: args.background,
        ramp, motion: args.motion, progress: args.progress,
      });
      await writePngFile(outPath, pixels, width, height);
      console.log(outPath);
    }
  } catch (e) {
    if (isBrowserMissingError(e)) {
      console.error(
        '[exportStill] refusing: headless Chromium is not installed.\n' +
        '  FINAL export runs on the GPU via headless Chromium (#191).\n' +
        '  Install it with:  cd app && npx playwright install chromium'
      );
      process.exitCode = 3;
      return;
    }
    console.error(`[exportStill] ${e.message || e}`);
    process.exitCode = 1;
  } finally {
    await closeGlDriver().catch(() => {});
  }
}

// Only run the CLI when executed directly — the selfcheck imports the pure
// pieces (parseRes, renderExport, writePngFile) without side effects.
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
