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
 *     [--tunnel 0] [--prism 0] [--flow 0] [--echoes 0] [--audio env.json]
 *     [--attack-ms 0] [--decay-ms 0] [--response linear] [--swell 1]
 *
 * --attack-ms / --decay-ms / --response shape the audio envelope through the
 * #306 ballistics follower before it modulates the recipe (defaults are the
 * identity: raw sidecar values hit the mapping unchanged, exactly as before).
 * --swell scales only the audio→glow gesture (the washout control).
 *
 * Frames vary with progress (i/(steps-1)) and the motion/ramp inputs, exactly
 * like studio.py's old per-frame loop — the placements move, the ACCUM
 * feedback loop turns motion into trails. Writes a PNG of the final buffer.
 *
 * --audio takes a JSON envelope (see "Audio envelope sidecar" in
 * docs/ACCUM.md): per-step { rms, flux, beatPulse } samples modulate
 * keep/optics and the Phase-A amounts through the shared recipe
 * (applyAudioEnvelope in accum.mjs) — the studio path only. Live-canvas
 * audio wiring waits for #224.
 *
 * Exit codes: 0 ok; 1 render failure; 2 bad args; 3 headless browser
 * unavailable (studio.py treats this as "refuse --accum" with guidance).
 */
import { readFileSync } from 'node:fs';
import { writePngFile } from './png.mjs';
// exportStill's parseRes enforces the 16384px/side + 64MP ceilings (same as
// studio.py); accumStill used to accept any --res, e.g. 30000x30000 →
// ~3.6GB pixel buffer → OOM on an unattended batch tool.
import { parseRes } from './exportStill.mjs';
import { loadAudioEnvelope, sampleEnvelope } from './audioEnvelope.mjs';
import {
  createBallisticsState,
  processBallistics,
  sanitizeBallistics,
  BALLISTICS_CURVES,
} from './audioBallistics.mjs';
import { buildSceneContract, warnUnsupportedMaterials } from './sceneContract.js';
import { resolveLayers, whenSwarmWasmReady } from '../../../studio/render.mjs';
import { getRenderCaps } from '../data/quality.js';
import { renderAccumViaGL, closeGlDriver } from './parity/glDriver.mjs';

const BROWSER_MISSING_RE = /Executable doesn't exist/;

function parseArgs(argv) {
  const out = {
    project: null, out: null, steps: 24, fps: 30, fade: 0.88, optics: 0,
    tunnel: 0, prism: 0, flow: 0, echoes: 0, audio: null,
    // #306: still-path ballistics default to the identity — existing renders
    // are byte-identical unless these flags are passed.
    attackMs: 0, decayMs: 0, response: 'linear', swell: 1,
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
    else if (a === '--tunnel') out.tunnel = num('--tunnel');
    else if (a === '--prism') out.prism = num('--prism');
    else if (a === '--flow') out.flow = num('--flow');
    else if (a === '--echoes') out.echoes = num('--echoes');
    else if (a === '--audio') out.audio = argv[++i];
    else if (a === '--attack-ms') out.attackMs = num('--attack-ms');
    else if (a === '--decay-ms') out.decayMs = num('--decay-ms');
    else if (a === '--response') {
      const v = argv[++i];
      if (!BALLISTICS_CURVES.includes(v)) {
        throw new Error(`bad --response ${v} (expected one of ${BALLISTICS_CURVES.join(', ')})`);
      }
      out.response = v;
    }
    else if (a === '--swell') out.swell = num('--swell');
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

function parseRamps(list) {
  const ramp = {};
  for (const r of list) {
    const m = /^([A-Za-z0-9_]+)=(-?[0-9.eE+-]+):(-?[0-9.eE+-]+)$/.exec(r);
    if (!m) throw new Error(`bad --ramp "${r}", expected name=from:to`);
    ramp[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return Object.keys(ramp).length ? ramp : null;
}

// --- Phase B1: audio envelope sidecar --------------------------------------
// See ./audioEnvelope.mjs for the loader/sampler. Sidecar schema
// "kc-audio-envelope/1" (written by studio/audio_envelope.py):
//   { schema, source, sr, hop_length, fps, duration, tempo_bpm,
//     frames: [{t, rms, flux, beat_phase}], beats: [t…], downbeats: [] }
// Sampled time-wise per step: t_i = (i / (steps-1)) * (steps / fps).
// A missing or malformed sidecar warns on stderr and is a real no-op.

// PNG encoding lives in ./png.mjs (shared with exportStill): it validates
// the pixel buffer and streams rows through deflate instead of allocating
// a second full-resolution filtered buffer up front (~177MB saved at 8K).

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
  await whenSwarmWasmReady(); // #175 — wasm fast path warmed up when available
  // Phase B1: optional audio envelope — sampled per step, time-wise.
  // A missing or malformed sidecar is a real no-op (warns, renders anyway).
  let audioEnv = null;
  if (args.audio) {
    audioEnv = loadAudioEnvelope(args.audio);
    if (audioEnv) {
      console.log(`  audio envelope: ${audioEnv.samples.length} frames, ${audioEnv.beats.length} beats from ${args.audio}`);
    }
  }
  const duration = args.steps / args.fps; // seconds across the sequence
  // Background: explicit flag wins, else the project's palette bg (same rule
  // as the parity candidate), same as studio.py's old accum path.
  const firstLayers = resolveLayers(doc, { caps, ramp, motion, progress: 0 });
  warnUnsupportedMaterials(firstLayers);
  const paletteBg = firstLayers[0]?.palette?.bg || '#000000';
  const background = /^#[0-9a-fA-F]{6}$/.test(args.background || '') ? args.background : paletteBg;

  const frames = [];
  const audioFrames = audioEnv ? [] : null;
  // #306: one follower shapes the sidecar envelope before the mapping.
  // Identity defaults (attack/decay 0, linear) pass the raw samples through
  // exactly; beat_phase is never shaped — the follower would smear it.
  const ballistics = createBallisticsState();
  const ballParams = sanitizeBallistics({
    attackMs: args.attackMs, releaseMs: args.decayMs, curve: args.response,
  });
  let prevT = 0;
  const stepMs = (duration / Math.max(1, args.steps - 1)) * 1000;
  try {
    for (let i = 0; i < args.steps; i++) {
      const progress = i / Math.max(1, args.steps - 1);
      const t = progress * duration;
      const resolvedLayers = resolveLayers(doc, { caps, ramp, motion, progress });
      frames.push(buildSceneContract({
        doc, resolvedLayers, caps,
        accum: { enabled: true, fade: args.fade, optics: args.optics, tunnel: args.tunnel, prism: args.prism, flow: args.flow, echoes: args.echoes, background },
      }));
      if (audioEnv) {
        const raw = sampleEnvelope(audioEnv, t);
        const dtMs = i === 0 ? stepMs : (t - prevT) * 1000;
        prevT = t;
        const shaped = processBallistics(
          ballistics, { rms: raw.rms, flux: raw.flux, beatPulse: raw.beatPulse }, dtMs, ballParams
        );
        audioFrames.push({ ...raw, ...shaped });
      }
      if ((i + 1) % 5 === 0 || i + 1 === args.steps) {
        console.log(`  accum frame ${i + 1}/${args.steps}`);
      }
    }
    const { pixels, width, height } = await renderAccumViaGL(frames, {
      width: w, height: h, bg: background, fade: args.fade, optics: args.optics,
      tunnel: args.tunnel, prism: args.prism, flow: args.flow, echoes: args.echoes,
      audio: audioFrames, swell: args.swell,
    });
    await writePngFile(args.out, pixels, width, height);
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
