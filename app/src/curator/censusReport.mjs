// censusReport.mjs — #1505 (Look Explorer E1b): the parameter census,
// the dish formation×knob matrix, and render reachability (spec §12:
// RA3, RA5). The store-level halves of the stage (the write-path door
// census, RA6 round-trip, PA3 crown integrity) live in
// census.selfcheck.mjs, which drives the real store; everything here
// is a pure function of the engine/data modules, seeded streams only
// (the determinism law — mulberry32 from E1a's coverageReport).
//
// Measurement philosophy, inherited from E1a: a census does not grade,
// it COUNTS. Every key in PARAM_SPEC / RANGE_SPEC / the structural
// set gets a row; every asset, palette, and layout mode gets a row.
// A key that moves nothing in the context that honestly exercises its
// consumer is reported as measured — "dead" is a conclusion the
// staging report draws from these rows, never an assumption baked in
// here. Keys whose consumers live outside headless reach (the audio
// modulation layer with no input signal, the GL accumulation
// framebuffer, wall-clock animation rates) are classified
// 'not-headless' with the reason, never silently dropped and never
// called dead.
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import {
  PARAM_SPEC, RANGE_SPEC, DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams, MODE_IDS,
} from '../data/layout-modes.js';
import { getQualityCaps } from '../data/quality.js';
import { buildPlacements } from '../engine/buildPlacements.js';
import { bakeParticles, BAKE_TIME_ORIGIN, BAKE_DT_MS } from '../engine/kernel/bake/index.js';
import { bakeDishParticles } from '../engine/kernel/bake/dishBake.mjs';
import { ParticleSystem } from '../engine/particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts, dishEnrolRadius } from '../engine/dishContacts.mjs';
import { createGrid, stepGrid } from '../engine/ca-engine.js';
import { tickDishTrails } from '../engine/dishTrails.mjs';
import { countEcologyAlive } from '../engine/dishEcology.mjs';
import { canonicalSvg } from '../assets/regionBake.mjs';
import { patternAmounts, rhythmTypeForPattern } from '../engine/kineme.js';
import { createTravelStore, travelLayer, advanceTravelClock, travelParams } from '../engine/travel.js'; // #1574
import { createNoise } from '../engine/noise.js';
import { GrowthHooks, ensureAggregate } from '../engine/kernel/sample/growth.js';
import { createDish } from '../engine/kernel/dish.js';
import { patternGround } from '../pattern/ground.js';
import { defaultPattern } from '../state/patternTrack.js';
import { mulberry32 } from './coverageReport.mjs';
import { composeStillSvg } from './miner.mjs'; // #1585 — the matstill driver's still composer
// XGBoost T2: the agreement readout scores ledger recipes with the taste
// head — the same module the live instrument uses (tasteHead.scoreLayout).
import { scoreLayout, headUsable, XGB_HEAD_KIND } from './tasteHead.js';

export { mulberry32 };
export const CENSUS_SEED = 0x1505;
const W = 1000;
const H = 700;
const CAPS = getQualityCaps('high');
const byId = new Map(ASSETS.map((a) => [a.id, a]));

// A fixed cast spanning categories — the census's standard company.
// Deliberately includes tray-invisible families (radial, crystalline)
// from E1a: the census deals casts directly, no scorer funnel.
export const CAST_IDS = [
  'geo_tri_01', 'org_blob_04', 'rad_rings_01', 'xsh01',
  'dot_field_01', 'line_squiggle_01', 'stamp_num_01', 'flora_flower_01',
];
export const CAST = CAST_IDS.map((id) => byId.get(id)).filter(Boolean);

// ── fingerprints ────────────────────────────────────────────────────
// Canonical item tuples → sha256, the golden harness's own equality
// notion (goldenPlacement.fingerprintPlacements): two runs are the
// same still iff their canonical fingerprints agree.
const r4 = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);
export function fingerprintItems(items, fields) {
  const canon = items.map((it) => fields.map((f) => r4(it[f])));
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}
// The material body flags ride the place fingerprint too (#1549):
// they are placement facts (buildPlacements sets them on every item),
// uniform in every sweep except the rows that sweep them — the
// material row below and the glass row (whose sort already moved
// it). Without them the material row could only ever see glass's
// alpha; with them it measures the flags each body engages, while
// the bodies themselves are measured at render level by their leaf
// suites (plateBody / washBody / stippleBody raster deltas).
const PLACE_FIELDS = ['assetId', 'x', 'y', 'scale', 'scaleY', 'rotation', 'alpha', 'color', 'accent', 'zTier', 'glass', 'plate', 'wash', 'stipple'];
const BAKE_FIELDS = ['assetId', 'x', 'y', 'rotation', 'scale', 'alpha', 'color'];

/** Fingerprint delta between two item lists over the shared prefix. */
export function fpDelta(a, b, fields) {
  const fa = fingerprintItems(a, fields);
  const fb = fingerprintItems(b, fields);
  let moved = 0;
  let posShift = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ta = fields.map((f) => r4(a[i][f]));
    const tb = fields.map((f) => r4(b[i][f]));
    if (JSON.stringify(ta) !== JSON.stringify(tb)) {
      moved++;
      const dx = (a[i].x ?? 0) - (b[i].x ?? 0);
      const dy = (a[i].y ?? 0) - (b[i].y ?? 0);
      posShift += Math.hypot(dx, dy);
    }
  }
  return {
    n0: a.length, n1: b.length, equal: fa === fb && a.length === b.length,
    moved, meanPosShift: moved ? +(posShift / moved).toFixed(2) : 0,
  };
}

// ── drivers ─────────────────────────────────────────────────────────
// place() is the still pipeline (buildPlacements as evalContext calls
// it). The ephemeral channels liveResolve threads per frame — growth
// tick, the kineme driver context, the ground (dish/lean/nudge/snap),
// the life-drift offset — are opt-in here so a key can be measured in
// the context that actually consumes it; each such fixture is named
// for the channel it rides.
export function place(params, {
  seed = CENSUS_SEED, cast = CAST, paletteId = 'hydra', seedOffsets = null,
  growthTick = 0, kineme = null, ground = null, rawParams = null, clearGrowth = false, caGrid = null, travel = null,
} = {}) {
  const lp = normalizeLayoutParams(params);
  if (rawParams) Object.assign(lp, rawParams);
  // The growth aggregate is a module-level history keyed by
  // (seed, mode, seedOffsets) — growthRate/Branch bend only the ticks
  // that advance after they are set. A census sweep end must grow its
  // own history from the zygote, so it clears through the same hook
  // the live regrow policy uses.
  if (clearGrowth) GrowthHooks.clearGrowth(seed, lp.mode, seedOffsets);
  const { items } = buildPlacements({
    layoutParams: lp, seed, activeAssets: cast,
    palette: resolvePalette(paletteId, null, []), caps: CAPS,
    canvasW: W, canvasH: H, seedOffsets, growthTick, kineme, caGrid, travel,
    ...(ground ? { dish: ground.dish, lean: ground.lean, nudge: ground.nudge, snap: ground.snap } : {}),
  });
  return items;
}

export function swarmBake(params, { seed = CENSUS_SEED, steps = 240, cast = CAST, paletteId = 'hydra', attractor = null } = {}) {
  const lp = normalizeLayoutParams(params);
  return bakeParticles({
    seed, count: lp.particleCount, layoutParams: lp, activeAssets: cast,
    palette: resolvePalette(paletteId, null, []), canvasW: W, canvasH: H,
    steps, maxParticles: lp.particleCount, attractor,
  });
}

// The kineme driver context, built exactly as liveResolve's
// livingMotion builds it (liveResolve.mjs:128 — a private function;
// this replica is the deepest headless level the kineme keys can be
// measured at, with driver time frozen at 3.7 s). If livingMotion's
// recipe changes, this replica must change with it — the census pins
// the recipe's OUTPUT (the amounts), so drift shows up as changed
// deltas, not silent agreement.
export function kinemeCtxFor(lp, seed = CENSUS_SEED) {
  const amounts = patternAmounts(
    { breath: lp.kinemeBreath, drift: lp.kinemeDrift, pulse: lp.kinemePulse },
    lp.kinemePattern, null,
  );
  amounts.paletteBreath = lp.kinemePaletteBreath;
  const rt = rhythmTypeForPattern(lp.kinemePattern);
  const rhythm = rt ? { type: rt } : null;
  if (!rhythm && !(amounts.breath > 0) && !(amounts.drift > 0) && !(amounts.pulse > 0) && !(amounts.paletteBreath > 0)) return null;
  return { seed, driverSec: 3.7, boilStep: 0, amounts, canvasW: W, canvasH: H, shedTier: 0, anchored: true, rhythm };
}

// #1574 — the travel context, built exactly as liveResolve builds it per frame: a fresh stratum store, its fixed-
// step clock advanced at a locked 60 Hz, the shared world noise. Travel is TEMPORAL (offsets integrate over steps),
// so the honest headless measure is the placement after `steps` locked steps — the still bake (slowRender) and every
// non-live caller pass no travel context at all, by design.
export const TRAVEL_CENSUS_STEPS = 120;
export function travelPlace(params, { steps = TRAVEL_CENSUS_STEPS, seed = CENSUS_SEED } = {}) {
  const lp = normalizeLayoutParams(params);
  const store = createTravelStore();
  const noise = createNoise(seed);
  const layer = travelLayer(store, 'census', seed, W, H);
  advanceTravelClock(layer, 0);
  let items = null;
  for (let f = 1; f <= steps; f++) {
    advanceTravelClock(layer, (f * 1000) / 60);
    items = place(params, { seed, travel: { layer, seed, W, H, noise, params: travelParams(lp, W, H) } });
  }
  return items;
}

