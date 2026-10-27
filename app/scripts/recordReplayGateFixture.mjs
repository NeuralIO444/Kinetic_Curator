// recordReplayGateFixture.mjs — #1638: record the CI replay gate's fixture take.
//
//   node scripts/recordReplayGateFixture.mjs
//
// Records one scripted 60-second performance through the REAL taps the app records with — the
// performance recorder on the resolve taps, the spectrum recorder on the spectrum tap — with the
// spectrum marks' dials up and a deterministic synthetic hearing (a fake analyser whose dB curve is
// a pure function of the frame; no clock, no RNG, no room). The session mirrors
// performanceFile.selfcheck's: same stable store shape, sliders moving mid-take, a seed change.
//
// The output is src/gl/fixtures/replayGate.kcperf (the take file format itself) plus the provenance
// note beside it. Recording must be deterministic: run this twice and the file's sha256 must not
// change. If it does, the fixture is not written — a gate whose fixture wanders is worse than no gate.
//
// RE-RECORDING IS A DELIBERATE ACT. When an intentional behaviour change moves the replay, re-record
// in the same PR and say so in its body, with the reason. Never re-record to make a red gate green
// without naming the behaviour that changed — that is the hope this gate exists to replace.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLiveResolver } from '../src/gl/liveResolve.mjs';
import { withResolveTap, setResolveTap, setResolveOutputTap } from '../src/gl/resolveTap.mjs';
import {
  createPerformanceRecorder,
  checkPerformance,
  packPerformance,
  CHECKPOINT_EVERY,
} from '../src/gl/performanceFile.mjs';
import { stepSpectrum, readSpectrum, setSpectrumTap } from '../src/gl/spectrumLive.mjs';
import { createSpectrumRecorder, checkSpectrumRecord } from '../src/curator/spectrumRecord.js';
import { DEFAULT_LAYOUT_PARAMS } from '../src/data/layout-modes.js';
import { defaultPattern } from '../src/state/patternTrack.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(APP, 'src/gl/fixtures');
const FRAMES = 3601; // frames 0..3600 at a nominal 60 fps: a 60-second take, ending on a checkpoint
const SEED = 1234;
const DT_MS = [16.7, 16.7, 33.3, 8, 16.7, 50, 16.7, 12.5];

// The hearing: two travelling bumps over a slow swell, a pure function of the frame.
const analyserFor = (f) => ({
  frequencyBinCount: 1024,
  fftSize: 2048,
  getFloatFrequencyData(a) {
    for (let i = 0; i < a.length; i++) {
      const x = i / a.length;
      const bump = Math.exp(-(((x - (0.25 + 0.3 * Math.sin(f / 480))) / 0.07) ** 2));
      const bump2 = Math.exp(-(((x - (0.62 + 0.18 * Math.sin(f / 300 + 1.7))) / 0.05) ** 2));
      a[i] = -92 + 56 * bump + 44 * bump2 + 10 * Math.sin(f / 90 + x * 9);
    }
  },
  getFloatTimeDomainData(a) {
    a.fill(0);
  },
});

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });
// the marks are UP for the whole take, as the issue specifies: the fixture carries its spectrum
// section (#1534) — the section playback will hear — while the gate's hash comparison covers the
// resolver chain the take's checkpoints are made of
const lp = (over = {}) => ({
  ...DEFAULT_LAYOUT_PARAMS,
  count: 220,
  particleCount: 100,
  spectrumScale: 0.8,
  spectrumDisplace: 0.35,
  spectrumColour: 0.5,
  spectrumMap: 0,
  ...over,
});
const snap = (seed, over = {}) => ({
  seed,
  paletteId: 'bone',
  paletteOverrides: null,
  layoutParams: lp(over),
  caGrid: null,
  enabledAssets: null,
});
const stable = {
  canvasW: 1000,
  canvasH: 700,
  layers: [
    L('lyr-a'),
    L('lyr-b', { patch: { mode: 'field', to: 'lyr-a', strength: 1 } }),
    L('fx', { type: 'fx' }),
    L('p', { type: 'pattern', pattern: defaultPattern('QUILT', 7) }),
  ],
  activeLayerId: 'lyr-a',
  layerSnapshots: { 'lyr-b': snap(999, { mode: 'poisson', count: 24 }) },
  seed: SEED,
  seedOffsets: null,
  paletteId: 'bone',
  paletteOverrides: null,
  userPalettes: [],
  caGrid: null,
  enabledAssets: null,
  assetWeightOverrides: {},
  customAssets: [],
  lockedParams: {},
  batchPaused: false,
  focusSwap: false,
  perfClampOverride: null,
  scaleMul: 1,
  alphaBoost: 0,
  effectiveScaleY: undefined,
  phraseWrapGen: 0,
  reducedMotion: false,
};

