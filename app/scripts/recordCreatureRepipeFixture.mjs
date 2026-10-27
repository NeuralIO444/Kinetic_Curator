// recordCreatureRepipeFixture.mjs — #1694 slice 1, STEP 0: record the creature-bearing replay gate's fixture take.
//
//   node scripts/recordCreatureRepipeFixture.mjs
//
// WHY THIS EXISTS. The standing replay gate's fixture (recordReplayGateFixture.mjs) scripts a session that never
// raises creatureCount, so its take carries no creatures and the gate cannot see a creature divergence. The
// repipe (spawning moves from the App-side tap channel into the resolver) needs its proof recorded BEFORE the
// code moves: a take with the moth line AND the dish creature populated, recorded through the channel exactly as
// it stands today — App's frame tap feeding the singleton trackers (curator/formationLive.js, curator/spawnLive.js),
// their decisions riding the next frame's resolver input through the resolveTap providers, the performance
// recorder on the resolve taps. After the repipe, gl/creatureGate.selfcheck.mjs replays this file through the
// new path and every checkpoint must match, unmodified. This fixture is NEVER re-recorded by the repipe: if the
// new path cannot replay it, that is the slice's kill criterion firing, not a re-pin event.
//
// The session is scripted ( Matt's instrument, deterministic ): seed 4242, 901 frames (0..900, 16 checkpoints),
// creatureCount 2 → 3 at frame 300 → 2 at frame 750, the stress band NORMAL → TIGHTEN at 300 → NORMAL at 600 →
// RELAX at 750, handed to the formation rule and stamped on the input exactly as liveLoop stamps the stress
// tracker's band. Births, formation holds, limb growth, Davis birth traits and the dish hosting all happen inside.
//
// Recording must be deterministic: the session runs TWICE in this process and the packed bytes' sha256 must
// match, or nothing is written — a gate whose fixture wanders is worse than no gate.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLiveResolver } from '../src/gl/liveResolve.mjs';
import {
  withResolveTap,
  setResolveTap,
  setResolveOutputTap,
  setFormedProvider,
  setLimbsProvider,
  setTraitsProvider,
  setDishHostedProvider,
  setDishPressureProvider,
  getFormedPins,
  getLimbPairs,
  getPinTraits,
  getDishHosted,
  getDishPressure,
} from '../src/gl/resolveTap.mjs';
import { createPerformanceRecorder, checkPerformance, packPerformance } from '../src/gl/performanceFile.mjs';
import {
  observeFormation,
  resetFormation,
  getFormedPins as liveFormed,
  getLimbPairs as liveLimbs,
  getPinTraits as liveTraits,
  getDishHosted as liveHosted,
  getDishPressures as livePressures,
} from '../src/curator/formationLive.js';
import { observeSpawn, resetSpawn } from '../src/curator/spawnLive.js';
import { BAND_NORMAL, BAND_TIGHTEN, BAND_RELAX } from '../src/curator/stress.js';
import { DEFAULT_LAYOUT_PARAMS } from '../src/data/layout-modes.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(APP, 'src/gl/fixtures');
const FRAMES = 901; // frames 0..900 at a nominal 60 fps, ending on a checkpoint (every 60)
const SEED = 4242;

const bandAt = (f) => (f < 300 ? BAND_NORMAL : f < 600 ? BAND_TIGHTEN : f < 750 ? BAND_NORMAL : BAND_RELAX);
const countAt = (f) => (f < 300 ? 2 : f < 750 ? 3 : 2);

const L = (id, extra = {}) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1, ...extra });

/** One scripted session, wired as App + liveLoop wire the instrument today. Returns { perf, stats }. */
function recordSession() {
  resetFormation();
  resetSpawn();
  setFormedProvider(liveFormed);
  setLimbsProvider(liveLimbs);
  setTraitsProvider(liveTraits);
  setDishHostedProvider(liveHosted);
  setDishPressureProvider(livePressures);
  const recorder = createPerformanceRecorder();
  const resolver = withResolveTap(createLiveResolver);
  setResolveTap((i) => recorder.onInput(i));
  setResolveOutputTap((o) => recorder.onOutput(o));
  const stable = {
    canvasW: 1000,
    canvasH: 700,
    layers: [L('lyr-a')],
    activeLayerId: 'lyr-a',
    layerSnapshots: {},
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
    phraseWrapGen: 0,
    reducedMotion: false,
    quality: 'balanced',
    perfTier1: false,
    assetThin: false,
    slowRender: false,
    effectiveScale: [0.5, 1.5],
    effectiveAlpha: [20, 100],
    assetAttach: {},
    attractor: null,
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS, mode: 'random', count: 380, particleCount: 150 },
  };
  let pins = []; // the store's dishPins, written by the spawner (as App's tap writes them)
  let t = 0;
  let last = null;
  let maxPins = 0;
  for (let f = 0; f < FRAMES; f++) {
    t += 16.7;
    const band = bandAt(f);
    const input = {
      ...stable,
      seed: SEED,
      loopTimeMs: t,
      dtSec: 1 / 60,
      band,
      smoothed: 0.5 + 0.5 * Math.sin(f / 240),
      creatureCount: countAt(f),
      dishPins: pins,
      dishFormed: getFormedPins(),
      dishLimbs: getLimbPairs(),
      dishTraits: getPinTraits(),
      dishHosted: getDishHosted(),
      dishPressure: getDishPressure(),
    };
    const out = resolver.resolveLayers(input);
    // the frame tap, as App wires it: formation first (it reads the frame), then spawn (its homes are next frame's pins)
    observeFormation(input, out, () => band);
    const homes = observeSpawn(input, out, { count: countAt(f), formed: liveFormed(), band });
    if (homes) pins = homes;
    if (pins.length > maxPins) maxPins = pins.length;
    last = out;
  }
  setResolveTap(null);
  setResolveOutputTap(null);
  setFormedProvider(null);
  setLimbsProvider(null);
  setTraitsProvider(null);
  setDishHostedProvider(null);
  setDishPressureProvider(null);
  resolver.dispose();
  const perf = recorder.finish();
  const flat = (last || []).flatMap((e) => e.items || []);
  const stats = {
    maxPins,
    finalPins: pins.length,
    moths: flat.filter((i) => i._creature && !(typeof i.key === 'string' && i.key.startsWith('dish:'))).length,
    dishItems: flat.filter((i) => i._creature && typeof i.key === 'string' && i.key.startsWith('dish:')).length,
    births: perf.inputs.steps.filter((s) => s.k && Array.isArray(s.k.dishTraits) && s.k.dishTraits.some(Boolean))
      .length,
    hosted: perf.inputs.steps.some((s) => s.k && Array.isArray(s.k.dishHosted) && s.k.dishHosted.some(Boolean)),
    grew: perf.inputs.steps.some((s) => s.k && Array.isArray(s.k.dishLimbs) && s.k.dishLimbs.some((n) => n >= 2)),
  };
  return { perf, stats };
}

