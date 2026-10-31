// Layout mode definitions — single source of truth

import { BEHAVE_IDS } from '../engine/organisms/behave.js';
import { COMPOSITION_PRESETS } from './presets.js';
import { resolveLookId } from './taxonomy.js';
import { BALLISTICS_CURVES } from '../gl/audioBallistics.mjs';
import { TRAIL_MODES } from '../gl/trailMode.mjs'; // #560 — the trail vocabulary (resolveTrail's list)
import { KINEME_PATTERNS, TRANSPORT_MODES, PATH_FAMILIES } from '../engine/kineme.js'; // #1128; #1574: the transport vocabulary; #1575: the PATH families
import { FIELDMAP_FIELDS, FIELDMAP_CHANNELS, FIELDMAP_CURVES } from '../engine/fieldMap.mjs'; // #1199
import { GLASS_BODY_ALPHA } from '../engine/glassBody.mjs'; // #1585 (Materials M4) — the shipped glass tune is the param default
import { PLATE_CENTER, PLATE_RADIUS } from '../engine/plateBody.mjs'; // #1585 — ditto, plate geometry
import { STIPPLE_DOT_SCALE } from '../engine/stippleBody.mjs'; // #1585 — ditto, Matt's dot scale

export const LAYOUT_MODES = [
  { id: 'random', name: 'random', glyph: 'rand' },
  { id: 'grid', name: 'grid', glyph: 'grid' },
  { id: 'fibonacci', name: 'fibonacci', glyph: 'phi' },
  // #585 — the golden-angle family with the divergence exposed; `fibonacci`
  // is its fixed point (see the sampler). Sibling, not duplicate.
  { id: 'phyllotaxis', name: 'phyllotaxis', glyph: 'phyllo' },
  { id: 'radial', name: 'radial', glyph: 'rad' },
  { id: 'truchet', name: 'truchet', glyph: 'tile' },
  { id: 'swarm', name: 'swarm boids', glyph: 'swarm' },
  { id: 'noise', name: 'noise warp', glyph: 'noise' },
  { id: 'hype', name: 'moth·hype', glyph: 'hype' },
  { id: 'stratified', name: 'stratified', glyph: 'strat' },
  { id: 'flow', name: 'wave', glyph: 'flow' },
  { id: 'brush', name: 'brush line', glyph: 'brush' },
  { id: 'layers', name: 'layers', glyph: 'z' },
  { id: 'rails', name: 'rails', glyph: 'rail' },
  { id: 'ca', name: 'cellular', glyph: 'ca' },
  { id: 'voronoi', name: 'voronoi', glyph: 'vein' },
  { id: 'lsystem', name: 'l-system', glyph: 'frond' },
  { id: 'dla', name: 'DLA growth', glyph: 'coral' }, // #720
  { id: 'eden', name: 'Eden growth', glyph: 'bloom' }, // #720
  { id: 'orbit', name: 'orbit', glyph: 'orbit' },
  { id: 'abacus', name: 'abacus', glyph: 'abacus' },
  { id: 'poisson', name: 'poisson', glyph: 'pois' }, // #1193
  { id: 'gaussian', name: 'gaussian', glyph: 'gaus' }, // #1194
  { id: 'circlepack', name: 'circle pack', glyph: 'pack' }, // #1195
  { id: 'colonize', name: 'colonize', glyph: 'branch' }, // #1197
  { id: 'voronoi-cells', name: 'voronoi cells', glyph: 'cell' }, // #1196
  { id: 'streamline', name: 'streamlines', glyph: 'stream' }, // #1794
  // #280 — murmuration is a curated voice, not a new engine: it runs on the
  // swarm engine (see isLiveSwarmMode below) with its own palette + motion
  // character. Kept out of the stub list so it never falls back to a bare
  // sampler.
  { id: 'murmuration', name: 'murmuration', glyph: 'deep' },
];

export function isLiveSwarmMode(mode) {
  return mode === 'swarm' || mode === 'hype' || mode === 'murmuration';
}

export function isOrganismMode(mode) {
  return mode === 'hype';
}

export const SYMMETRY_MODES = [
  'none',
  'bilateral',
  'radial-4',
  'radial-6',
  'radial-8',
  'radial-12',
  'kaleido-6',
  'kaleido-8',
  'kaleido-12',
];
export const BEHAVE_MODES = BEHAVE_IDS;

/** #1202 — MIRROR is a 4-state reflection mode, not a boolean.
 *  OFF = no reflection, X/Y = single-axis (2× items), XY = both axes (4×). */
export const MIRROR_STATES = ['off', 'x', 'y', 'xy'];

/** Reflection multiplier: how many copies each source item becomes. */
export function mirrorMultiplier(mirror) {
  if (mirror === 'xy') return 4;
  if (mirror === 'x' || mirror === 'y' || mirror === true) return 2; // legacy boolean true = X
  return 1;
}

/** Parse a symmetry id into { kind, folds }.
 *  kind: 'none' | 'bilateral' | 'radial' (cyclic, rotation-only) | 'kaleido' (dihedral, alternating mirrors). */
export function symmetryParts(symmetry) {
  const s = String(symmetry ?? 'none');
  if (s === 'bilateral') return { kind: 'bilateral', folds: 0 };
  let m = /^radial-(\d+)$/.exec(s);
  if (m) return { kind: 'radial', folds: parseInt(m[1], 10) };
  m = /^kaleido-(\d+)$/.exec(s);
  if (m) return { kind: 'kaleido', folds: parseInt(m[1], 10) };
  return { kind: 'none', folds: 0 };
}

/** #167 — onContact response per overlapping pair. */
export const CONTACT_MODES = ['none', 'bounce', 'swap', 'stick', 'die', 'breed'];

export const PALETTE_SHIFTS = ['auto', 'band', 'zone', 'split'];

export const BLEND_MODES = ['normal', 'screen', 'multiply', 'overlay', 'difference', 'plus-lighter', 'soft-light'];