let frame = 0;
const recorder = createPerformanceRecorder();
const spectrumRec = createSpectrumRecorder({ getFrame: () => frame });
spectrumRec.note(true); // the dials are up from the first frame
setSpectrumTap((state) => spectrumRec.sample(state.smooth));
const resolver = withResolveTap(createLiveResolver);
setResolveTap((i) => recorder.onInput(i));
setResolveOutputTap((o) => recorder.onOutput(o));

let params = lp({ mode: 'swarm', behave: 'scatter' });
let t = 0;
const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  frame = f;
  const dt = DT_MS[f % DT_MS.length];
  t += dt;
  if (f === 900) params = { ...params, count: 260 }; // the artist moves a slider
  if (f === 2000) params = { ...params, mode: 'gaussian' }; // and changes mode
  stepSpectrum(analyserFor(f), 48000, dt); // the hearing first (the tap samples it), then the resolve
  resolver.resolveLayers({
    ...stable,
    layoutParams: params,
    seed: f > 3000 ? 77 : SEED,
    effectiveScale: [0.5, 1.5 + 0.2 * Math.sin(f / 9)],
    effectiveAlpha: [20 + 10 * Math.sin(f / 13), 100],
    attractor: f % 40 < 20 ? { x: 400 + (f % 7), y: 300, strength: 1 } : null,
    quality: 'balanced',
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    loopTimeMs: t,
    dtSec: dt / 1000,
  });
}
setResolveTap(null);
setResolveOutputTap(null);
setSpectrumTap(null);
resolver.dispose();

const spectrum = spectrumRec.finish();
if (!spectrum || !checkSpectrumRecord(spectrum)) throw new Error('the spectrum section did not record');
const perf = checkPerformance({ ...recorder.finish(), spectrum });
if (perf.frames !== FRAMES) throw new Error(`take holds ${perf.frames} frames, want ${FRAMES}`);
const bytes = await packPerformance(perf);
const sha = createHash('sha256').update(bytes).digest('hex');
const head = execSync('git rev-parse --short HEAD', { cwd: APP, encoding: 'utf8' }).trim();

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'replayGate.kcperf'), bytes);
writeFileSync(
  join(OUT_DIR, 'replayGate.PROVENANCE.md'),
  `# Replay gate fixture — provenance (#1638)

- **What:** one scripted 60-second performance, recorded through the app's real recording taps
  (the performance recorder on the resolve taps, the spectrum recorder on the spectrum tap).
- **File:** \`replayGate.kcperf\` — ${bytes.length} bytes, sha256 \`${sha}\`.
- **Frames:** ${perf.frames} (0..${perf.frames - 1}), ${perf.checkpoints.length} checkpoints (every ${CHECKPOINT_EVERY} frames).
- **Seed:** ${SEED} (changed to 77 at frame 3001, as the script's artist changes it).
- **Look:** layout params from the generator script: swarm/scatter, count 220→260 at frame 900,
  mode gaussian from frame 2000, a QUILT pattern layer, palette 'bone'.
- **The hearing:** a deterministic synthetic analyser (two travelling dB bumps, a pure function of
  the frame — no clock, no RNG). The spectrum marks' dials are up for the whole take
  (SCALE 0.8 · DISPLACE 0.35 · COLOUR 0.5), so the file carries its spectrum section (#1534) —
  the hearing playback will reproduce. The gate's checkpoint comparison covers the resolver
  chain, which is what a take's hashes are made of; the marks ride the render contract, not
  the resolver, and never entered the chain.
- **Recorded with:** \`node scripts/recordReplayGateFixture.mjs\` on commit \`${head}\`.
- **Re-record:** run the same command. It is deterministic — the sha256 must be identical unless
  behaviour changed. When an intentional behaviour change moves the replay, re-record in the same
  PR and say so in its body, with the reason. Never re-record just to make a red gate green.
`,
);
console.log(
  `fixture: ${bytes.length} bytes, ${perf.frames} frames, ${perf.checkpoints.length} checkpoints, sha256 ${sha}, recorded in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