const t0 = Date.now();
const a = recordSession();
const b = recordSession();
const bytesA = await packPerformance(checkPerformance(a.perf));
const bytesB = await packPerformance(checkPerformance(b.perf));
const shaA = createHash('sha256').update(bytesA).digest('hex');
const shaB = createHash('sha256').update(bytesB).digest('hex');
if (shaA !== shaB) throw new Error(`recording is not deterministic: ${shaA} vs ${shaB} — fixture NOT written`);

const { perf, stats } = a;
console.log('session stats:', JSON.stringify(stats));
if (!(stats.maxPins >= 2))
  throw new Error('auto spawn did not find at least two homes — fixture would not exercise births');
if (!(stats.moths > 0)) throw new Error('no moths in the final frame — fixture carries no moth line');
if (!(stats.dishItems > 0)) throw new Error('no dish creature in the final frame — fixture carries no dish family');
if (!(stats.births >= 1)) throw new Error('no Davis-stamped birth recorded in the take');
if (!stats.hosted) throw new Error('no pin ever hosted the dish creature in the take');
if (!stats.grew) throw new Error('no pin ever grew its second pair of wings in the take');
if (perf.frames !== FRAMES) throw new Error(`take holds ${perf.frames} frames, want ${FRAMES}`);

const head = execSync('git rev-parse --short HEAD', { cwd: APP, encoding: 'utf8' }).trim();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'creatureRepipe.kcperf'), bytesA);
writeFileSync(
  join(OUT_DIR, 'creatureRepipe.PROVENANCE.md'),
  `# Creature repipe gate fixture — provenance (#1694 slice 1, step 0)

- **What:** one scripted 15-second performance with the creature channel UP — auto spawn finding homes, the
  formation rule forming moths, Davis stamping traits at birth, the first formed pin hosting the dish creature —
  recorded through the app's real recording taps (the performance recorder on the resolve taps), with the
  channel wired exactly as the app wires it today: App's frame tap feeding the singleton trackers
  (curator/formationLive.js / curator/spawnLive.js), their decisions riding the next frame's resolver input
  through the resolveTap providers.
- **File:** \`creatureRepipe.kcperf\` — ${bytesA.length} bytes, sha256 \`${shaA}\`.
- **Frames:** ${perf.frames} (0..${perf.frames - 1}), ${perf.checkpoints.length} checkpoints (every 60 frames).
- **Seed:** ${SEED}, constant. Canvas 1000x700, one content layer, layout mode 'random', count 380 marks,
  palette 'bone' — the performanceCreatures session's dish (count 380 marks here, for crowds deep enough to
  grow a second pair of wings), lengthened and fully stamped (band + hosted + pressure ride the input as
  liveLoop stamps them).
- **Script:** creatureCount 2 → 3 at frame 300 → 2 at frame 750. Stress band NORMAL → TIGHTEN at frame 300 →
  NORMAL at frame 600 → RELAX at frame 750 (a pure function of the frame, handed to the formation rule and
  stamped on the input as liveLoop stamps the stress tracker's band). Session outcome at record time:
  up to ${stats.maxPins} standing homes, ${stats.births} recorded birth-stamp steps, second-pair growth seen,
  dish hosting seen, final frame carrying ${stats.moths} moth marks and ${stats.dishItems} dish-creature marks.
- **Recorded with:** \`node scripts/recordCreatureRepipeFixture.mjs\` on commit \`${head}\` — the PRISTINE
  pre-repipe code. The script records the session twice and refuses to write unless the two packed takes are
  byte-identical (sha256 above is both runs').
- **Re-record:** NEVER by the repipe. This fixture is the slice's contract: \`gl/creatureGate.selfcheck.mjs\`
  replays it through the repiped resolver and every checkpoint must match unmodified. If a later intentional
  behaviour change ever moves creature replay, that change re-records in its own PR and says so, with the
  reason — the gate's rule since #1638.
`,
);
console.log(
  `fixture: ${bytesA.length} bytes, ${perf.frames} frames, ${perf.checkpoints.length} checkpoints, sha256 ${shaA}, recorded twice identically in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