// The ground a content layer rests on, built exactly as
// gl/dishGround.groundArgs builds it (a PATTERN ground below, the
// dish carrying this frame's ground functions; time frozen at 0).
export function groundFor(key, value) {
  const g = patternGround(defaultPattern('FIELD', 7), resolvePalette('hydra', null, []), W, H);
  const dish = createDish({ seed: 0 });
  dish.seed = CENSUS_SEED;
  dish.ground = (x, y) => g.at(x, y, 0);
  dish.groundCell = (x, y) => g.cell(x, y, 0);
  dish.groundRoles = (x, y) => g.roles(x, y, 0);
  const args = { dish, lean: 0, nudge: 0, snap: 0 };
  if (key === 'groundLean') args.lean = value;
  if (key === 'groundNudge') args.nudge = value;
  if (key === 'groundSnap') args.snap = value;
  return args;
}

// liveResolve.applyLifeDrift, replicated at a frozen loop time: the
// resolver turns lifeDrift (depth) into post-geometry offsets on
// jitter / displacement / noiseSpeed. Depth <= 0.01 sets nothing.
export function lifeDriftOffsetFor(depth, loopTimeMs = 60000) {
  if (depth <= 0.01) return undefined;
  const t = loopTimeMs * 0.0005;
  return {
    j: Math.sin(t * 0.7) * 12 * depth,
    d: Math.sin(t * 0.45 + 1.2) * 18 * depth,
    ns: Math.sin(t * 0.3 + 0.5) * 0.25 * depth,
  };
}

const PLACE_BASE = { count: 60, kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePaletteBreath: 0.12 };
const SWARM_BASE = {
  mode: 'swarm', particleCount: 60, contactRadius: 16, contactMode: 'none',
  kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
};

// ── RA3 — the parameter census ──────────────────────────────────────
// One fixture per key: the context that honestly exercises the key's
// consumer, values at the key's own spec min and max. `driver`:
//   place — buildPlacements fingerprint (the still pipeline)
//   swarm — bakeParticles end-state fingerprint (the physics bake)
//   dish  — measured in the dish matrix below (cross-referenced)
//   matstill — the composed still's raster, pixel-compared (#1585:
//           the material bodies are render-level — placements carry
//           their flags only — so the still is the honest context)
//   none  — no headless consumer exists; reason recorded, door is in
//           the selfcheck's write-path census.
const FIELDMAP_CTX = { fieldMapField: 'noise', fieldMapChannel: 'scale', fieldMapAmount: 0.8 };
// The organism path (resolveEffectiveBehave, bio-drives, body plans)
// is gated on mode 'hype' alone (isOrganismMode) — the behave family
// is only honestly exercisable there.
const HYPE_CTX = { mode: 'hype', behave: 'cruise' };
// buildPlacements' geoParams (buildPlacements.js) forwards growthRate
// / growthBranch / noise / lsys / phyllo into computeGeometrySoA. The
// brush family was forwarded by #1516 (2026-10-14) and the colonize
// family by #1517 (2026-10-14) — before those fixes, both families
// kept their hardcoded kernel defaults (placement.js: brushSize 24,
// spacing 0.5, fieldScale 0.004, trails 6, wobble 0/0.5; colonize
// 90/18/0.25/7) no matter what the params carried.
// The fixtures below sweep every key through the full pipeline: the
// zero IS the measurement.
const KEY_FIXTURES = {
  count: { driver: 'place', ctx: { mode: 'fibonacci' } },
  jitter: { driver: 'place', ctx: { mode: 'fibonacci' } },
  density: { driver: 'place', ctx: { mode: 'fibonacci' } },
  zTiers: { driver: 'place', ctx: { mode: 'fibonacci' } },
  hueRotate: { driver: 'none', reason: 'GL scene-contract hue rotation (sceneContract.js carries layoutParams.hueRotate to the renderer matrix); placements and bakes carry unrotated colours by design' },
  phylloDivergence: { driver: 'place', ctx: { mode: 'phyllotaxis' } },
  lsysDepth: { driver: 'place', ctx: { mode: 'lsystem' } },
  lsysAngle: { driver: 'place', ctx: { mode: 'lsystem' } },
  growthRate: { driver: 'growth', ctx: { mode: 'dla' }, note: 'the knob is a RATE: its observable is the aggregate\u2019s cell count at a fixed tick (what the lifecycle policy itself reads). Placement fingerprints saturate — both rates present the same oldest cells — so the census measures the count directly, growing from the zygote at each value' },
  growthBranch: { driver: 'place', ctx: { mode: 'dla' }, opts: { growthTick: 60, clearGrowth: true }, note: 'measured on an aggregate grown from the zygote to tick 60 at each value' },
  colonizeInfluence: { driver: 'place', ctx: { mode: 'colonize' } },
  colonizeKill: { driver: 'place', ctx: { mode: 'colonize' } },
  colonizeBranch: { driver: 'place', ctx: { mode: 'colonize' } },
  colonizeStep: { driver: 'place', ctx: { mode: 'colonize' } },
  noiseFreq: { driver: 'place', ctx: { mode: 'noise', displacement: 120 } },
  noiseSpeed: { driver: 'place', ctx: { mode: 'noise', displacement: 120 } },
  brushSize: { driver: 'place', ctx: { mode: 'brush' } },
  brushSpacing: { driver: 'place', ctx: { mode: 'brush' } },
  fieldScale: { driver: 'place', ctx: { mode: 'brush' } },
  trailCount: { driver: 'place', ctx: { mode: 'brush' } },
  wobbleAmp: { driver: 'place', ctx: { mode: 'brush' } },
  wobbleFreq: { driver: 'place', ctx: { mode: 'brush', wobbleAmp: 20 }, note: 'swept at a working wobbleAmp 20 (this fixture\u2019s ctx): at the layout default amp 0 the kernel gates the wobble term off entirely, so the frequency has nothing to modulate \u2014 the honest context for this consumer is a live amplitude (#1551; the #1516 delta probe first measured it moving at amp 20, 43/48 fixtures)' },
  displacement: { driver: 'place', ctx: { mode: 'noise' } },
  particleCount: { driver: 'swarm', ctx: {} },
  swarmCohesion: { driver: 'swarm', ctx: {} },
  gravityWells: { driver: 'swarm', ctx: {}, opts: { attractor: { x: 500, y: 350 } }, note: 'wells act on the attractor point; the fixture pins one at canvas centre, as the live pointer/well does' },
  damping: { driver: 'swarm', ctx: {} },
  body: { driver: 'swarm', ctx: { ...HYPE_CTX }, note: 'organism body plan — hype mode only' },
  flap: { driver: 'swarm', ctx: { ...HYPE_CTX, symmetry: 'bilateral' }, note: 'organism wing flap — wings exist only under a winged symmetry (bilateral/radial/kaleido) on a hype cast' },
  squash: { driver: 'none', reason: 'GL quad deform: liveLoop feeds layoutParams.squash (via squashWithAudio) to the render doc; no placement/bake consumer' },
  crooked: { driver: 'none', reason: 'GL quad deform: liveLoop carries layoutParams.crooked to the renderer u_hands uniform; no placement/bake consumer' },
  spectrumMap: { driver: 'none', reason: 'GL vertex lookup (#1482): liveLoop carries it to the renderer spectrum uniforms; a still has no spectrum to show' },
  spectrumScale: { driver: 'none', reason: 'GL vertex lookup (#1482): marks grow with the level at their frequency; a still has no spectrum' },
  spectrumDisplace: { driver: 'none', reason: 'GL vertex lookup (#1482): marks are pushed by onsets at their frequency; a still has no spectrum' },
  spectrumColour: { driver: 'none', reason: 'GL vertex lookup (#1482): ink moves toward its accent with the peak at its frequency; a still has no spectrum' },
  kinemeRate: { driver: 'none', reason: 'driver-clock rate (kineme.js driverTimeSec): scales how fast driver time accumulates — by construction invisible in any single frozen frame, live or baked' },
  rotateSpin: { driver: 'none', reason: 'live rotation rate: sceneContract spinOf carries layoutParams.rotateSpin to the renderer; a still has no spin to show' },
  groundLean: { driver: 'ground', ctx: { mode: 'grid' }, note: 'measured with a PATTERN ground beneath (the groundArgs context); without a pattern layer below, the resolver passes nothing and the knob is inert by design' },
  groundNudge: { driver: 'ground', ctx: { mode: 'grid' }, note: 'measured with a PATTERN ground beneath (the groundArgs context)' },
  groundShadow: { driver: 'none', reason: 'creature contact shadow (gl/contactShadow.mjs, via dishGround.creatureGround); marks/placements have no shadow channel' },
  groundSnap: { driver: 'ground', ctx: { mode: 'grid' }, note: 'measured with a PATTERN ground beneath (the groundArgs context)' },
  kinemeBreath: { driver: 'kineme', ctx: { mode: 'fibonacci' }, note: 'measured through the livingMotion driver context, driver time frozen at 3.7 s; the still bake (slowRender) zeroes the whole kineme floor by design' },
  kinemeDrift: { driver: 'kineme', ctx: { mode: 'fibonacci' }, note: 'measured through the livingMotion driver context, driver time frozen at 3.7 s' },
  kinemePulse: { driver: 'kineme', ctx: { mode: 'fibonacci' }, note: 'measured through the livingMotion driver context, driver time frozen at 3.7 s' },
  kinemePaletteBreath: { driver: 'kineme', ctx: { mode: 'fibonacci' }, note: 'measured through the livingMotion driver context, driver time frozen at 3.7 s' },
  fieldMapAmount: { driver: 'place', ctx: { ...FIELDMAP_CTX } },
  kinemeBrushWobble: { driver: 'kineme', ctx: { mode: 'brush' }, note: 'livingMotion populates amounts.brushWobble from this param since #1516 and the driver evaluates dWobble — but no stage-C consumer applies dWobble to placements yet (#894/#897, by design), so the measured picture delta is still zero — measured through the production-shaped driver context' },
  kinemeBoilFps: { driver: 'none', reason: 'boil is a frame-timing rate (6–12 fps re-deal cadence); no still-level consumer exists' },
  transportLeash: { driver: 'travel', ctx: { mode: 'fibonacci', transport: 'flow' }, note: 'measured through the live travel context after 120 locked steps (2 s); the still bake passes no travel context, so stills are home by design' },
  transportFlow: { driver: 'travel', ctx: { mode: 'fibonacci', transport: 'flow' }, note: 'measured through the live travel context after 120 locked steps (2 s)' },
  transportCeiling: { driver: 'travel', ctx: { mode: 'fibonacci', transport: 'flow' }, note: '#1574 Q2 — the author\'s traveller ceiling, measured with no device cap and no governor shed (the census has neither): 0 keeps every mark home, 800 lets the whole cast travel' },
  tight: { driver: 'swarm', ctx: { ...HYPE_CTX }, note: 'spine follow-through in the organism integrator — hype mode only' },
  wind: { driver: 'dish', reason: 'currents live in the dish/swarm physics — measured in the dish matrix (mass-split drift)' },
  behaveSep: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveAli: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveCoh: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveSepR: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveAliR: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveCohR: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveWind: { driver: 'swarm', ctx: { ...HYPE_CTX, wind: 1 } },
  behaveOrbit: { driver: 'swarm', ctx: { ...HYPE_CTX } },
  behaveAttract: { driver: 'swarm', ctx: { ...HYPE_CTX }, opts: { attractor: { x: 500, y: 350 } }, note: 'the seek gain acts on the attractor point; the fixture pins one at canvas centre' },
  metabolism: { driver: 'swarm', ctx: { ...HYPE_CTX }, note: 'bio-drives run on organism casts — hype mode only' },
  breath: { driver: 'swarm', ctx: {} },
  graze: { driver: 'grazeprobe', ctx: { ...HYPE_CTX, metabolism: 1 }, note: 'the knob deals the grazer caste at init (the fraction of the cast flagged grazer); their distinct behaviour is erosion of the accumulation ground, a live-layer phenomenon — the census measures the caste dealt, which is the knob\u2019s direct effect' },
  accumulationFade: { driver: 'none', reason: 'accumulation framebuffer fade (GL trail surface); no headless consumer' },
  leaveFade: { driver: 'none', reason: 'accumulation framebuffer fade (GL trail surface); no headless consumer' },
  tunnelFade: { driver: 'none', reason: 'accumulation framebuffer fade (GL trail surface); no headless consumer' },
  prismFade: { driver: 'none', reason: 'accumulation framebuffer fade (GL trail surface); no headless consumer' },
  flowFade: { driver: 'none', reason: 'accumulation framebuffer fade (GL trail surface); no headless consumer' },
  echoes: { driver: 'none', reason: 'accumulation echo passes (GL trail surface); no headless consumer' },
  accumulationOptics: { driver: 'none', reason: 'accumulation optics (GL trail surface); no headless consumer' },
  accumulationTunnel: { driver: 'none', reason: 'accumulation tunnel (GL trail surface); no headless consumer' },
  accumulationPrism: { driver: 'none', reason: 'accumulation prism (GL trail surface); no headless consumer' },
  accumulationFlow: { driver: 'none', reason: 'accumulation flow (GL trail surface); no headless consumer' },
  accumulationWetness: { driver: 'dish', reason: 'the medium — measured in the dish matrix (settle energy)' },
  audioModDepth: { driver: 'none', reason: 'audio-reactive modulation depth; no audio input exists headlessly' },
  audioScaleMod: { driver: 'none', reason: 'audio-reactive scale modulation; no audio input exists headlessly' },
  audioAlphaMod: { driver: 'none', reason: 'audio-reactive alpha modulation; no audio input exists headlessly' },
  audioAttackMs: { driver: 'none', reason: 'audio envelope timing; no audio input exists headlessly' },
  audioDecayMs: { driver: 'none', reason: 'audio envelope timing; no audio input exists headlessly' },
  audioSwell: { driver: 'none', reason: 'audio swell; no audio input exists headlessly' },
  lifeDrift: { driver: 'lifedrift', ctx: { mode: 'noise', displacement: 120 }, note: 'resolver-mediated: liveResolve turns the depth into post-geometry offsets (its own formula, replicated at frozen loop time 60 s); the bare bake never sees it' },
  parallax: { driver: 'none', reason: 'render camera: gl/parallax.mjs offsets tiers at draw time from layoutParams.parallax; placements carry the un-offset field by design' },
  contactRadius: { driver: 'dish', reason: 'measured in the dish matrix (pair fixture + isolation)' },
  contactRestitution: { driver: 'dish', reason: 'measured in the dish matrix (pair fixture)' },
  contactRepel: { driver: 'dish', reason: 'measured in the dish matrix (pair fixture)' },
  collideMask: { driver: 'dish', reason: 'measured in the dish matrix (masked pair isolation)' },
  // #1585 (Materials M4) — the material bodies' tunables. glassAlpha is
  // spent at placement time (the alpha multiply), so the place
  // fingerprint sees it; the ramp/screen knobs are render-level —
  // placements carry their flags only, by design — so they are swept
  // through the composed still (matstill), the same surface their
  // leaf suites measure.
  glassAlpha: { driver: 'place', ctx: { mode: 'fibonacci', material: 'glass' }, note: 'the glass body spends its alpha at placement time (buildPlacements), so the fingerprint carries it' },
  plateRadius: { driver: 'matstill', ctx: { material: 'plate' }, note: 'render-level: swept through the composed still (the plateBody leaf suite measures the same raster)' },
  plateCenterX: { driver: 'matstill', ctx: { material: 'plate' }, note: 'render-level: swept through the composed still' },
  plateCenterY: { driver: 'matstill', ctx: { material: 'plate' }, note: 'render-level: swept through the composed still' },
  washStrength: { driver: 'matstill', ctx: { material: 'wash' }, note: 'render-level: swept through the composed still' },
  washSpread: { driver: 'matstill', ctx: { material: 'wash' }, note: 'render-level: swept through the composed still' },
  stippleDotScale: { driver: 'matstill', ctx: { material: 'stipple' }, note: 'render-level: swept through the composed still' },
  dishTempo: { driver: 'dish', reason: 'thermal energy (#1538) — measured in the dish matrix (settle energy, tempo 0 vs 1)' },
};