export const DEFAULT_LAYOUT_PARAMS = {
  composition: 'praystation',
  mode: 'fibonacci',
  count: 240,
  scale: { x: [0.4, 1.6], y: [0.4, 1.6] }, // #1202 — non-uniform scale: linked default = the old pair twice
  rotate: [-180, 180],
  alpha: [40, 100],
  zTiers: 4,
  jitter: 24,
  density: 78,
  bleed: false,
  mirror: 'off', // #1202 — 4-state reflection: off | x | y | xy
  overlap: true,
  glass: false, // #1129 PR1 — glass-body material: translucent instances sort back-to-front by z-tier
  blendMode: 'normal',
  hueRotate: 0,
  paletteShift: 'auto',

  accumulation: false,
  accumulationFade: 5.4, // #274: trail half-life in frames (was keep 0.88)
  trail: 'accum', // #560 Leave holds the stamps
  echoes: 0, // live echo taps, 0..4
  // #1804: accumScan / accumScanFlip deliberately live OUTSIDE both this
  // table and PARAM_SPEC. normalizeLayoutParams fills defaults into the
  // resolver's output and the replay gates (#1638) hash that output — a
  // new default key diverges every recorded take (proven by this slice:
  // the gates went red until the defaults came out) — while PARAM_SPEC
  // membership requires a default (normalize jitters every spec key and
  // demands a finite value). So the params exist only once the performer
  // sets them (AccumFamily / LAYOUT_PARAM, like the string/boolean
  // params' event path), every reader treats absent as 0 / unflipped,
  // the panel slider bounds the amount, and accumRecipeParams clamps it
  // again at the recipe boundary — the value cannot reach the buffer
  // unclamped.
  leaveFade: 0, // 0 holds the stamps, higher fades them
  tunnelFade: 0,
  prismFade: 0,
  flowFade: 0,
  accumulationOptics: 0, // #190: bloom + halation + stipple-diffusion amount (GLOW slider) (#308: no gaussian blur)
  accumulationTunnel: 0, // Phase A: feedback zoom/spin amount (TUNNEL slider)
  accumulationPrism: 0, // Phase A: chromatic drift amount (PRISM slider)
  accumulationFlow: 0, // #284 Phase B2: curl advection of the trail buffer (FLOW slider)
  accumulationWetness: 0, // #970 WETNESS: 0 is dry paper, live-only

  // #585 — degrees of divergence away from the golden angle. 0 is the golden
  // angle itself, where phyllotaxis and the fibonacci tile agree exactly.
  phylloDivergence: 0,
  // #588 — L-system generation depth and branch angle (degrees).
  lsysDepth: 4,
  lsysAngle: 25,
  // #720 — DLA / Eden growth. growthRate is cells per tick at full drive
  // (floors at 1 — the piece never freezes); growthBranch is DLA stick
  // probability (Eden ignores it). Both are exposed for the curator
  // engine (#762), which owns the audio→growth mapping.
  growthRate: 3,
  growthBranch: 0.8,
  // #1197 — space-colonization species knobs: influence radius (px),
  // kill radius (px), branch probability, step size (px).
  colonizeInfluence: 90,
  colonizeKill: 18,
  colonizeBranch: 0.25,
  colonizeStep: 7,
  // #1794 — streamlines: trace count, max steps per trace, step size (px).
  streamlineTraces: 42,
  streamlineSteps: 180,
  streamlineStep: 6,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
  displacement: 0,
  // Brush line: nominal stamp diameter px, step as fraction of it,
  // simplex field scale per px, trail count.
  brushSize: 24,
  brushSpacing: 0.5,
  fieldScale: 0.004,
  trailCount: 6,
  // Slice 2 — the crooked: perpendicular wobble amplitude in px (0 = the
  // trail exactly) and its frequency per stamp.
  wobbleAmp: 0,
  wobbleFreq: 0.5,
  particleCount: 150,
  swarmCohesion: 0.6, // #272: retuned to the honest slider max (was 1.5, past the 'one blob' threshold)
  gravityWells: 1.0,
  damping: 0.95,

  body: 3,
  flap: 0.35,
  // #1694 S3 — how many creatures live in the dish (0..4, the old DIRECTORS
  // stepper's exact range). The count is a BUILD param since the fold-in:
  // quantized hand input beside its neighbours, read by liveLoop, which
  // stamps it on the resolver input as `creatureCount`. Default 0 is the
  // pre-fold-in store default — an untouched stage spawns nothing. A saved
  // project from before the move carries the count as a top-level
  // `creatureCount` field instead; projectDocument lands it here on load.
  creatures: 0,
  kinemeRate: 1, // #781 KINEME RATE: 1 = each kineme's own tempo, 0 freezes
  // #1127 ROTATE spin: every mark that has no kineme of its own turns this many revolutions per second, on top of
  // its static angle (the ROTATE range stays the spread of starting angles). Off by default since #1128: the
  // living-motion floor below (breath and drift) is what a fresh scene gives, and spin is CHOSEN in the ROTATE
  // dialog (Matt, 2026-10-07: spin is chosen, drift is given).
  rotateSpin: 0,
  // Kineme living-motion drivers (#1128): the floor that makes "nothing is ever 100% frozen" (#721) architectural.
  // A NEW scene breathes (0.3) and drifts (0.5), each mark on its own phase from the seed. A project, keep or link
  // saved before these defaults existed loads with both at 0 (normalizeLayoutParams): it opens as it was saved.
  // Amount 0 is a hard gate: the maths is skipped, not multiplied by zero. Boil fps: 8 default, 6–12 exposed.
  // #1151 — palette-breath joins the floor: a per-instance palette sweep (color domain). Default 0.12 ≈ ±12% of
  // the palette — shimmer, not strobe. Reduced motion damps it to zero.
  // #1183 — how far a mark takes the colour of the PATTERN ground beneath it. 0 = today's frame exactly.
  groundLean: 0,
  // #1183 — tile-edge nudge: marks ease off the edges of the PATTERN tile beneath them. 0 = today's frame exactly.
  groundNudge: 0,
  // #1183 — contact shadow: marks cast a soft shadow onto what lies beneath them (needs a PATTERN below). 0 = off.
  groundShadow: 0,
  // #1183 — palette snap: the share of marks that take the exact colours of the PATTERN tile beneath them. 0 = off.
  groundSnap: 0,
  // #1183 weather — how far this layer's marks fade into the haze of the nearest FX layer above them
  // (the WEATHER dial). 0 = today's frame exactly; absent in a saved project loads as 0.
  weatherAir: 0,
  kinemeBreath: 0.3,
  kinemeDrift: 0.5,
  kinemePulse: 0,
  kinemePaletteBreath: 0.12,
  kinemePattern: 'DRIFT', // #1128 DIRECTOR pattern: DRIFT | SWELL | THUMP (re-weight the amounts) | ORGANIC | CADENCE (#1198: switch on the rhythm placement layer; an unknown name is DRIFT)
  // #1574 — travel kinemes P1: the transport core. `transport` is the mode
  // ('still' | 'flow'); transportLeash is the leash radius in px (no home
  // force inside it; 0 = still, whatever the mode); transportFlow is the
  // FLOW strength 0..1. 'still' is the default and a document that predates
  // #1574 carries no keys, so it opens exactly as it was saved — the sim
  // never runs and placements are bit-identical. The editing surface is
  // the Directors panel's motion group (Matt's ruling, 2026-10-14); these
  // keys stay recipe data: saved, crowned, replayed, censused.
  transport: 'still',
  transportLeash: 112, // px — the #1573 spike's proven radius (0.16 of a 700px-min canvas)
  transportFlow: 0.8,
  // #1575 — travel kinemes P2: the PATH assignment. `transportPath` is the
  // PATH family (orbit | spiral | sweep | lissajous); transportSpeed is
  // its rate multiplier and transportRadius its amplitude in px. They
  // matter only when transport is 'path'; a document that predates P2
  // carries none of them and opens with these defaults sitting inert
  // beside a 'still'/'flow' mode, exactly as it was saved. Editing
  // surface: the Directors motion group (family chips + speed/radius
  // rows), plus the minimal mode chip on the BUILD stratum block — the
  // same split P1 shipped under Matt's 2026-10-14 controls ruling.
  transportPath: 'orbit',
  transportSpeed: 1,
  transportRadius: 140, // px — under the leash's 400 max, over the rhythm layer's ±5.6 px by design
  // #1576 — travel kinemes P3: SURGE + parallax drift. Both are amounts
  // (0..1) and 0 is OFF — the parity gate: a document that predates P3
  // carries neither key and opens with both sitting inert at 0, exactly
  // as it was saved, whatever its transport mode (surge and drift are
  // independent of the FLOW/PATH modes — they compose on top of any
  // scene, still scenes included). transportSurge is the surge AMOUNT
  // (ruled to the Directors motion group, #1574's comment); what FIRES
  // a surge is Q3, unruled — no trigger surface exists, and the
  // machinery's trigger input stays inert (engine/surge.js).
  // transportParallax is the drift amount — NOT the #796 camera
  // parallax (the `parallax` key below): this one drifts the anchors
  // themselves, proportional to zTier, on the step clock
  // (engine/parallaxDrift.js).
  transportSurge: 0,
  transportParallax: 0,
  kinemeBrushWobble: 0,
  kinemeBoilFps: 8,
  squash: 0, // #594 PR3: 0 = the plain #309 smear (stretch only), byte-identical
  crooked: 0, // Crooked Hand. 0 is today's quad.
  // #1482 P3 — spectrum marks (STIMULI → SPECTRUM). Which frequency a mark listens to: 0 INDEX, 1 ANGLE, 2 POSITION,
  // 3 HASH; and three amounts. All amounts 0 is today's frame, byte for byte.
  spectrumMap: 0,
  spectrumScale: 0,
  spectrumDisplace: 0,
  spectrumColour: 0,
  tight: 0.55,
  wind: 1,
  symmetry: 'none',
  behave: 'cruise',
  // #479 Option B — per-layer BEHAVE steering-weight overrides. null means
  // "no override, use the behave.js table row for the current chip" — the
  // same default-preserving sentinel clampNum already gives every other
  // optional numeric field (see clampNum's null-handling comment below).
  // Never randomized/morphed: these are direct physics tuning, not part of
  // RANDOMIZABLE_KEYS/MORPHABLE_KEYS in paramUtils.js.
  behaveSep: null,
  behaveAli: null,
  behaveCoh: null,
  behaveSepR: null,
  behaveAliR: null,
  behaveCohR: null,
  behaveWind: null,
  behaveOrbit: null,
  behaveAttract: null,
  material: 'plate',
  // #1585 (Materials M4) — the material bodies' scalar tunables as live
  // per-Look params. The defaults ARE the shipped constants (imported
  // from the body leaves above, one source of truth): a Look that
  // predates M4, or one that never touches these knobs, renders
  // exactly as the constants rendered it. The STIPPLE_DOTS / WASH_STOPS
  // / PLATE_STOPS tables stay authored data in their leaves — these
  // knobs scale and spread them, never replace them. Plate centre is
  // two scalars (plateCenterX / plateCenterY): PARAM_SPEC's currency
  // is the scalar, and the one structured precedent (scale {x,y})
  // carries ranges, not points — two clamped scalars are the honest
  // fit, each swept and censused on its own.
  glassAlpha: GLASS_BODY_ALPHA,
  plateRadius: PLATE_RADIUS,
  plateCenterX: PLATE_CENTER.x,
  plateCenterY: PLATE_CENTER.y,
  washStrength: 1, // the wash ramp at full travel (washBody.mjs)
  washSpread: 1, // the wash ramp spans the full glyph height
  stippleDotScale: STIPPLE_DOT_SCALE,
  // #287 bio-drives. metabolism 0 = drives off (legacy behaviour);
  // breath 0 = no breathing swell; graze 0 = no grazers. graze is a hidden
  // voice-level param (no slider — the spec is the trust boundary, same as
  // the #167 contact params before their UI follow-up).
  metabolism: 0,
  breath: 0,
  graze: 0,

  // #167 — organism contacts. contactRadius 0 disables the contact pass
  // entirely (the swarm is then bit-identical to the pre-contact engine).
  contactRadius: 0,
  contactRestitution: 0.5,
  contactRepel: 0,
  contactMode: 'none',
  collideMask: 0xffffffff,
  // #1538 (petri spec §4) — TEMPO: the dish's thermal energy
  // (Brownian jitter amplitude; law in engine/dishThermal.mjs).
  // Default 0 = cold: the pre-#1538 dish bit for bit, so a document
  // that predates the row opens exactly as it was saved. DENSITY's
  // §4 meaning (crowding pressure on the repel gain, pivot = the
  // density default 78 above) needs no new key — it reinterprets
  // the existing density param in the dish path only.
  dishTempo: 0,
  // #1409 (petri dish A3) — the per-Look DISH switch: gates the shared
  // cross-strata grid (#1407) at enrolment. Default ON (spec open
  // question 1, ratified): a Look is a world, and worlds have physics.
  // OFF restores the pre-dish ghost stack — strata pass through each
  // other — while each stratum's own #167 contacts keep working exactly
  // as before. No migration case for old saves: every shipped voice and
  // preset carries contactRadius 0, so dish ON cannot arm on any
  // existing document; a document that predates A3 opens with the same
  // behaviour it was saved with, and the switch is there to choose.
  dish: true,
  // #1416 (petri dish C4) — the ecology MODE: dish population law
  // (one pooled cap at the governor, density-gated breed, crowding
  // die pressure), per the spec's open-question-3 recommendation
  // that ecology is a performance decision, not a default behaviour.
  // Default OFF: while off, an enrolled stratum's populations are
  // exactly as dealt. No migration case for old saves: every shipped
  // voice and preset carries contactRadius 0, so no existing
  // document enrols in the dish at all (A3's record).
  ecology: false,

  audioModDepth: 0.65,
  audioScaleMod: 0.45,
  audioAlphaMod: 0.25,
  // #306: audio ballistics — envelope follower + response curve + glow fader.
  audioAttackMs: 25,
  audioDecayMs: 320,
  audioResponse: 'exponential',
  audioSwell: 1,
  lifeDrift: 0.35,
  parallax: 0, // #796 diorama drift; 0 = placements bit-identical
  // #1199 — field→channel MAP (MATH stratum): data drives visual channels.
  // fieldMapField 'off'|'noise'|'density', fieldMapChannel
  // 'off'|'weight'|'saturation'|'scale', fieldMapAmount 0..1 dry/wet,
  // fieldMapCurve 'linear'|'smooth'|'stepped'. All-off is the no-op: a
  // document that predates #1199 opens exactly as it was saved.
  fieldMapField: 'off',
  fieldMapChannel: 'off',
  fieldMapAmount: 0,
  fieldMapCurve: 'smooth',
};

