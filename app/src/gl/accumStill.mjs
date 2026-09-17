#!/usr/bin/env node
/**
 * accumStill.mjs — Phase 4 (#190). Node-only.
 *
 * Trail-still export through the SHARED ACCUM recipe (app/src/gl/accum.mjs).
 * This is the entrypoint `studio.py render --accum` calls: the Python side
 * must not reimplement the recipe (per #169's rule it shares this code or
 * refuses --accum).
 *
 * Usage:
 *   node app/src/gl/accumStill.mjs <project.json> --out out.png
 *     [--steps 24] [--fps 30] [--fade 0.88] [--optics 0] [--res 1000x700|2]
 *     [--seed N] [--uncapped] [--background #rrggbb]
 *     [--ramp param=from:to ...] [--motion auto]
 *
 * Frames vary with progress (i/(steps-1)) and the motion/ramp inputs, exactly
 * like studio.py's old per-frame loop — the placements move, the ACCUM
 * feedback loop turns motion into trails. Writes a PNG of the final buffer.
 *
 * Exit codes: 0 ok; 1 render failure; 2 bad args; 3 headless browser
 * unavailable (studio.py treats this as "refuse --accum" with guidance).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildSceneContract, warnUnsupportedMaterials } from './sceneContract.js';
import { resolveLayers } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { renderAccumViaGL, closeGlDriver } from './parity/glDriver.mjs';

const BROWSER_MISSING_RE = /Executable doesn't exist/;

function parseArgs(argv) {
  const out = {
    project: null, out: null, steps: 24, fps: 30, fade: 0.88, optics: 0,
    res: '1', seed: null, uncapped: false, background: null, ramps: [], motion: 'auto',
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
    else if (a === '--steps') out.steps = Math.max(2, Math.round(num('--steps')));
    else if (a === '--fps') out.fps = Math.max(1, Math.round(num('--fps')));
    else if (a === '--fade') out.fade = num('--fade');
    else if (a === '--optics') out.optics = num('--optics');
    else if (a === '--res') out.res = argv[++i];
    else if (a === '--seed') out.seed = num('--seed') | 0;
    else if (a === '--uncapped') out.uncapped = true;
    else if (a === '--background') out.background = argv[++i];
    else if (a === '--ramp') out.ramps.push(argv[++i]);
    else if (a === '--motion') out.motion = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown arg "${a}"`);
    else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('expected exactly one project JSON path');
  if (!out.out) throw new Error('--out is required');
  out.project = rest[0];
  return out;
}

function parseRes(spec) {
  let w, h;
  if (/x/i.test(String(spec))) {
    const [ws, hs] = String(spec).toLowerCase().split('x');
    w = parseInt(ws, 10); h = parseInt(hs, 10);
  } else {
    const mul = Number(spec);
    if (!Number.isFinite(mul) || mul <= 0) throw new Error(`bad --res ${spec}`);
    w = Math.round(1000 * mul); h = Math.round(700 * mul);
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error(`bad --res ${spec}: expected WxH or a scale factor`);
  }
  return { w, h };
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

// Minimal PNG encoder (8-bit RGBA, no interlace): IHDR + IDAT(zlib) + IEND.
function writePng(path, pixels, w, h) {
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const td = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const cd = Buffer.alloc(4); cd.writeUInt32BE(crc(Buffer.concat([td, data])));
    return Buffer.concat([len, td, data, cd]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const px = Buffer.from(pixels);
  for (let y = 0; y < h; y++) {
    // Pixels arrive top-first; PNG rows are top-first. Filter byte 0 (none).
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`[accumStill] ${e.message}`);
    process.exitCode = 2;
    return;
  }
  const { w, h } = (() => {
    try {
      return parseRes(args.res);
    } catch (e) {
      console.error(`[accumStill] ${e.message}`);
      process.exitCode = 2;
      return { w: 0, h: 0 };
    }
  })();
  if (!w || !h) return;
  // --fps is accepted for studio.py compatibility but does not affect a still:
  // the still composites N frames at progress 0..1, not a timed sequence.
  let doc;
  try {
    doc = JSON.parse(readFileSync(args.project, 'utf8'));
  } catch (e) {
    console.error(`[accumStill] cannot read project ${args.project}: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  if (args.seed != null) doc = { ...doc, seed: args.seed >>> 0 };

  const caps = getRenderCaps(doc.quality || 'balanced', args.uncapped);
  let ramp;
  try {
    ramp = parseRamps(args.ramps);
  } catch (e) {
    console.error(`[accumStill] ${e.message}`);
    process.exitCode = 2;
    return;
  }
  const motion = args.motion && args.motion !== 'none' ? args.motion : null;
  // Background: explicit flag wins, else the project's palette bg (same rule
  // as the parity candidate), same as studio.py's old accum path.
  const firstLayers = resolveLayers(doc, { caps, ramp, motion, progress: 0 });
  warnUnsupportedMaterials(firstLayers);
  const paletteBg = firstLayers[0]?.palette?.bg || '#000000';
  const background = /^#[0-9a-fA-F]{6}$/.test(args.background || '') ? args.background : paletteBg;

  const frames = [];
  try {
    for (let i = 0; i < args.steps; i++) {
      const progress = i / Math.max(1, args.steps - 1);
      const resolvedLayers = resolveLayers(doc, { caps, ramp, motion, progress });
      frames.push(buildSceneContract({
        doc, resolvedLayers, caps,
        accum: { enabled: true, fade: args.fade, optics: args.optics, background },
      }));
      if ((i + 1) % 5 === 0 || i + 1 === args.steps) {
        console.log(`  accum frame ${i + 1}/${args.steps}`);
      }
    }
    const { pixels, width, height } = await renderAccumViaGL(frames, {
      width: w, height: h, bg: background, fade: args.fade, optics: args.optics,
    });
    writePng(args.out, pixels, width, height);
    console.log(args.out);
  } catch (e) {
    if (BROWSER_MISSING_RE.test(e.message || '')) {
      console.error(
        '[accumStill] refusing --accum: headless Chromium is not installed.\n' +
        '  The ACCUM recipe runs on the GPU via headless Chromium (shared recipe,\n' +
        '  #190). Install it with:  cd app && npx playwright install chromium'
      );
      process.exitCode = 3;
      return;
    }
    console.error(`[accumStill] ${e.message || e}`);
    process.exitCode = 1;
  } finally {
    await closeGlDriver().catch(() => {});
  }
}

main(process.argv.slice(2));