// The structural keys (enums + bools) — value pairs to sweep at the
// still/physics level where a headless consumer exists.
const STRUCT_FIXTURES = {
  mode: { driver: 'reach', reason: 'swept exhaustively in render reachability (27 mode signatures)' },
  composition: { driver: 'place', ctx: { mode: 'fibonacci' }, values: ['praystation', 'chiaroscuro'] },
  transport: { driver: 'travel', ctx: { mode: 'fibonacci' }, values: ['still', 'flow'], note: '#1574 — still is today\'s placement exactly; flow measured after 120 locked steps through the live travel context' },
  bleed: { driver: 'place', ctx: { mode: 'grid' }, values: [false, true] },
  mirror: { driver: 'place', ctx: { mode: 'grid' }, values: ['off', 'x'] },
  overlap: { driver: 'place', ctx: { mode: 'grid' }, values: [false, true] },
  glass: { driver: 'place', ctx: { mode: 'fibonacci' }, values: [false, true] },
  blendMode: { driver: 'none', reason: 'canvas composite op at draw time; placements carry no blend field' },
  paletteShift: { driver: 'place', ctx: { mode: 'fibonacci' }, values: ['auto', 'split'] },
  accumulation: { driver: 'dish', reason: 'measured in the dish matrix (trail field deposits + read)' },
  trail: { driver: 'none', reason: 'accumulation trail style (GL trail surface); no headless consumer' },
  kinemePattern: { driver: 'kineme', ctx: { mode: 'fibonacci' }, values: ['DRIFT', 'ORGANIC'], note: 'ORGANIC routes to the rhythm layer — a placement-layer modulation that survives into stills when the driver context is present' },
  symmetry: { driver: 'swarm', ctx: { mode: 'hype' }, values: ['none', 'bilateral'], note: 'symmetry fans live in the organism item builder (wings/fans on a hype cast); placements have no symmetry channel' },
  behave: { driver: 'swarm', ctx: { ...HYPE_CTX }, values: ['cruise', 'flock'] },
  material: { driver: 'place', ctx: { mode: 'fibonacci' }, values: ['plate', 'wash'], note: 'the material vocabulary is complete in GL (#1547 M1 glass, #1548 M2 plate, #1549 M3 wash + stipple): every value engages a placement flag here (the flags ride the place fingerprint and the scene contract; the renderer carries them as one body code) — the delta below is plate↔wash on this fixture, the two colour-ramp bodies. The bodies themselves are render-level and measured by their leaf suites (plateBody / washBody / stippleBody raster deltas), not here; glass additionally moves the placed alpha + sort. One seam stays disclosed, not hidden: plate and wash render flat in the GL export (studio.py still — no channel decomposition there), which sceneContract.warnUnsupportedMaterials names; stipple\'s screen and glass\'s body survive the export' },
  contactMode: { driver: 'dish', reason: 'measured in the dish matrix (pair fixture modes)' },
  dish: { driver: 'dish', reason: 'measured in the dish matrix (the DISH toggle row)' },
  ecology: { driver: 'dish', reason: 'measured in the dish matrix (population vs pooled cap)' },
  audioResponse: { driver: 'none', reason: 'audio envelope curve; no audio input exists headlessly' },
  fieldMapField: { driver: 'place', ctx: { fieldMapChannel: 'scale', fieldMapAmount: 0.8 }, values: ['off', 'noise'] },
  fieldMapChannel: { driver: 'place', ctx: { fieldMapField: 'noise', fieldMapAmount: 0.8 }, values: ['off', 'scale'] },
  fieldMapCurve: { driver: 'place', ctx: { ...FIELDMAP_CTX }, values: ['linear', 'stepped'] },
};