/** #306 — audio envelope response-curve shapes. */
export const AUDIO_RESPONSE_IDS = BALLISTICS_CURVES;

export const MODE_IDS = LAYOUT_MODES.map((m) => m.id);
// #268: SHADING_MODES / MATERIAL_IDS removed — the GL renderer renders
// everything flat; the controls are gone, so the params are gone too.
export const COMPOSITION_IDS = COMPOSITION_PRESETS.map((p) => p.id);

/**
 * Numeric bounds for every scalar in DEFAULT_LAYOUT_PARAMS — the same limits
 * the sliders in panels/layout/*Sliders.jsx and panels/stimulus enforce.
 *
 * This is the trust boundary for project JSON (#106). A project arrives from
 * a file picker, an autosave written by an older build, or `studio/render.mjs`
 * reading an arbitrary path, and until now none of these were checked:
 * `{"jitter": 1e999}` parses to Infinity and produced a whole canvas of
 * non-finite coordinates, and `{"particleCount": 1e7}` asked the swarm to
 * allocate ten million particles.
 *
 * Keep in sync with the sliders — they are the UI half of the same contract.
 * A value the UI cannot produce should not survive a project load either.
 */
export const PARAM_SPEC = {
  count: { min: 10, max: 800, int: true },
  jitter: { min: 0, max: 200 },
  density: { min: 10, max: 100 }, // #272: capped at 100
  zTiers: { min: 1, max: 12, int: true },
  hueRotate: { min: 0, max: 360 },
  // A fraction of a degree already re-counts the spiral arms, so the range is
  // small on purpose: past a few degrees the disc stops reading as growth.
  phylloDivergence: { min: -20, max: 20 },
  // Depth is capped hard: the worst-case rule is 5^depth segments, and the
  // walk must never outgrow the placement budget (see the sampler).
  lsysDepth: { min: 1, max: 5, int: true },
  lsysAngle: { min: 5, max: 90 },
  // #720 — growthRate 0 still creeps (1 cell/tick floor in the engine);
  // growthBranch maps to DLA stick probability 0.25..1.0.
  growthRate: { min: 0, max: 12 },
  growthBranch: { min: 0, max: 1 },
  // #1197 — colonize knobs: kill must stay well under influence or the
  // veins starve (no attractors survive within reach).
  colonizeInfluence: { min: 20, max: 300 },
  colonizeKill: { min: 2, max: 60 },
  colonizeBranch: { min: 0, max: 1 },
  colonizeStep: { min: 2, max: 24 },
  // #1794 — streamlines: traces/steps caps mirror the sampler's hard caps;
  // step is the stamp spacing along the trace (brushSpacing's lesson:
  // at or under the stamp size the line reads continuous).
  streamlineTraces: { min: 4, max: 96, int: true },
  streamlineSteps: { min: 16, max: 400, int: true },
  streamlineStep: { min: 2, max: 24 },
  noiseFreq: { min: 0.001, max: 0.03 },
  noiseSpeed: { min: 0.1, max: 3.0 },
  // Brush line: spacing ≤ 0.7 reads as a continuous line; wider is a
  // dotted texture (a feature). trailCount is an int.
  brushSize: { min: 4, max: 96 },
  brushSpacing: { min: 0.1, max: 2 },
  fieldScale: { min: 0.001, max: 0.02 },
  trailCount: { min: 1, max: 24, int: true },
  wobbleAmp: { min: 0, max: 40 },
  wobbleFreq: { min: 0.05, max: 2 },
  displacement: { min: 0, max: 250 },
  // int: true — a fractional value mid-MIX reaches ParticleSystem.init as a
  // non-integer array length (RangeError, surfaces as a RENDER FAULT). Every
  // other count-like param (zTiers, body, collideMask) already has this.
  particleCount: { min: 10, max: 500, int: true },
  swarmCohesion: { min: 0, max: 5.0 },
  gravityWells: { min: 0, max: 5.0 },
  damping: { min: 0.8, max: 0.99 },
  body: { min: 1, max: 7, int: true },
  flap: { min: 0, max: 1 },
  // #1694 S3 — the creature count's bounds ARE sanitizeCount's bounds
  // (curator/spawn.js, MAX_CREATURES): the trust boundary and the spawn
  // sanitizer clamp to the same 0..4, so no door can land a fifth creature.
  creatures: { min: 0, max: 4, int: true },
  // #594 PR3 squash-and-stretch: how much a moving mark thins across its
  // motion while the #309 smear stretches it along — 1 holds its area.
  squash: { min: 0, max: 1 },
  crooked: { min: 0, max: 1 },
  spectrumMap: { min: 0, max: 3, int: true },
  spectrumScale: { min: 0, max: 1 },
  spectrumDisplace: { min: 0, max: 1 },
  spectrumColour: { min: 0, max: 1 },
  kinemeRate: { min: 0, max: 4 }, // #781 KINEME RATE
  rotateSpin: { min: 0, max: 1 }, // #1127 ROTATE spin, rev/s
  groundLean: { min: 0, max: 1 },
  groundNudge: { min: 0, max: 1 },
  groundShadow: { min: 0, max: 1 },
  groundSnap: { min: 0, max: 1 },
  weatherAir: { min: 0, max: 1 }, // #1183 weather — the WEATHER dial (haze as air)
  kinemeBreath: { min: 0, max: 1 },
  kinemeDrift: { min: 0, max: 1 },
  kinemePulse: { min: 0, max: 1 },
  kinemePaletteBreath: { min: 0, max: 1 },
  fieldMapAmount: { min: 0, max: 1 }, // #1199 — MAP row amount, dry/wet
  kinemeBrushWobble: { min: 0, max: 1 },
  kinemeBoilFps: { min: 6, max: 12 },
  // #1574 — travel: the leash radius in px (0 = still) and the FLOW strength.
  transportLeash: { min: 0, max: 400 },
  transportFlow: { min: 0, max: 1 },
  // #1575 — PATH: the rate multiplier (0 freezes the path at its deal) and
  // the amplitude in px (spiral breathing / sweep arc / lissajous reach).
  transportSpeed: { min: 0, max: 2 },
  transportRadius: { min: 0, max: 300 },
  // #1576 — P3 amounts: the surge z-approach depth and the parallax
  // drift rate, both fractions of their modules' full travel.
  transportSurge: { min: 0, max: 1 },
  transportParallax: { min: 0, max: 1 },
  tight: { min: 0.05, max: 0.95 },
  wind: { min: 0, max: 3 },
  // #479 Option B — BEHAVE override bounds, generous headroom over the
  // table's own observed ranges (behave.js: sep 1.8-4.2, ali 0-1.0,
  // coh 0-1.35, radii 20-80, wind 0.08-0.35, orbit 0-0.55, attract 0.1-1).
  behaveSep: { min: 0, max: 6 },
  behaveAli: { min: 0, max: 2 },
  behaveCoh: { min: 0, max: 2 },
  behaveSepR: { min: 0, max: 150 },
  behaveAliR: { min: 0, max: 150 },
  behaveCohR: { min: 0, max: 150 },
  behaveWind: { min: 0, max: 1 },
  behaveOrbit: { min: 0, max: 1 },
  behaveAttract: { min: 0, max: 2 },
  // #287 bio-drives — the two new sliders (METABOLISM, BREATH) plus the
  // hidden voice-level grazer fraction.
  metabolism: { min: 0, max: 2 },
  breath: { min: 0, max: 1 },
  graze: { min: 0, max: 1 },
  accumulationFade: { min: 1, max: 40 }, // #274: half-life frames
  leaveFade: { min: 0, max: 1 },
  tunnelFade: { min: 0, max: 1 },
  prismFade: { min: 0, max: 1 },
  flowFade: { min: 0, max: 1 },
  echoes: { min: 0, max: 4 },
  // #1804: no accumScan entry here either — see the DEFAULT_LAYOUT_PARAMS note.
  accumulationOptics: { min: 0, max: 0.25 }, // #308 review: remapped — full slider travel is the usable range
  accumulationTunnel: { min: 0, max: 1 },
  accumulationPrism: { min: 0, max: 1 },
  accumulationFlow: { min: 0, max: 1 }, // #284: Phase B2 curl advection amount
  accumulationWetness: { min: 0, max: 1 }, // #970 live wetness; 0 is the dry path
  // #1478 — the master gains reach 2 (defaults unchanged at 0.65 / 0.45 / 0.25): a normal mic signal is low on the bands,
  // so the ceiling was what limited the animation, not the route sliders (those already span the output clamp).
  audioModDepth: { min: 0, max: 2 },
  audioScaleMod: { min: 0, max: 2 },
  audioAlphaMod: { min: 0, max: 2 },
  // #306: envelope follower time constants (ms), glow swell fader.
  audioAttackMs: { min: 0, max: 2000 },
  audioDecayMs: { min: 0, max: 5000 },
  audioSwell: { min: 0, max: 1 },
  lifeDrift: { min: 0, max: 1 },
  parallax: { min: 0, max: 1 },
  // #167 — contact disc radius in px (0 = contacts off), bounce 0–1,
  // personal-space force gain, and the 32-bit layer-interaction mask.
  // The spec is the trust boundary (#107). #1409 exposes restitution and
  // repel (plus the dish switch) on the strata block; the radius itself
  // stays voice/layout-set — it is the px anchor of A2's radius law, not
  // a performance knob.
  contactRadius: { min: 0, max: 120 },
  contactRestitution: { min: 0, max: 1 },
  contactRepel: { min: 0, max: 5 },
  collideMask: { min: 0, max: 0xffffffff, int: true },
  // #1585 (Materials M4) — material body tunables. glassAlpha is the
  // fraction of rolled alpha a glass body keeps (0 = the body
  // vanishes, 1 = no attenuation). Plate geometry is in glyph-box
  // units like the def it came from: radius spans past the box at the
  // top end (the shipped 1.05 already does), centre anywhere in the
  // box. washStrength scales the ramp's travel toward ink; washSpread
  // stretches (or compresses) the height over which it travels.
  // stippleDotScale multiplies the authored dot radii (STIPPLE_DOTS).
  glassAlpha: { min: 0, max: 1 },
  plateRadius: { min: 0.2, max: 2 },
  plateCenterX: { min: 0, max: 1 },
  plateCenterY: { min: 0, max: 1 },
  washStrength: { min: 0, max: 1 },
  washSpread: { min: 0.25, max: 4 },
  stippleDotScale: { min: 0.5, max: 5 },
  // #1538 — TEMPO, the dish's thermal knob: 0 cold (identity) to
  // 1 full Brownian jitter. #1409-class dish law, not a performance
  // slider range — the DISH block's RangeRow spans exactly this.
  dishTempo: { min: 0, max: 1 },
};

/**
 * #1607 (Strata Q Phase 1) — the stop table: the authored OFF · LOW · MID ·
 * HIGH detents for every continuous value on the BUILD shelves (§1–§4).
 * Authored under the stop-table law (docs/research/strata-quantized/plan.md,
 * Phase 0 paper):
 *
 *  1. Stops are authored per param, never derived from PARAM_SPEC ranges.
 *  2. The shipped default (DEFAULT_LAYOUT_PARAMS) is always one of the
 *     stops — a mode tap can always return to Matt's by-eye tune.
 *  3. Where a taper exists, stops are authored in taper space — chosen
 *     where the hand travels, then mapped through the taper. The `taper`
 *     descriptor records the curve each tapered entry was authored
 *     against (modeStops.selfcheck verifies the slider-space spread).
 *  4. Detent labels name effect strength, not numeric order: an entry
 *     whose effect strengthens as its number falls lists its stops in
 *     effect order (descending numbers).
 *  5. OFF = this param contributes nothing. Magnitude class (the default
 *     sits at the range's no-effect end): OFF is that value, usually the
 *     PARAM_SPEC min. Identity class (`identity: true` — the param's
 *     no-effect value is its neutral, not its floor): OFF is the neutral,
 *     never the range minimum.
 *  7. Int counts in ATLAS_AFFECTING_PARAMS carry `atlas: true` — a coarse
 *     stop there changes rebake behaviour, not just feel.
 *
 * The table governs HAND INPUT ONLY (the data law): stored values stay
 * continuous, dice/curator/governor keep writing in-between values, and a
 * row holding one lights its nearest stop with the off-detent mark.
 * Exempt shelf params are absent by design (Phase 0's closed list):
 * phylloDivergence (precision), plateCenterX / plateCenterY (position),
 * hueRotate (the dial), and the SCALE / ROTATE / ALPHA dual ranges.
 * accumScan is here despite having no PARAM_SPEC entry (#1804 keeps it
 * out of the spec on purpose); its stops are authored against its panel
 * range 0..1 like every other entry.
 */