const KINEME_BASE = {
  mode: 'fibonacci', count: 60,
  kinemeBreath: 0.3, kinemeDrift: 0.5, kinemePulse: 0, kinemePaletteBreath: 0.12, kinemePattern: 'DRIFT',
};

// liveResolve's post-geometry life-drift application (liveResolve.mjs
// — the resolver's own hash and formula, frozen loop time).
function hash01(n) {
  let h = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}
function applyDriftOffsets(items, depth) {
  const drift = lifeDriftOffsetFor(depth);
  if (!drift || !(drift.j || drift.d)) return items;
  return items.map((it, k) => {
    let dx = 0; let dy = 0;
    if (drift.j) {
      dx += (hash01(k) - 0.5) * drift.j;
      dy += (hash01(k + 7919) - 0.5) * drift.j;
    }
    if (drift.d) {
      dx += (hash01(k + 104729) - 0.5) * drift.d * 0.3;
      dy += (hash01(k + 104729 + 7919) - 0.5) * drift.d * 0.3;
    }
    return dx || dy ? { ...it, x: it.x + dx, y: it.y + dy } : it;
  });
}

// Run one end of a sweep. `key`/`value` name the swept key so the
// ground and lifedrift drivers can route the value to the channel
// that actually consumes it (the resolver's args / offset), exactly
// as the live resolver routes the param.
function runFixture(driver, params, fx = {}, key = null, value = null) {
  if (driver === 'place') return { items: place(params, fx.opts ?? {}), fields: PLACE_FIELDS };
  if (driver === 'swarm') return { items: swarmBake(params, fx.opts ?? {}), fields: BAKE_FIELDS };
  if (driver === 'kineme') {
    const lp = normalizeLayoutParams(params);
    return { items: place(params, { kineme: kinemeCtxFor(lp) }), fields: PLACE_FIELDS };
  }
  if (driver === 'ground') {
    return { items: place(params, { ground: groundFor(key, value) }), fields: PLACE_FIELDS };
  }
  if (driver === 'travel') return { items: travelPlace(params), fields: PLACE_FIELDS }; // #1574
  if (driver === 'lifedrift') {
    return { items: applyDriftOffsets(place(params), value), fields: PLACE_FIELDS };
  }
  throw new Error(`driver ${driver} not runnable here`);
}

function baseFor(driver) {
  if (driver === 'swarm') return { ...SWARM_BASE };
  if (driver === 'kineme') return { ...KINEME_BASE };
  return { ...PLACE_BASE };
}

// ── #1585 — the matstill driver ─────────────────────────────────────
// The material bodies paint at render level; placements carry their
// flags and nothing else, so no placement fingerprint can see their
// tunables. The honest headless context is the composed still (the
// miner's SVG baker — one of the two render paths the bodies serve),
// rasterized and compared pixel by pixel. The pixel buffer is cached
// ONCE per raster (Resvg's .pixels getter materializes a fresh buffer
// per access — the #1564 lesson).
function matStillRaster(params) {
  const items = place(params);
  const svg = composeStillSvg(items, resolvePalette('hydra', null, []));
  const img = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: 'width', value: 500 } }).render();
  const px = img.pixels;
  return { px, hash: createHash('sha256').update(px).digest('hex'), n: items.length };
}
function pxDiffCount(a, b) {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) d++;
  }
  return d;
}

export function paramCensus() {
  const rows = [];
  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    const fx = KEY_FIXTURES[key];
    const row = { key, spec: { min: spec.min, max: spec.max, int: !!spec.int }, driver: fx?.driver ?? 'MISSING' };
    if (!fx) { row.class = 'unfixtured'; rows.push(row); continue; }
    if (fx.driver === 'none') { row.class = 'not-headless'; row.reason = fx.reason; rows.push(row); continue; }
    if (fx.driver === 'dish') { row.class = 'dish-matrix'; row.reason = fx.reason; rows.push(row); continue; }
    if (fx.driver === 'growth') {
      const cellsAt = (rate) => {
        GrowthHooks.clearGrowth(CENSUS_SEED, 'dla', null);
        return ensureAggregate(CENSUS_SEED, 'dla', 60, {
          growthRate: rate, growthBranch: 0.8, audioEnergy: null, seedOffsets: null,
        }).cells.length;
      };
      const cMin = cellsAt(spec.min);
      const cMax = cellsAt(spec.max);
      row.delta = { n0: cMin, n1: cMax, equal: cMin === cMax, moved: Math.abs(cMax - cMin), meanPosShift: 0 };
      row.repeatIdentical = cellsAt(spec.min) === cMin;
      row.class = row.delta.equal ? 'zero-in-context' : 'moves';
      if (fx.note) row.note = fx.note;
      rows.push(row);
      continue;
    }
    if (fx.driver === 'grazeprobe') {
      const flagged = (v) => swarmBake({ ...SWARM_BASE, ...fx.ctx, graze: v }).filter((it) => it.graze).length;
      const gMin = flagged(spec.min);
      const gMax = flagged(spec.max);
      row.delta = { n0: gMin, n1: gMax, equal: gMin === gMax, moved: Math.abs(gMax - gMin), meanPosShift: 0 };
      row.repeatIdentical = flagged(spec.min) === gMin;
      row.class = row.delta.equal ? 'zero-in-context' : 'moves';
      if (fx.note) row.note = fx.note;
      rows.push(row);
      continue;
    }
    if (fx.driver === 'matstill') {
      const at = (v) => matStillRaster({ ...PLACE_BASE, ...fx.ctx, [key]: v });
      const lo = at(spec.min);
      const hi = at(spec.max);
      const rep = at(spec.min);
      row.delta = {
        n0: lo.n, n1: hi.n,
        equal: lo.hash === hi.hash,
        moved: pxDiffCount(lo.px, hi.px),
        meanPosShift: 0,
      };
      row.repeatIdentical = rep.hash === lo.hash;
      row.class = row.delta.equal ? 'zero-in-context' : 'moves';
      if (fx.note) row.note = fx.note;
      rows.push(row);
      continue;
    }
    const base = baseFor(fx.driver);
    const lo = runFixture(fx.driver, { ...base, ...fx.ctx, [key]: spec.min }, fx, key, spec.min);
    const hi = runFixture(fx.driver, { ...base, ...fx.ctx, [key]: spec.max }, fx, key, spec.max);
    const rep = runFixture(fx.driver, { ...base, ...fx.ctx, [key]: spec.min }, fx, key, spec.min);
    row.delta = fpDelta(lo.items, hi.items, lo.fields);
    row.repeatIdentical = fingerprintItems(lo.items, lo.fields) === fingerprintItems(rep.items, rep.fields);
    row.class = row.delta.equal ? 'zero-in-context' : 'moves';
    if (fx.note) row.note = fx.note;
    rows.push(row);
  }
  for (const [key, spec] of Object.entries(RANGE_SPEC)) {
    const ctx = { ...PLACE_BASE, mode: 'fibonacci' };
    const a = place({ ...ctx, [key]: [spec.min, spec.min] });
    const b = place({ ...ctx, [key]: [spec.max, spec.max] });
    rows.push({
      key, spec: { min: spec.min, max: spec.max, pair: true }, driver: 'place',
      delta: fpDelta(a, b, PLACE_FIELDS),
      class: fpDelta(a, b, PLACE_FIELDS).equal ? 'zero-in-context' : 'moves',
    });
  }
  for (const [key, fx] of Object.entries(STRUCT_FIXTURES)) {
    const row = { key, structural: true, driver: fx.driver };
    if (fx.driver === 'none') { row.class = 'not-headless'; row.reason = fx.reason; rows.push(row); continue; }
    if (fx.driver === 'dish') { row.class = 'dish-matrix'; row.reason = fx.reason; rows.push(row); continue; }
    if (fx.driver === 'reach') { row.class = 'reachability'; row.reason = fx.reason; rows.push(row); continue; }
    const base = baseFor(fx.driver);
    const a = runFixture(fx.driver, { ...base, ...fx.ctx, [key]: fx.values[0] }, fx, key, fx.values[0]);
    const b = runFixture(fx.driver, { ...base, ...fx.ctx, [key]: fx.values[1] }, fx, key, fx.values[1]);
    row.values = fx.values;
    row.delta = fpDelta(a.items, b.items, a.fields);
    row.class = row.delta.equal ? 'zero-in-context' : 'moves';
    if (fx.note) row.note = fx.note;
    rows.push(row);
  }
  return rows;
}