export const PARAM_STOPS = {
  // ── ① LAYOUT ──
  count: { stops: [10, 120, 240, 800], atlas: true },
  jitter: { stops: [0, 24, 80, 200] },
  density: { stops: [10, 40, 78, 100] },
  // The #1183 ground family: plain 0..1 amounts, 0 = today's frame exactly.
  groundLean: { stops: [0, 0.25, 0.55, 1] },
  groundNudge: { stops: [0, 0.25, 0.55, 1] },
  groundShadow: { stops: [0, 0.25, 0.55, 1] },
  groundSnap: { stops: [0, 0.25, 0.5, 1] },
  weatherAir: { stops: [0, 0.25, 0.55, 1] },
  // ── ③ swarm physics ──
  particleCount: { stops: [10, 80, 150, 400], atlas: true },
  // The editor's honest max is 0.6 (#272 retune) — the stops live inside it;
  // the shipped default sits at HIGH.
  swarmCohesion: { stops: [0, 0.2, 0.4, 0.6] },
  gravityWells: { stops: [0, 1, 2.5, 5] },
  // Identity class (Phase 0 names damping explicitly): OFF is the tuned
  // neutral 0.95, and LOW→HIGH runs toward MORE friction — lower numbers,
  // per rule 4. The stops descend on purpose; do not "fix" the order.
  damping: { stops: [0.95, 0.93, 0.89, 0.83], identity: true },
  noiseSpeed: { stops: [0.1, 0.5, 1.2, 3] },
  // ── ③ hype / moth ──
  creatures: { stops: [0, 1, 2, 4] },
  body: { stops: [1, 2, 3, 5], atlas: true },
  // #1608 (Phase 2) — the #716 motion keys (flap / breath / wind) join the
  // table: the closed Phase 0 exemptions list never named the tiles, and
  // D1's scope covers them, so their BUILD form is the mode row like every
  // neighbour. The MotionTile glyph form survives only in STIMULI (life),
  // outside the amendment's BUILD scope. All three are magnitude class:
  // at 0 the param contributes nothing (no beat, no swell, no wind).
  flap: { stops: [0, 0.35, 0.65, 1] },
  tight: { stops: [0.05, 0.35, 0.55, 0.85] },
  breath: { stops: [0, 0.3, 0.6, 1] },
  wind: { stops: [0, 0.5, 1, 3] },
  metabolism: { stops: [0, 0.5, 1, 2] },
  // ── ③ ACCUM trail family ──
  echoes: { stops: [0, 1, 2, 4] },
  accumScan: { stops: [0, 0.3, 0.65, 1] },
  // The LEAVE fade editor spans 0..0.2 (its usable range) — stops live there.
  leaveFade: { stops: [0, 0.05, 0.1, 0.2] },
  tunnelFade: { stops: [0, 0.25, 0.55, 1] },
  prismFade: { stops: [0, 0.25, 0.55, 1] },
  flowFade: { stops: [0, 0.25, 0.55, 1] },
  // Authored in half-life taper space (slider 0 / .30 / .46 / .81): OFF is
  // the 1-frame strobe, MID is the shipped 5.4-frame default.
  accumulationFade: { stops: [1, 3, 5.4, 20], taper: { kind: 'halfLife', minFrames: 1, maxFrames: 40 } },
  // Authored in GLOW's power taper space (slider 0 / .40 / .63 / 1).
  accumulationOptics: { stops: [0, 0.04, 0.1, 0.25], taper: { kind: 'power', min: 0, max: 0.25, exp: 2 } },
  // Authored in the power taper space of #1882's WETNESS taper (slider
  // 0 / .39 / .67 / 1) — that PR adds the taper to this row's editor; the
  // stops were chosen against the same curve so the two compose.
  accumulationWetness: { stops: [0, 0.15, 0.45, 1], taper: { kind: 'power', min: 0, max: 1, exp: 2 } },
  accumulationTunnel: { stops: [0, 0.25, 0.55, 1] },
  accumulationPrism: { stops: [0, 0.25, 0.55, 1] },
  accumulationFlow: { stops: [0, 0.25, 0.55, 1] },
  // ── ④ APPEARANCE ──
  crooked: { stops: [0, 0.25, 0.55, 1] },
  squash: { stops: [0, 0.3, 0.65, 1] },
  growthRate: { stops: [0, 3, 6, 12] },
  growthBranch: { stops: [0, 0.4, 0.8, 1] },
  // ── ④ materials (M4) ──
  // Identity by meaning: at 1 the glass keeps its full rolled alpha — the
  // param contributes nothing — so OFF is 1, never the vanishing 0. The
  // effect (attenuation) strengthens as the number falls, so the stops
  // descend in effect order; MID is the shipped 0.78 tune.
  glassAlpha: { stops: [1, 0.9, 0.78, 0.5], identity: true },
  plateRadius: { stops: [0.2, 0.65, 1.05, 1.8] },
  washStrength: { stops: [0, 0.4, 0.7, 1] },
  // Identity class: 1 is the wash ramp exactly as authored (the param
  // contributes no change), so OFF is the shipped default itself; the
  // detents spread in the working direction — a lazier, longer ramp.
  washSpread: { stops: [1, 1.6, 2.5, 4], identity: true },
  stippleDotScale: { stops: [0.5, 1.2, 2.5, 4.5] },
  // ── ② CAST — the DISH knobs (#1409): layout params whose rows live
  // inside the strata blocks, not on a shelf (#1608, Phase 2). Same law:
  // authored stops, the shipped default always among them, magnitude
  // class (0 = the knob contributes nothing: no bounce, no repel, a cold
  // dish).
  contactRestitution: { stops: [0, 0.25, 0.5, 1] },
  contactRepel: { stops: [0, 1, 2.5, 5] },
  dishTempo: { stops: [0, 0.3, 0.6, 1] },
};