// ── RA3 — the dish formation × knob matrix ──────────────────────────
// Driver: dishCast — the dishEcology selfcheck's own harness shape
// (one session, enrolled strata, per-step arm + update), extended
// with the trail tick the bake and the live loop both perform
// (dishBake.mjs:95, liveResolve.mjs:895). Formations: packed colonies,
// a pair, two strata, a breed colony, a mingling colony.
const DISH_ASSETS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const DISH_PALETTE = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };

function dishCast(strata, steps, { onStep = null, tickTrails = false } = {}) {
  const session = createDishSession();
  const units = strata.map((st) => {
    const lp = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...st.lp });
    const sys = new ParticleSystem();
    sys.init(st.count, W, H, DISH_ASSETS, st.palette ?? DISH_PALETTE, st.seed);
    if (st.place) st.place(sys);
    enrolDishBody(session, {
      key: st.key, sys, radius: dishEnrolRadius(lp), restitution: lp.contactRestitution ?? 0.5,
      contactMode: lp.contactMode, umask: st.umask ?? 0xffffffff, organism: false,
      wetness: lp.accumulationWetness, accum: !!lp.accumulation,
      ecology: !!lp.ecology, cap: st.cap ?? st.count,
    });
    return { ...st, sys, lp, params: { ...lp, dishSession: session, particleCount: st.count, maxParticles: st.cap ?? st.count } };
  });
  const keys = units.map((u) => u.key);
  for (let s = 0; s < steps; s++) {
    armDish(session, keys);
    for (const u of units) u.sys.update(u.params, DISH_ASSETS, u.palette ?? DISH_PALETTE, u.seed, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
    if (tickTrails) tickDishTrails(session);
    if (onStep) onStep(s, units, session);
  }
  return { units, session };
}

const sysFingerprint = (sys) => {
  const items = [];
  for (let i = 0; i < sys.n; i++) {
    if (sys.alive && !sys.alive[i]) continue;
    items.push({ x: sys.x[i], y: sys.y[i], vx: sys.vx[i], vy: sys.vy[i] });
  }
  return fingerprintItems(items, ['x', 'y', 'vx', 'vy']);
};
const sysPositions = (sys) => {
  const out = [];
  for (let i = 0; i < sys.n; i++) out.push([sys.x[i], sys.y[i]]);
  return out;
};
const settleKE = (sys) => {
  let ke = 0;
  for (let i = 0; i < sys.n; i++) {
    if (sys.alive && !sys.alive[i]) continue;
    ke += 0.5 * sys.mass[i] * (sys.vx[i] * sys.vx[i] + sys.vy[i] * sys.vy[i]);
  }
  return ke;
};
// The crowded formation (dishMedium's own dish): a packed grid falling
// and compressing against the floor band.
const PACK = { cols: 8, dx: 22, dy: 22, ox: 412, oy: 150 };
function placePack(sys) {
  for (let i = 0; i < sys.n; i++) {
    sys.x[i] = PACK.ox + (i % PACK.cols) * PACK.dx;
    sys.y[i] = PACK.oy + Math.floor(i / PACK.cols) * PACK.dy;
    sys.vx[i] = 0; sys.vy[i] = 6; sys.scale[i] = 1.4; sys.mass[i] = 1.4;
  }
}
const packLp = (over = {}) => ({
  mode: 'swarm', particleCount: 24, contactRadius: 28, contactMode: 'bounce',
  contactRestitution: 0.4, contactRepel: 1.2, gravityWells: 0, swarmCohesion: 0,
  flap: 0, metabolism: 0, wind: 0, kinemeBreath: 0, kinemeDrift: 0,
  kinemePaletteBreath: 0, lifeDrift: 0, ...over,
});

export function dishMatrix() {
  const rows = [];
  const SEED = 0x1a4f;

  // DISH toggle — two strata in contact range. Off must equal the two
  // strata baked alone (A3's isolation), on must differ.
  {
    const layer = (key, seed, over = {}) => ({
      key, seed, count: 24, paletteId: 'hydra',
      activeAssets: CAST.slice(0, 4),
      layoutParams: normalizeLayoutParams({
        mode: 'swarm', particleCount: 24, contactRadius: 20, contactMode: 'bounce',
        dish: true, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over,
      }),
    });
    const bake = (layers) => bakeDishParticles({ layers, canvasW: W, canvasH: H, steps: 180 });
    const on = bake([layer('a', SEED), layer('b', SEED + 1)]);
    const off = bake([layer('a', SEED, { dish: false }), layer('b', SEED + 1, { dish: false })]);
    const soloA = bake([layer('a', SEED, { dish: false })]);
    const soloB = bake([layer('b', SEED + 1, { dish: false })]);
    const fp = (m, k) => fingerprintItems(m.get(k) ?? [], BAKE_FIELDS);
    rows.push({
      knob: 'dish (DISH toggle)', formation: 'two strata, contact range',
      observable: 'cross-strata bake fingerprint',
      onOffDiffer: fp(on, 'a') !== fp(off, 'a') || fp(on, 'b') !== fp(off, 'b'),
      offEqualsSolo: fp(off, 'a') === fp(soloA, 'a') && fp(off, 'b') === fp(soloB, 'b'),
    });
  }

  // WETNESS — settle energy of the packed colony must order with
  // wetness (C1's acceptance probe, same fixture family); with
  // contacts off the medium cannot act: bit-identity (C1's (e)).
  {
    const settle = (wet, radius = 28) => {
      const { units } = dishCast(
        [{ key: 'pack', seed: SEED, count: 24, place: placePack, lp: packLp({ accumulationWetness: wet, contactRadius: radius }) }],
        240,
      );
      return units[0].sys;
    };
    const dry = settle(0); const mid = settle(0.5); const wet = settle(1);
    const off0 = settle(0, 0); const off1 = settle(1, 0);
    rows.push({
      knob: 'accumulationWetness (WETNESS)', formation: 'packed colony, 24 bodies',
      observable: 'residual kinetic energy after 240 steps',
      ke: { w0: +settleKE(dry).toFixed(4), w05: +settleKE(mid).toFixed(4), w1: +settleKE(wet).toFixed(4) },
      ordered: settleKE(dry) > settleKE(mid) && settleKE(mid) > settleKE(wet),
      contactsOffIdentical: sysFingerprint(off0) === sysFingerprint(off1),
    });
    // FX-medium world: across a seam, the pair's medium is the two
    // strata's AVERAGE wetness (dishContacts.mjs — the pair law), so a
    // wet stratum is quite literally the medium its dry neighbour
    // touches. Measured at the pass level (the contacts suite's own
    // cross-strata pair): the light body's rebound at seam wetness
    // (0,0) vs (0,1).
    const seam = (wetB) => {
      const mk = (x, vx, mass) => {
        const s = new ParticleSystem();
        s.init(1, W, H, DISH_ASSETS, DISH_PALETTE, SEED);
        s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass; s.scale[0] = 1;
        return s;
      };
      const pearl = mk(400, 2, 1);
      const eaves = mk(430, -2, 3);
      const ses = createDishSession();
      enrolDishBody(ses, { key: 'pearl', sys: pearl, radius: 20, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false, wetness: 0 });
      enrolDishBody(ses, { key: 'eaves', sys: eaves, radius: 20, restitution: 1, contactMode: 'bounce', umask: 0xffffffff, organism: false, wetness: wetB });
      armDish(ses, ['pearl', 'eaves']);
      runDishContacts(ses, pearl);
      return { pearlVx: pearl.vx[0], pearlX: pearl.x[0] };
    };
    const seamDry = seam(0);
    const seamWet = seam(1);
    rows.push({
      knob: 'accumulationWetness (FX-medium seam)', formation: 'light body bouncing off a heavy stratum across the seam',
      observable: 'light body velocity after one shared pass (dry closed form: -4)',
      seamDry, seamWet,
      mediumCrossesSeam: seamWet.pearlVx !== seamDry.pearlVx,
    });
  }

  // Contact pair fixtures — radius / restitution / repel / mask,
  // measured at the pass level (the petri suites' own idiom: the
  // integrator's ambient noise would swamp a two-body signal over
  // full updates, so the pass is driven directly, once, on a known
  // configuration — the knob values are the layoutParams values,
  // threaded exactly as update()/enrolment thread them).
  {
    // Cross-strata pair through the shared dish pass (contacts
    // selfcheck scenario 17's fixture): light PEARL (m=1) at 400
    // moving +2, heavy EAVES (m=3) at 430 moving -2, discs r=20 at
    // scale 1, overlap 10. Dry elastic closed form: PEARL displaced
    // to 392.5 with vx -4, EAVES to 432.5 with vx 0.
    const dishPair = ({ radius = 20, rest = 1, umaskA = 0xffffffff, umaskB = 0xffffffff } = {}) => {
      const mk = (x, vx, mass) => {
        const s = new ParticleSystem();
        s.init(1, W, H, DISH_ASSETS, DISH_PALETTE, SEED);
        s.x[0] = x; s.y[0] = 350; s.vx[0] = vx; s.vy[0] = 0; s.mass[0] = mass; s.scale[0] = 1;
        return s;
      };
      const pearl = mk(400, 2, 1);
      const eaves = mk(430, -2, 3);
      const ses = createDishSession();
      enrolDishBody(ses, { key: 'pearl', sys: pearl, radius, restitution: rest, contactMode: 'bounce', umask: umaskA, organism: false, wetness: 0 });
      enrolDishBody(ses, { key: 'eaves', sys: eaves, radius, restitution: rest, contactMode: 'bounce', umask: umaskB, organism: false, wetness: 0 });
      armDish(ses, ['pearl', 'eaves']);
      runDishContacts(ses, pearl);
      return { pearl, eaves };
    };
    const r0 = dishPair({ radius: 0 });
    const r20 = dishPair({ radius: 20 });
    rows.push({
      knob: 'contactRadius', formation: 'cross-strata head-on pair, one shared pass',
      observable: 'light body displacement (px)',
      dispRadius0: +(400 - r0.pearl.x[0]).toFixed(3), dispRadius20: +(400 - r20.pearl.x[0]).toFixed(3),
      moves: r20.pearl.x[0] !== r0.pearl.x[0],
      radius0IsIdentity: r0.pearl.x[0] === 400 && r0.pearl.vx[0] === 2 && r0.eaves.x[0] === 430 && r0.eaves.vx[0] === -2,
    });
    const rest0 = dishPair({ rest: 0 });
    const rest1 = dishPair({ rest: 1 });
    rows.push({
      knob: 'contactRestitution', formation: 'cross-strata head-on pair, one shared pass',
      observable: 'light body rebound velocity (elastic closed form -4; dead-stop closed form -1)',
      vxRest0: rest0.pearl.vx[0], vxRest1: rest1.pearl.vx[0],
      moves: rest1.pearl.vx[0] !== rest0.pearl.vx[0],
    });
    const maskedPair = dishPair({ umaskA: 0b01, umaskB: 0b10 });
    rows.push({
      knob: 'collideMask', formation: 'cross-strata pair, disjoint masks 0b01 / 0b10',
      observable: 'displacement under disjoint masks vs shared mask',
      disjointIsolated: maskedPair.pearl.x[0] === 400 && maskedPair.pearl.vx[0] === 2 && maskedPair.eaves.x[0] === 430,
      sharedMaskMoves: r20.pearl.x[0] !== 400,
    });
    // Repel lives in the same-system pass only (dishContacts.mjs:
    // "repel stays per-system") — measured there, on the contacts
    // suite's own scenario 10: a pair at shared velocity (no bounce
    // impulse possible), mode 'none'; repel still separates them.
    const repelPass = (repel) => {
      const sys = new ParticleSystem();
      sys.init(2, W, H, DISH_ASSETS, DISH_PALETTE, SEED);
      sys.x[0] = 400; sys.y[0] = 350; sys.x[1] = 430; sys.y[1] = 350;
      // Same velocity (no bounce impulse possible) and the same
      // collision group — repel's two preconditions (contacts #10).
      sys.vx[0] = 1; sys.vy[0] = 0; sys.vx[1] = 1; sys.vy[1] = 0;
      sys.mass[0] = 1; sys.mass[1] = 1; sys.scale[0] = 1; sys.scale[1] = 1;
      sys.cgroup[0] = 5; sys.cgroup[1] = 5;
      sys._layout = { contactRadius: 20 };
      sys._contactPass({
        radius: 20, restitution: 0, repel, mode: 'none', umask: 0xffffffff,
        breedCap: 10, seed: SEED, organism: false,
        minScale: 0.4, maxScale: 1.6, minAlpha: 40, maxAlpha: 100,
      });
      return { vx0: sys.vx[0], vx1: sys.vx[1] };
    };
    const rp0 = repelPass(0);
    const rp3 = repelPass(3);
    rows.push({
      knob: 'contactRepel', formation: 'same-system, same-group pair at shared velocity, overlapping, mode none — one pass',
      observable: 'separation velocity imparted by the pass',
      repel0: rp0, repel3: rp3,
      moves: rp3.vx0 < 1 && rp3.vx1 > 1 && rp0.vx0 === 1 && rp0.vx1 === 1,
    });
  }

  // Wind — mass-split drift (C2's probe, single-body purity) + the
  // wind-0 identity at bake level.
  {
    const ride = (mass) => {
      const lp = normalizeLayoutParams({
        ...DEFAULT_LAYOUT_PARAMS, mode: 'hype', behave: 'cruise', particleCount: 1,
        contactRadius: 16, contactMode: 'none', wind: 2, windMode: 'curl',
        gravityWells: 0, damping: 0.98, metabolism: 0,
        kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
      });
      const sys = new ParticleSystem();
      sys.init(1, W, H, DISH_ASSETS, DISH_PALETTE, SEED);
      sys.x[0] = 500; sys.y[0] = 350; sys.vx[0] = 0; sys.vy[0] = 0; sys.mass[0] = mass;
      for (let s = 0; s < 120; s++) {
        sys.update({ ...lp, particleCount: 1, maxParticles: 10 }, DISH_ASSETS, DISH_PALETTE, SEED, BAKE_TIME_ORIGIN + s * BAKE_DT_MS, null);
      }
      return +Math.hypot(sys.x[0] - 500, sys.y[0] - 350).toFixed(2);
    };
    const layer = (over = {}) => ({
      key: 'w', seed: SEED, count: 24, paletteId: 'hydra', activeAssets: CAST.slice(0, 4),
      layoutParams: normalizeLayoutParams({
        mode: 'hype', particleCount: 24, contactRadius: 16, contactMode: 'none',
        dish: true, windMode: 'curl', kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0, ...over,
      }),
    });
    const w0 = bakeDishParticles({ layers: [layer({ wind: 0 })], canvasW: W, canvasH: H, steps: 120 });
    const wOff = bakeDishParticles({ layers: [layer({ wind: 0, dish: false })], canvasW: W, canvasH: H, steps: 120 });
    const w2 = bakeDishParticles({ layers: [layer({ wind: 2 })], canvasW: W, canvasH: H, steps: 120 });
    const cloud2 = bakeDishParticles({ layers: [layer({ wind: 2, mode: 'swarm' })], canvasW: W, canvasH: H, steps: 120 });
    const cloud0 = bakeDishParticles({ layers: [layer({ wind: 0, mode: 'swarm' })], canvasW: W, canvasH: H, steps: 120 });
    const fp = (m) => fingerprintItems(m.get('w') ?? [], BAKE_FIELDS);
    rows.push({
      knob: 'wind', formation: 'single bodies in a curl field; hype stratum at bake level',
      observable: 'travel over 120 steps by mass (px); bake fingerprint',
      travelLight: ride(0.5), travelHeavy: ride(4),
      massSplit: ride(0.5) > 2 * ride(4),
      wind0EqualsNoDish: fp(w0) === fp(wOff),
      windMovesBake: fp(w2) !== fp(w0),
      cloudStratumBakeMoved: fp(cloud2) !== fp(cloud0),
      note: 'the currents (C2) ride the organism path — a cloud (swarm-mode) stratum\u2019s bake is the control',
    });
  }

  // ACCUMULATION — the trail field: deposits land, the total is
  // readable, off deposits nothing, and the read moves the cast
  // (on-run positions differ from off-run positions).
  {
    const run = (accum) => dishCast([{
      key: 't', seed: SEED, count: 24,
      lp: {
        mode: 'swarm', particleCount: 24, contactRadius: 20, contactMode: 'bounce',
        accumulation: accum, swarmCohesion: 0.6, gravityWells: 0, flap: 0, metabolism: 0,
        wind: 0, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
      },
    }], 240, { tickTrails: true });
    const on = run(true); const off = run(false);
    const total = (session) => {
      if (!session.trailTotal) return 0;
      let t = 0;
      for (const v of session.trailTotal.cells) t += v;
      return +t.toFixed(3);
    };
    rows.push({
      knob: 'accumulation (ACCUMULATION)', formation: 'cohering swarm stratum, 240 steps',
      observable: 'session trail-field total; cast fingerprint',
      fieldOn: total(on.session), fieldOff: total(off.session),
      readMovesCast: sysFingerprint(on.units[0].sys) !== sysFingerprint(off.units[0].sys),
    });
  }

  // Ecology — population vs the pooled cap (C4's acceptance shape):
  // two breed strata, caps 40 + 20 = pool 60; on fills the pool and
  // never exceeds it; off (the adjudicated mode law) breeds nothing.
  {
    const breed = (eco) => {
      let maxAlive = 0;
      const { units } = dishCast([
        { key: 'a', seed: SEED, count: 30, cap: 40, lp: { mode: 'swarm', contactMode: 'breed', ecology: eco, swarmCohesion: 0.8, contactRepel: 1, contactRadius: 16, scale: { x: [0.3, 0.3], y: [0.3, 0.3] }, wind: 0, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0 } },
        { key: 'b', seed: SEED + 3, count: 30, cap: 20, lp: { mode: 'swarm', contactMode: 'breed', ecology: eco, swarmCohesion: 0.8, contactRepel: 1, contactRadius: 16, scale: { x: [0.3, 0.3], y: [0.3, 0.3] }, wind: 0, kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0 } },
      ], 600, {
        onStep: (s, us) => {
          const alive = us.reduce((n, u) => n + countEcologyAlive(u.sys), 0);
          if (alive > maxAlive) maxAlive = alive;
        },
      });
      return { final: units.reduce((n, u) => n + countEcologyAlive(u.sys), 0), maxAlive };
    };
    const on = breed(true); const off = breed(false);
    rows.push({
      knob: 'ecology', formation: 'two breed strata, dealt 30 + 30, caps 40 + 20',
      observable: 'population vs pooled cap 60 over 600 steps',
      on, off,
      fillsPool: on.final === 60, neverExceeds: on.maxAlive <= 60,
      offRosterExact: off.final === 60 && off.maxAlive === 60,
    });
  }

  // Pigment mingling — two-colour colony in sustained contact: the
  // leakRgb gap must close (B3's observable, full-update level).
  {
    const mingle = (steps) => {
      const pal2 = { swatches: ['#ff0000', '#0000ff'] };
      const { units } = dishCast([{
        key: 'm', seed: SEED, count: 36, palette: pal2,
        lp: {
          mode: 'swarm', particleCount: 36, contactRadius: 26, contactMode: 'stick',
          contactRestitution: 0.6, swarmCohesion: 0.8, gravityWells: 0,
          kinemeBreath: 0, kinemeDrift: 0, kinemePaletteBreath: 0, lifeDrift: 0,
        },
      }], steps);
      const sys = units[0].sys;
      let gap = 0; let pairs = 0;
      for (let i = 0; i < sys.n; i++) {
        for (let j = i + 1; j < sys.n; j++) {
          gap += Math.abs(sys.leakRgb[i * 3] - sys.leakRgb[j * 3]) + Math.abs(sys.leakRgb[i * 3 + 2] - sys.leakRgb[j * 3 + 2]);
          pairs++;
        }
      }
      return +(gap / pairs).toFixed(2);
    };
    const early = mingle(120);
    const late = mingle(3000);
    rows.push({
      knob: 'mingling (pigment exchange)', formation: 'red/blue colony, stick contacts',
      observable: 'mean pairwise leakRgb channel gap',
      gapEarly: early, gapLate: late,
      converges: late < early * 0.6,
    });
  }

  // TEMPO + DENSITY as dish knobs — the petri spec §4 rows, built by
  // #1538 (law in engine/dishThermal.mjs), measured the way the gap
  // was first measured: density through the packed colony at the
  // knob's ends (10 vs 100 — no longer bit-identical: crowding
  // pressure drives the repel gain), TEMPO through the same colony's
  // settle energy cold vs hot. The parity pins ride along: TEMPO 0
  // and density-at-default must reproduce the row-absent dish bit
  // for bit, or existing Looks would shift at their defaults.
  {
    const dense = (density) => dishCast([{
      key: 'd', seed: SEED, count: 24, place: placePack,
      lp: packLp({ density }),
    }], 240).units[0].sys;
    const base = dishCast([{
      key: 'd', seed: SEED, count: 24, place: placePack, lp: packLp({}),
    }], 240).units[0].sys;
    rows.push({
      knob: 'density (as dish knob)', formation: 'packed colony',
      observable: 'dish fingerprint at density 10 vs 100; at the layout default vs the row absent',
      identicalInDish: sysFingerprint(dense(10)) === sysFingerprint(dense(100)),
      defaultIsIdentity: sysFingerprint(dense(DEFAULT_LAYOUT_PARAMS.density)) === sysFingerprint(base),
      tempoKeyExists: Object.keys(PARAM_SPEC).some((k) => /tempo|thermal/i.test(k)),
      note: 'petri spec §4 rows (TEMPO = thermal jitter, DENSITY = crowding pressure) — built by #1538, law in engine/dishThermal.mjs',
    });

    const settle = (tempo) => dishCast([{
      key: 't', seed: SEED, count: 24, place: placePack,
      lp: packLp({ dishTempo: tempo }),
    }], 240).units[0].sys;
    const cold = settle(0); const hot = settle(1);
    rows.push({
      knob: 'dishTempo (TEMPO)', formation: 'packed colony, 24 bodies',
      observable: 'residual kinetic energy after 240 steps at tempo 0 vs 1; fingerprint at 0 vs the row absent',
      ke: { t0: +settleKE(cold).toFixed(4), t1: +settleKE(hot).toFixed(4) },
      hotterKeepsEnergy: settleKE(hot) > settleKE(cold),
      movesDish: sysFingerprint(cold) !== sysFingerprint(hot),
      tempo0IsIdentity: sysFingerprint(cold) === sysFingerprint(base),
    });
  }

  return rows;
}