/**
 * #764 — params that can change WHICH assets get placed, and so the live
 * atlas key (liveLoop atlasKeyFor: asset ids + FX layers). The Hold rule
 * (docs/PLENUM.md): a MIX may lerp these per frame only while the placed
 * asset set stays constant across the blend, because a new asset id mid-
 * blend is a rebake. gl/atlasKeyGuard.selfcheck.mjs sweeps real MIXes and
 * fails when that breaks. A new param that affects placement joins this list.
 */
export const ATLAS_AFFECTING_PARAMS = ['count', 'particleCount', 'lsysDepth', 'body'];

/** Bounds for each end of the dual-slider ranges. */
export const RANGE_SPEC = {
  scale: { min: 0.1, max: 3.0 },
  rotate: { min: -180, max: 180 },
  alpha: { min: 0, max: 100 },
};

/**
 * #1127 — how far the tap-name dialog may stretch a dual slider. The sliders REST on RANGE_SPEC (and macros, defaults
 * and the randomizer keep using it); a performer can widen the span up to here, so the engine accepts these ends.
 */
/** #1128 — the speed the ROTATE dialog offers when you choose SPIN (the default itself is 0: spin is chosen, drift is given). */
export const ROTATE_SPIN_START = 0.05;

export const RANGE_HARD = {
  scale: { min: 0.05, max: 6.0 },
  rotate: { min: -720, max: 720 },
  alpha: { min: 0, max: 100 },
};