// ── RA5 — render reachability ───────────────────────────────────────
// Every asset must draw: (1) its canonical raster (the bake's own
// raster, regionBake.canonicalSvg — the same SVG the browser atlas
// bakes from) carries ink; (2) it is actually placed, at positive
// scale, by at least one standard layout through buildPlacements.
// Every palette must produce a distinct still: measured at the
// placement level — the item colours a fixed composition is dealt —
// plus the resolved swatch record itself. Every layout mode must
// produce a distinct arrangement signature (placement fingerprint).
const RASTER_OPTS_FAST = { font: { loadSystemFonts: false } };

export function assetInk(svg, opts = RASTER_OPTS_FAST) {
  const img = new Resvg(canonicalSvg(svg), opts).render();
  const px = img.pixels;
  let ink = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
  return { ink, total: img.width * img.height, coverage: ink / (img.width * img.height) };
}

export function renderReachability() {
  // Assets: ink + placement presence. The fast raster (no system
  // fonts — 100x faster, bit-identical on path art) is the sweep; any
  // asset it finds blank is re-rasterized with the bake's own default
  // options before it may be called unreached. The assets that differ
  // are the <text> stamps: their ink is font-contingent — it exists
  // exactly when a monospace font does — which the census reports as
  // a property of the asset, not a defect of the sweep.
  const assetRows = [];
  const REACH_LAYOUTS = ['grid', 'fibonacci', 'radial'];
  for (const a of ASSETS) {
    const fast = assetInk(a.svg);
    let ink = fast.ink;
    let fontContingent = false;
    if (fast.ink === 0) {
      const confirmed = assetInk(a.svg, {}); // the bake's own options: system fonts load
      fontContingent = confirmed.ink > 0;
      ink = confirmed.ink;
    }
    const coverage = ink / fast.total;
    let placedIn = [];
    let maxScale = 0;
    for (const mode of REACH_LAYOUTS) {
      const items = place(
        { ...PLACE_BASE, mode, count: 24 },
        { cast: [a] },
      );
      if (items.length) {
        placedIn.push(mode);
        for (const it of items) if (it.scale > maxScale) maxScale = it.scale;
      }
    }
    assetRows.push({
      id: a.id, category: a.category, ink, coverage: +coverage.toFixed(4),
      fontContingent,
      placedIn, maxScale: +maxScale.toFixed(3),
      reaches: ink > 0 && placedIn.length > 0 && maxScale > 0,
    });
  }

  // Palettes: distinct stills for one fixed composition.
  const paletteRows = PALETTES.map((p) => {
    const items = place({ ...PLACE_BASE, mode: 'fibonacci', count: 60 }, { paletteId: p.id });
    const resolved = resolvePalette(p.id, null, []);
    return {
      id: p.id,
      stillFp: fingerprintItems(items, ['assetId', 'color', 'accent']),
      colorFp: fingerprintItems(items, ['color']),
      resolvedFp: createHash('sha256').update(JSON.stringify({
        bg: resolved.bg, ink: resolved.ink, swatches: resolved.swatches,
      })).digest('hex'),
    };
  });
  const groupBy = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r[key])) m.set(r[key], []);
      m.get(r[key]).push(r.id);
    }
    return [...m.values()].filter((g) => g.length > 1);
  };

  // Layout modes: distinct arrangement signatures, one fixed company.
  const layoutRows = MODE_IDS.map((mode) => {
    const items = place({ ...PLACE_BASE, mode, count: 60 });
    return { mode, n: items.length, fp: fingerprintItems(items, PLACE_FIELDS) };
  });
  const layoutGroups = new Map();
  for (const r of layoutRows) {
    if (!layoutGroups.has(r.fp)) layoutGroups.set(r.fp, []);
    layoutGroups.get(r.fp).push(r.mode);
  }
  // Separation evidence for the signature-sharing pairs: each pair
  // shares a signature only at the census's default composition, and
  // separates in the context that actually distinguishes it.
  const grid = createGrid(48, 34, 0); // fixed seed: the census sample grid is evidence furniture, identical every run
  for (let i = 0; i < 12; i++) stepGrid(grid);
  const separation = {
    // 'noise' registers the grid sampler itself (kernel/sample/
    // registry.js: "noise registers the grid fn itself") — the alias
    // is by design, and displacement (a mode-agnostic warp) does not
    // separate them either. The mode's identity is the live warp
    // phase, not the placed field.
    noiseIsGridAliasAtDisplacement: fingerprintItems(place({ ...PLACE_BASE, mode: 'noise', count: 60, displacement: 120 }), PLACE_FIELDS)
      === fingerprintItems(place({ ...PLACE_BASE, mode: 'grid', count: 60, displacement: 120 }), PLACE_FIELDS),
    caVsRandomWithGrid: fingerprintItems(place({ ...PLACE_BASE, mode: 'ca', count: 60 }, { caGrid: grid }), PLACE_FIELDS)
      !== fingerprintItems(place({ ...PLACE_BASE, mode: 'random', count: 60 }, { caGrid: grid }), PLACE_FIELDS),
    phylloVsFibonacciAtDivergence: fingerprintItems(place({ ...PLACE_BASE, mode: 'phyllotaxis', count: 60, phylloDivergence: -20 }), PLACE_FIELDS)
      !== fingerprintItems(place({ ...PLACE_BASE, mode: 'fibonacci', count: 60, phylloDivergence: -20 }), PLACE_FIELDS),
    liveModeBakes: ['swarm', 'hype', 'murmuration'].map((mode) => ({
      mode,
      fp: fingerprintItems(swarmBake({ ...SWARM_BASE, mode, particleCount: 40 }), BAKE_FIELDS),
    })),
  };
  separation.liveModeBakesDistinct = new Set(separation.liveModeBakes.map((r) => r.fp)).size;

  return {
    assets: assetRows,
    assetsUnreached: assetRows.filter((r) => !r.reaches),
    fontContingent: assetRows.filter((r) => r.fontContingent).map((r) => r.id),
    palettes: {
      rows: paletteRows,
      stillCollisions: groupBy(paletteRows, 'stillFp'),
      resolvedCollisions: groupBy(paletteRows, 'resolvedFp'),
      distinct: new Set(paletteRows.map((r) => r.stillFp)).size,
    },
    layouts: {
      rows: layoutRows,
      distinct: layoutGroups.size,
      collisions: [...layoutGroups.values()].filter((g) => g.length > 1),
      separation,
    },
  };
}