const RANGE_KEYS = Object.keys(RANGE_SPEC);
const BOOL_KEYS = ['bleed', 'overlap', 'accumulation', 'glass', 'dish', 'ecology']; // #268: recolor removed; #1202: mirror is a 4-state enum now; #1409: dish is the per-Look cross-strata switch; #1416: ecology is the per-Look dish population mode

/** Names that would shadow Object.prototype if copied onto a plain object. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clampNum(value, spec, fallback) {
  // Only genuine numbers and numeric strings coerce. Number() maps null, ''
  // and [] to 0, which would silently pin an absent field to the slider's
  // minimum instead of its default — `{"damping": null}` would render at
  // 0.80 rather than 0.95, and look like a deliberate authoring choice.
  const isNumeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  if (!isNumeric) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(spec.max, Math.max(spec.min, n));
  return spec.int ? Math.round(c) : c;
}

function pickEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

const ENUM_SPEC = {
  mode: MODE_IDS,
  composition: COMPOSITION_IDS,
  blendMode: BLEND_MODES,
  paletteShift: PALETTE_SHIFTS,
  symmetry: SYMMETRY_MODES,
  mirror: MIRROR_STATES, // #1202 — 4-state reflection
  behave: BEHAVE_MODES,
  contactMode: CONTACT_MODES,
  audioResponse: AUDIO_RESPONSE_IDS, // #306
  kinemePattern: KINEME_PATTERNS, // #1128
  transport: TRANSPORT_MODES, // #1574
  transportPath: PATH_FAMILIES, // #1575
};

/** True when `value` is a number we can meaningfully clamp. */
function isNumericish(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value));
  return false;
}

/**
 * Which supplied keys are *structurally* wrong, as opposed to merely out of
 * range (#107 §1).
 *
 * The distinction matters. A slider that runs past its maximum should clamp —
 * that is what a slider does, and rejecting it would feel broken. But NaN,
 * null, a boolean where a number belongs, or a mode that does not exist is
 * not a value at the edge of a range; it is a caller that has gone wrong, and
 * silently substituting a default would hide the bug while changing the
 * operator's composition underneath them.
 *
 * So: clamp what can be clamped, reject what cannot, and let the caller keep
 * the previous state for the rejected keys.
 *
 * @returns {{ params: object, rejected: string[] }}
 */
export function validateLayoutParams(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const rejected = [];

  for (const key of Object.keys(src)) {
    if (UNSAFE_KEYS.has(key)) {
      rejected.push(key);
      continue;
    }
    const value = src[key];
    if (PARAM_SPEC[key]) {
      // #479 Option B — a field whose OWN default is null (the 9 BEHAVE
      // overrides) treats null as a legitimate value ("no override"), not
      // garbage: a RESET action writes null to clear an override, and that
      // write must not be silently rejected back to whatever the override
      // last was. Every other numeric field's default is a real number, so
      // this doesn't loosen validation for count/jitter/etc. — null there
      // still rejects exactly as before.
      const nullable = DEFAULT_LAYOUT_PARAMS[key] === null;
      if (!(nullable && value === null) && !isNumericish(value)) rejected.push(key);
    } else if (RANGE_SPEC[key]) {
      // #1202 — scale validates as {x:[lo,hi], y:[lo,hi]}; a legacy array
      // still validates (normalize migrates it to a linked pair).
      const isPair = (p) => Array.isArray(p) && p.length >= 2 && isNumericish(p[0]) && isNumericish(p[1]);
      const usable =
        key === 'scale'
          ? isPair(value) || (value && typeof value === 'object' && isPair(value.x) && isPair(value.y ?? value.x))
          : Array.isArray(value) && value.length >= 2 && isNumericish(value[0]) && isNumericish(value[1]);
      if (!usable) rejected.push(key);
    } else if (ENUM_SPEC[key]) {
      // #1202 — mirror accepts legacy booleans; normalize migrates them
      // (true→'x', false→'off'), so they are not rejections.
      const ok = key === 'mirror' && typeof value === 'boolean' ? true : pickEnumOk(value, ENUM_SPEC[key]);
      if (!ok) rejected.push(key);
    }
    // Booleans coerce rather than reject; unknown keys are passed through
    // untouched, same as normalizeLayoutParams.
  }

  return { params: normalizeLayoutParams(src), rejected };
}

function pickEnumOk(value, allowed) {
  if (typeof value !== 'string') return false;
  if (allowed.includes(value)) return true;
  // Look aliases: composition:'murmuration' is a valid Look address, not a new enum.
  if (allowed === COMPOSITION_IDS && allowed.includes(resolveLookId(value))) return true;
  return false;
}