// ── formatting ──────────────────────────────────────────────────────
export function formatCensusReport({ paramRows, dishRows, reach, store }) {
  const L = [];
  const moves = paramRows.filter((r) => r.class === 'moves');
  const zero = paramRows.filter((r) => r.class === 'zero-in-context');
  const notHeadless = paramRows.filter((r) => r.class === 'not-headless');
  L.push(`RA3 parameter census — ${paramRows.length} keys through the pipeline`);
  L.push(`  moves: ${moves.length} · zero-delta in its consuming context: ${zero.length} · not headless-measurable: ${notHeadless.length} · dish-matrix: ${paramRows.filter((r) => r.class === 'dish-matrix').length}`);
  for (const r of paramRows) {
    if (r.class === 'moves') {
      L.push(`  ${r.key}: MOVES (${r.driver}, items ${r.delta.n0}->${r.delta.n1}, ${r.delta.moved} changed, mean shift ${r.delta.meanPosShift}px)`);
    } else if (r.class === 'zero-in-context') {
      L.push(`  ${r.key}: ZERO in context (${r.driver})${r.note ? ` — ${r.note}` : ''}`);
    } else if (r.class === 'not-headless') {
      L.push(`  ${r.key}: NOT-HEADLESS — ${r.reason}`);
    } else if (r.class === 'dish-matrix') {
      L.push(`  ${r.key}: DISH MATRIX — ${r.reason}`);
    } else {
      L.push(`  ${r.key}: ${r.class}${r.reason ? ` — ${r.reason}` : ''}`);
    }
  }
  L.push('');
  L.push('RA3 dish formation x knob matrix');
  for (const r of dishRows) L.push(`  ${r.knob} [${r.formation}] -> ${r.observable}: ${JSON.stringify(r, (k, v) => (['knob', 'formation', 'observable'].includes(k) ? undefined : v))}`);
  L.push('');
  L.push(`RA5 render reachability`);
  L.push(`  assets: ${reach.assets.length} measured, ${reach.assetsUnreached.length} unreached`);
  for (const a of reach.assetsUnreached) L.push(`    UNREACHED ${a.id} (${a.category}): ink ${a.ink}px, placed in [${a.placedIn.join(',')}], maxScale ${a.maxScale}`);
  L.push(`  font-contingent ink (text stamps — ink exists only when a monospace font does): ${reach.fontContingent.length} [${reach.fontContingent.join(', ')}]`);
  const drawing = reach.assets.filter((a) => a.ink > 0);
  const minInk = drawing.reduce((m, a) => (a.coverage < m.coverage ? a : m), drawing[0]);
  L.push(`  faintest drawing asset: ${minInk.id} at ${(minInk.coverage * 100).toFixed(2)}% ink coverage`);
  L.push(`  palettes: ${reach.palettes.rows.length} measured, ${reach.palettes.distinct} distinct stills; still collisions: ${JSON.stringify(reach.palettes.stillCollisions)}; resolved-colour collisions: ${JSON.stringify(reach.palettes.resolvedCollisions)}`);
  L.push(`  layouts: ${reach.layouts.rows.length} modes, ${reach.layouts.distinct} distinct signatures; collisions: ${JSON.stringify(reach.layouts.collisions)}`);
  const sep = reach.layouts.separation;
  L.push(`  separation: noise is the grid sampler's alias even at displacement 120: ${sep.noiseIsGridAliasAtDisplacement}; ca!=random with a CA grid: ${sep.caVsRandomWithGrid}; phyllotaxis!=fibonacci at divergence -20: ${sep.phylloVsFibonacciAtDivergence}; live-mode bakes distinct: ${sep.liveModeBakesDistinct}/3`);
  if (store) {
    L.push('');
    L.push('Store-level census (write path, evolve, RA6, PA3)');
    for (const line of store) L.push(`  ${line}`);
  }
  return L.join('\n');
}

// ── XGBoost T2: taste agreement readout (spec §6) ────────────────────
// Scores the taste ledger's keeps and passes with the active tree head
// and reports whether the model's taste agrees with the performer's
// recorded verdicts. READOUT ONLY — nothing here steers curation, the
// dice, or training; it is the census's standing answer to "does the
// head still see what Matt saw?"
//
// Scoring follows the live reduction exactly: each ledger row carries
// its recipe, and the head scores the row's layoutParams through
// tasteHead.scoreLayout (the palette rides in the recipe, but the
// head's features read layoutParams only — so, like the live
// instrument, this readout does not score the palette). Rows without
// layoutParams cannot be scored; they are counted as unscored, never
// silently dropped.
//
// Separation statistic: AUC by the rank-sum (Mann–Whitney) method —
// the probability that a randomly chosen keep out-scores a randomly
// chosen pass, ties counting half. Deterministic, no sampling, and
// hand-computable from the two score lists. Means and AUC are rounded
// to 4 decimals so the readout is a stable artifact.
export function tasteAgreement({ keeps = [], passes = [] } = {}, taste) {
  if (!taste) return { present: false, reason: 'no taste loaded' };
  const head = taste.head;
  if (!head || head.kind !== XGB_HEAD_KIND) {
    return { present: false, reason: 'taste has no tree head (linear head)' };
  }
  if (!headUsable(head)) {
    return { present: false, reason: 'tree head below the fidelity bar' };
  }
  const scoreSide = (rows) => {
    const scores = [];
    let unscored = 0;
    for (const row of rows || []) {
      const lp = row?.recipe?.layoutParams;
      if (!lp || typeof lp !== 'object') { unscored += 1; continue; }
      scores.push(scoreLayout(head, lp));
    }
    return { scores, unscored };
  };
  const k = scoreSide(keeps);
  const p = scoreSide(passes);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const r4 = (v) => (v === null ? null : +v.toFixed(4));
  return {
    present: true,
    headKind: head.kind,
    tasteVersion: taste.version,
    fidelity: head.fidelity,
    keeps: { n: k.scores.length, mean: r4(mean(k.scores)) },
    passes: { n: p.scores.length, mean: r4(mean(p.scores)) },
    unscored: k.unscored + p.unscored,
    auc: r4(rankAuc(k.scores, p.scores)),
  };
}

// Mann–Whitney AUC: rank the pooled scores (ties share the average
// rank), then AUC = (Σ keep ranks − nK(nK+1)/2) / (nK · nP).
// Null when either side is empty — no separation to speak of.
function rankAuc(keepScores, passScores) {
  if (!keepScores.length || !passScores.length) return null;
  const pooled = [
    ...keepScores.map((s) => ({ s, keep: true })),
    ...passScores.map((s) => ({ s, keep: false })),
  ].sort((a, b) => a.s - b.s);
  let rankSumKeeps = 0;
  for (let i = 0; i < pooled.length;) {
    let j = i;
    while (j < pooled.length && pooled[j].s === pooled[i].s) j += 1;
    const avgRank = (i + 1 + j) / 2; // the average of ranks i+1 … j
    for (let t = i; t < j; t += 1) if (pooled[t].keep) rankSumKeeps += avgRank;
    i = j;
  }
  const nk = keepScores.length;
  return (rankSumKeeps - (nk * (nk + 1)) / 2) / (nk * passScores.length);
}

export function formatTasteAgreement(a) {
  if (!a || a.present !== true) {
    return `taste agreement: ABSENT — ${a?.reason ?? 'not measured'}`;
  }
  const side = (label, s) => (s.mean === null ? `${label} — (n=0)` : `${label} mean ${s.mean.toFixed(3)} (n=${s.n})`);
  return [
    `taste agreement (${a.headKind}, taste v${a.tasteVersion}, fidelity ${a.fidelity})`,
    `  ${side('keeps', a.keeps)} · ${side('passes', a.passes)}`,
    `  separation AUC ${a.auc === null ? '—' : a.auc.toFixed(3)} (P(keep out-scores pass), ties half) · ${a.unscored} unscored rows`,
  ].join('\n');
}