export function normalizeLayoutParams(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const next = { ...DEFAULT_LAYOUT_PARAMS };
  // Copy own enumerable keys, skipping prototype-shadowing names that
  // JSON.parse hands back as ordinary own properties.
  for (const k of Object.keys(src)) {
    if (!UNSAFE_KEYS.has(k)) next[k] = src[k];
  }

  for (const key of RANGE_KEYS) {
    if (key === 'scale') continue; // #1202 — scale is {x,y} now, normalized below
    const v = next[key];
    const spec = RANGE_HARD[key];
    // QA (2026-09-16): length was checked but entries were not, so
    // {scale:['a','b']} from a hand-edited or corrupted project JSON
    // passed through unchanged and fed NaN/strings into transform math
    // downstream instead of falling back to a safe default.
    const usable = Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]));
    next[key] = usable
      ? // Ends are clamped but deliberately NOT reordered: a reversed range
        // (hi < lo) runs the lerp backwards, which is a legitimate thing to
        // author, so "fixing" the order would change existing compositions.
        [clampNum(v[0], spec, DEFAULT_LAYOUT_PARAMS[key][0]), clampNum(v[1], spec, DEFAULT_LAYOUT_PARAMS[key][1])]
      : DEFAULT_LAYOUT_PARAMS[key].slice();
  }

  // #1202 — SCALE is { x:[lo,hi], y:[lo,hi] }. A legacy array migrates to a
  // linked {x, y} pair (identical values) — the linked default is
  // behavior-identical to the old pair, provable no-op.
  {
    const v = next.scale;
    const dx = DEFAULT_LAYOUT_PARAMS.scale.x,
      dy = DEFAULT_LAYOUT_PARAMS.scale.y;
    const pair = (p, fb) => {
      const usable =
        Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
      return usable ? [clampNum(p[0], RANGE_HARD.scale, fb[0]), clampNum(p[1], RANGE_HARD.scale, fb[1])] : fb.slice();
    };
    if (Array.isArray(v)) {
      const p = pair(v, dx);
      next.scale = { x: p, y: p.slice() };
    } else if (v && typeof v === 'object') {
      const x = pair(v.x, dx);
      next.scale = { x, y: pair(v.y ?? v.x, dy) };
    } else {
      next.scale = { x: dx.slice(), y: dy.slice() };
    }
  }

  // #1202 — MIRROR is a 4-state enum. Legacy boolean: true → 'x' (the old
  // X-only mirror), false → 'off'.
  {
    const v = next.mirror;
    next.mirror = typeof v === 'boolean' ? (v ? 'x' : 'off') : pickEnum(v, MIRROR_STATES, 'off');
  }

  // #274: legacy fade migration — accumulationFade was stored as a keep
  // multiplier (0..1) before the half-life change. Any value in (0, 1) in a
  // saved project is a legacy keep (the new slider minimum is 1, so the
  // ranges don't overlap); convert to half-life frames so old projects keep
  // their look: halfLife = -1 / log2(keep). Exactly 1 is left alone — it's
  // the new half-life minimum, and a legacy keep of exactly 1 ("never
  // fade") is a degenerate edge not worth a version bump. Runs before the
  // PARAM_SPEC clamp.
  {
    const v = next.accumulationFade;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0 && n < 1) {
      const hl = -1 / Math.log2(n);
      next.accumulationFade = Math.min(40, Math.max(1, hl));
    }
  }

  // #1127 — a document that predates ROTATE spin keeps its static rotation: absent means 0, not the new default.
  // #1128 — the same rule for the living-motion floor: a document that predates it opens exactly as it was saved.
  // #1151 — palette-breath likewise: absent means 0, not the new default.
  for (const k of ['rotateSpin', 'kinemeBreath', 'kinemeDrift', 'kinemePaletteBreath'])
    if (!Object.prototype.hasOwnProperty.call(src, k)) next[k] = 0;

  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    next[key] = clampNum(next[key], spec, DEFAULT_LAYOUT_PARAMS[key]);
  }

  for (const key of BOOL_KEYS) next[key] = !!next[key];

  // #1202 — legacy 'stamp' symmetry was organism-path X-mirroring. It becomes
  // the unified X mirror (the placement pipeline never had it; unification
  // is the point of the bilateral/mirror reconciliation). Runs before the
  // symmetry enum clamp below, which would otherwise swallow it to 'none'.
  if (next.symmetry === 'stamp') {
    next.symmetry = 'none';
    if (next.mirror === 'off') next.mirror = 'x';
  }

  // Enums. `mode` is the one with teeth: getSampler indexed SAMPLERS
  // directly, so {"mode": "__proto__"} resolved to Object.prototype — truthy,
  // not callable — and threw "sample is not a function" mid-render, taking
  // down a studio batch or the live canvas.
  next.mode = pickEnum(next.mode, MODE_IDS, DEFAULT_LAYOUT_PARAMS.mode);
  next.composition = pickEnum(resolveLookId(next.composition), COMPOSITION_IDS, DEFAULT_LAYOUT_PARAMS.composition);
  next.blendMode = pickEnum(next.blendMode, BLEND_MODES, 'normal');
  next.paletteShift = pickEnum(next.paletteShift, PALETTE_SHIFTS, 'auto');
  next.symmetry = pickEnum(next.symmetry, SYMMETRY_MODES, 'none');
  next.behave = pickEnum(next.behave, BEHAVE_MODES, 'cruise');
  next.contactMode = pickEnum(next.contactMode, CONTACT_MODES, 'none');
  next.audioResponse = pickEnum(next.audioResponse, AUDIO_RESPONSE_IDS, DEFAULT_LAYOUT_PARAMS.audioResponse); // #306
  next.kinemePattern = pickEnum(next.kinemePattern, KINEME_PATTERNS, 'DRIFT'); // #1128: absent or unknown is the floor
  next.transport = pickEnum(next.transport, TRANSPORT_MODES, 'still'); // #1574: absent or unknown is still — a pre-#1574 document opens exactly as saved
  next.transportPath = pickEnum(next.transportPath, PATH_FAMILIES, 'orbit'); // #1575: absent or unknown is the orbit family, inert unless transport is 'path'
  // #1199 — MAP row enums. Unknown/absent is the no-op ('off'); the amount
  // clamp rides PARAM_SPEC above. A document that predates #1199 opens with
  // the map off exactly (defaults are already the no-op).
  next.fieldMapField = pickEnum(next.fieldMapField, FIELDMAP_FIELDS, 'off');
  next.fieldMapChannel = pickEnum(next.fieldMapChannel, FIELDMAP_CHANNELS, 'off');
  next.fieldMapCurve = pickEnum(next.fieldMapCurve, FIELDMAP_CURVES, 'smooth');
  // #1416 — the two string params that rode verbatim: `trail` has a
  // canonical vocabulary (#560, the same list resolveTrail reads), so
  // it takes the enum clamp like every other string enum. `material`
  // deliberately has none — #268 retired its vocabulary with the SVG
  // renderer, and old documents carry retired values ('wash',
  // 'stipple') that the export disclosure (gl/sceneContract) still
  // reads by name — so its clamp is type-only: any string is a name,
  // a non-string is the default. Both holes were the same shape: a
  // non-string (NaN above all) survived sanitising verbatim, and NaN
  // is not JSON-stable, so parse stopped being a fixed point.
  next.trail = pickEnum(next.trail, TRAIL_MODES, DEFAULT_LAYOUT_PARAMS.trail);
  next.material = typeof next.material === 'string' ? next.material : DEFAULT_LAYOUT_PARAMS.material;

  return next;
}
